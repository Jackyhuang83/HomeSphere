import { NextResponse } from 'next/server';
import { guardRequest, jsonError } from '@/lib/api-guard';
import { getMedia } from '@/lib/library/db';
import { getStoredSubtitle } from '@/lib/subtitles/store';
import { shiftVttTimestamps } from '@/lib/subtitles/convert';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(req:Request,ctx:{params:Promise<{mediaId:string}>}){
  const guarded=guardRequest(req);if(guarded)return guarded;
  const {mediaId}=await ctx.params;
  if(!getMedia(mediaId))return jsonError('媒体条目不存在',404);
  const stored=await getStoredSubtitle(mediaId);
  if(!stored)return new NextResponse('字幕不存在',{status:404,headers:{'Cache-Control':'private, no-store'}});
  const offset=Number(stored.meta.offsetSeconds||0);
  const vtt=shiftVttTimestamps(stored.vtt,offset);
  return new NextResponse(vtt,{
    status:200,
    headers:{
      'Content-Type':'text/vtt; charset=utf-8',
      'Cache-Control':'private, no-store',
      'X-Content-Type-Options':'nosniff',
    },
  });
}
