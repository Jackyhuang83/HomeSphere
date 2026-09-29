import { NextResponse } from 'next/server';
import { guardRequest, jsonError } from '@/lib/api-guard';
import { resolve115HlsPlayback } from '@/lib/library/115-hls';
import { getBridgeHealth } from '@/lib/library/bridge-health';
import { getProbeMedia } from '@/lib/library/db';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const PROBE_MIN_INTERVAL_MS=30_000;
let lastProbeAt=0;

export async function POST(req:Request){
  const guarded=guardRequest(req);if(guarded)return guarded;
  const health=getBridgeHealth();
  if(!health.ready)return jsonError(health.errors[0]||'Bridge 配置未就绪',400);
  const media=getProbeMedia();
  if(!media?.sourceUrl)return jsonError('没有可用于探测的 STRM 条目；请先同步 STRM',400);
  const now=Date.now();
  const retryAfter=PROBE_MIN_INTERVAL_MS-(now-lastProbeAt);
  if(retryAfter>0){
    return NextResponse.json({error:'Bridge 探测过于频繁，请稍后再试',retryAfterSeconds:Math.ceil(retryAfter/1000)},{
      status:429,headers:{'Retry-After':String(Math.ceil(retryAfter/1000)),'Cache-Control':'private, no-store'}
    });
  }
  lastProbeAt=now;
  const started=Date.now();
  try{
    const resolved=await resolve115HlsPlayback(media.sourceUrl,{
      signal:req.signal,userAgent:req.headers.get('user-agent')||undefined,
    });
    const upstream=new URL(resolved.upstreamUrl);
    return NextResponse.json({
      success:true,sample:{id:media.id,filename:media.filename},
      bridgeHost:new URL(media.sourceUrl).hostname,finalHost:upstream.hostname,
      finalProtocol:upstream.protocol.replace(':',''),playbackType:'hls',
      durationMs:Date.now()-started,checkedAt:Date.now(),
    },{headers:{'Cache-Control':'private, no-store'}});
  }catch(error){return jsonError(error instanceof Error?error.message:'HLS 播放链路探测失败',502);}
}
