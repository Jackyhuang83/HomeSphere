import crypto from 'node:crypto';
import path from 'node:path';
import { readFile, readdir, stat } from 'node:fs/promises';
import { buildGroupKey, parseMediaName } from './media-name';
import { makeMediaId, makeWorkId, reconcileProviderMedia, upsertMedia, upsertWork } from './db';
import { strmRoot } from './mode';

export interface StrmSyncSummary {
  provider: 'strm';
  root: string;
  directoriesScanned: number;
  entriesSeen: number;
  strmFilesIndexed: number;
  worksIndexed: number;
  invalidFiles: number;
  startedAt: number;
  finishedAt: number;
}

export async function syncStrmLibrary(signal?: AbortSignal): Promise<StrmSyncSummary> {
  const root = strmRoot();
  const rootStat = await stat(root).catch(() => null);
  if (!rootStat?.isDirectory()) {
    throw new Error(`STRM 目录不存在：${root}`);
  }

  const maxEntries = intEnv('HOMESPHERE_SYNC_MAX_ENTRIES', 30000, 100, 300000);
  const maxDirs = intEnv('HOMESPHERE_SYNC_MAX_DIRS', 5000, 10, 50000);
  const startedAt = Date.now();
  let directoriesScanned = 0;
  let entriesSeen = 0;
  let strmFilesIndexed = 0;
  let invalidFiles = 0;
  const works = new Set<string>();
  const mediaIds = new Set<string>();
  const stack = [root];

  while (stack.length) {
    signal?.throwIfAborted();
    const dir = stack.pop()!;
    if (++directoriesScanned > maxDirs) {
      throw new Error(`扫描目录数超过 HOMESPHERE_SYNC_MAX_DIRS=${maxDirs}，已停止`);
    }

    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      signal?.throwIfAborted();
      if (++entriesSeen > maxEntries) {
        throw new Error(`扫描条目超过 HOMESPHERE_SYNC_MAX_ENTRIES=${maxEntries}，已停止`);
      }

      const fullPath = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        invalidFiles++;
        continue;
      }
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.strm') {
        continue;
      }

      const sourceUrl = await readStrmUrl(fullPath);
      if (!sourceUrl) {
        invalidFiles++;
        continue;
      }

      const relative = path.relative(root, fullPath).split(path.sep).join('/');
      const parsed = parseMediaName(entry.name);
      const groupKey = buildGroupKey(parsed.mediaType, parsed.title, parsed.year);
      const workId = makeWorkId('strm', groupKey);
      const mediaId = makeMediaId('strm', relative);
      const now = Date.now();

      upsertWork({
        id: workId,
        provider: 'strm',
        groupKey,
        title: parsed.title,
        year: parsed.year,
        mediaType: parsed.mediaType,
        scrapeStatus: 'pending',
        manualMatch: false,
        updatedAt: now,
      });

      upsertMedia({
        id: mediaId,
        workId,
        provider: 'strm',
        remoteId: relative,
        sourceUrl,
        path: relative,
        filename: entry.name,
        title: parsed.title,
        year: parsed.year,
        mediaType: parsed.mediaType,
        season: parsed.season,
        episode: parsed.episode,
        hash: crypto.createHash('sha256').update(sourceUrl).digest('hex'),
        updatedAt: now,
      });

      mediaIds.add(mediaId);
      works.add(workId);
      strmFilesIndexed++;
    }
  }

  reconcileProviderMedia('strm', [...mediaIds]);

  return {
    provider: 'strm',
    root,
    directoriesScanned,
    entriesSeen,
    strmFilesIndexed,
    worksIndexed: works.size,
    invalidFiles,
    startedAt,
    finishedAt: Date.now(),
  };
}

export function validateStrmPlaybackUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('STRM 仅允许 http/https 播放地址');
  }
  if (url.username || url.password) {
    throw new Error('STRM 播放地址不能包含 URL 用户名/密码');
  }

  const rawAllow = process.env.HOMESPHERE_STRM_ALLOWED_HOSTS?.trim();
  if (rawAllow) {
    const allowed = new Set(
      rawAllow.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean)
    );
    if (!allowed.has(url.hostname.toLowerCase())) {
      throw new Error(`STRM Bridge 主机不在允许列表：${url.hostname}`);
    }
  }

  return url.toString();
}

async function readStrmUrl(filePath: string): Promise<string | null> {
  const fileStat = await stat(filePath);
  if (fileStat.size <= 0 || fileStat.size > 16 * 1024) {
    return null;
  }
  const text = (await readFile(filePath, 'utf8')).replace(/^\uFEFF/, '');
  const line = text.split(/\r?\n/).map((x) => x.trim()).find(Boolean);
  if (!line) return null;
  try {
    return validateStrmPlaybackUrl(line);
  } catch {
    return null;
  }
}

function intEnv(name: string, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}
