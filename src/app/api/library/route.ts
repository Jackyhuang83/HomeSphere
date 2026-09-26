import { NextResponse } from 'next/server';
import { guardRequest } from '@/lib/api-guard';
import { listWorks } from '@/lib/library/db';
import { activeLibraryProvider, isLibraryConfigured, libraryMode, librarySourceLabel } from '@/lib/library/mode';
import { tmdbConfigured } from '@/lib/tmdb/client';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(req:Request) {
  const guarded=guardRequest(req);
  if(guarded) return guarded;
  const url=new URL(req.url);
  const type=url.searchParams.get('type');
  const provider=activeLibraryProvider();
  const result=listWorks({
    limit:Number(url.searchParams.get('limit') || 60),
    offset:Number(url.searchParams.get('offset') || 0),
    type:type==='movie'||type==='tv'?type:undefined,
    provider,
  });
  return NextResponse.json({
    ...result,
    libraryMode:libraryMode(),
    libraryProvider:provider,
    librarySourceLabel:librarySourceLabel(),
    libraryConfigured:isLibraryConfigured(),
    tmdbConfigured:tmdbConfigured(),
  },{headers:{'Cache-Control':'private, no-store'}});
}
