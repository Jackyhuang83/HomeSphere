import crypto from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { CloudProviderKind } from '@/lib/cloud/provider';
import type { MediaItem, MediaListResult } from './types';

let db: DatabaseSync | null = null;
function dataDir(): string { return process.env.ONEHUBX_DATA_DIR?.trim() || '/data'; }
function database(): DatabaseSync { if (db) return db; const dir=dataDir(); mkdirSync(dir,{recursive:true}); db=new DatabaseSync(path.join(dir,'onehubx.sqlite')); db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000;'); db.exec(`
CREATE TABLE IF NOT EXISTS media (
id TEXT PRIMARY KEY,provider TEXT NOT NULL,remote_id TEXT NOT NULL,token TEXT,path TEXT NOT NULL,title TEXT NOT NULL,original_title TEXT,year TEXT,media_type TEXT NOT NULL,poster_url TEXT,backdrop_url TEXT,overview TEXT,season INTEGER,episode INTEGER,size INTEGER,updated_at INTEGER NOT NULL,UNIQUE(provider,path));
CREATE INDEX IF NOT EXISTS idx_media_title ON media(title);
CREATE INDEX IF NOT EXISTS idx_media_provider_path ON media(provider,path);
CREATE INDEX IF NOT EXISTS idx_media_updated_at ON media(updated_at DESC);`); return db; }
export function mediaId(provider:CloudProviderKind,remotePath:string){return crypto.createHash('sha256').update(`${provider}:${remotePath}`).digest('hex').slice(0,24);}
export function upsertMedia(item:MediaItem):void{database().prepare(`INSERT INTO media (id,provider,remote_id,token,path,title,original_title,year,media_type,poster_url,backdrop_url,overview,season,episode,size,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET remote_id=excluded.remote_id,token=excluded.token,path=excluded.path,title=excluded.title,original_title=excluded.original_title,year=excluded.year,media_type=excluded.media_type,poster_url=COALESCE(excluded.poster_url,media.poster_url),backdrop_url=COALESCE(excluded.backdrop_url,media.backdrop_url),overview=COALESCE(excluded.overview,media.overview),season=excluded.season,episode=excluded.episode,size=excluded.size,updated_at=excluded.updated_at`).run(item.id,item.provider,item.remoteId,item.token??null,item.path,item.title,item.originalTitle??null,item.year??null,item.mediaType,item.posterUrl??null,item.backdropUrl??null,item.overview??null,item.season??null,item.episode??null,item.size??null,item.updatedAt);}
export function getMedia(id:string):MediaItem|null{const row=database().prepare('SELECT * FROM media WHERE id = ?').get(id) as DbMediaRow|undefined;return row?mapRow(row):null;}
export function listMedia(opts?:{limit?:number;offset?:number;type?:'movie'|'tv'}):MediaListResult{const limit=clampInt(opts?.limit??60,1,200),offset=Math.max(0,opts?.offset??0),type=opts?.type,where=type?'WHERE media_type = ?':'',args=type?[type]:[];const rows=database().prepare(`SELECT * FROM media ${where} ORDER BY updated_at DESC, title ASC LIMIT ? OFFSET ?`).all(...args,limit,offset) as unknown as DbMediaRow[];const count=database().prepare(`SELECT COUNT(*) AS n FROM media ${where}`).get(...args) as {n:number};return{items:rows.map(mapRow),total:Number(count.n)};}
export function searchMedia(query:string,limit=50):MediaItem[]{const q=query.trim();if(!q)return[];const pattern=`%${escapeLike(q)}%`;const rows=database().prepare(`SELECT * FROM media WHERE title LIKE ? ESCAPE '\\' OR COALESCE(original_title,'') LIKE ? ESCAPE '\\' OR path LIKE ? ESCAPE '\\' ORDER BY CASE WHEN title = ? THEN 0 ELSE 1 END, updated_at DESC LIMIT ?`).all(pattern,pattern,pattern,q,clampInt(limit,1,100)) as unknown as DbMediaRow[];return rows.map(mapRow);}
export function clearMediaForProvider(provider:CloudProviderKind):void{database().prepare('DELETE FROM media WHERE provider = ?').run(provider);}
interface DbMediaRow{id:string;provider:string;remote_id:string;token:string|null;path:string;title:string;original_title:string|null;year:string|null;media_type:string;poster_url:string|null;backdrop_url:string|null;overview:string|null;season:number|null;episode:number|null;size:number|null;updated_at:number;}
function mapRow(row:DbMediaRow):MediaItem{return{id:row.id,provider:row.provider as CloudProviderKind,remoteId:row.remote_id,token:row.token??undefined,path:row.path,title:row.title,originalTitle:row.original_title??undefined,year:row.year??undefined,mediaType:row.media_type as MediaItem['mediaType'],posterUrl:row.poster_url??undefined,backdropUrl:row.backdrop_url??undefined,overview:row.overview??undefined,season:row.season??undefined,episode:row.episode??undefined,size:row.size??undefined,updatedAt:row.updated_at};}
function escapeLike(value:string){return value.replace(/[\\%_]/g,m=>`\\${m}`);} function clampInt(value:number,min:number,max:number){const n=Number.isFinite(value)?Math.trunc(value):min;return Math.max(min,Math.min(max,n));}
export function __closeMediaDbForTest(){db?.close();db=null;}
