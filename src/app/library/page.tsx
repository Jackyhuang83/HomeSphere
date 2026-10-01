'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Header } from '@/components/header';
import { SiteFooter } from '@/components/site-footer';
import { LibraryActivitySections } from '@/components/library-activity-sections';
import type { LibraryWork } from '@/lib/library/types';

type Filter='all'|'movie'|'tv'|'animation';
type CategoryFilter='all'|'recent'|'year-0'|'year-1'|'year-2'|'year-3'|'mainland'|'hmt'|'overseas';
type PersonalFilter='all'|'favorite'|'watchlist';
type WatchFilter='all'|'inprogress'|'watched'|'unwatched';

interface BridgeHealthView {
  ready:boolean;
  strmRoot:string;
  strmRootReadable:boolean;
  allowedHosts:string[];
  errors:string[];
  sampleAvailable:boolean;
}

export default function LibraryPage(){
  const [items,setItems]=useState<LibraryWork[]>([]);
  const [total,setTotal]=useState(0);
  const [filter,setFilter]=useState<Filter>('all');
  const [category,setCategory]=useState<CategoryFilter>('all');
  const [personal,setPersonal]=useState<PersonalFilter>('all');
  const [watchFilter,setWatchFilter]=useState<WatchFilter>('all');
  const [query,setQuery]=useState('');
  const [activeQuery,setActiveQuery]=useState('');
  const [loading,setLoading]=useState(true);
  const [syncing,setSyncing]=useState(false);
  const [scraping,setScraping]=useState(false);
  const [libraryConfigured,setLibraryConfigured]=useState(false);
  const [tmdbReady,setTmdbReady]=useState(false);
  const [bridgeHealth,setBridgeHealth]=useState<BridgeHealthView|null>(null);
  const [probing,setProbing]=useState(false);
  const [message,setMessage]=useState('');
  const [showHidden,setShowHidden]=useState(false);

  const load=useCallback(async()=>{
    setLoading(true);
    try{
      const currentYear=new Date().getFullYear();
      const params=new URLSearchParams({limit:'120'});
      if(showHidden)params.set('hidden','1');
      if(personal!=='all')params.set('personal',personal);
      if(watchFilter!=='all')params.set('watch',watchFilter);
      if(filter==='movie'||filter==='tv')params.set('type',filter);
      else if(filter==='animation')params.set('animation','1');
      if(category==='recent')params.set('sort','recent');
      else if(category==='mainland'||category==='hmt'||category==='overseas')params.set('region',category);
      else if(category.startsWith('year-')){
        const offset=Number(category.slice(5));
        params.set('year',String(currentYear-offset));
      }
      const url=activeQuery
        ? (()=>{const searchParams=new URLSearchParams(params);searchParams.set('q',activeQuery);return `/api/library/search?${searchParams.toString()}`;})()
        : `/api/library?${params.toString()}`;
      const res=await fetch(url,{cache:'no-store'});
      const data=await res.json();
      if(!res.ok)throw new Error(data.error||'片库读取失败');
      setItems(data.items||[]);
      setTotal(data.total??data.items?.length??0);
      if(!activeQuery){
        setLibraryConfigured(Boolean(data.libraryConfigured));
        setTmdbReady(Boolean(data.tmdbConfigured));
      }
    }catch(error){setMessage(error instanceof Error?error.message:'片库读取失败');}
    finally{setLoading(false);}
  },[activeQuery,filter,category,personal,watchFilter,showHidden]);

  const loadBridgeHealth=useCallback(async()=>{
    try{
      const res=await fetch('/api/library/bridge/status',{cache:'no-store'});
      const data=await res.json();
      if(res.ok)setBridgeHealth(data as BridgeHealthView);
    }catch{}
  },[]);

  useEffect(()=>{void load();},[load]);
  useEffect(()=>{void loadBridgeHealth();},[loadBridgeHealth]);

  const sync=async()=>{
    if(syncing)return;
    setSyncing(true);setMessage('');
    try{
      const res=await fetch('/api/library/sync',{method:'POST'});
      const data=await res.json();
      if(!res.ok)throw new Error(data.error||'同步失败');
      const s=data.summary||{};
      const invalid=s.invalidFiles?`，忽略 ${s.invalidFiles} 个无效 STRM`:'';
      const cleanup=(s.removedMedia||s.removedWorks)?`，清理失效 STRM ${s.removedMedia??0} 个、空作品 ${s.removedWorks??0} 部`:'';
      setMessage(`同步完成：${s.worksIndexed??0} 部作品，${s.strmFilesIndexed??0} 个 STRM，扫描 ${s.directoriesScanned??0} 个目录${invalid}${cleanup}`);
      setActiveQuery('');setQuery('');
      await Promise.all([load(),loadBridgeHealth()]);
    }catch(error){setMessage(error instanceof Error?error.message:'同步失败');}
    finally{setSyncing(false);}
  };

  const scrape=async()=>{
    if(scraping)return;
    setScraping(true);setMessage('');
    try{
      const res=await fetch('/api/library/scrape',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({limit:100})});
      const data=await res.json();
      if(!res.ok)throw new Error(data.error||'TMDB整理失败');
      const s=data.summary;
      const merged=s.merged?`，合并重复 ${s.merged}`:'';
      const regions=s.regionsUpdated?`，补全地区 ${s.regionsUpdated}`:'';
      setMessage(`TMDB整理完成：匹配 ${s.matched}，待确认 ${s.review}，失败 ${s.failed}${merged}${regions}`);
      await load();
    }catch(error){setMessage(error instanceof Error?error.message:'TMDB整理失败');}
    finally{setScraping(false);}
  };

  const probeBridge=async()=>{
    if(probing)return;
    setProbing(true);setMessage('');
    try{
      const res=await fetch('/api/library/bridge/probe',{method:'POST'});
      const data=await res.json();
      if(!res.ok)throw new Error(data.error||'Bridge 探测失败');
      setMessage(`Bridge 探测通过：${data.bridgeHost} → ${data.finalHost}，${data.durationMs} ms。`);
      await loadBridgeHealth();
    }catch(error){setMessage(error instanceof Error?error.message:'Bridge 探测失败');}
    finally{setProbing(false);}
  };

  return <div className="min-h-screen flex flex-col">
    <Header/>
    <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-4 lg:px-6 py-5 sm:py-7">
      <div className="mb-5 sm:mb-6">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-content tracking-tight">我的片库</h1>
            <p className="text-sm text-muted mt-1">{showHidden?`已隐藏 · ${activeQuery?items.length:total} 部`:activeQuery?`搜索结果 · ${items.length} 部`:`共 ${total} 部作品`}</p>
          </div>
        </div>
      </div>

      {!libraryConfigured&&<Notice>尚未挂载 STRM 目录。请把 Media Bridge 生成的 STRM 只读挂载到 <code>/media</code>。</Notice>}
      {!tmdbReady&&<Notice>尚未配置 <code>TMDB_API_TOKEN</code>；片库仍可使用，但不会自动补海报和简介。</Notice>}
      {message&&<div className="mb-4 rounded-xl border border-line bg-surface-raised px-4 py-3 text-sm text-content">{message}</div>}

      {!showHidden&&<LibraryActivitySections />}

      <div className="mb-5 sm:mb-6 rounded-2xl border border-line/80 bg-surface/80 p-3 sm:p-4">
        <form className="flex gap-2" onSubmit={e=>{e.preventDefault();setActiveQuery(query.trim());}}>
          <input className="input flex-1 h-10 rounded-xl" value={query} onChange={e=>setQuery(e.target.value)} placeholder={showHidden?"搜索已隐藏内容…":"搜索电影、剧集…"}/>
          <button className="btn-primary h-10 rounded-xl px-4" type="submit">搜索</button>
          {activeQuery&&<button className="btn-ghost h-10 rounded-xl" type="button" onClick={()=>{setQuery('');setActiveQuery('');}}>清除</button>}
        </form>

        <>
          <div className="flex gap-2 mt-3 overflow-x-auto scrollbar-thin pb-0.5">
            {([['all','全部'],['movie','电影'],['tv','剧集'],['animation','动画']] as const).map(([value,label])=>
              <button
                key={value}
                className={`shrink-0 rounded-full px-4 py-1.5 text-sm border transition-colors ${filter===value?'bg-accent text-on-accent border-accent':'bg-chip text-muted border-line hover:text-content hover:bg-hover'}`}
                onClick={()=>setFilter(value)}
              >
                {label}
              </button>
            )}
          </div>

          <div className="flex gap-2 mt-2.5 overflow-x-auto scrollbar-thin pb-0.5">
            {([
              ['all','全部分类'],
              ['recent','最近新增'],
              ['year-0',String(new Date().getFullYear())],
              ['year-1',String(new Date().getFullYear()-1)],
              ['year-2',String(new Date().getFullYear()-2)],
              ['year-3',String(new Date().getFullYear()-3)],
              ['mainland','中国内地'],
              ['hmt','港澳台'],
              ['overseas','海外'],
            ] as const).map(([value,label])=>
              <button
                key={value}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm border transition-colors ${category===value?'bg-content text-page border-content':'bg-transparent text-muted border-line hover:text-content hover:bg-hover'}`}
                onClick={()=>setCategory(value)}
              >
                {label}
              </button>
            )}
          </div>
          <details className="mt-3 rounded-xl border border-line/80 bg-card/60">
            <summary className="cursor-pointer select-none px-3.5 py-2.5 text-sm text-muted hover:text-content">
              更多筛选{personal!=='all'||watchFilter!=='all'?' · 已启用':''}
            </summary>
            <div className="border-t border-line px-3 py-3 space-y-3">
              <div>
                <div className="text-xs text-faint mb-2">个人整理</div>
                <div className="flex gap-2 overflow-x-auto scrollbar-thin pb-0.5">
                  {([['all','全部'],['favorite','已收藏'],['watchlist','想看']] as const).map(([value,label])=>
                    <button key={value} type="button"
                      className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm border ${personal===value?'bg-content text-page border-content':'bg-transparent text-muted border-line hover:text-content hover:bg-hover'}`}
                      onClick={()=>setPersonal(value)}>{label}</button>
                  )}
                </div>
              </div>
              <div>
                <div className="text-xs text-faint mb-2">观看状态</div>
                <div className="flex gap-2 overflow-x-auto scrollbar-thin pb-0.5">
                  {([['all','全部'],['inprogress','观看中'],['watched','已看完'],['unwatched','未观看']] as const).map(([value,label])=>
                    <button key={value} type="button"
                      className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm border ${watchFilter===value?'bg-content text-page border-content':'bg-transparent text-muted border-line hover:text-content hover:bg-hover'}`}
                      onClick={()=>setWatchFilter(value)}>{label}</button>
                  )}
                </div>
              </div>
              {(personal!=='all'||watchFilter!=='all')&&<button type="button" className="text-xs text-muted hover:text-content" onClick={()=>{setPersonal('all');setWatchFilter('all');}}>清除更多筛选</button>}
            </div>
          </details>
        </>
      </div>

      <details className="mb-6 rounded-xl border border-line bg-card">
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-muted hover:text-content">
          片库管理
        </summary>
        <div className="border-t border-line px-4 py-4">
          <div className="flex flex-col sm:flex-row gap-2 mb-3">
            <button className="btn-ghost h-10 sm:w-auto" onClick={()=>void sync()} disabled={syncing||!libraryConfigured}>
              {syncing?'同步中…':'同步 STRM'}
            </button>
            <button className="btn-primary h-10 sm:w-auto" onClick={()=>void scrape()} disabled={scraping||!tmdbReady}>
              {scraping?'整理中…':'整理海报'}
            </button>
            <button
              className="btn-ghost h-10 sm:w-auto"
              onClick={()=>{
                setShowHidden(value=>!value);
                setActiveQuery('');
                setQuery('');
              }}
            >
              {showHidden?'返回正常片库':'查看已隐藏'}
            </button>
          </div>
          <p className="text-xs text-faint mb-4">
            新增内容通过 STRM 同步进入片库；同步会自动清理已经消失的 STRM。隐藏只影响 HomeSphere 展示，不会删除 115 文件。
          </p>
          {bridgeHealth&&<BridgeStatusCard health={bridgeHealth} probing={probing} onProbe={probeBridge}/>}
        </div>
      </details>

      {loading?<PosterSkeleton/>
        :items.length===0?<Empty activeQuery={activeQuery} canSync={libraryConfigured} syncing={syncing} sync={sync}/>
        :<div className="grid grid-cols-3 min-[480px]:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-x-3 sm:gap-x-4 gap-y-5 sm:gap-y-6">
          {items.map(item=><WorkCard key={item.id} item={item}/>)}
        </div>}
    </main>
    <SiteFooter/>
  </div>;
}

function BridgeStatusCard({health,probing,onProbe}:{health:BridgeHealthView;probing:boolean;onProbe:()=>Promise<void>}){
  return <section className="mb-5 rounded-xl border border-line bg-card p-4">
    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${health.ready?'bg-green-500':'bg-warning'}`}/>
          <h2 className="text-sm font-semibold text-content">Media Bridge：{health.ready?'配置已就绪':'需要处理'}</h2>
        </div>
        <p className="text-xs text-muted mt-1 break-all">
          服务端内网解析 · STRM {health.strmRootReadable?'可读':'不可读'}
          {health.allowedHosts.length?` · Allowlist: ${health.allowedHosts.join(', ')}`:''}
        </p>
      </div>
      <button className="btn-ghost h-9 shrink-0" onClick={()=>void onProbe()} disabled={probing||!health.ready||!health.sampleAvailable}>
        {probing?'探测中…':'测试播放链路'}
      </button>
    </div>
    {!health.sampleAvailable&&health.ready&&<p className="text-xs text-faint mt-3">先同步至少一个 STRM 后，才能测试播放链路。</p>}
    {health.errors.length>0&&<div className="mt-3 space-y-1">
      {health.errors.map((item,index)=><p key={index} className="text-xs text-warning">• {item}</p>)}
    </div>}
  </section>;
}

function Notice({children}:{children:React.ReactNode}){
  return <div className="mb-4 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-content">{children}</div>;
}
function WorkCard({item}:{item:LibraryWork}){
  const poster=item.posterUrl?`/api/image/${encodeURIComponent(item.posterUrl)}`:undefined;
  const statusLabel=item.hidden?'已隐藏'
    :item.scrapeStatus==='pending'?'待整理'
    :item.scrapeStatus==='review'?'待确认'
    :item.scrapeStatus==='failed'?'待修正'
    :'';
  return <Link href={`/library/${item.id}`} className="group block min-w-0">
    <div className="aspect-[2/3] rounded-xl sm:rounded-2xl overflow-hidden bg-card relative shadow-sm ring-1 ring-line/80 transition duration-200 group-hover:-translate-y-0.5 group-hover:shadow-lg group-hover:ring-accent/30">
      {poster
        ?<img
          src={poster}
          alt={item.title}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.035]"
          loading="lazy"
        />
        :<div className="w-full h-full flex items-center justify-center px-3 text-center text-sm text-muted bg-gradient-to-br from-card via-chip to-hover">
          <span className="line-clamp-3">{item.title}</span>
        </div>}

      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/70 via-black/15 to-transparent pointer-events-none"/>

      <span className="absolute left-2 bottom-2 rounded-full bg-black/65 backdrop-blur-sm text-white text-[10px] px-2 py-0.5">
        {item.mediaType==='movie'?'电影':`${item.fileCount} 集`}
      </span>

      {statusLabel&&<span className="absolute top-2 right-2 rounded-full bg-black/65 backdrop-blur-sm text-white text-[10px] px-2 py-0.5">
        {statusLabel}
      </span>}
    </div>

    <div className="pt-2 px-0.5">
      <h2 className="text-[13px] sm:text-sm font-medium text-content leading-snug line-clamp-1 group-hover:text-accent transition-colors">
        {item.title}
      </h2>
      <p className="mt-0.5 text-[11px] sm:text-xs text-faint line-clamp-1">
        {[item.year,item.mediaType==='movie'?'电影':'剧集'].filter(Boolean).join(' · ')}
      </p>
    </div>
  </Link>;
}

function PosterSkeleton(){
  return <div className="grid grid-cols-3 min-[480px]:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-x-3 sm:gap-x-4 gap-y-5 sm:gap-y-6" aria-hidden="true">
    {Array.from({length:21}).map((_,index)=><div key={index} className="animate-pulse">
      <div className="aspect-[2/3] rounded-xl sm:rounded-2xl bg-chip"/>
      <div className="mt-2 h-3.5 rounded bg-chip w-4/5"/>
      <div className="mt-1.5 h-3 rounded bg-chip w-2/5"/>
    </div>)}
  </div>;
}
function Empty({activeQuery,canSync,syncing,sync}:{activeQuery:string;canSync:boolean;syncing:boolean;sync:()=>Promise<void>}){
  return <div className="py-20 text-center max-w-md mx-auto">
    <div className="text-4xl mb-4">🎬</div>
    <h2 className="text-lg font-semibold text-content">{activeQuery?'片库里没有找到':'本地片库还是空的'}</h2>
    <p className="text-sm text-muted mt-2 mb-5">{activeQuery?'换一个片名搜索，或让 Media Bridge 更新 STRM 后重新同步。':'准备好 STRM 后，手动同步一次即可建立本地索引。'}</p>
    {!activeQuery&&canSync&&<button className="btn-primary" disabled={syncing} onClick={()=>void sync()}>{syncing?'同步中…':'同步STRM'}</button>}
  </div>;
}
