import crypto from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { LibraryWork, LibraryWorkDetail, MediaItem, MediaRegion, ScrapeStatus, WorkListResult } from './types';

let db:DatabaseSync|null=null;
const SOURCE='strm';

function database():DatabaseSync {
  if(db) return db;
  const dir=process.env.HOMESPHERE_DATA_DIR?.trim() || path.join(process.cwd(),'.data');
  mkdirSync(dir,{recursive:true});
  db=new DatabaseSync(path.join(dir,'homesphere.sqlite'));
  db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000;');
  db.exec(`
CREATE TABLE IF NOT EXISTS works (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  group_key TEXT NOT NULL,
  title TEXT NOT NULL,
  year TEXT,
  media_type TEXT NOT NULL,
  poster_url TEXT,
  backdrop_url TEXT,
  overview TEXT,
  updated_at INTEGER NOT NULL,
  UNIQUE(provider, group_key)
);
CREATE INDEX IF NOT EXISTS idx_works_updated ON works(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_works_title ON works(title);

CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  work_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  remote_id TEXT NOT NULL,
  token TEXT,
  path TEXT NOT NULL,
  filename TEXT NOT NULL,
  title TEXT NOT NULL,
  year TEXT,
  media_type TEXT NOT NULL,
  season INTEGER,
  episode INTEGER,
  size INTEGER,
  hash TEXT,
  updated_at INTEGER NOT NULL,
  UNIQUE(provider, path),
  FOREIGN KEY(work_id) REFERENCES works(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_media_work ON media(work_id);
CREATE INDEX IF NOT EXISTS idx_media_path ON media(provider, path);
`);
  ensureColumn(db,'works','original_title','TEXT');
  ensureColumn(db,'works','tmdb_id','INTEGER');
  ensureColumn(db,'works','scrape_status',"TEXT NOT NULL DEFAULT 'pending'");
  ensureColumn(db,'works','scrape_error','TEXT');
  ensureColumn(db,'works','match_confidence','TEXT');
  ensureColumn(db,'works','manual_match','INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db,'works','region','TEXT');
  ensureColumn(db,'works','is_animation','INTEGER');
  ensureColumn(db,'works','added_at','INTEGER');
  ensureColumn(db,'works','hidden',"INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db,'media','source_url','TEXT');
  ensureColumn(db,'media','manual_episode',"INTEGER NOT NULL DEFAULT 0");
  db.exec(`
CREATE INDEX IF NOT EXISTS idx_works_scrape ON works(scrape_status);
CREATE TABLE IF NOT EXISTS watch_progress (
  profile_id TEXT NOT NULL,
  media_id TEXT NOT NULL,
  work_id TEXT NOT NULL,
  position REAL NOT NULL DEFAULT 0,
  duration REAL NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  last_played_at INTEGER NOT NULL,
  PRIMARY KEY(profile_id,media_id),
  FOREIGN KEY(media_id) REFERENCES media(id) ON DELETE CASCADE,
  FOREIGN KEY(work_id) REFERENCES works(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS favorite_works (
  profile_id TEXT NOT NULL,
  work_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(profile_id,work_id),
  FOREIGN KEY(work_id) REFERENCES works(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS watchlist_works (
  profile_id TEXT NOT NULL,
  work_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(profile_id,work_id),
  FOREIGN KEY(work_id) REFERENCES works(id) ON DELETE CASCADE
);
`);

  // HomeSphere is STRM-only. Purge rows created by removed legacy providers.
  db.prepare("DELETE FROM media WHERE provider<>?").run(SOURCE);
  db.prepare("DELETE FROM works WHERE provider<>?").run(SOURCE);
  return db;
}

export function makeWorkId(groupKey:string):string {
  return crypto.createHash('sha256').update(`work:${SOURCE}:${groupKey}`).digest('hex').slice(0,24);
}

export function makeMediaId(remotePath:string):string {
  return crypto.createHash('sha256').update(`media:${SOURCE}:${remotePath}`).digest('hex').slice(0,24);
}

export function upsertWork(work:Omit<LibraryWork,'fileCount'>):void {
  database().prepare(`
INSERT INTO works (id,provider,group_key,title,year,media_type,poster_url,backdrop_url,overview,region,added_at,updated_at)
VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
ON CONFLICT(id) DO UPDATE SET
  title=CASE WHEN COALESCE(works.scrape_status,'pending') IN ('matched','manual') THEN works.title ELSE excluded.title END,
  year=CASE WHEN COALESCE(works.scrape_status,'pending') IN ('matched','manual') THEN works.year ELSE COALESCE(works.year, excluded.year) END,
  media_type=CASE WHEN COALESCE(works.scrape_status,'pending') IN ('matched','manual') THEN works.media_type ELSE excluded.media_type END,
  added_at=COALESCE(works.added_at,excluded.added_at),
  updated_at=excluded.updated_at
`).run(
    work.id,SOURCE,work.groupKey,work.title,work.year??null,work.mediaType,
    work.posterUrl??null,work.backdropUrl??null,work.overview??null,work.region??null,
    work.addedAt??work.updatedAt,work.updatedAt
  );
}

export function upsertMedia(item:MediaItem):void {
  const conn=database();
  const work=conn.prepare('SELECT media_type,year FROM works WHERE id=? AND provider=?').get(item.workId,SOURCE) as {media_type:string;year:string|null}|undefined;
  conn.prepare(`
INSERT INTO media (
  id,work_id,provider,remote_id,token,source_url,path,filename,title,year,media_type,season,episode,size,hash,updated_at
) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
ON CONFLICT(id) DO UPDATE SET
  work_id=excluded.work_id,
  remote_id=excluded.remote_id,
  token=NULL,
  source_url=excluded.source_url,
  filename=excluded.filename,
  title=excluded.title,
  year=excluded.year,
  media_type=(SELECT media_type FROM works WHERE id=excluded.work_id),
  season=CASE WHEN COALESCE(media.manual_episode,0)=1 THEN media.season ELSE excluded.season END,
  episode=CASE WHEN COALESCE(media.manual_episode,0)=1 THEN media.episode ELSE excluded.episode END,
  size=excluded.size,
  hash=excluded.hash,
  updated_at=excluded.updated_at
`).run(
    item.id,item.workId,SOURCE,item.path,null,item.sourceUrl??null,item.path,item.filename,
    item.title,work?.year??item.year??null,work?.media_type??item.mediaType,item.season??null,item.episode??null,
    item.size??null,item.hash??null,item.updatedAt
  );
}

export function listWorks(opts?:{
  limit?:number;
  offset?:number;
  type?:'movie'|'tv';
  year?:string;
  region?:MediaRegion;
  animation?:boolean;
  sort?:'recent';
  hidden?:boolean;
  personal?:'favorite'|'watchlist';
  watchState?:'watched'|'inprogress'|'unwatched';
  profileId?:string;
}):WorkListResult {
  const limit=clamp(opts?.limit??60,1,200);
  const offset=Math.max(0,Math.trunc(opts?.offset??0));
  const where=['w.provider=?'];
  const params:Array<string|number>=[SOURCE];

  if(opts?.type){where.push('w.media_type=?');params.push(opts.type);}
  if(opts?.year){where.push('w.year=?');params.push(opts.year);}
  if(opts?.region){where.push('w.region=?');params.push(opts.region);}
  if(opts?.animation){where.push('COALESCE(w.is_animation,0)=1');}
  where.push(opts?.hidden?'COALESCE(w.hidden,0)=1':'COALESCE(w.hidden,0)=0');
  const profileId=opts?.profileId||'default';
  if(opts?.personal==='favorite'){
    where.push('EXISTS (SELECT 1 FROM favorite_works f WHERE f.work_id=w.id AND f.profile_id=?)');
    params.push(profileId);
  }else if(opts?.personal==='watchlist'){
    where.push('EXISTS (SELECT 1 FROM watchlist_works q WHERE q.work_id=w.id AND q.profile_id=?)');
    params.push(profileId);
  }
  if(opts?.watchState==='watched'){
    where.push('EXISTS (SELECT 1 FROM media mx WHERE mx.work_id=w.id) AND NOT EXISTS (SELECT 1 FROM media mx WHERE mx.work_id=w.id AND NOT EXISTS (SELECT 1 FROM watch_progress p WHERE p.media_id=mx.id AND p.profile_id=? AND p.completed=1))');
    params.push(profileId);
  }else if(opts?.watchState==='inprogress'){
    where.push('EXISTS (SELECT 1 FROM watch_progress p WHERE p.work_id=w.id AND p.profile_id=? AND p.position>0) AND EXISTS (SELECT 1 FROM media mx WHERE mx.work_id=w.id AND NOT EXISTS (SELECT 1 FROM watch_progress p2 WHERE p2.media_id=mx.id AND p2.profile_id=? AND p2.completed=1))');
    params.push(profileId,profileId);
  }else if(opts?.watchState==='unwatched'){
    where.push('NOT EXISTS (SELECT 1 FROM watch_progress p WHERE p.work_id=w.id AND p.profile_id=? AND p.position>0)');
    params.push(profileId);
  }

  const whereSql=where.join(' AND ');
  const orderSql=opts?.sort==='recent'
    ? 'COALESCE(w.added_at,w.updated_at) DESC,w.title COLLATE NOCASE'
    : 'w.updated_at DESC';

  const rows=database().prepare(`
SELECT w.*,COUNT(m.id) file_count
FROM works w LEFT JOIN media m ON m.work_id=w.id
WHERE ${whereSql}
GROUP BY w.id
ORDER BY ${orderSql}
LIMIT ? OFFSET ?
`).all(...params,limit,offset);

  const countRow=database().prepare(`
SELECT COUNT(*) n FROM works w WHERE ${whereSql}
`).get(...params) as {n:number};

  return {items:(rows as unknown as DbWorkRow[]).map(mapWork),total:Number(countRow.n)};
}

export function searchWorks(
  query:string,
  limit=60,
  hidden=false,
  opts?:{
    type?:'movie'|'tv';
    year?:string;
    region?:MediaRegion;
    animation?:boolean;
    personal?:'favorite'|'watchlist';
    watchState?:'watched'|'inprogress'|'unwatched';
    profileId?:string;
  }
):LibraryWork[] {
  const q=query.trim();
  if(!q)return [];
  const pattern=`%${escapeLike(q)}%`;
  const where=[
    'w.provider=?',
    hidden?'COALESCE(w.hidden,0)=1':'COALESCE(w.hidden,0)=0',
    "(w.title LIKE ? ESCAPE '\\\\' OR COALESCE(w.original_title,'') LIKE ? ESCAPE '\\\\')",
  ];
  const params:Array<string|number>=[SOURCE,pattern,pattern];
  if(opts?.type){where.push('w.media_type=?');params.push(opts.type);}
  if(opts?.year){where.push('w.year=?');params.push(opts.year);}
  if(opts?.region){where.push('w.region=?');params.push(opts.region);}
  if(opts?.animation)where.push('COALESCE(w.is_animation,0)=1');
  const profileId=opts?.profileId||'default';
  if(opts?.personal==='favorite'){
    where.push('EXISTS (SELECT 1 FROM favorite_works f WHERE f.work_id=w.id AND f.profile_id=?)');
    params.push(profileId);
  }else if(opts?.personal==='watchlist'){
    where.push('EXISTS (SELECT 1 FROM watchlist_works ql WHERE ql.work_id=w.id AND ql.profile_id=?)');
    params.push(profileId);
  }
  if(opts?.watchState==='watched'){
    where.push('EXISTS (SELECT 1 FROM media mx WHERE mx.work_id=w.id) AND NOT EXISTS (SELECT 1 FROM media mx WHERE mx.work_id=w.id AND NOT EXISTS (SELECT 1 FROM watch_progress p WHERE p.media_id=mx.id AND p.profile_id=? AND p.completed=1))');
    params.push(profileId);
  }else if(opts?.watchState==='inprogress'){
    where.push('EXISTS (SELECT 1 FROM watch_progress p WHERE p.work_id=w.id AND p.profile_id=? AND p.position>0) AND EXISTS (SELECT 1 FROM media mx WHERE mx.work_id=w.id AND NOT EXISTS (SELECT 1 FROM watch_progress p2 WHERE p2.media_id=mx.id AND p2.profile_id=? AND p2.completed=1))');
    params.push(profileId,profileId);
  }else if(opts?.watchState==='unwatched'){
    where.push('NOT EXISTS (SELECT 1 FROM watch_progress p WHERE p.work_id=w.id AND p.profile_id=? AND p.position>0)');
    params.push(profileId);
  }
  const rows=database().prepare(`
SELECT w.*,COUNT(m.id) file_count
FROM works w LEFT JOIN media m ON m.work_id=w.id
WHERE ${where.join(' AND ')}
GROUP BY w.id
ORDER BY CASE WHEN w.title=? THEN 0 ELSE 1 END,w.updated_at DESC
LIMIT ?
`).all(...params,q,clamp(limit,1,100));
  return (rows as unknown as DbWorkRow[]).map(mapWork);
}

export function getWork(id:string):LibraryWorkDetail|null {
  const row=database().prepare(`
SELECT w.*,COUNT(m.id) file_count
FROM works w LEFT JOIN media m ON m.work_id=w.id
WHERE w.id=? AND w.provider=? GROUP BY w.id
`).get(id,SOURCE) as DbWorkRow|undefined;
  if(!row) return null;
  const files=database().prepare(`
SELECT * FROM media WHERE work_id=? AND provider=?
ORDER BY COALESCE(season,0),COALESCE(episode,0),filename
`).all(id,SOURCE) as unknown as DbMediaRow[];
  return {...mapWork(row),files:files.map(mapMedia)};
}

export function getMedia(id:string):MediaItem|null {
  const row=database().prepare('SELECT * FROM media WHERE id=? AND provider=?').get(id,SOURCE) as DbMediaRow|undefined;
  return row?mapMedia(row):null;
}

export function getProbeMedia():MediaItem|null {
  const row=database().prepare(`
SELECT * FROM media
WHERE provider=? AND source_url IS NOT NULL AND source_url<>''
ORDER BY updated_at DESC LIMIT 1
`).get(SOURCE) as DbMediaRow|undefined;
  return row?mapMedia(row):null;
}

export function listWorksForScrape(limit=50):LibraryWork[] {
  const rows=database().prepare(`
SELECT w.*,COUNT(m.id) file_count
FROM works w LEFT JOIN media m ON m.work_id=w.id
WHERE w.provider=? AND COALESCE(w.hidden,0)=0 AND COALESCE(w.manual_match,0)=0
  AND COALESCE(w.scrape_status,'pending') IN ('pending','review','failed')
GROUP BY w.id
ORDER BY CASE COALESCE(w.scrape_status,'pending') WHEN 'pending' THEN 0 WHEN 'review' THEN 1 ELSE 2 END,w.updated_at DESC
LIMIT ?
`).all(SOURCE,clamp(limit,1,200));
  return (rows as unknown as DbWorkRow[]).map(mapWork);
}

export function setWorkMatch(id:string,patch:{
  title:string; originalTitle?:string; year?:string; mediaType:'movie'|'tv'; tmdbId:number;
  posterUrl?:string; backdropUrl?:string; overview?:string; region?:MediaRegion; isAnimation?:boolean; scrapeStatus:ScrapeStatus;
  matchConfidence?:'high'|'medium'|'low'; scrapeError?:string; manualMatch?:boolean;
}):void {
  const conn=database();
  conn.prepare(`
UPDATE works SET title=?,original_title=?,year=?,media_type=?,tmdb_id=?,poster_url=?,backdrop_url=?,overview=?,region=?,is_animation=?,
scrape_status=?,scrape_error=?,match_confidence=?,manual_match=?,updated_at=?
WHERE id=? AND provider=?
`).run(
    patch.title,patch.originalTitle??null,patch.year??null,patch.mediaType,patch.tmdbId,
    patch.posterUrl??null,patch.backdropUrl??null,patch.overview??null,patch.region??null,
    patch.isAnimation===undefined?null:(patch.isAnimation?1:0),patch.scrapeStatus,
    patch.scrapeError??null,patch.matchConfidence??null,patch.manualMatch?1:0,Date.now(),id,SOURCE
  );
  conn.prepare('UPDATE media SET media_type=?,year=COALESCE(?,year),updated_at=? WHERE work_id=? AND provider=?')
    .run(patch.mediaType,patch.year??null,Date.now(),id,SOURCE);
}

export function listWorksMissingMetadata(limit=100):LibraryWork[] {
  const rows=database().prepare(`
SELECT w.*,COUNT(m.id) file_count
FROM works w LEFT JOIN media m ON m.work_id=w.id
WHERE w.provider=? AND COALESCE(w.hidden,0)=0 AND w.tmdb_id IS NOT NULL AND (w.region IS NULL OR w.is_animation IS NULL)
GROUP BY w.id ORDER BY w.updated_at DESC LIMIT ?
`).all(SOURCE,clamp(limit,1,200));
  return (rows as unknown as DbWorkRow[]).map(mapWork);
}

export function setWorkMetadata(id:string,region:MediaRegion|undefined,isAnimation:boolean|undefined):void {
  database().prepare(`
UPDATE works
SET region=COALESCE(?,region),is_animation=COALESCE(?,is_animation)
WHERE id=? AND provider=?
`).run(
    region??null,
    isAnimation===undefined?null:(isAnimation?1:0),
    id,SOURCE
  );
}

export function setWorkScrapeState(id:string,status:ScrapeStatus,error?:string):void {
  database().prepare('UPDATE works SET scrape_status=?,scrape_error=?,updated_at=? WHERE id=? AND provider=?')
    .run(status,error??null,Date.now(),id,SOURCE);
}

export function mergeDuplicateTmdbWorks():number {
  const conn=database();
  const groups=conn.prepare(`
SELECT tmdb_id,media_type,COUNT(*) n
FROM works
WHERE provider=? AND tmdb_id IS NOT NULL
GROUP BY tmdb_id,media_type
HAVING COUNT(*)>1
`).all(SOURCE) as unknown as Array<{tmdb_id:number;media_type:string;n:number}>;

  let merged=0;
  for(const group of groups){
    const rows=conn.prepare(`
SELECT w.id,w.manual_match,w.updated_at,COUNT(m.id) file_count
FROM works w LEFT JOIN media m ON m.work_id=w.id
WHERE w.provider=? AND w.tmdb_id=? AND w.media_type=?
GROUP BY w.id
ORDER BY COALESCE(w.hidden,0) ASC,COALESCE(w.manual_match,0) DESC,COUNT(m.id) DESC,w.updated_at DESC
`).all(SOURCE,group.tmdb_id,group.media_type) as unknown as Array<{
      id:string;manual_match:number|null;updated_at:number;file_count:number;
    }>;
    if(rows.length<2)continue;

    const canonical=rows[0].id;
    for(const duplicate of rows.slice(1)){
      conn.prepare('UPDATE media SET work_id=? WHERE provider=? AND work_id=?').run(canonical,SOURCE,duplicate.id);
      conn.prepare('DELETE FROM works WHERE provider=? AND id=?').run(SOURCE,duplicate.id);
      merged++;
    }
    conn.prepare('UPDATE works SET updated_at=? WHERE provider=? AND id=?').run(Date.now(),SOURCE,canonical);
  }
  return merged;
}

export function updateWorkBasics(id:string,patch:{
  title:string;
  year?:string;
  mediaType:'movie'|'tv';
}):LibraryWorkDetail|null {
  const conn=database();
  const current=conn.prepare('SELECT media_type FROM works WHERE id=? AND provider=?').get(id,SOURCE) as {media_type:string}|undefined;
  if(!current)return null;
  const title=patch.title.normalize('NFKC').trim().slice(0,160);
  if(!title)return null;
  const year=patch.year?.trim()||null;
  const typeChanged=current.media_type!==patch.mediaType;

  if(typeChanged){
    conn.prepare(`
UPDATE works SET
  title=?,year=?,media_type=?,original_title=NULL,tmdb_id=NULL,poster_url=NULL,backdrop_url=NULL,overview=NULL,
  region=NULL,is_animation=NULL,scrape_status='manual',scrape_error=NULL,match_confidence=NULL,manual_match=1,updated_at=?
WHERE id=? AND provider=?
`).run(title,year,patch.mediaType,Date.now(),id,SOURCE);
  }else{
    conn.prepare(`
UPDATE works SET title=?,year=?,scrape_status='manual',scrape_error=NULL,manual_match=1,updated_at=?
WHERE id=? AND provider=?
`).run(title,year,Date.now(),id,SOURCE);
  }
  conn.prepare('UPDATE media SET media_type=?,year=?,updated_at=? WHERE work_id=? AND provider=?')
    .run(patch.mediaType,year,Date.now(),id,SOURCE);
  return getWork(id);
}

export function updateMediaEpisode(id:string,season:number,episode:number):MediaItem|null {
  const conn=database();
  const s=Math.max(0,Math.min(99,Math.trunc(season)));
  const e=Math.max(1,Math.min(9999,Math.trunc(episode)));
  const result=conn.prepare(`
UPDATE media SET season=?,episode=?,manual_episode=1,updated_at=?
WHERE id=? AND provider=?
`).run(s,e,Date.now(),id,SOURCE);
  return Number(result.changes||0)>0?getMedia(id):null;
}

export function setWorkHidden(id:string,hidden:boolean):boolean {
  const result=database().prepare('UPDATE works SET hidden=?,updated_at=? WHERE id=? AND provider=?')
    .run(hidden?1:0,Date.now(),id,SOURCE);
  return Number(result.changes||0)>0;
}

export function reconcileMedia(currentIds:string[]):{removedMedia:number;removedWorks:number} {
  const conn=database();
  conn.exec('CREATE TEMP TABLE IF NOT EXISTS current_media_ids (id TEXT PRIMARY KEY)');
  conn.exec('DELETE FROM current_media_ids');
  const insert=conn.prepare('INSERT INTO current_media_ids (id) VALUES (?)');
  for(const id of currentIds) insert.run(id);
  const removedMedia=Number(conn.prepare('DELETE FROM media WHERE provider=? AND id NOT IN (SELECT id FROM current_media_ids)').run(SOURCE).changes||0);
  const removedWorks=Number(conn.prepare('DELETE FROM works WHERE provider=? AND NOT EXISTS (SELECT 1 FROM media m WHERE m.work_id=works.id)').run(SOURCE).changes||0);
  return {removedMedia,removedWorks};
}

interface DbWorkRow {
  id:string;group_key:string;title:string;original_title:string|null;year:string|null;media_type:string;
  tmdb_id:number|null;poster_url:string|null;backdrop_url:string|null;overview:string|null;region:string|null;is_animation:number|null;
  scrape_status:string|null;scrape_error:string|null;match_confidence:string|null;manual_match:number|null;
  added_at:number|null;hidden:number|null;updated_at:number;file_count:number;
}
interface DbMediaRow {
  id:string;work_id:string;source_url:string|null;path:string;filename:string;title:string;year:string|null;
  media_type:string;season:number|null;episode:number|null;size:number|null;hash:string|null;manual_episode:number|null;updated_at:number;
}
function mapWork(row:DbWorkRow):LibraryWork {
  return {
    id:row.id,groupKey:row.group_key,title:row.title,originalTitle:row.original_title??undefined,
    year:row.year??undefined,mediaType:row.media_type as LibraryWork['mediaType'],tmdbId:row.tmdb_id??undefined,
    posterUrl:row.poster_url??undefined,backdropUrl:row.backdrop_url??undefined,overview:row.overview??undefined,
    region:(row.region as LibraryWork['region'])??undefined,
    isAnimation:row.is_animation===null?undefined:row.is_animation===1,
    scrapeStatus:(row.scrape_status||'pending') as LibraryWork['scrapeStatus'],
    scrapeError:row.scrape_error??undefined,matchConfidence:(row.match_confidence as LibraryWork['matchConfidence'])??undefined,
    manualMatch:row.manual_match===1,hidden:row.hidden===1,fileCount:Number(row.file_count||0),
    addedAt:row.added_at??undefined,updatedAt:row.updated_at,
  };
}
function mapMedia(row:DbMediaRow):MediaItem {
  return {
    id:row.id,workId:row.work_id,sourceUrl:row.source_url??undefined,path:row.path,filename:row.filename,
    title:row.title,year:row.year??undefined,mediaType:row.media_type as MediaItem['mediaType'],
    season:row.season??undefined,episode:row.episode??undefined,size:row.size??undefined,
    hash:row.hash??undefined,updatedAt:row.updated_at,
  };
}
function ensureColumn(conn:DatabaseSync,table:string,column:string,type:string):void {
  const rows=conn.prepare(`PRAGMA table_info(${table})`).all() as unknown as Array<{name:string}>;
  if(!rows.some(row=>row.name===column)) conn.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
}
function escapeLike(value:string):string { return value.replace(/[\\%_]/g,m=>`\\${m}`); }
function clamp(n:number,min:number,max:number):number {
  const value=Number.isFinite(n)?Math.trunc(n):min;
  return Math.max(min,Math.min(max,value));
}
export function getLibraryDatabase():DatabaseSync { return database(); }
export function __closeLibraryDbForTest():void { db?.close();db=null; }
