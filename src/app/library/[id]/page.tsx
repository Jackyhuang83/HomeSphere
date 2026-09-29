'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
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
              :playbackUrl?<video
                key={`${selected.id}:${playbackUrl}`}
                src={playbackUrl}
                controls
                playsInline
                preload="metadata"
                className="w-full h-full bg-black"
                onError={()=>setPlaybackError('浏览器无法播放该媒体，请检查文件编码或 CDN 响应')}
              />
              :<span className="text-white/50 text-sm">播放地址不可用</span>}
          </div>
          <p className="mt-2 text-xs text-faint">播放链路：HomeSphere 鉴权并解析 STRM → Media Bridge → 浏览器直连最终 CDN。视频字节不经过 HomeSphere。</p>
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
function Centered({text}:{text:string}){return <div className="min-h-screen"><Header/><main className="min-h-[70vh] flex items-center justify-center px-6 text-muted">{text}</main></div>;}
