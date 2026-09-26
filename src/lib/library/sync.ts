import path from 'node:path';
import type { CloudEntry, CloudProviderKind } from '@/lib/cloud/provider';
import { getCloudProvider } from '@/lib/cloud/registry';
import { mediaId, upsertMedia, upsertWork, workId } from './db';
import { buildGroupKey, isVideoFile, parseMediaName } from './media-name';

export interface SyncSummary {
  provider: CloudProviderKind;
  roots: string[];
  directoriesScanned: number;
  filesSeen: number;
  videoFilesIndexed: number;
  worksIndexed: number;
  skipped: number;
  startedAt: number;
  finishedAt: number;
}

export async function syncConfiguredMedia(providerKind: CloudProviderKind = '115', signal?: AbortSignal): Promise<SyncSummary> {
  const provider = getCloudProvider(providerKind);
  const roots = configuredMediaRoots(providerKind);
  if (roots.length === 0) throw new Error(`${providerKind} 未配置媒体目录`);

  const startedAt = Date.now();
  let directoriesScanned = 0, filesSeen = 0, videoFilesIndexed = 0, skipped = 0;
  const seenWorks = new Set<string>();
  const maxFiles = intEnv('ONEHUBX_SYNC_MAX_FILES', 20000, 100, 200000);

  for (const root of roots) {
    signal?.throwIfAborted();
    const rootEntry = await provider.resolvePath(root, signal);
    if (!rootEntry?.isDir) throw new Error(`媒体目录不存在或不是目录：${root}`);
    const stack: Array<{ id: string; remotePath: string }> = [{ id: rootEntry.id, remotePath: normalizeRemotePath(root) }];

    while (stack.length) {
      signal?.throwIfAborted();
      const dir = stack.pop()!;
      directoriesScanned++;
      const entries = await provider.listDir(dir.id, signal);

      for (const entry of entries) {
        filesSeen++;
        if (filesSeen > maxFiles) {
          throw new Error(`扫描文件数超过 ONEHUBX_SYNC_MAX_FILES=${maxFiles}，已停止以保护网盘接口`);
        }
        const remotePath = joinRemote(dir.remotePath, entry.name);
        if (entry.isDir) {
          stack.push({ id: entry.id, remotePath });
          continue;
        }
        if (!isVideoFile(entry.name)) {
          skipped++;
          continue;
        }
        const work = indexVideo(providerKind, remotePath, entry);
        seenWorks.add(work);
        videoFilesIndexed++;
      }
    }
  }

  return {
    provider: providerKind, roots, directoriesScanned, filesSeen, videoFilesIndexed, worksIndexed: seenWorks.size,
    skipped, startedAt, finishedAt: Date.now(),
  };
}

function indexVideo(provider: CloudProviderKind, remotePath: string, entry: CloudEntry): string {
  const parsed = parseMediaName(entry.name);
  const groupKey = buildGroupKey(parsed.mediaType, parsed.title, parsed.year);
  const wid = workId(provider, groupKey);
  const now = Date.now();

  upsertWork({
    id: wid, provider, groupKey, title: parsed.title, year: parsed.year, mediaType: parsed.mediaType,
    scrapeStatus: 'pending', manualMatch: false, updatedAt: now,
  });

  upsertMedia({
    id: mediaId(provider, remotePath), workId: wid, provider, remoteId: entry.id, token: entry.token, path: remotePath,
    title: parsed.title, year: parsed.year, mediaType: parsed.mediaType, season: parsed.season, episode: parsed.episode,
    size: entry.size, updatedAt: now,
  });
  return wid;
}

export function configuredMediaRoots(provider: CloudProviderKind): string[] {
  const key = provider === '115' ? 'ONEHUBX_115_MEDIA_DIRS' : 'ONEHUBX_QUARK_MEDIA_DIRS';
  const raw = process.env[key]?.trim();
  if (!raw) return [];
  if (raw.startsWith('[')) {
    try {
      const value = JSON.parse(raw) as unknown;
      if (Array.isArray(value)) return uniqueRoots(value.map(String));
    } catch {}
  }
  return uniqueRoots(raw.split(/[\n,]/));
}

function uniqueRoots(values: string[]): string[] {
  return [...new Set(values.map(normalizeRemotePath).filter((v) => v !== '/'))];
}
function normalizeRemotePath(value: string): string {
  const clean = value.trim().replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/\/$/, '');
  if (!clean) return '/';
  return clean.startsWith('/') ? clean : `/${clean}`;
}
function joinRemote(base: string, name: string): string { return path.posix.join(base || '/', name); }
function intEnv(name: string, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}
