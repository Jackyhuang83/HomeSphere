'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Header } from '@/components/header';
import { SiteFooter } from '@/components/site-footer';
import { buildImageUrl } from '@/lib/utils';

interface TmdbItem {
  id:number;
  mediaType:'movie'|'tv';
  title:string;
  originalTitle?:string;
  year?:string;
  posterUrl?:string;
  backdropUrl?:string;
  overview?:string;
}

function DiscoveryDetailContent() {
  const params = useParams<{source:string;id:string}>();
  const search = useSearchParams();
  const title = search.get('title')?.trim() || '未命名作品';
  const cover = search.get('cover')?.trim() || '';
  const rating = search.get('rating')?.trim() || '';
  const mediaType = search.get('type') === 'tv' ? 'tv' : 'movie';
  const source = String(params.source || '');
  const [detail,setDetail]=useState<TmdbItem|null>(null);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{
    const controller=new AbortController();
    const sp=new URLSearchParams({q:title,type:mediaType});
    setLoading(true);
    fetch('/api/library/tmdb/search?' + sp.toString(),{signal:controller.signal,cache:'no-store'})
      .then(async res=>{
        if(!res.ok) return null;
        const data=await res.json() as {items?:TmdbItem[]};
        return data.items?.[0] || null;
      })
      .then(item=>setDetail(item))
      .catch(err=>{if(err?.name!=='AbortError')setDetail(null);})
      .finally(()=>setLoading(false));
    return()=>controller.abort();
  },[title,mediaType]);

  const sourceLabel = useMemo(()=>{
    if(source==='douban') return '豆瓣推荐';
    if(source==='bangumi') return 'Bangumi';
    if(source==='hot') return '影视热榜';
    return '影视发现';
  },[source]);

  const poster = detail?.posterUrl
    ? '/api/image/' + encodeURIComponent(detail.posterUrl)
    : buildImageUrl(cover);
  const backdrop = detail?.backdropUrl
    ? '/api/image/' + encodeURIComponent(detail.backdropUrl)
    : '';

  return <div className="min-h-screen flex flex-col">
    <Header/>
    <main className="flex-1">
      {backdrop&&<div className="h-52 sm:h-72 w-full overflow-hidden relative">
        <img src={backdrop} alt="" className="w-full h-full object-cover opacity-35"/>
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-surface"/>
      </div>}
      <div className={backdrop?'-mt-24 relative max-w-5xl mx-auto px-4 pb-8':'max-w-5xl mx-auto px-4 py-6'}>
        <Link href="/" className="text-sm text-muted hover:text-content">← 返回影视发现</Link>
        <div className="mt-4 grid grid-cols-[112px_1fr] sm:grid-cols-[180px_1fr] gap-5">
          <div className="aspect-[2/3] rounded-xl overflow-hidden bg-chip shadow-lg">
            {poster
              ? <img src={poster} alt={title} className="w-full h-full object-cover"/>
              : <div className="w-full h-full flex items-center justify-center p-3 text-center text-sm text-faint">{title}</div>}
          </div>
          <div className="min-w-0">
            <div className="text-xs text-faint mb-2">{sourceLabel}</div>
            <h1 className="text-2xl sm:text-3xl font-bold text-content">{detail?.title || title}</h1>
            {detail?.originalTitle&&detail.originalTitle!==detail.title&&<p className="text-sm text-muted mt-1">{detail.originalTitle}</p>}
            <p className="text-sm text-muted mt-3">
              {[detail?.year,mediaType==='movie'?'电影':'剧集',rating?'★ ' + rating:undefined].filter(Boolean).join(' · ')}
            </p>
            {loading
              ? <p className="text-sm text-muted mt-5">正在补充作品简介…</p>
              : detail?.overview
                ? <p className="text-sm sm:text-base text-muted leading-7 mt-5">{detail.overview}</p>
                : <p className="text-sm text-faint mt-5">暂时没有可用简介。配置 TMDB 后，影视发现会自动补充中文简介、年份和背景图。</p>}
          </div>
        </div>
        <section className="mt-8 rounded-xl border border-line bg-card p-4">
          <h2 className="font-semibold text-content">播放说明</h2>
          <p className="text-sm text-muted mt-2">“影视发现”用于找片和看介绍。只有已经存在于“我的片库”的 STRM 内容才能直接播放。</p>
          <div className="mt-4">
            <Link href="/library" className="btn-primary">进入我的片库</Link>
          </div>
        </section>
      </div>
    </main>
    <SiteFooter/>
  </div>;
}

export default function DiscoveryDetailPage(){
  return <Suspense fallback={<div className="min-h-screen"><Header/><main className="min-h-[70vh] flex items-center justify-center text-muted">正在读取作品…</main></div>}>
    <DiscoveryDetailContent/>
  </Suspense>;
}
