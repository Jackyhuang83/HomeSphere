import { NextResponse } from 'next/server';
import { guardRequest, jsonError } from '@/lib/api-guard';
import { getTmdbDetails, searchTmdb } from '@/lib/tmdb/client';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(req:Request) {
  const guarded=guardRequest(req);
  if(guarded) return guarded;
  const url=new URL(req.url);
  const q=url.searchParams.get('q')?.trim() || '';
  const type=url.searchParams.get('type');
  const year=url.searchParams.get('year')?.trim() || undefined;
  if(!q) return jsonError('缺少 TMDB 搜索关键词',400);
  if(type!=='movie'&&type!=='tv') return jsonError('type 参数错误',400);
  try {
    if(/^\d+$/.test(q)){
      const item=await getTmdbDetails(type,Number(q),req.signal);
      return NextResponse.json({items:item?[item]:[]});
    }

    let items=await searchTmdb(q,type,year,req.signal);
    if(!items.length&&year) items=await searchTmdb(q,type,undefined,req.signal);

    if(/[A-Za-z]/.test(q)){
      const english=await searchTmdb(q,type,year,req.signal,'en-US');
      const merged=new Map<number,(typeof items)[number]>();
      for(const item of [...english,...items]) if(!merged.has(item.id)) merged.set(item.id,item);
      items=[...merged.values()];
    }

    return NextResponse.json({items});
  } catch(error) {
    return jsonError(error instanceof Error?error.message:'TMDB 搜索失败',502);
  }
}
