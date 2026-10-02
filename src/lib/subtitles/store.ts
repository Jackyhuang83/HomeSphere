import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface StoredSubtitleMeta {
  mediaId:string;
  provider:'assrt';
  candidateId:number;
  title:string;
  language:string;
  sourceFile:string;
  installedAt:number;
  offsetSeconds?:number;
}

function rootDir():string {
  const dataDir=process.env.HOMESPHERE_DATA_DIR?.trim()||path.join(process.cwd(),'.data');
  return path.join(dataDir,'subtitles');
}

function assertMediaId(mediaId:string):void {
  if(!/^[a-f0-9]{24}$/i.test(mediaId))throw new Error('字幕媒体 ID 无效');
}

function paths(mediaId:string){
  assertMediaId(mediaId);
  const root=rootDir();
  return {
    root,
    vtt:path.join(root,`${mediaId}.vtt`),
    meta:path.join(root,`${mediaId}.json`),
  };
}

export async function getStoredSubtitle(mediaId:string):Promise<{meta:StoredSubtitleMeta;vtt:string}|null>{
  const p=paths(mediaId);
  try{
    const [metaRaw,vtt]=await Promise.all([readFile(p.meta,'utf8'),readFile(p.vtt,'utf8')]);
    return {meta:JSON.parse(metaRaw) as StoredSubtitleMeta,vtt};
  }catch{return null;}
}

export async function saveStoredSubtitle(mediaId:string,vtt:string,meta:Omit<StoredSubtitleMeta,'mediaId'|'installedAt'>):Promise<StoredSubtitleMeta>{
  const p=paths(mediaId);
  await mkdir(p.root,{recursive:true});
  const full:StoredSubtitleMeta={mediaId,...meta,offsetSeconds:0,installedAt:Date.now()};
  await Promise.all([
    writeFile(p.vtt,vtt,{encoding:'utf8',mode:0o600}),
    writeFile(p.meta,JSON.stringify(full,null,2)+'\n',{encoding:'utf8',mode:0o600}),
  ]);
  return full;
}

export async function deleteStoredSubtitle(mediaId:string):Promise<void>{
  const p=paths(mediaId);
  await Promise.all([rm(p.vtt,{force:true}),rm(p.meta,{force:true})]);
}


export async function updateStoredSubtitleOffset(mediaId:string,offsetSeconds:number):Promise<StoredSubtitleMeta>{
  if(!Number.isFinite(offsetSeconds))throw new Error('字幕偏移量无效');
  const rounded=Math.round(offsetSeconds*2)/2;
  if(rounded<-30||rounded>30)throw new Error('字幕偏移量仅支持 -30 到 +30 秒');
  const p=paths(mediaId);
  const stored=await getStoredSubtitle(mediaId);
  if(!stored)throw new Error('字幕不存在');
  const meta:StoredSubtitleMeta={...stored.meta,offsetSeconds:rounded};
  await writeFile(p.meta,JSON.stringify(meta,null,2)+'\n',{encoding:'utf8',mode:0o600});
  return meta;
}
