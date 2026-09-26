import { NextResponse } from 'next/server';
import { guardRequest, jsonError } from '@/lib/api-guard';
import { syncConfiguredLibrary } from '@/lib/library/sync';

export const runtime='nodejs';
export const dynamic='force-dynamic';

let running=false;

export async function POST(req:Request) {
  const guarded=guardRequest(req);
  if(guarded) return guarded;
  if(running) return jsonError('115 片库同步正在运行',409);
  running=true;
  try {
    const summary=await syncConfiguredLibrary('115',req.signal);
    return NextResponse.json({success:true,summary},{headers:{'Cache-Control':'private, no-store'}});
  } catch(error) {
    return jsonError(error instanceof Error?error.message:'115 片库同步失败',502);
  } finally {
    running=false;
  }
}
