import { NextResponse } from 'next/server';
import { guardRequest } from '@/lib/api-guard';
import { getBridgeHealth } from '@/lib/library/bridge-health';
import { listWorks } from '@/lib/library/db';
import { tmdbConfigured } from '@/lib/tmdb/client';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(req:Request){
  const guarded=guardRequest(req);
  if(guarded)return guarded;

  const bridge=getBridgeHealth();
  const library=listWorks({limit:1});
  const strmReady=bridge.strmRootReadable;
  const bridgeReady=bridge.allowedHosts.length>0;
  const indexed=library.total>0;
  const tmdbReady=tmdbConfigured();

  return NextResponse.json({
    ready:strmReady&&bridgeReady&&indexed,
    vps:{
      cpu:'1 vCPU',
      memory:'1 GB',
      disk:'50 GB',
      bandwidth:'10 Mbps',
      suitable:true,
      note:'适合 HomeSphere + 轻量 Media Bridge；禁止转码和视频字节中转。',
    },
    steps:[
      {
        id:'bridge',
        title:'启动 Media Bridge',
        required:true,
        ok:bridgeReady,
        detail:bridgeReady?`已允许 Bridge：${bridge.allowedHosts.join(', ')}`:'Bridge 与 HomeSphere 放在同一 VPS / Docker 内网，不公开播放解析端口。',
      },
      {
        id:'strm',
        title:'生成并挂载 STRM',
        required:true,
        ok:strmReady,
        detail:strmReady?`STRM 目录可读：${bridge.strmRoot}`:`把 Bridge 生成的 STRM 只读挂载到 ${bridge.strmRoot}`,
      },
      {
        id:'index',
        title:'建立片库索引',
        required:true,
        ok:indexed,
        detail:indexed?`已索引 ${library.total} 部作品`:'进入片库点击“同步STRM”。',
      },
      {
        id:'tmdb',
        title:'TMDB 海报',
        required:false,
        ok:tmdbReady,
        detail:tmdbReady?'TMDB 已配置':'可选：配置 TMDB_API_TOKEN 自动补海报和简介。',
      },
    ],
  },{headers:{'Cache-Control':'private, no-store'}});
}
