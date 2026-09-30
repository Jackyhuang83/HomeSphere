import { NextResponse } from 'next/server';
import { guardRequest } from '@/lib/api-guard';
import { listWorks } from '@/lib/library/db';
import { isLibraryConfigured } from '@/lib/library/config';
import { tmdbConfigured } from '@/lib/tmdb/client';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(req:Request){
  const guarded=guardRequest(req);if(guarded)return guarded;
  const url=new URL(req.url);
  const type=url.searchParams.get('type');
  const year=url.searchParams.get('year')?.trim()||undefined;
  const region=url.searchParams.get('region');
  const sort=url.searchParams.get('sort');
  const animation=url.searchParams.get('animation');
  const result=listWorks({
    limit:Number(url.searchParams.get('limit')||60),
    offset:Number(url.searchParams.get('offset')||0),
    type:type==='movie'||type==='tv'?type:undefined,
    year:/^(?:19|20)\d{2}$/.test(year||'')?year:undefined,
    region:region==='mainland'||region==='hmt'||region==='overseas'?region:undefined,
    animation:animation==='1',
    sort:sort==='recent'?'recent':undefined,
  });
  return NextResponse.json({...result,libraryConfigured:isLibraryConfigured(),tmdbConfigured:tmdbConfigured()},{
    headers:{'Cache-Control':'private, no-store'}
  });
}
