import path from 'node:path';
import type { CloudEntry, CloudProviderKind } from '@/lib/cloud/provider';
import { getCloudProvider } from '@/lib/cloud/registry';
import { buildGroupKey, isVideoFile, parseMediaName } from './media-name';
import { makeMediaId, makeWorkId, upsertMedia, upsertWork } from './db';

export interface SyncSummary {
  provider:CloudProviderKind;
  roots:string[];
  directoriesScanned:number;
  entriesSeen:number;
  videoFilesIndexed:number;
  worksIndexed:number;
  skipped:number;
  startedAt:number;
  finishedAt:number;
}

export async function syncConfiguredLibrary(providerKind:CloudProviderKind='115',signal?:AbortSignal):Promise<SyncSummary> {
  const provider=getCloudProvider(providerKind);
  if(!provider.isConfigured()) throw new Error(`${providerKind} Provider 尚未配置`);
  const roots=configuredMediaRoots(providerKind);
  if(!roots.length) throw new Error('未配置 HOMESPHERE_115_MEDIA_DIRS');

  const maxEntries=intEnv('HOMESPHERE_SYNC_MAX_ENTRIES',30000,100,300000);
  const maxDirs=intEnv('HOMESPHERE_SYNC_MAX_DIRS',5000,10,50000);
  const startedAt=Date.now();
  let directoriesScanned=0, entriesSeen=0, videoFilesIndexed=0, skipped=0;
  const works=new Set<string>();

  for(const root of roots) {
    signal?.throwIfAborted();
    const node=await provider.resolvePath(root,signal);
    if(!node?.isDir) throw new Error(`115 媒体目录不存在：${root}`);
    const stack:Array<{id:string;remotePath:string}>=[{id:node.id,remotePath:root}];

    while(stack.length) {
      signal?.throwIfAborted();
      if(++directoriesScanned>maxDirs) throw new Error(`扫描目录数超过 HOMESPHERE_SYNC_MAX_DIRS=${maxDirs}，已停止`);
      const dir=stack.pop()!;
      const entries=await provider.listDir(dir.id,signal);
      for(const entry of entries) {
        if(++entriesSeen>maxEntries) throw new Error(`扫描条目超过 HOMESPHERE_SYNC_MAX_ENTRIES=${maxEntries}，已停止`);
        const remotePath=path.posix.join(dir.remotePath,entry.name);
        if(entry.isDir) {
          stack.push({id:entry.id,remotePath});
          continue;
        }
        if(!isVideoFile(entry.name)) { skipped++; continue; }
        const workId=indexVideo(providerKind,remotePath,entry);
        works.add(workId);
        videoFilesIndexed++;
      }
    }
  }

  return {
    provider:providerKind, roots, directoriesScanned, entriesSeen, videoFilesIndexed,
    worksIndexed:works.size, skipped, startedAt, finishedAt:Date.now(),
  };
}

function indexVideo(provider:CloudProviderKind,remotePath:string,entry:CloudEntry):string {
  const parsed=parseMediaName(entry.name);
  const groupKey=buildGroupKey(parsed.mediaType,parsed.title,parsed.year);
  const workId=makeWorkId(provider,groupKey);
  const now=Date.now();

  upsertWork({
    id:workId, provider, groupKey, title:parsed.title, year:parsed.year,
    mediaType:parsed.mediaType, updatedAt:now,
  });
  upsertMedia({
    id:makeMediaId(provider,remotePath), workId, provider, remoteId:entry.id, token:entry.token,
    path:remotePath, filename:entry.name, title:parsed.title, year:parsed.year, mediaType:parsed.mediaType,
    season:parsed.season, episode:parsed.episode, size:entry.size, hash:entry.hash, updatedAt:now,
  });
  return workId;
}

export function configuredMediaRoots(provider:CloudProviderKind):string[] {
  const key=provider==='115'?'HOMESPHERE_115_MEDIA_DIRS':'HOMESPHERE_QUARK_MEDIA_DIRS';
  const raw=process.env[key]?.trim();
  if(!raw) return [];
  let values:string[]=[];
  if(raw.startsWith('[')) {
    try {
      const parsed=JSON.parse(raw) as unknown;
      if(Array.isArray(parsed)) values=parsed.map(String);
    } catch { throw new Error(`${key} JSON 格式错误`); }
  } else {
    values=raw.split(/[\n,]/);
  }
  const roots=[...new Set(values.map(normalizeRemotePath).filter(Boolean))];
  if(roots.includes('/')) throw new Error(`${key} 不允许配置根目录 /；请指定影视目录，避免全盘扫描`);
  return roots;
}
function normalizeRemotePath(value:string):string {
  const clean=value.trim().replace(/\\/g,'/').replace(/\/{2,}/g,'/').replace(/\/$/,'');
  if(!clean) return '';
  return clean.startsWith('/')?clean:`/${clean}`;
}
function intEnv(name:string,fallback:number,min:number,max:number):number {
  const n=Number.parseInt(process.env[name] || '',10);
  return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;
}
