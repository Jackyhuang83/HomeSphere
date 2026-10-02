import { NextResponse } from 'next/server';
import { guardRequest, jsonError } from '@/lib/api-guard';
import { getMedia, getWork } from '@/lib/library/db';
import { assrtConfigured, downloadAssrtSubtitle, searchAssrt } from '@/lib/subtitles/assrt';
import { deleteStoredSubtitle, getStoredSubtitle, saveStoredSubtitle, updateStoredSubtitleOffset } from '@/lib/subtitles/store';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(req:Request){
  const guarded=guardRequest(req);if(guarded)return guarded;
  const url=new URL(req.url);
  const mediaId=url.searchParams.get('mediaId')?.trim()||'';
  const media=getMedia(mediaId);
  if(!media)return jsonError('媒体条目不存在',404);

  if(url.searchParams.get('action')==='search'){
    const work=getWork(media.workId);
    if(!work)return jsonError('作品不存在',404);
    if(!assrtConfigured())return jsonError('尚未配置 ASSRT API Token，请在 SSH 运行 homesphere → 14. 字幕中心',503);
    const queries=buildSearchQueries(media.filename,work.mediaType,work.originalTitle,work.title,media.season,media.episode);
    try{
      const items=await searchAssrt(queries,req.signal);
      return NextResponse.json({
        items,
        attribution:{label:'字幕服务由 assrt.net 提供',url:'https://2.assrt.net/'},
      },{headers:{'Cache-Control':'private, no-store'}});
    }catch(error){
      return jsonError(error instanceof Error?error.message:'字幕搜索失败',502);
    }
  }

  const stored=await getStoredSubtitle(mediaId);
  return NextResponse.json({
    configured:assrtConfigured(),
    installed:Boolean(stored),
    subtitle:stored?.meta||null,
    provider:'assrt',
  },{headers:{'Cache-Control':'private, no-store'}});
}

export async function POST(req:Request){
  const guarded=guardRequest(req);if(guarded)return guarded;
  let body:unknown;
  try{body=await req.json();}
  catch{return jsonError('请求格式错误',400);}
  if(!body||typeof body!=='object')return jsonError('请求格式错误',400);
  const input=body as Record<string,unknown>;
  const mediaId=typeof input.mediaId==='string'?input.mediaId.trim():'';
  const media=getMedia(mediaId);
  if(!media)return jsonError('媒体条目不存在',404);
  const work=getWork(media.workId);
  if(!work)return jsonError('作品不存在',404);

  if(input.action==='offset'){
    const offsetSeconds=Number(input.offsetSeconds);
    try{
      const meta=await updateStoredSubtitleOffset(mediaId,offsetSeconds);
      return NextResponse.json({success:true,subtitle:meta},{
        headers:{'Cache-Control':'private, no-store'}
      });
    }catch(error){
      return jsonError(error instanceof Error?error.message:'字幕同步调整失败',400);
    }
  }

  if(input.action==='install'){
    if(!assrtConfigured())return jsonError('尚未配置 ASSRT API Token',503);
    const candidateId=Number(input.candidateId);
    if(!Number.isInteger(candidateId)||candidateId<=0)return jsonError('字幕 ID 无效',400);
    try{
      const downloaded=await downloadAssrtSubtitle(candidateId,media.episode,req.signal);
      const meta=await saveStoredSubtitle(mediaId,downloaded.vtt,{
        provider:'assrt',
        candidateId,
        title:downloaded.title,
        language:downloaded.language,
        sourceFile:downloaded.sourceFile,
      });
      return NextResponse.json({success:true,subtitle:meta},{
        headers:{'Cache-Control':'private, no-store'}
      });
    }catch(error){
      return jsonError(error instanceof Error?error.message:'字幕安装失败',502);
    }
  }

  return jsonError('不支持的字幕操作',400);
}

export async function DELETE(req:Request){
  const guarded=guardRequest(req);if(guarded)return guarded;
  const url=new URL(req.url);
  const mediaId=url.searchParams.get('mediaId')?.trim()||'';
  if(!getMedia(mediaId))return jsonError('媒体条目不存在',404);
  try{
    await deleteStoredSubtitle(mediaId);
    return NextResponse.json({success:true},{headers:{'Cache-Control':'private, no-store'}});
  }catch(error){
    return jsonError(error instanceof Error?error.message:'删除字幕失败',500);
  }
}


function buildSearchQueries(
  filename:string,
  mediaType:'movie'|'tv',
  originalTitle:string|undefined,
  title:string,
  season:number|undefined,
  episode:number|undefined
):string[]{
  const basename=filename.replace(/\.[^.]+$/,'').trim();
  const episodeTag=mediaType==='tv'&&episode
    ?`S${String(season??1).padStart(2,'0')}E${String(episode).padStart(2,'0')}`
    :'';
  const titleQuery=[originalTitle||'',episodeTag].filter(Boolean).join(' ').trim();
  const fallback=[title,episodeTag].filter(Boolean).join(' ').trim();
  return [basename,titleQuery,fallback]
    .filter((value,index,array)=>value.length>=3&&array.indexOf(value)===index);
}
