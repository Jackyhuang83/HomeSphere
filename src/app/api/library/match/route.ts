import { NextResponse } from 'next/server';
import { guardRequest, jsonError } from '@/lib/api-guard';
import { matchLibraryWorks } from '@/lib/library/db';
import { activeLibraryProvider } from '@/lib/library/mode';
import type { LibraryMatchRequestItem } from '@/lib/types';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function POST(req:Request) {
  const guarded=guardRequest(req);
  if(guarded) return guarded;

  let body:{items?:unknown};
  try { body=await req.json() as {items?:unknown}; }
  catch { return jsonError('请求格式错误',400); }

  if(!Array.isArray(body.items)) return jsonError('items 必须是数组',400);
  if(body.items.length>60) return jsonError('单次最多匹配60个推荐条目',400);

  const items:LibraryMatchRequestItem[]=[];
  for(let i=0;i<body.items.length;i++) {
    const raw=body.items[i];
    if(!raw || typeof raw!=='object') return jsonError(`items[${i}] 格式错误`,400);
    const value=raw as Record<string,unknown>;
    const key=typeof value.key==='string'?value.key.trim():'';
    const title=typeof value.title==='string'?value.title.trim():'';
    const year=typeof value.year==='string'?value.year.trim():undefined;
    const isTv=typeof value.isTv==='boolean'?value.isTv:undefined;
    if(!key || key.length>160) return jsonError(`items[${i}].key 错误`,400);
    if(!title || title.length>200) return jsonError(`items[${i}].title 错误`,400);
    if(year && !/^(?:19|20)\d{2}$/.test(year)) return jsonError(`items[${i}].year 错误`,400);
    items.push({key,title,year,isTv});
  }

  const matches=matchLibraryWorks(items,activeLibraryProvider());
  return NextResponse.json({matches},{headers:{'Cache-Control':'private, no-store'}});
}
