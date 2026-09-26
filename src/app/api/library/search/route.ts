import { NextResponse } from 'next/server';
import { guardRequest, jsonError } from '@/lib/api-guard';
import { searchMedia } from '@/lib/library/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const guarded = guardRequest(req);
  if (guarded) return guarded;
  const q = new URL(req.url).searchParams.get('q')?.trim() ?? '';
  if (!q) return jsonError('缺少搜索关键词', 400);
  return NextResponse.json(
    { items: searchMedia(q, 60) },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
