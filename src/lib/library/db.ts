import crypto from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { CloudProviderKind } from '@/lib/cloud/provider';
import type { LibraryWork, LibraryWorkDetail, MediaItem, MediaListResult, ScrapeStatus, WorkListResult } from './types';

let db: DatabaseSync | null = null;

function dataDir(): string {
  return process.env.ONEHUBX_DATA_DIR?.trim() || '/data';
}

function database(): DatabaseSync {
  if (db) return db;
  const dir = dataDir();
  mkdirSync(dir, { recursive: true });
  db = new DatabaseSync(path.join(dir, 'onehubx.sqlite'));
  db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000;');

  db.exec(`
CREATE TABLE IF NOT EXISTS works (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  group_key TEXT NOT NULL,
  title TEXT NOT NULL,
  original_title TEXT,
  year TEXT,
  media_type TEXT NOT NULL,
  tmdb_id INTEGER,
  poster_url TEXT,
  backdrop_url TEXT,
  overview TEXT,
  scrape_status TEXT NOT NULL DEFAULT 'pending',
  scrape_error TEXT,
  match_confidence TEXT,
  manual_match INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  UNIQUE(provider, group_key)
);
CREATE INDEX IF NOT EXISTS idx_works_title ON works(title);
CREATE INDEX IF NOT EXISTS idx_works_status ON works(scrape_status);
CREATE INDEX IF NOT EXISTS idx_works_updated_at ON works(updated_at DESC);

CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  remote_id TEXT NOT NULL,
  token TEXT,
  path TEXT NOT NULL,
  title TEXT NOT NULL,
  original_title TEXT,
  year TEXT,
  media_type TEXT NOT NULL,
  poster_url TEXT,
  backdrop_url TEXT,
  overview TEXT,
  season INTEGER,
  episode INTEGER,
  size INTEGER,
  updated_at INTEGER NOT NULL,
  UNIQUE(provider, path)
);
CREATE INDEX IF NOT EXISTS idx_media_title ON media(title);
CREATE INDEX IF NOT EXISTS idx_media_provider_path ON media(provider,path);
CREATE INDEX IF NOT EXISTS idx_media_updated_at ON media(updated_at DESC);
`);

  ensureColumn(db, 'media', 'work_id', 'TEXT');
  db.exec('CREATE INDEX IF NOT EXISTS idx_media_work_id ON media(work_id);');
  return db;
}

function ensureColumn(conn: DatabaseSync, table: string, column: string, type: string): void {
  const rows = conn.prepare(`PRAGMA table_info(${table})`).all() as unknown as Array<{ name: string }>;
  if (!rows.some((row) => row.name === column)) {
    conn.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

export function mediaId(provider: CloudProviderKind, remotePath: string): string {
  return crypto.createHash('sha256').update(`${provider}:${remotePath}`).digest('hex').slice(0, 24);
}

export function workId(provider: CloudProviderKind, groupKey: string): string {
  return crypto.createHash('sha256').update(`work:${provider}:${groupKey}`).digest('hex').slice(0, 24);
}

export function upsertWork(seed: Omit<LibraryWork, 'fileCount'>): void {
  database().prepare(`
INSERT INTO works (
  id,provider,group_key,title,original_title,year,media_type,tmdb_id,poster_url,backdrop_url,overview,
  scrape_status,scrape_error,match_confidence,manual_match,updated_at
) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
ON CONFLICT(id) DO UPDATE SET
  provider=excluded.provider,
  group_key=excluded.group_key,
  title=CASE WHEN works.scrape_status IN ('matched','manual') THEN works.title ELSE excluded.title END,
  year=CASE WHEN works.scrape_status IN ('matched','manual') THEN works.year ELSE COALESCE(works.year, excluded.year) END,
  media_type=CASE WHEN works.scrape_status IN ('matched','manual') THEN works.media_type ELSE excluded.media_type END,
  updated_at=excluded.updated_at
`).run(
    seed.id, seed.provider, seed.groupKey, seed.title, seed.originalTitle ?? null, seed.year ?? null, seed.mediaType,
    seed.tmdbId ?? null, seed.posterUrl ?? null, seed.backdropUrl ?? null, seed.overview ?? null,
    seed.scrapeStatus, seed.scrapeError ?? null, seed.matchConfidence ?? null, seed.manualMatch ? 1 : 0, seed.updatedAt,
  );
}

export function upsertMedia(item: MediaItem): void {
  database().prepare(`
INSERT INTO media (
  id,work_id,provider,remote_id,token,path,title,original_title,year,media_type,poster_url,backdrop_url,overview,season,episode,size,updated_at
) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
ON CONFLICT(id) DO UPDATE SET
  work_id=excluded.work_id,
  remote_id=excluded.remote_id,
  token=excluded.token,
  path=excluded.path,
  title=excluded.title,
  original_title=excluded.original_title,
  year=excluded.year,
  media_type=excluded.media_type,
  poster_url=COALESCE(excluded.poster_url,media.poster_url),
  backdrop_url=COALESCE(excluded.backdrop_url,media.backdrop_url),
  overview=COALESCE(excluded.overview,media.overview),
  season=excluded.season,
  episode=excluded.episode,
  size=excluded.size,
  updated_at=excluded.updated_at
`).run(
    item.id, item.workId ?? null, item.provider, item.remoteId, item.token ?? null, item.path, item.title,
    item.originalTitle ?? null, item.year ?? null, item.mediaType, item.posterUrl ?? null, item.backdropUrl ?? null,
    item.overview ?? null, item.season ?? null, item.episode ?? null, item.size ?? null, item.updatedAt,
  );
}

export function getMedia(id: string): MediaItem | null {
  const row = database().prepare('SELECT * FROM media WHERE id = ?').get(id) as DbMediaRow | undefined;
  return row ? mapMediaRow(row) : null;
}

export function getWork(id: string): LibraryWorkDetail | null {
  const row = database().prepare(`
SELECT w.*, COUNT(m.id) AS file_count
FROM works w LEFT JOIN media m ON m.work_id=w.id
WHERE w.id=?
GROUP BY w.id
`).get(id) as DbWorkRow | undefined;
  if (!row) return null;
  const files = database().prepare(`
SELECT * FROM media WHERE work_id=? ORDER BY
  COALESCE(season,0) ASC, COALESCE(episode,0) ASC, path ASC
`).all(id) as unknown as DbMediaRow[];
  return { ...mapWorkRow(row), files: files.map(mapMediaRow) };
}

export function listWorks(opts?: { limit?: number; offset?: number; type?: 'movie' | 'tv' }): WorkListResult {
  const limit = clampInt(opts?.limit ?? 60, 1, 200);
  const offset = Math.max(0, opts?.offset ?? 0);
  const type = opts?.type;
  const where = type ? 'WHERE w.media_type = ?' : '';
  const args = type ? [type] : [];
  const rows = database().prepare(`
SELECT w.*, COUNT(m.id) AS file_count
FROM works w LEFT JOIN media m ON m.work_id=w.id
${where}
GROUP BY w.id
ORDER BY w.updated_at DESC, w.title ASC
LIMIT ? OFFSET ?
`).all(...args, limit, offset) as unknown as DbWorkRow[];
  const count = database().prepare(`SELECT COUNT(*) AS n FROM works w ${where}`).get(...args) as { n: number };
  return { items: rows.map(mapWorkRow), total: Number(count.n) };
}

export function searchWorks(query: string, limit = 50): LibraryWork[] {
  const q = query.trim();
  if (!q) return [];
  const pattern = `%${escapeLike(q)}%`;
  const rows = database().prepare(`
SELECT w.*, COUNT(m.id) AS file_count
FROM works w LEFT JOIN media m ON m.work_id=w.id
WHERE w.title LIKE ? ESCAPE '\\' OR COALESCE(w.original_title,'') LIKE ? ESCAPE '\\'
GROUP BY w.id
ORDER BY CASE WHEN w.title = ? THEN 0 ELSE 1 END, w.updated_at DESC
LIMIT ?
`).all(pattern, pattern, q, clampInt(limit, 1, 100)) as unknown as DbWorkRow[];
  return rows.map(mapWorkRow);
}

export function listWorksForScrape(limit = 50): LibraryWork[] {
  const rows = database().prepare(`
SELECT w.*, COUNT(m.id) AS file_count
FROM works w LEFT JOIN media m ON m.work_id=w.id
WHERE w.manual_match=0 AND w.scrape_status IN ('pending','failed')
GROUP BY w.id
ORDER BY CASE w.scrape_status WHEN 'pending' THEN 0 ELSE 1 END, w.updated_at DESC
LIMIT ?
`).all(clampInt(limit, 1, 200)) as unknown as DbWorkRow[];
  return rows.map(mapWorkRow);
}

export function setWorkMatch(id: string, patch: {
  title: string;
  originalTitle?: string;
  year?: string;
  mediaType: 'movie' | 'tv';
  tmdbId: number;
  posterUrl?: string;
  backdropUrl?: string;
  overview?: string;
  scrapeStatus: ScrapeStatus;
  matchConfidence?: 'high' | 'medium' | 'low';
  scrapeError?: string;
  manualMatch?: boolean;
}): void {
  database().prepare(`
UPDATE works SET
  title=?, original_title=?, year=?, media_type=?, tmdb_id=?, poster_url=?, backdrop_url=?, overview=?,
  scrape_status=?, match_confidence=?, scrape_error=?, manual_match=?, updated_at=?
WHERE id=?
`).run(
    patch.title, patch.originalTitle ?? null, patch.year ?? null, patch.mediaType, patch.tmdbId,
    patch.posterUrl ?? null, patch.backdropUrl ?? null, patch.overview ?? null, patch.scrapeStatus,
    patch.matchConfidence ?? null, patch.scrapeError ?? null, patch.manualMatch ? 1 : 0, Date.now(), id,
  );
}

export function setWorkScrapeState(id: string, status: ScrapeStatus, error?: string): void {
  database().prepare('UPDATE works SET scrape_status=?, scrape_error=?, updated_at=? WHERE id=?')
    .run(status, error ?? null, Date.now(), id);
}

export function listMedia(opts?: { limit?: number; offset?: number; type?: 'movie' | 'tv' }): MediaListResult {
  const limit = clampInt(opts?.limit ?? 60, 1, 200);
  const offset = Math.max(0, opts?.offset ?? 0);
  const type = opts?.type;
  const where = type ? 'WHERE media_type = ?' : '';
  const args = type ? [type] : [];
  const rows = database().prepare(`SELECT * FROM media ${where} ORDER BY updated_at DESC, title ASC LIMIT ? OFFSET ?`)
    .all(...args, limit, offset) as unknown as DbMediaRow[];
  const count = database().prepare(`SELECT COUNT(*) AS n FROM media ${where}`).get(...args) as { n: number };
  return { items: rows.map(mapMediaRow), total: Number(count.n) };
}

interface DbMediaRow {
  id: string; work_id: string | null; provider: string; remote_id: string; token: string | null; path: string;
  title: string; original_title: string | null; year: string | null; media_type: string; poster_url: string | null;
  backdrop_url: string | null; overview: string | null; season: number | null; episode: number | null; size: number | null;
  updated_at: number;
}

interface DbWorkRow {
  id: string; provider: string; group_key: string; title: string; original_title: string | null; year: string | null;
  media_type: string; tmdb_id: number | null; poster_url: string | null; backdrop_url: string | null; overview: string | null;
  scrape_status: string; scrape_error: string | null; match_confidence: string | null; manual_match: number; updated_at: number;
  file_count: number;
}

function mapMediaRow(row: DbMediaRow): MediaItem {
  return {
    id: row.id, workId: row.work_id ?? undefined, provider: row.provider as CloudProviderKind, remoteId: row.remote_id,
    token: row.token ?? undefined, path: row.path, title: row.title, originalTitle: row.original_title ?? undefined,
    year: row.year ?? undefined, mediaType: row.media_type as MediaItem['mediaType'], posterUrl: row.poster_url ?? undefined,
    backdropUrl: row.backdrop_url ?? undefined, overview: row.overview ?? undefined, season: row.season ?? undefined,
    episode: row.episode ?? undefined, size: row.size ?? undefined, updatedAt: row.updated_at,
  };
}

function mapWorkRow(row: DbWorkRow): LibraryWork {
  return {
    id: row.id, provider: row.provider as CloudProviderKind, groupKey: row.group_key, title: row.title,
    originalTitle: row.original_title ?? undefined, year: row.year ?? undefined,
    mediaType: row.media_type as LibraryWork['mediaType'], tmdbId: row.tmdb_id ?? undefined,
    posterUrl: row.poster_url ?? undefined, backdropUrl: row.backdrop_url ?? undefined, overview: row.overview ?? undefined,
    scrapeStatus: row.scrape_status as ScrapeStatus, scrapeError: row.scrape_error ?? undefined,
    matchConfidence: (row.match_confidence as LibraryWork['matchConfidence']) ?? undefined,
    manualMatch: row.manual_match === 1, fileCount: Number(row.file_count ?? 0), updatedAt: row.updated_at,
  };
}

function escapeLike(value: string): string { return value.replace(/[\\%_]/g, (m) => `\\${m}`); }
function clampInt(value: number, min: number, max: number): number {
  const n = Number.isFinite(value) ? Math.trunc(value) : min;
  return Math.max(min, Math.min(max, n));
}

export function __closeMediaDbForTest(): void {
  db?.close();
  db = null;
}
