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
  const type=url.searchParams.get('type');
  const year=url.searchParams.get('year')?.trim()||undefined;
  const region=url.searchParams.get('region');
  const animation=url.searchParams.get('animation')==='1';
  const personal=url.searchParams.get('personal');
  const watch=url.searchParams.get('watch');
  if(!q)return jsonError('缺少搜索关键词',400);

  return NextResponse.json({
    items:searchWorks(q,60,hidden,{
      type:type==='movie'||type==='tv'?type:undefined,
      year:/^(?:19|20)\d{2}$/.test(year||'')?year:undefined,
      region:region==='mainland'||region==='hmt'||region==='overseas'?region:undefined,
      animation,
      personal:personal==='favorite'||personal==='watchlist'?personal:undefined,
      watchState:watch==='watched'||watch==='inprogress'||watch==='unwatched'?watch:undefined,
    })
  },{headers:{'Cache-Control':'private, no-store'}});
}
