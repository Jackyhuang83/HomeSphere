import { NextResponse } from 'next/server';
import { guardRequest, jsonError } from '@/lib/api-guard';
import { getWork, setWorkHidden } from '@/lib/library/db';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(req:Request,ctx:{params:Promise<{id:string}>}){
  const guarded=guardRequest(req);if(guarded)return guarded;
  const {id}=await ctx.params;
  const item=getWork(id);
  if(!item)return jsonError('作品不存在',404);
  return NextResponse.json(item,{headers:{'Cache-Control':'private, no-store'}});
}

export async function PATCH(req:Request,ctx:{params:Promise<{id:string}>}){
  const guarded=guardRequest(req);if(guarded)return guarded;
  const {id}=await ctx.params;
  if(!getWork(id))return jsonError('作品不存在',404);

  let body:unknown;
  try{body=await req.json();}
  catch{return jsonError('请求格式错误',400);}
  if(!body||typeof body!=='object')return jsonError('请求格式错误',400);

  const hidden=(body as {hidden?:unknown}).hidden;
  if(typeof hidden!=='boolean')return jsonError('hidden 参数错误',400);
  if(!setWorkHidden(id,hidden))return jsonError('作品不存在',404);

  return NextResponse.json({success:true,work:getWork(id)},{
    headers:{'Cache-Control':'private, no-store'}
  });
}
