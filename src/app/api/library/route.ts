import { NextResponse } from 'next/server';
import { guardRequest } from '@/lib/api-guard';
import { configuredProviderKinds } from '@/lib/cloud/registry';
import { listMedia } from '@/lib/library/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const guarded = guardRequest(req);
  if (guarded) return guarded;

  const url = new URL(req.url);
  const type = url.searchParams.get('type');
  const limit = Number(url.searchParams.get('limit') ?? 60);
  const offset = Number(url.searchParams.get('offset') ?? 0);
  const result = listMedia({
    limit,
    offset,
    type: type === 'movie' || type === 'tv' ? type : undefined,
  });

  return NextResponse.json({
    ...result,
    configuredProviders: configuredProviderKinds(),
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
