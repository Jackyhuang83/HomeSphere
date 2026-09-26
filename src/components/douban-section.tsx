'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/client-api';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import type { DoubanItem, LibraryMatchHit, LibraryMatchRequestItem } from '@/lib/types';
import { RecommendCard } from './recommend-card';

const MOVIE_TAGS = ['热门','最新','经典','豆瓣高分','冷门佳片','华语','欧美','韩国','日本','动画'];
const TV_TAGS = ['热门','美剧','英剧','韩剧','日剧','国产剧','港剧','日本动画','综艺','纪录片'];
const WEEKDAYS = ['周一','周二','周三','周四','周五','周六','周日'];
const HOT_LISTS = [
  { id: 'douban_movie_weekly', label: '电影周榜' },
  { id: 'douban_tv_chinese', label: '国产剧周榜' },
  { id: 'douban_tv_global', label: '海外剧周榜' },
  { id: 'douban_show_chinese', label: '国内综艺' },
  { id: 'douban_show_global', label: '海外综艺' },
  { id: 'baidu_teleplay', label: '百度热播剧' },
];

export function RecommendSection() {
  const enabled = useAppStore((s) => s.doubanEnabled);
  const source = useAppStore((s) => s.recommendSource);
  if (!enabled) return null;
  if (source === 'bangumi') return <BangumiView />;
  if (source === 'douban') return <DoubanView />;
  return <HotListView />;
}

function DoubanView() {
  const [type, setType] = useState<'movie'|'tv'>('movie');
  const [tag, setTag] = useState('热门');
  const query = useQuery({ queryKey: ['douban', type, tag], queryFn: ({ signal }) => api.douban(type, tag, 0, 50, signal) });
  const tags = type === 'movie' ? MOVIE_TAGS : TV_TAGS;
  return (
    <section>
      <div className="flex gap-2 mb-3">
        <button className={type === 'movie' ? 'btn-primary btn-sm' : 'btn-ghost btn-sm'} onClick={() => { setType('movie'); setTag('热门'); }}>电影</button>
        <button className={type === 'tv' ? 'btn-primary btn-sm' : 'btn-ghost btn-sm'} onClick={() => { setType('tv'); setTag('热门'); }}>剧集</button>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-4">
        {tags.map((t) => <button key={t} className={cn('px-2.5 py-1 rounded-full text-xs', t === tag ? 'bg-accent text-on-accent' : 'bg-chip text-muted hover:bg-hover')} onClick={() => setTag(t)}>{t}</button>)}
      </div>
      <RecommendationGrid items={query.data?.items ?? []} loading={query.isLoading} error={query.isError} />
    </section>
  );
}

function BangumiView() {
  const [weekday, setWeekday] = useState<number|'all'>('all');
  const query = useQuery({ queryKey: ['bangumi-calendar'], queryFn: ({ signal }) => api.bangumiCalendar(signal) });
  let items: DoubanItem[] = [];
  if (query.data) items = weekday === 'all' ? query.data.days.flatMap((d) => d.items) : (query.data.days.find((d) => d.weekday === weekday)?.items ?? []);
  return (
    <section>
      <div className="flex flex-wrap gap-1.5 mb-4">
        <Chip active={weekday === 'all'} onClick={() => setWeekday('all')}>全部</Chip>
        {WEEKDAYS.map((name, i) => <Chip key={name} active={weekday === i + 1} onClick={() => setWeekday(i + 1)}>{name}</Chip>)}
      </div>
      <RecommendationGrid items={items} loading={query.isLoading} error={query.isError} />
    </section>
  );
}

function HotListView() {
  const [listId, setListId] = useState(HOT_LISTS[0].id);
  const query = useQuery({ queryKey: ['hot-list', listId], queryFn: ({ signal }) => api.hotList(listId, signal) });
  return (
    <section>
      <div className="flex flex-wrap gap-1.5 mb-4">
        {HOT_LISTS.map((l) => <Chip key={l.id} active={listId === l.id} onClick={() => setListId(l.id)}>{l.label}</Chip>)}
      </div>
      <RecommendationGrid items={query.data?.items ?? []} loading={query.isLoading} error={query.isError} />
    </section>
  );
}

function RecommendationGrid({ items, loading, error }: { items: DoubanItem[]; loading: boolean; error: boolean }) {
  const matchItems:LibraryMatchRequestItem[]=items.slice(0,60).map((item,index)=>({
    key:recommendMatchKey(item,index),
    title:item.title,
    year:item.year,
    isTv:item.isTv,
  }));
  const fingerprint=matchItems.map(item=>`${item.key}:${item.title}:${item.year || ''}:${item.isTv===true?'tv':item.isTv===false?'movie':'any'}`).join('|');
  const matchQuery=useQuery({
    queryKey:['library-match',fingerprint],
    queryFn:({signal})=>api.libraryMatch(matchItems,signal),
    enabled:!loading && !error && matchItems.length>0,
    staleTime:30_000,
  });

  if (error) return <p className="text-center text-sm text-faint py-10">推荐内容加载失败</p>;
  if (loading) return <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2.5">{Array.from({ length: 16 }).map((_, i) => <div key={i} className="aspect-[2/3] rounded-lg bg-chip animate-pulse" />)}</div>;

  const matches:Record<string,LibraryMatchHit>=matchQuery.data?.matches || {};
  return <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2.5">
    {items.map((item,index)=>{
      const key=recommendMatchKey(item,index);
      return <RecommendCard
        key={key}
        item={item}
        match={matches[key]}
        matchKnown={matchQuery.isSuccess}
      />;
    })}
  </div>;
}

function recommendMatchKey(item:DoubanItem,index:number):string {
  return `${index}:${item.id}:${item.isTv===true?'tv':item.isTv===false?'movie':'any'}`;
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button className={cn('px-2.5 py-1 rounded-full text-xs', active ? 'bg-accent text-on-accent' : 'bg-chip text-muted hover:bg-hover')} onClick={onClick}>{children}</button>;
}
