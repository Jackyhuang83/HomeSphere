import { getMedia, getLibraryDatabase } from './db';

export const DEFAULT_PROFILE_ID='default';
const CONTINUE_MIN_SECONDS=30;
const COMPLETE_RATIO=0.92;

export interface PlaybackProgress {
  mediaId:string;
  workId:string;
  position:number;
  duration:number;
  completed:boolean;
  lastPlayedAt:number;
}

export interface ActivityWork {
  id:string;
  title:string;
  year?:string;
  mediaType:'movie'|'tv';
  posterUrl?:string;
}

export interface ActivityMedia {
  id:string;
  season?:number;
  episode?:number;
}

export interface ActivityItem extends PlaybackProgress {
  work:ActivityWork;
  media:ActivityMedia;
}

export interface WorkActivityState {
  favorite:boolean;
  watchlist:boolean;
  mediaProgress:Record<string,PlaybackProgress>;
}

export interface LibraryActivitySummary {
  continueWatching:ActivityItem[];
  recentWatching:ActivityItem[];
  favorites:ActivityWork[];
  watchlist:ActivityWork[];
}

let activitySchemaReady=false;

function activityDatabase(){
  const conn=getLibraryDatabase();
  if(activitySchemaReady)return conn;
  conn.exec(`
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
CREATE INDEX IF NOT EXISTS idx_watch_progress_profile_time
  ON watch_progress(profile_id,last_played_at DESC);
CREATE INDEX IF NOT EXISTS idx_watch_progress_profile_work
  ON watch_progress(profile_id,work_id);

CREATE TABLE IF NOT EXISTS favorite_works (
  profile_id TEXT NOT NULL,
  work_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(profile_id,work_id),
  FOREIGN KEY(work_id) REFERENCES works(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_favorite_works_profile_time
  ON favorite_works(profile_id,created_at DESC);

CREATE TABLE IF NOT EXISTS watchlist_works (
  profile_id TEXT NOT NULL,
  work_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(profile_id,work_id),
  FOREIGN KEY(work_id) REFERENCES works(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_watchlist_works_profile_time
  ON watchlist_works(profile_id,created_at DESC);
`);
  activitySchemaReady=true;
  return conn;
}

export function savePlaybackProgress(
  mediaId:string,
  positionInput:number,
  durationInput:number,
  profileId=DEFAULT_PROFILE_ID
):PlaybackProgress|null {
  const media=getMedia(mediaId);
  if(!media)return null;

  const duration=boundedNumber(durationInput,0,7*24*60*60);
  const position=boundedNumber(positionInput,0,duration>0?duration:7*24*60*60);
  if(position<=0)return null;
  const completed=duration>=60 && position/duration>=COMPLETE_RATIO;
  const lastPlayedAt=Date.now();

  activityDatabase().prepare(`
INSERT INTO watch_progress (
  profile_id,media_id,work_id,position,duration,completed,last_played_at
) VALUES (?,?,?,?,?,?,?)
ON CONFLICT(profile_id,media_id) DO UPDATE SET
  work_id=excluded.work_id,
  position=excluded.position,
  duration=excluded.duration,
  completed=excluded.completed,
  last_played_at=excluded.last_played_at
`).run(
    profileId,media.id,media.workId,position,duration,completed?1:0,lastPlayedAt
  );

  return {
    mediaId:media.id,
    workId:media.workId,
    position,
    duration,
    completed,
    lastPlayedAt,
  };
}

export function setWorkFavorite(
  workId:string,
  favorite:boolean,
  profileId=DEFAULT_PROFILE_ID
):boolean {
  const conn=activityDatabase();
  const exists=conn.prepare('SELECT 1 ok FROM works WHERE id=?').get(workId) as {ok:number}|undefined;
  if(!exists)return false;

  if(favorite){
    conn.prepare(`
INSERT INTO favorite_works (profile_id,work_id,created_at)
VALUES (?,?,?)
ON CONFLICT(profile_id,work_id) DO UPDATE SET created_at=excluded.created_at
`).run(profileId,workId,Date.now());
  }else{
    conn.prepare('DELETE FROM favorite_works WHERE profile_id=? AND work_id=?').run(profileId,workId);
  }
  return true;
}

export function setWorkWatchlist(
  workId:string,
  watchlist:boolean,
  profileId=DEFAULT_PROFILE_ID
):boolean {
  const conn=activityDatabase();
  const exists=conn.prepare('SELECT 1 ok FROM works WHERE id=?').get(workId) as {ok:number}|undefined;
  if(!exists)return false;

  if(watchlist){
    conn.prepare(`
INSERT INTO watchlist_works (profile_id,work_id,created_at)
VALUES (?,?,?)
ON CONFLICT(profile_id,work_id) DO UPDATE SET created_at=excluded.created_at
`).run(profileId,workId,Date.now());
  }else{
    conn.prepare('DELETE FROM watchlist_works WHERE profile_id=? AND work_id=?').run(profileId,workId);
  }
  return true;
}

export function getWorkActivityState(
  workId:string,
  profileId=DEFAULT_PROFILE_ID
):WorkActivityState {
  const conn=activityDatabase();
  const favorite=Boolean(conn.prepare(
    'SELECT 1 ok FROM favorite_works WHERE profile_id=? AND work_id=?'
  ).get(profileId,workId));
  const watchlist=Boolean(conn.prepare(
    'SELECT 1 ok FROM watchlist_works WHERE profile_id=? AND work_id=?'
  ).get(profileId,workId));

  const rows=conn.prepare(`
SELECT media_id,work_id,position,duration,completed,last_played_at
FROM watch_progress
WHERE profile_id=? AND work_id=?
`).all(profileId,workId) as unknown as ProgressRow[];

  const mediaProgress:Record<string,PlaybackProgress>={};
  for(const row of rows){
    mediaProgress[row.media_id]=mapProgress(row);
  }
  return {favorite,watchlist,mediaProgress};
}

export function getLibraryActivitySummary(
  profileId=DEFAULT_PROFILE_ID
):LibraryActivitySummary {
  const conn=activityDatabase();
  const rows=conn.prepare(`
SELECT
  p.media_id,p.work_id,p.position,p.duration,p.completed,p.last_played_at,
  w.title,w.year,w.media_type,w.poster_url,
  m.season,m.episode
FROM watch_progress p
JOIN works w ON w.id=p.work_id
JOIN media m ON m.id=p.media_id
WHERE p.profile_id=? AND COALESCE(w.hidden,0)=0
ORDER BY p.last_played_at DESC
LIMIT 120
`).all(profileId) as unknown as ActivityRow[];

  const activity=rows.map(mapActivityItem);
  const continueWatching=dedupeWorks(activity.filter(item=>
    !item.completed &&
    item.position>=CONTINUE_MIN_SECONDS &&
    (item.duration<=0 || item.position/item.duration<COMPLETE_RATIO)
  ),12);
  const recentWatching=dedupeWorks(activity,20);

  const favoriteRows=conn.prepare(`
SELECT w.id,w.title,w.year,w.media_type,w.poster_url
FROM favorite_works f
JOIN works w ON w.id=f.work_id
WHERE f.profile_id=? AND COALESCE(w.hidden,0)=0
ORDER BY f.created_at DESC
LIMIT 20
`).all(profileId) as unknown as FavoriteRow[];

  const watchlistRows=conn.prepare(`
SELECT w.id,w.title,w.year,w.media_type,w.poster_url
FROM watchlist_works q
JOIN works w ON w.id=q.work_id
WHERE q.profile_id=? AND COALESCE(w.hidden,0)=0
ORDER BY q.created_at DESC
LIMIT 20
`).all(profileId) as unknown as FavoriteRow[];

  const mapWork=(row:FavoriteRow):ActivityWork=>({
    id:row.id,
    title:row.title,
    year:row.year??undefined,
    mediaType:row.media_type==='tv'?'tv':'movie',
    posterUrl:row.poster_url??undefined,
  });

  return {
    continueWatching,
    recentWatching,
    favorites:favoriteRows.map(mapWork),
    watchlist:watchlistRows.map(mapWork),
  };
}

interface ProgressRow {
  media_id:string;
  work_id:string;
  position:number;
  duration:number;
  completed:number;
  last_played_at:number;
}

interface ActivityRow extends ProgressRow {
  title:string;
  year:string|null;
  media_type:string;
  poster_url:string|null;
  season:number|null;
  episode:number|null;
}

interface FavoriteRow {
  id:string;
  title:string;
  year:string|null;
  media_type:string;
  poster_url:string|null;
}

function mapProgress(row:ProgressRow):PlaybackProgress {
  return {
    mediaId:row.media_id,
    workId:row.work_id,
    position:Number(row.position||0),
    duration:Number(row.duration||0),
    completed:row.completed===1,
    lastPlayedAt:Number(row.last_played_at||0),
  };
}

function mapActivityItem(row:ActivityRow):ActivityItem {
  return {
    ...mapProgress(row),
    work:{
      id:row.work_id,
      title:row.title,
      year:row.year??undefined,
      mediaType:row.media_type==='tv'?'tv':'movie',
      posterUrl:row.poster_url??undefined,
    },
    media:{
      id:row.media_id,
      season:row.season??undefined,
      episode:row.episode??undefined,
    },
  };
}

function dedupeWorks(items:ActivityItem[],limit:number):ActivityItem[] {
  const seen=new Set<string>();
  const result:ActivityItem[]=[];
  for(const item of items){
    if(seen.has(item.work.id))continue;
    seen.add(item.work.id);
    result.push(item);
    if(result.length>=limit)break;
  }
  return result;
}

function boundedNumber(value:number,min:number,max:number):number {
  if(!Number.isFinite(value))return min;
  return Math.max(min,Math.min(max,value));
}
