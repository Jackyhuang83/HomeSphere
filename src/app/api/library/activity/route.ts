import { NextResponse } from 'next/server';
import { guardRequest, jsonError } from '@/lib/api-guard';
import {
  getLibraryActivitySummary,
  getWorkActivityState,
  savePlaybackProgress,
  setWorkFavorite,
  setWorkWatchlist,
} from '@/lib/library/activity';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const ID_RE=/^[a-f0-9]{24}$/;

export async function GET(req:Request){
  const guarded=guardRequest(req);if(guarded)return guarded;
  const workId=new URL(req.url).searchParams.get('workId')?.trim()||'';
  const data=workId
    ? ID_RE.test(workId)
      ? getWorkActivityState(workId)
      : null
    : getLibraryActivitySummary();
  if(data===null)return jsonError('作品 ID 无效',400);
  return NextResponse.json(data,{headers:{'Cache-Control':'private, no-store'}});
}

export async function POST(req:Request){
  const guarded=guardRequest(req);if(guarded)return guarded;

  let body:unknown;
  try{body=await req.json();}
  catch{return jsonError('请求格式无效',400);}
  if(!body||typeof body!=='object')return jsonError('请求格式无效',400);

  const input=body as Record<string,unknown>;
  if(input.action==='progress'){
    const mediaId=typeof input.mediaId==='string'?input.mediaId.trim():'';
    if(!ID_RE.test(mediaId))return jsonError('媒体 ID 无效',400);
    const position=Number(input.position);
    const duration=Number(input.duration);
    if(!Number.isFinite(position)||!Number.isFinite(duration)||position<=0||duration<0){
      return jsonError('播放进度无效',400);
    }
    const progress=savePlaybackProgress(mediaId,position,duration);
    if(!progress)return jsonError('媒体文件不存在或播放进度无效',404);
    return NextResponse.json(progress,{headers:{'Cache-Control':'private, no-store'}});
  }

  if(input.action==='favorite'){
    const workId=typeof input.workId==='string'?input.workId.trim():'';
    if(!ID_RE.test(workId)||typeof input.favorite!=='boolean'){
      return jsonError('收藏参数无效',400);
    }
    if(!setWorkFavorite(workId,input.favorite))return jsonError('作品不存在',404);
    return NextResponse.json({workId,favorite:input.favorite},{headers:{'Cache-Control':'private, no-store'}});
  }

  if(input.action==='watchlist'){
    const workId=typeof input.workId==='string'?input.workId.trim():'';
    if(!ID_RE.test(workId)||typeof input.watchlist!=='boolean'){
      return jsonError('想看参数无效',400);
    }
    if(!setWorkWatchlist(workId,input.watchlist))return jsonError('作品不存在',404);
    return NextResponse.json({workId,watchlist:input.watchlist},{headers:{'Cache-Control':'private, no-store'}});
  }

  return jsonError('不支持的操作',400);
}
