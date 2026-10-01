'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

interface ActivityWork {
  id:string;
  title:string;
  year?:string;
  mediaType:'movie'|'tv';
  posterUrl?:string;
}

interface ActivityItem {
  mediaId:string;
  workId:string;
  position:number;
  duration:number;
  completed:boolean;
  lastPlayedAt:number;
  work:ActivityWork;
  media:{id:string;season?:number;episode?:number};
}

interface ActivitySummary {
  continueWatching:ActivityItem[];
  recentWatching:ActivityItem[];
  favorites:ActivityWork[];
  watchlist:ActivityWork[];
}

export function LibraryActivitySections(){
  const [data,setData]=useState<ActivitySummary|null>(null);

  useEffect(()=>{
    const controller=new AbortController();
    fetch('/api/library/activity',{cache:'no-store',signal:controller.signal})
      .then(async res=>{
        if(!res.ok)throw new Error('activity unavailable');
        return res.json() as Promise<ActivitySummary>;
      })
      .then(setData)
      .catch(()=>{});
    return()=>controller.abort();
  },[]);

  if(!data)return null;

  const continueCount=data.continueWatching.length;
  const recentCount=data.recentWatching.length;
  const favoriteCount=data.favorites.length;
  const watchlistCount=data.watchlist.length;
  if(!continueCount&&!recentCount&&!favoriteCount&&!watchlistCount)return null;

  return <details className="mb-5 sm:mb-6 rounded-2xl border border-line/80 bg-card overflow-hidden">
    <summary className="cursor-pointer select-none px-4 py-3.5 sm:px-5 flex items-center gap-3 text-sm hover:bg-hover/60 transition-colors">
      <span className="font-semibold text-content">观看记录与收藏</span>
      <span className="ml-auto text-xs text-muted">
        {[
          continueCount?'继续 '+continueCount:'',
          recentCount?'最近 '+recentCount:'',
          favoriteCount?'收藏 '+favoriteCount:'',
          watchlistCount?'想看 '+watchlistCount:'',
        ].filter(Boolean).join(' · ')}
      </span>
    </summary>
    <div className="border-t border-line px-4 sm:px-5 py-5 space-y-7">
      {continueCount>0&&<ActivityRow title="继续播放" items={data.continueWatching} showProgress/>}
      {recentCount>0&&<ActivityRow title="最近观看" items={data.recentWatching}/>}
      {favoriteCount>0&&<WorkRow title="我的收藏" items={data.favorites}/>}
      {watchlistCount>0&&<WorkRow title="想看" items={data.watchlist}/>}
    </div>
  </details>;
}

function ActivityRow({title,items,showProgress=false}:{title:string;items:ActivityItem[];showProgress?:boolean}){
  return <section>
    <h2 className="text-base sm:text-lg font-semibold text-content mb-3">{title}</h2>
    <div className="flex gap-3 sm:gap-4 overflow-x-auto pb-2 scrollbar-thin">
      {items.map(item=>{
        const percent=item.duration>0?Math.max(0,Math.min(100,Math.round(item.position/item.duration*100))):0;
        const href=`/library/${item.work.id}?media=${encodeURIComponent(item.media.id)}`;
        return <Link key={item.work.id} href={href} className="group w-[112px] sm:w-[132px] shrink-0">
          <Poster work={item.work}/>
          {showProgress&&<div className="h-1 rounded-full bg-chip mt-2 overflow-hidden">
            <div className="h-full bg-accent" style={{width:`${percent}%`}}/>
          </div>}
          <div className={showProgress?'pt-1.5':'pt-2'}>
            <div className="text-[13px] sm:text-sm font-medium text-content line-clamp-1 group-hover:text-accent">{item.work.title}</div>
            <div className="text-[11px] sm:text-xs text-faint mt-0.5 line-clamp-1">
              {activityMeta(item,showProgress?percent:undefined)}
            </div>
          </div>
        </Link>;
      })}
    </div>
  </section>;
}

function WorkRow({title,items}:{title:string;items:ActivityWork[]}){
  return <section>
    <h2 className="text-base sm:text-lg font-semibold text-content mb-3">{title}</h2>
    <div className="flex gap-3 sm:gap-4 overflow-x-auto pb-2 scrollbar-thin">
      {items.map(work=><Link key={work.id} href={`/library/${work.id}`} className="group w-[112px] sm:w-[132px] shrink-0">
        <Poster work={work}/>
        <div className="pt-2">
          <div className="text-[13px] sm:text-sm font-medium text-content line-clamp-1 group-hover:text-accent">{work.title}</div>
          <div className="text-[11px] sm:text-xs text-faint mt-0.5">{[work.year,work.mediaType==='movie'?'电影':'剧集'].filter(Boolean).join(' · ')}</div>
        </div>
      </Link>)}
    </div>
  </section>;
}

function Poster({work}:{work:ActivityWork}){
  const poster=work.posterUrl?`/api/image/${encodeURIComponent(work.posterUrl)}`:undefined;
  return <div className="aspect-[2/3] rounded-xl overflow-hidden bg-card ring-1 ring-line/80 shadow-sm transition duration-200 group-hover:-translate-y-0.5 group-hover:shadow-lg group-hover:ring-accent/30">
    {poster
      ?<img src={poster} alt={work.title} loading="lazy" decoding="async" className="w-full h-full object-cover"/>
      :<div className="w-full h-full flex items-center justify-center px-3 text-center text-sm text-muted bg-gradient-to-br from-card via-chip to-hover">{work.title}</div>}
  </div>;
}

function activityMeta(item:ActivityItem,percent?:number){
  const parts:string[]=[];
  if(item.work.mediaType==='tv'){
    if(item.media.season!==undefined&&item.media.episode!==undefined)parts.push(`S${item.media.season}E${item.media.episode}`);
    else if(item.media.episode!==undefined)parts.push(`第 ${item.media.episode} 集`);
  }else if(item.work.year)parts.push(item.work.year);
  if(item.completed)parts.push('已看完');
  else if(percent!==undefined)parts.push(`${percent}%`);
  return parts.join(' · ')||'最近观看';
}
