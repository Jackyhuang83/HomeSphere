import { NextResponse } from 'next/server';
import { guardRequest, jsonError } from '@/lib/api-guard';
import { getWork } from '@/lib/library/db';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(req:Request,ctx:{params:Promise<{id:string}>}) {
  const guarded=guardRequest(req);
  if(guarded) return guarded;
  const {id}=await ctx.params;
  const work=getWork(id);
  if(!work) return jsonError('作品不存在',404);
  return NextResponse.json(work,{headers:{'Cache-Control':'private, no-store'}});
}
