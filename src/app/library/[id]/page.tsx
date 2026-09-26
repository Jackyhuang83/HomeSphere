'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Header } from '@/components/header';
import type { LibraryWorkDetail, MediaItem } from '@/lib/library/types';

export default function WorkPage() {
  const params=useParams<{id:string}>();
  const id=String(params.id || '');
  const [work,setWork]=useState<LibraryWorkDetail|null>(null);
  const [selected,setSelected]=useState<MediaItem|null>(null);
  const [error,setError]=useState('');

  useEffect(()=>{
    if(!id) return;
    const controller=new AbortController();
    fetch(`/api/library/work/${encodeURIComponent(id)}`,{signal:controller.signal,cache:'no-store'})
      .then(async res=>{const data=await res.json();if(!res.ok) throw new Error(data.error||'作品读取失败');return data as LibraryWorkDetail;})
      .then(data=>{setWork(data);setSelected(data.files[0]||null);})
      .catch(err=>{if(err?.name!=='AbortError') setError(err instanceof Error?err.message:'作品读取失败');});
    return ()=>controller.abort();
  },[id]);

  const seasons=useMemo(()=>{
    const map=new Map<number,MediaItem[]>();
    for(const file of work?.files || []) {
      const season=file.season ?? 1;
      const list=map.get(season) || [];
      list.push(file); map.set(season,list);
    }
    return map;
  },[work]);

  if(error) return <Centered text={error}/>;
  if(!work) return <Centered text="正在读取作品…"/>;

  return <div className="min-h-screen flex flex-col">
    <Header />
    <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6">
      <Link href="/library" className="text-sm text-muted hover:text-content">← 返回片库</Link>
      <div className="mt-5 grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5">
        <div>
          <div className="aspect-video bg-black rounded-xl overflow-hidden flex items-center justify-center">
            {selected
              ? <video key={selected.id} src={`/api/play/${encodeURIComponent(selected.id)}`} controls playsInline preload="metadata" className="w-full h-full bg-black" />
              : <span className="text-white/50 text-sm">没有可播放文件</span>}
          </div>
          <p className="mt-2 text-xs text-faint">当前为浏览器原生播放；不支持的 MKV/编码会在后续播放器阶段完善。视频数据由115直链直接传给设备。</p>
        </div>

        <aside className="card p-4">
          <h1 className="text-xl font-semibold text-content">{work.title}</h1>
          <p className="text-sm text-muted mt-1">{[work.year,work.mediaType==='movie'?'电影':'剧集',`${work.fileCount} 个文件`].filter(Boolean).join(' · ')}</p>
          {selected && <div className="mt-4">
            <div className="text-xs text-faint mb-1">当前文件</div>
            <div className="text-sm text-content break-all">{selected.filename}</div>
          </div>}
        </aside>
      </div>

      {work.mediaType==='tv' && work.files.length>0 && <section className="mt-6 space-y-5">
        {[...seasons.entries()].map(([season,files])=><div key={season}>
          <h2 className="text-sm font-semibold text-content mb-2">第 {season} 季</h2>
          <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-2">
            {files.map((file,index)=><button key={file.id} onClick={()=>setSelected(file)}
              className={selected?.id===file.id?'btn-primary px-2':'btn-ghost px-2'}>
              {file.episode ?? index+1}
            </button>)}
          </div>
        </div>)}
      </section>}

      {work.mediaType==='movie' && work.files.length>1 && <section className="mt-6">
        <h2 className="text-sm font-semibold text-content mb-2">文件版本</h2>
        <div className="space-y-2">
          {work.files.map(file=><button key={file.id} onClick={()=>setSelected(file)}
            className={`w-full text-left p-3 rounded-lg border ${selected?.id===file.id?'border-accent bg-accent/10':'border-line bg-card'}`}>
            <span className="text-sm text-content break-all">{file.filename}</span>
          </button>)}
        </div>
      </section>}
    </main>
  </div>;
}

function Centered({text}:{text:string}) {
  return <div className="min-h-screen"><Header/><main className="min-h-[70vh] flex items-center justify-center px-6 text-muted">{text}</main></div>;
}
