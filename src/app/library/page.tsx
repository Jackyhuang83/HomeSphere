'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Header } from '@/components/header';
import { SiteFooter } from '@/components/site-footer';
import type { LibraryWork } from '@/lib/library/types';

type Filter='all'|'movie'|'tv';
type LibraryMode='strm'|'direct115';

export default function LibraryPage() {
  const [items,setItems]=useState<LibraryWork[]>([]);
  const [total,setTotal]=useState(0);
  const [filter,setFilter]=useState<Filter>('all');
  const [query,setQuery]=useState('');
  const [activeQuery,setActiveQuery]=useState('');
  const [loading,setLoading]=useState(true);
  const [syncing,setSyncing]=useState(false);
  const [scraping,setScraping]=useState(false);
  const [libraryMode,setLibraryMode]=useState<LibraryMode>('strm');
  const [sourceLabel,setSourceLabel]=useState('STRM');
  const [libraryConfigured,setLibraryConfigured]=useState(false);
  const [tmdbReady,setTmdbReady]=useState(false);
  const [message,setMessage]=useState('');

  const load=useCallback(async()=>{
    setLoading(true);
    try {
      const url=activeQuery
        ? `/api/library/search?q=${encodeURIComponent(activeQuery)}`
        : `/api/library?limit=120${filter==='all'?'':`&type=${filter}`}`;
      const res=await fetch(url,{cache:'no-store'});
      const data=await res.json();
      if(!res.ok) throw new Error(data.error || '片库读取失败');
      setItems(data.items || []);
      setTotal(data.total ?? data.items?.length ?? 0);
      if(!activeQuery) {
        setLibraryMode(data.libraryMode === 'direct115' ? 'direct115' : 'strm');
        setSourceLabel(data.librarySourceLabel || 'STRM');
        setLibraryConfigured(Boolean(data.libraryConfigured));
        setTmdbReady(Boolean(data.tmdbConfigured));
      }
    } catch(error) {
      setMessage(error instanceof Error?error.message:'片库读取失败');
    } finally { setLoading(false); }
  },[activeQuery,filter]);

  useEffect(()=>{void load();},[load]);

  const sync=async()=>{
    if(syncing) return;
    setSyncing(true); setMessage('');
    try {
      const res=await fetch('/api/library/sync',{method:'POST'});
      const data=await res.json();
      if(!res.ok) throw new Error(data.error || '同步失败');
      const s=data.summary || {};
      const files=s.strmFilesIndexed ?? s.videoFilesIndexed ?? 0;
      const invalid=s.invalidFiles ? `，忽略 ${s.invalidFiles} 个无效STRM` : '';
      setMessage(`同步完成：${s.worksIndexed ?? 0} 部作品，${files} 个媒体条目，扫描 ${s.directoriesScanned ?? 0} 个目录${invalid}`);
      setActiveQuery('');
      setQuery('');
      await load();
    } catch(error) {
      setMessage(error instanceof Error?error.message:'同步失败');
    } finally { setSyncing(false); }
  };

  const scrape=async()=>{
    if(scraping) return;
    setScraping(true); setMessage('');
    try {
      const res=await fetch('/api/library/scrape',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({limit:100}),
      });
      const data=await res.json();
      if(!res.ok) throw new Error(data.error || 'TMDB整理失败');
      const s=data.summary;
      setMessage(`TMDB整理完成：匹配 ${s.matched}，待确认 ${s.review}，失败 ${s.failed}`);
      await load();
    } catch(error) {
      setMessage(error instanceof Error?error.message:'TMDB整理失败');
    } finally { setScraping(false); }
  };

  const submitSearch=(e:React.FormEvent)=>{
    e.preventDefault();
    setActiveQuery(query.trim());
  };

  const syncLabel=libraryMode==='strm'?'同步STRM':'同步115（高级）';

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-5">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-content">我的片库</h1>
            <p className="text-sm text-muted mt-1">
              当前来源：{sourceLabel}。日常浏览与搜索只读本地 SQLite。
            </p>
          </div>
          <div className="flex gap-2">
            <button className="btn-ghost h-10 flex-1 sm:flex-none" onClick={()=>void sync()} disabled={syncing || !libraryConfigured}>
              {syncing?'同步中…':syncLabel}
            </button>
            <button className="btn-primary h-10 flex-1 sm:flex-none" onClick={()=>void scrape()} disabled={scraping || !tmdbReady}>
              {scraping?'整理中…':'整理海报'}
            </button>
          </div>
        </div>

        {!libraryConfigured && libraryMode==='strm' && (
          <Notice>
            尚未挂载 STRM 目录。生产默认把 Bridge 生成的 STRM 只读挂载到 <code>/media</code>。
          </Notice>
        )}
        {!libraryConfigured && libraryMode==='direct115' && (
          <Notice>
            当前启用了 115 Direct 高级兼容模式，但尚未配置对应凭据与媒体目录。
          </Notice>
        )}
        {libraryMode==='direct115' && (
          <Notice>
            当前是 115 Direct 高级兼容模式。正式部署推荐使用 STRM + Media Bridge，让 HomeSphere 不持有 115 凭据。
          </Notice>
        )}
        {!tmdbReady && <Notice>尚未配置 <code>TMDB_API_TOKEN</code>；片库仍可使用，但不会自动补海报和简介。</Notice>}
        {message && <div className="mb-4 rounded-lg border border-line bg-surface-raised px-4 py-3 text-sm text-content">{message}</div>}

        <form className="flex gap-2 mb-4" onSubmit={submitSearch}>
          <input className="input flex-1 h-10" value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索自己的片库…" />
          <button className="btn-primary" type="submit">搜索</button>
          {activeQuery && <button className="btn-ghost" type="button" onClick={()=>{setQuery('');setActiveQuery('');}}>清除</button>}
        </form>

        {!activeQuery && <div className="flex gap-2 mb-5">
          {([['all','全部'],['movie','电影'],['tv','剧集']] as const).map(([value,label])=>(
            <button key={value} className={filter===value?'btn-primary':'btn-ghost'} onClick={()=>setFilter(value)}>{label}</button>
          ))}
        </div>}

        <p className="text-xs text-faint mb-4">{activeQuery?`搜索到 ${items.length} 部作品`:`本地索引共 ${total} 部作品`}</p>

        {loading ? <div className="py-20 text-center text-muted">正在读取片库…</div>
          : items.length===0 ? <Empty activeQuery={activeQuery} canSync={libraryConfigured} syncing={syncing} sync={sync} sourceLabel={sourceLabel} />
          : <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-x-3 gap-y-5">
            {items.map(item=><WorkCard key={item.id} item={item} />)}
          </div>}
      </main>
      <SiteFooter />
    </div>
  );
}

function Notice({children}:{children:React.ReactNode}) {
  return <div className="mb-4 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-content">{children}</div>;
}

function posterSrc(url?:string):string|undefined {
  return url ? `/api/image/${encodeURIComponent(url)}` : undefined;
}

function WorkCard({item}:{item:LibraryWork}) {
  const poster=posterSrc(item.posterUrl);
  const needsFix=item.scrapeStatus==='review'||item.scrapeStatus==='failed';
  const source=item.provider==='strm'?'STRM':item.provider==='115'?'115 Direct':item.provider;
  return <div className="min-w-0">
    <Link href={`/library/${item.id}`} className="group block">
      <div className="aspect-[2/3] rounded-lg overflow-hidden border border-line bg-card relative">
        {poster
          ? <img src={poster} alt={item.title} className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform" loading="lazy" />
          : <div className="w-full h-full flex items-center justify-center px-3 text-center text-sm text-muted bg-gradient-to-br from-card to-chip">{item.title}</div>}
        <span className="absolute left-1.5 bottom-1.5 rounded bg-black/70 text-white text-[10px] px-1.5 py-0.5">{source}</span>
        {item.mediaType==='tv' && <span className="absolute right-1.5 bottom-1.5 rounded bg-black/70 text-white text-[10px] px-1.5 py-0.5">{item.fileCount} 集</span>}
        {item.scrapeStatus==='pending' && <span className="absolute top-1.5 right-1.5 rounded bg-black/70 text-white text-[10px] px-1.5 py-0.5">待整理</span>}
      </div>
      <h2 className="mt-2 text-sm font-medium text-content truncate">{item.title}</h2>
      <p className="text-xs text-faint truncate">{[item.year,item.mediaType==='movie'?'电影':'剧集'].filter(Boolean).join(' · ')}</p>
    </Link>
    {needsFix && <Link href={`/library/${item.id}/match`} className="mt-1 inline-block text-xs text-warning hover:underline">
      {item.scrapeStatus==='review'?'需要确认匹配':'识别失败，手动修正'}
    </Link>}
  </div>;
}

function Empty({activeQuery,canSync,syncing,sync,sourceLabel}:{activeQuery:string;canSync:boolean;syncing:boolean;sync:()=>Promise<void>;sourceLabel:string}) {
  return <div className="py-20 text-center max-w-md mx-auto">
    <div className="text-4xl mb-4">🎬</div>
    <h2 className="text-lg font-semibold text-content">{activeQuery?'片库里没有找到':'本地片库还是空的'}</h2>
    <p className="text-sm text-muted mt-2 mb-5">
      {activeQuery?'换一个片名搜索，或让 Media Bridge 更新 STRM 后重新同步。':`准备好 ${sourceLabel} 媒体来源后，手动同步一次即可建立本地索引。`}
    </p>
    {!activeQuery && canSync && <button className="btn-primary" disabled={syncing} onClick={()=>void sync()}>{syncing?'同步中…':'同步媒体库'}</button>}
  </div>;
}
