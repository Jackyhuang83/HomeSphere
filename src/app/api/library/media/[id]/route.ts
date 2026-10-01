import { NextResponse } from 'next/server';
import { guardRequest, jsonError } from '@/lib/api-guard';
import { getMedia, updateMediaEpisode } from '@/lib/library/db';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function PATCH(req:Request,ctx:{params:Promise<{id:string}>}){
  const guarded=guardRequest(req);if(guarded)return guarded;
  const {id}=await ctx.params;
  if(!getMedia(id))return jsonError('媒体文件不存在',404);

  let body:unknown;
  try{body=await req.json();}
  catch{return jsonError('请求格式错误',400);}
  if(!body||typeof body!=='object')return jsonError('请求格式错误',400);
  const input=body as Record<string,unknown>;
  if(input.action!=='episode')return jsonError('不支持的更新操作',400);

  const season=Number(input.season);
  const episode=Number(input.episode);
  if(!Number.isInteger(season)||season<0||season>99)return jsonError('季数必须是 0-99 的整数',400);
  if(!Number.isInteger(episode)||episode<1||episode>9999)return jsonError('集数必须是 1-9999 的整数',400);

  const media=updateMediaEpisode(id,season,episode);
  if(!media)return jsonError('媒体文件不存在',404);
  return NextResponse.json({success:true,media},{headers:{'Cache-Control':'private, no-store'}});
}
