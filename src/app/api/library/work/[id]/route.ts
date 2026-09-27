import { NextResponse } from 'next/server';
import { guardRequest, jsonError } from '@/lib/api-guard';
import { getWork } from '@/lib/library/db';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(req:Request,ctx:{params:Promise<{id:string}>}){
  const guarded=guardRequest(req);if(guarded)return guarded;
  const {id}=await ctx.params;
  const item=getWork(id);
  if(!item)return jsonError('作品不存在',404);
  return NextResponse.json(item,{headers:{'Cache-Control':'private, no-store'}});
}
