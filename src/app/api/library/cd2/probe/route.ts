import { NextResponse } from 'next/server';
import { guardRequest, jsonError } from '@/lib/api-guard';
import { runCd2Probe } from '@/lib/cd2/probe';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(req:Request) {
  const guarded=guardRequest(req);
  if(guarded) return guarded;
  try {
    const result=await runCd2Probe(req.headers.get('user-agent') || '',req.signal);
    return NextResponse.json(result,{headers:{'Cache-Control':'private, no-store'}});
  } catch(error) {
    return jsonError(error instanceof Error?error.message:'CloudDrive2 探针失败',502);
  }
}
