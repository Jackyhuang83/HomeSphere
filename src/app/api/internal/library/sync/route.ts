import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { jsonError } from '@/lib/api-guard';
import { syncStrmLibrary } from '@/lib/library/strm';

export const runtime='nodejs';
export const dynamic='force-dynamic';

function authorized(req:Request):boolean{
  const expected=process.env.PROXY_SECRET?.trim()||'';
  const actual=req.headers.get('x-homesphere-internal-key')?.trim()||'';
  if(!expected||!actual)return false;
  const a=Buffer.from(actual);
  const b=Buffer.from(expected);
  return a.length===b.length&&crypto.timingSafeEqual(a,b);
}

export async function POST(req:Request){
  if(!authorized(req))return jsonError('Unauthorized',401);
  try{
    const summary=await syncStrmLibrary(req.signal);
    return NextResponse.json({success:true,summary},{headers:{'Cache-Control':'private, no-store'}});
  }catch(error){
    const message=error instanceof Error?error.message:'STRM 片库同步失败';
    return jsonError(message,message.includes('正在运行')?409:502);
  }
}
