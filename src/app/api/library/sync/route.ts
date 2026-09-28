import { NextResponse } from 'next/server';
import { guardRequest, jsonError } from '@/lib/api-guard';
import { syncStrmLibrary } from '@/lib/library/strm';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(req:Request){
  const guarded=guardRequest(req);if(guarded)return guarded;
  try{
    const summary=await syncStrmLibrary(req.signal);
    return NextResponse.json({success:true,summary},{headers:{'Cache-Control':'private, no-store'}});
  }catch(error){
    const message=error instanceof Error?error.message:'STRM 片库同步失败';
    return jsonError(message,message.includes('正在运行')?409:502);
  }
}
