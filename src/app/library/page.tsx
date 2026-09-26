'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Header } from '@/components/header';
import type { MediaItem } from '@/lib/library/types';

type Filter = 'all' | 'movie' | 'tv';

export default function LibraryPage() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '120' });
      if (filter !== 'all') params.set('type', filter);
      const res = await fetch(`/api/library?${params}`, { cache: 'no-store' });
      if (!res.ok) throw new Error((await res.json()).error || '片库读取失败');
      const data = (await res.json()) as { items: MediaItem[]; total: number };
      setItems(data.items);
      setTotal(data.total);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '片库读取失败');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) =>
      [item.title, item.originalTitle, item.path, item.year]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
    );
  }, [items, query]);

  const sync = async () => {
    if (syncing) return;
    setSyncing(true);
    setMessage('');
    try {
      const res = await fetch('/api/library/sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '同步失败');
      setMessage(`同步完成：新增/更新 ${data.summary.videoFilesIndexed} 个视频文件`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '同步失败');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface pb-20 sm:pb-8">
      <Header />
      <main className="max-w-6xl mx-auto px-4 py-5 sm:py-7">
        <div className="flex items-start sm:items-center justify-between gap-3 mb-5">
          <div>
            <h1 className="text-2xl font-semibold text-content">我的片库</h1>
            <p className="text-sm text-muted mt-1">{total} 个已索引媒体 · 浏览和搜索不会访问115</p>
          </div>
          <button className="btn-primary shrink-0" onClick={sync} disabled={syncing}>
            {syncing ? '同步中…' : '同步115'}
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <input className="input flex-1 h-11" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索自己的115影视库…" aria-label="搜索私人影视库" />
          <div className="flex gap-2">
            {([['all','全部'],['movie','电影'],['tv','剧集']] as const).map(([value,label]) => (
              <button key={value} onClick={() => setFilter(value)} className={filter === value ? 'btn-primary flex-1 sm:flex-none' : 'btn-ghost flex-1 sm:flex-none'}>{label}</button>
            ))}
          </div>
        </div>

        {message && <div className="mb-4 rounded-lg border border-line bg-surface-raised px-4 py-3 text-sm text-content">{message}</div>}
        {loading ? <div className="py-20 text-center text-muted">正在读取私人片库…</div> : visible.length === 0 ? <EmptyLibrary onSync={sync} syncing={syncing} /> : (
          <section className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-x-3 gap-y-5">{visible.map((item) => <MediaCard key={item.id} item={item} />)}</section>
        )}
      </main>
      <MobileNav />
    </div>
  );
}

function MediaCard({ item }: { item: MediaItem }) {
  return (
    <Link href={`/library/watch/${item.id}`} className="group min-w-0">
      <div className="aspect-[2/3] rounded-lg overflow-hidden bg-surface-raised border border-line shadow-sm relative">
        {item.posterUrl ? <img src={item.posterUrl} alt={item.title} loading="lazy" className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform" /> : <div className="w-full h-full flex items-center justify-center px-3 text-center text-muted text-sm bg-gradient-to-br from-surface-raised to-surface">{item.title}</div>}
        <div className="absolute left-1.5 bottom-1.5 rounded bg-black/70 text-white text-[10px] px-1.5 py-0.5">{item.provider === '115' ? '115' : '夸克'}</div>
      </div>
      <h2 className="mt-2 text-sm font-medium text-content truncate">{item.title}</h2>
      <p className="text-xs text-muted truncate">{[item.year, item.mediaType === 'tv' && item.season ? `S${item.season}` : item.mediaType === 'movie' ? '电影' : '剧集'].filter(Boolean).join(' · ')}</p>
    </Link>
  );
}

function EmptyLibrary({ onSync, syncing }: { onSync: () => void; syncing: boolean }) {
  return <div className="py-20 text-center max-w-md mx-auto"><div className="text-4xl mb-4">🎬</div><h2 className="text-lg font-semibold text-content">片库还是空的</h2><p className="text-sm text-muted mt-2 mb-5">配置 ONEHUBX_115_COOKIE 和媒体目录后，手动同步一次即可建立本地索引。</p><button className="btn-primary" onClick={onSync} disabled={syncing}>{syncing ? '同步中…' : '同步115媒体库'}</button></div>;
}

function MobileNav() {
  return <nav className="sm:hidden fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur px-5 h-16 flex items-center justify-around"><Link href="/" className="text-xs text-muted">发现</Link><Link href="/library" className="text-xs font-semibold text-content">片库</Link><Link href="/live" className="text-xs text-muted">直播</Link></nav>;
}
