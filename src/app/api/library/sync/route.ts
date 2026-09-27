import { NextResponse } from 'next/server';
import { guardRequest, jsonError } from '@/lib/api-guard';
import { syncStrmLibrary } from '@/lib/library/strm';

export const runtime='nodejs';
export const dynamic='force-dynamic';
let running=false;

export async function POST(req:Request){
  const guarded=guardRequest(req);if(guarded)return guarded;
  if(running)return jsonError('STRM 片库同步正在运行',409);
  running=true;
  try{
    const summary=await syncStrmLibrary(req.signal);
    return NextResponse.json({success:true,summary},{headers:{'Cache-Control':'private, no-store'}});
  }catch(error){
    return jsonError(error instanceof Error?error.message:'STRM 片库同步失败',502);
  }finally{running=false;}
}
