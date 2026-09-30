'use client';

import Hls from 'hls.js';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { Header } from '@/components/header';
import type { LibraryWorkDetail, MediaItem } from '@/lib/library/types';

export default function WorkPage(){
  const params=useParams<{id:string}>();
  const id=String(params.id||'');
  const [work,setWork]=useState<LibraryWorkDetail|null>(null);
  const [selected,setSelected]=useState<MediaItem|null>(null);
  const [error,setError]=useState('');
  const [playbackUrl,setPlaybackUrl]=useState('');
  const [playbackLoading,setPlaybackLoading]=useState(false);
  const [playbackError,setPlaybackError]=useState('');

  useEffect(()=>{
    if(!id)return;
    const controller=new AbortController();
    fetch(`/api/library/work/${encodeURIComponent(id)}`,{signal:controller.signal,cache:'no-store'})
      .then(async res=>{const data=await res.json();if(!res.ok)throw new Error(data.error||'作品读取失败');return data as LibraryWorkDetail;})
      .then(data=>{setWork(data);setSelected(data.files[0]||null);})
      .catch(err=>{if(err?.name!=='AbortError')setError(err instanceof Error?err.message:'作品读取失败');});
    return()=>controller.abort();
  },[id]);

  useEffect(()=>{
    if(!selected){
      setPlaybackUrl('');
      setPlaybackError('');
      setPlaybackLoading(false);
      return;
    }

    const controller=new AbortController();
    setPlaybackUrl('');
    setPlaybackError('');
    setPlaybackLoading(true);

    fetch(`/api/play/${encodeURIComponent(selected.id)}?resolve=1`,{
      signal:controller.signal,
      cache:'no-store',
    })
      .then(async res=>{
        const data=await res.json();
        if(!res.ok)throw new Error(data.error||'获取播放地址失败');
        if(!data.url)throw new Error('播放地址为空');
        return String(data.url);
      })
      .then(url=>setPlaybackUrl(url))
      .catch(err=>{if(err?.name!=='AbortError')setPlaybackError(err instanceof Error?err.message:'获取播放地址失败');})
      .finally(()=>{if(!controller.signal.aborted)setPlaybackLoading(false);});

    return()=>controller.abort();
  },[selected]);

  const seasons=useMemo(()=>{
    const map=new Map<number,MediaItem[]>();
    for(const file of work?.files||[]){
      const season=file.season??1;
      const list=map.get(season)||[];list.push(file);map.set(season,list);
    }
    return map;
  },[work]);

  if(error)return <Centered text={error}/>;
  if(!work)return <Centered text="正在读取作品…"/>;

  const poster=work.posterUrl?`/api/image/${encodeURIComponent(work.posterUrl)}`:undefined;
  return <div className="min-h-screen flex flex-col">
    <Header/>
    <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6">
      <div className="flex items-center gap-3">
        <Link href="/library" className="text-sm text-muted hover:text-content">← 返回片库</Link>
        <Link href={`/library/${work.id}/match`} className="text-sm text-muted hover:text-content ml-auto">修正TMDB</Link>
      </div>
      <div className="mt-5 grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5">
        <div>
          <div className="aspect-video bg-black rounded-xl overflow-hidden flex items-center justify-center">
            {!selected?<span className="text-white/50 text-sm">没有可播放文件</span>
              :playbackLoading?<span className="text-white/50 text-sm">正在获取播放地址…</span>
              :playbackError?<span className="text-red-300 text-sm px-4 text-center">{playbackError}</span>
              :playbackUrl?<HlsVideo
                key={`${selected.id}:${playbackUrl}`}
                src={playbackUrl}
                mediaId={selected.id}
                onFatalError={setPlaybackError}
              />
              :<span className="text-white/50 text-sm">播放地址不可用</span>}
          </div>
          <p className="mt-2 text-xs text-faint">播放链路：HomeSphere 鉴权 → QMediaSync 授权 → 115 HLS。iPhone/iPad 使用原生 HLS；Windows 强制通过本机播放助手 + hls.js 连接 115。视频字节不经过 VPS。</p>
        </div>
        <aside className="card p-4">
          <div className="flex gap-3">
            {poster&&<img src={poster} alt={work.title} className="w-24 aspect-[2/3] object-cover rounded-lg shrink-0"/>}
            <div className="min-w-0">
              <h1 className="text-xl font-semibold text-content">{work.title}</h1>
              <p className="text-sm text-muted mt-1">{[work.year,work.mediaType==='movie'?'电影':'剧集','STRM',work.tmdbId?`TMDB ${work.tmdbId}`:'未匹配TMDB'].filter(Boolean).join(' · ')}</p>
            </div>
          </div>
          {work.overview&&<p className="text-sm text-muted leading-relaxed mt-4">{work.overview}</p>}
          {selected&&<div className="mt-4"><div className="text-xs text-faint mb-1">当前条目</div><div className="text-sm text-content break-all">{selected.filename}</div></div>}
        </aside>
      </div>
      {work.mediaType==='tv'&&work.files.length>0&&<section className="mt-6 space-y-5">
        {[...seasons.entries()].map(([season,files])=><div key={season}>
          <h2 className="text-sm font-semibold text-content mb-2">第 {season} 季</h2>
          <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-2">
            {files.map((file,index)=><button key={file.id} onClick={()=>setSelected(file)} className={selected?.id===file.id?'btn-primary px-2':'btn-ghost px-2'}>{file.episode??index+1}</button>)}
          </div>
        </div>)}
      </section>}
    </main>
  </div>;
}

function HlsVideo({src,mediaId,onFatalError}:{src:string;mediaId:string;onFatalError:(message:string)=>void}){
  const videoRef=useRef<HTMLVideoElement|null>(null);

  useEffect(()=>{
    const video=videoRef.current;
    if(!video)return;

    let hls:Hls|undefined;
    let disposed=false;
    let networkRecovered=false;
    let mediaRecovered=false;

    const startDesktopPlayback=async()=>{
      if(!Hls.isSupported()){
        onFatalError('当前桌面浏览器不支持 HLS.js 播放');
        return;
      }

      try{
        const health=await fetch('http://127.0.0.1:17865/health',{
          cache:'no-store',
          signal:AbortSignal.timeout(2500),
        });
        if(!health.ok)throw new Error('helper health failed');

        const response=await fetch(`/api/play/${encodeURIComponent(mediaId)}?helper=1`,{
          cache:'no-store',
        });
        const data=await response.json();
        if(!response.ok)throw new Error(data.error||'获取115 HLS地址失败');
        if(!data.url)throw new Error('115 HLS地址为空');
        if(disposed)return;

        const helperUrl=`http://127.0.0.1:17865/proxy?url=${encodeURIComponent(String(data.url))}`;

        hls=new Hls({
          enableWorker:true,
          lowLatencyMode:false,
        });

        hls.on(Hls.Events.ERROR,(_event,errorData)=>{
          if(!errorData.fatal)return;

          if(errorData.type===Hls.ErrorTypes.NETWORK_ERROR&&!networkRecovered){
            networkRecovered=true;
            hls?.startLoad();
            return;
          }

          if(errorData.type===Hls.ErrorTypes.MEDIA_ERROR&&!mediaRecovered){
            mediaRecovered=true;
            hls?.recoverMediaError();
            return;
          }

          onFatalError(`Windows 播放助手链路失败（${errorData.type} / ${errorData.details}）`);
        });

        hls.loadSource(helperUrl);
        hls.attachMedia(video);
      }catch{
        onFatalError('未检测到 HomeSphere Windows 播放助手，或浏览器未允许访问本机 127.0.0.1');
      }
    };

    // Windows Chrome/Edge may report HLS capability through the OS media stack
    // while still failing on 115 HLS. Never let Windows bypass the localhost helper.
    const isWindows=/Windows NT/i.test(navigator.userAgent);
    const nativeHls=!isWindows&&video.canPlayType('application/vnd.apple.mpegurl')!=='';
    if(nativeHls){
      video.src=src;
    }else{
      void startDesktopPlayback();
    }

    return()=>{
      disposed=true;
      hls?.destroy();
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  },[src,mediaId,onFatalError]);

  return <video
    ref={videoRef}
    controls
    playsInline
    preload="metadata"
    className="w-full h-full bg-black"
    onError={(event)=>{
      const code=event.currentTarget.error?.code;
      if(code)onFatalError(`浏览器播放失败（MediaError ${code}）`);
    }}
  />;
}

function Centered({text}:{text:string}){return <div className="min-h-screen"><Header/><main className="min-h-[70vh] flex items-center justify-center px-6 text-muted">{text}</main></div>;}
