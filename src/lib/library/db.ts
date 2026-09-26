import crypto from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { CloudProviderKind } from '@/lib/cloud/provider';
import type { LibraryWork, LibraryWorkDetail, MediaItem, ScrapeStatus, WorkListResult } from './types';

let db: DatabaseSync | null = null;

function database(): DatabaseSync {
  if (db) return db;
  const dir = process.env.HOMESPHERE_DATA_DIR?.trim() || path.join(process.cwd(), '.data');
  mkdirSync(dir, { recursive: true });
  db = new DatabaseSync(path.join(dir, 'homesphere.sqlite'));
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
  ensureColumn(db,'media','source_url','TEXT');
  db.exec("CREATE INDEX IF NOT EXISTS idx_works_scrape ON works(scrape_status);");
  return db;
}

export function makeWorkId(provider: CloudProviderKind, groupKey: string): string {
  return crypto.createHash('sha256').update(`work:${provider}:${groupKey}`).digest('hex').slice(0,24);
}

export function makeMediaId(provider: CloudProviderKind, remotePath: string): string {
  return crypto.createHash('sha256').update(`media:${provider}:${remotePath}`).digest('hex').slice(0,24);
}

export function upsertWork(work: Omit<LibraryWork,'fileCount'>): void {
  database().prepare(`
INSERT INTO works (id,provider,group_key,title,year,media_type,poster_url,backdrop_url,overview,updated_at)
VALUES (?,?,?,?,?,?,?,?,?,?)
ON CONFLICT(id) DO UPDATE SET
  title=CASE WHEN COALESCE(works.scrape_status,'pending') IN ('matched','manual') THEN works.title ELSE excluded.title END,
  year=CASE WHEN COALESCE(works.scrape_status,'pending') IN ('matched','manual') THEN works.year ELSE COALESCE(works.year, excluded.year) END,
  media_type=CASE WHEN COALESCE(works.scrape_status,'pending') IN ('matched','manual') THEN works.media_type ELSE excluded.media_type END,
  updated_at=excluded.updated_at
`).run(
    work.id, work.provider, work.groupKey, work.title, work.year ?? null, work.mediaType,
    work.posterUrl ?? null, work.backdropUrl ?? null, work.overview ?? null, work.updatedAt
  );
}

export function upsertMedia(item: MediaItem): void {
  database().prepare(`
INSERT INTO media (
  id,work_id,provider,remote_id,token,source_url,path,filename,title,year,media_type,season,episode,size,hash,updated_at
) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
ON CONFLICT(id) DO UPDATE SET
  work_id=excluded.work_id,
  remote_id=excluded.remote_id,
  token=excluded.token,
  source_url=excluded.source_url,
  filename=excluded.filename,
  title=excluded.title,
  year=excluded.year,
  media_type=excluded.media_type,
  season=excluded.season,
  episode=excluded.episode,
  size=excluded.size,
  hash=excluded.hash,
  updated_at=excluded.updated_at
`).run(
    item.id, item.workId, item.provider, item.remoteId, item.token ?? null, item.sourceUrl ?? null, item.path, item.filename,
    item.title, item.year ?? null, item.mediaType, item.season ?? null, item.episode ?? null,
    item.size ?? null, item.hash ?? null, item.updatedAt
  );
}

export function listWorks(opts?: { limit?: number; offset?: number; type?: 'movie'|'tv'; provider?: CloudProviderKind }): WorkListResult {
  const limit = clamp(opts?.limit ?? 60,1,200);
  const offset = Math.max(0,Math.trunc(opts?.offset ?? 0));
  const type = opts?.type;
  const provider = opts?.provider;
  const conditions:string[]=[];
  const args:Array<string|number>=[];
  if(type){conditions.push('w.media_type=?');args.push(type);}
  if(provider){conditions.push('w.provider=?');args.push(provider);}
  const where=conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows=database().prepare(`
SELECT w.*, COUNT(m.id) file_count
FROM works w LEFT JOIN media m ON m.work_id=w.id
${where}
GROUP BY w.id ORDER BY w.updated_at DESC LIMIT ? OFFSET ?
`).all(...args,limit,offset);
  const countRow=database().prepare(`SELECT COUNT(*) n FROM works w ${where}`).get(...args) as {n:number};
  return { items:(rows as unknown as DbWorkRow[]).map(mapWork), total:Number(countRow.n) };
}

export function searchWorks(query:string,limit=60,provider?:CloudProviderKind):LibraryWork[] {
  const q=query.trim();
  if(!q) return [];
  const pattern=`%${escapeLike(q)}%`;
  const providerClause=provider?'AND w.provider=?':'';
  const args:Array<string|number>=provider
    ? [pattern,pattern,provider,q,clamp(limit,1,100)]
    : [pattern,pattern,q,clamp(limit,1,100)];
  const rows=database().prepare(`
SELECT w.*, COUNT(m.id) file_count
FROM works w LEFT JOIN media m ON m.work_id=w.id
WHERE (w.title LIKE ? ESCAPE '\\' OR COALESCE(w.original_title,'') LIKE ? ESCAPE '\\') ${providerClause}
GROUP BY w.id
ORDER BY CASE WHEN w.title=? THEN 0 ELSE 1 END, w.updated_at DESC
LIMIT ?
`).all(...args);
  return (rows as unknown as DbWorkRow[]).map(mapWork);
}

export function getWork(id:string): LibraryWorkDetail | null {
  const row=database().prepare(`
SELECT w.*, COUNT(m.id) file_count
FROM works w LEFT JOIN media m ON m.work_id=w.id
WHERE w.id=? GROUP BY w.id
`).get(id) as DbWorkRow | undefined;
  if(!row) return null;
  const files=database().prepare(`
SELECT * FROM media WHERE work_id=?
ORDER BY COALESCE(season,0), COALESCE(episode,0), filename
`).all(id) as unknown as DbMediaRow[];
  return { ...mapWork(row), files:files.map(mapMedia) };
}

export function getMedia(id:string): MediaItem | null {
  const row=database().prepare('SELECT * FROM media WHERE id=?').get(id) as DbMediaRow | undefined;
  return row ? mapMedia(row) : null;
}

export function listWorksForScrape(limit=50,provider?:CloudProviderKind):LibraryWork[] {
  const providerClause=provider?'AND w.provider=?':'';
  const args=provider?[provider,clamp(limit,1,200)]:[clamp(limit,1,200)];
  const rows=database().prepare(`
SELECT w.*, COUNT(m.id) file_count
FROM works w LEFT JOIN media m ON m.work_id=w.id
WHERE COALESCE(w.manual_match,0)=0 AND COALESCE(w.scrape_status,'pending')='pending' ${providerClause}
GROUP BY w.id ORDER BY w.updated_at DESC LIMIT ?
`).all(...args);
  return (rows as unknown as DbWorkRow[]).map(mapWork);
}

export function setWorkMatch(id:string,patch:{
  title:string; originalTitle?:string; year?:string; mediaType:'movie'|'tv'; tmdbId:number;
  posterUrl?:string; backdropUrl?:string; overview?:string; scrapeStatus:ScrapeStatus;
  matchConfidence?:'high'|'medium'|'low'; scrapeError?:string; manualMatch?:boolean;
}):void {
  database().prepare(`
UPDATE works SET title=?,original_title=?,year=?,media_type=?,tmdb_id=?,poster_url=?,backdrop_url=?,overview=?,
scrape_status=?,scrape_error=?,match_confidence=?,manual_match=?,updated_at=? WHERE id=?
`).run(
    patch.title,patch.originalTitle??null,patch.year??null,patch.mediaType,patch.tmdbId,
    patch.posterUrl??null,patch.backdropUrl??null,patch.overview??null,patch.scrapeStatus,
    patch.scrapeError??null,patch.matchConfidence??null,patch.manualMatch?1:0,Date.now(),id
  );
}

export function setWorkScrapeState(id:string,status:ScrapeStatus,error?:string):void {
  database().prepare('UPDATE works SET scrape_status=?,scrape_error=?,updated_at=? WHERE id=?')
    .run(status,error??null,Date.now(),id);
}

interface DbWorkRow {
  id:string; provider:string; group_key:string; title:string; original_title:string|null; year:string|null; media_type:string;
  tmdb_id:number|null; poster_url:string|null; backdrop_url:string|null; overview:string|null;
  scrape_status:string|null; scrape_error:string|null; match_confidence:string|null; manual_match:number|null;
  updated_at:number; file_count:number;
}
export function reconcileProviderMedia(provider:CloudProviderKind,currentIds:string[]):void {
  const conn=database();
  conn.exec('CREATE TEMP TABLE IF NOT EXISTS current_media_ids (id TEXT PRIMARY KEY)');
  conn.exec('DELETE FROM current_media_ids');
  const insert=conn.prepare('INSERT INTO current_media_ids (id) VALUES (?)');
  for(const id of currentIds) insert.run(id);
  conn.prepare('DELETE FROM media WHERE provider=? AND id NOT IN (SELECT id FROM current_media_ids)').run(provider);
  conn.prepare('DELETE FROM works WHERE provider=? AND NOT EXISTS (SELECT 1 FROM media m WHERE m.work_id=works.id)').run(provider);
}

interface DbMediaRow {
  id:string; work_id:string; provider:string; remote_id:string; token:string|null; source_url:string|null; path:string; filename:string;
  title:string; year:string|null; media_type:string; season:number|null; episode:number|null; size:number|null;
  hash:string|null; updated_at:number;
}
function mapWork(row:DbWorkRow):LibraryWork {
  return {
    id:row.id, provider:row.provider as CloudProviderKind, groupKey:row.group_key, title:row.title,
    originalTitle:row.original_title ?? undefined, year:row.year ?? undefined, mediaType:row.media_type as LibraryWork['mediaType'],
    tmdbId:row.tmdb_id ?? undefined, posterUrl:row.poster_url ?? undefined, backdropUrl:row.backdrop_url ?? undefined,
    overview:row.overview ?? undefined, scrapeStatus:(row.scrape_status || 'pending') as LibraryWork['scrapeStatus'],
    scrapeError:row.scrape_error ?? undefined, matchConfidence:(row.match_confidence as LibraryWork['matchConfidence']) ?? undefined,
    manualMatch:row.manual_match===1, fileCount:Number(row.file_count || 0), updatedAt:row.updated_at,
  };
}
function mapMedia(row:DbMediaRow):MediaItem {
  return {
    id:row.id, workId:row.work_id, provider:row.provider as CloudProviderKind, remoteId:row.remote_id,
    token:row.token ?? undefined, sourceUrl:row.source_url ?? undefined, path:row.path, filename:row.filename, title:row.title,
    year:row.year ?? undefined, mediaType:row.media_type as MediaItem['mediaType'],
    season:row.season ?? undefined, episode:row.episode ?? undefined, size:row.size ?? undefined,
    hash:row.hash ?? undefined, updatedAt:row.updated_at,
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
export function __closeLibraryDbForTest():void { db?.close(); db=null; }
