import { NextResponse } from 'next/server';
import { guardRequest, jsonError } from '@/lib/api-guard';
import { scrapePendingWorks } from '@/lib/tmdb/scraper';

export const runtime='nodejs';
export const dynamic='force-dynamic';

let running=false;

export async function POST(req:Request) {
  const guarded=guardRequest(req);
  if(guarded) return guarded;
  if(running) return jsonError('TMDB 整理正在运行',409);
  running=true;
  try {
    const body=await req.json().catch(()=>({})) as {limit?:number};
    const limit=Number.isFinite(body.limit)?Math.max(1,Math.min(100,Math.trunc(body.limit!))):50;
    const summary=await scrapePendingWorks(limit,req.signal);
    return NextResponse.json({success:true,summary});
  } catch(error) {
    return jsonError(error instanceof Error?error.message:'TMDB 整理失败',502);
  } finally { running=false; }
}
