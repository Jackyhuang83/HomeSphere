import { NextResponse } from 'next/server';
import { guardRequest, jsonError } from '@/lib/api-guard';
import { searchWorks } from '@/lib/library/db';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(req:Request){
  const guarded=guardRequest(req);if(guarded)return guarded;
  const url=new URL(req.url);
  const q=url.searchParams.get('q')?.trim()||'';
  const hidden=url.searchParams.get('hidden')==='1';
  if(!q)return jsonError('缺少搜索关键词',400);
  return NextResponse.json({items:searchWorks(q,60,hidden)},{headers:{'Cache-Control':'private, no-store'}});
}
