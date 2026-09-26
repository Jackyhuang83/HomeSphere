'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Header } from '@/components/header';
import type { LibraryWork } from '@/lib/library/types';

type Filter = 'all' | 'movie' | 'tv';

export default function LibraryPage() {
  return <Suspense><LibraryContent /></Suspense>;
}

function LibraryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') ?? '';
  const [items, setItems] = useState<LibraryWork[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState(initialQuery);
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [tmdbConfigured, setTmdbConfigured] = useState(false);
  const [message, setMessage] = useState('');

  const activeQuery = searchParams.get('q')?.trim() ?? '';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const url = activeQuery
        ? `/api/library/search?q=${encodeURIComponent(activeQuery)}`
        : `/api/library?limit=120${filter !== 'all' ? `&type=${filter}` : ''}`;
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error((await res.json()).error || '片库读取失败');
      const data = await res.json() as { items: LibraryWork[]; total?: number; tmdbConfigured?: boolean };
      setItems(data.items);
      setTotal(data.total ?? data.items.length);
      if (typeof data.tmdbConfigured === 'boolean') setTmdbConfigured(data.tmdbConfigured);
      if (activeQuery) {
        const statusRes = await fetch('/api/library?limit=1', { cache: 'no-store' });
        if (statusRes.ok) {
          const status = await statusRes.json() as { tmdbConfigured?: boolean };
          setTmdbConfigured(Boolean(status.tmdbConfigured));
        }
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '片库读取失败');
    } finally {
      setLoading(false);
    }
  }, [activeQuery, filter]);

  useEffect(() => { setQuery(initialQuery); }, [initialQuery]);
  useEffect(() => { void load(); }, [load]);

  const search = (value: string) => {
    const q = value.trim();
    router.push(q ? `/library?q=${encodeURIComponent(q)}` : '/library');
  };

  const sync = async () => {
    if (syncing) return;
    setSyncing(true);
    setMessage('');
    try {
      const res = await fetch('/api/library/sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '同步失败');
      setMessage(`115同步完成：${data.summary.worksIndexed} 部作品，${data.summary.videoFilesIndexed} 个视频文件`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '同步失败');
    } finally { setSyncing(false); }
  };

  const scrape = async () => {
    if (scraping) return;
    setScraping(true);
    setMessage('');
    try {
      const res = await fetch('/api/library/scrape', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ limit: 100 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'TMDB整理失败');
      const s = data.summary;
      setMessage(`TMDB整理完成：匹配 ${s.matched}，待确认 ${s.review}，失败 ${s.failed}`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'TMDB整理失败');
    } finally { setScraping(false); }
  };

  return (
    <div className="min-h-screen bg-surface pb-20 sm:pb-8">
      <Header />
      <main className="max-w-6xl mx-auto px-4 py-5 sm:py-7">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div>
            <h1 className="text-2xl font-semibold text-content">我的片库</h1>
            <p className="text-sm text-muted mt-1">{total} 部作品 · 浏览和搜索只读本地数据库</p>
          </div>
          <div className="flex gap-2">
            <button className="btn-ghost flex-1 sm:flex-none" onClick={sync} disabled={syncing}>
              {syncing ? '同步中…' : '同步115'}
            </button>
            <button className="btn-primary flex-1 sm:flex-none" onClick={scrape} disabled={scraping || !tmdbConfigured}>
              {scraping ? '整理中…' : '整理海报'}
            </button>
          </div>
        </div>

        {!tmdbConfigured && (
          <div className="mb-4 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-content">
            尚未配置 TMDB_API_TOKEN；115 索引可以正常使用，但自动海报整理暂不可用。
          </div>
        )}

        <form className="flex gap-2 mb-4" onSubmit={(e) => { e.preventDefault(); search(query); }}>
          <input className="input flex-1 h-11" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索自己的115影视库…" aria-label="搜索私人影视库" />
          <button className="btn-primary" type="submit">搜索</button>
          {activeQuery && <button className="btn-ghost" type="button" onClick={() => { setQuery(''); search(''); }}>清除</button>}
        </form>

        {!activeQuery && (
          <div className="flex gap-2 mb-5">
            {([['all','全部'],['movie','电影'],['tv','剧集']] as const).map(([value,label]) => (
              <button key={value} onClick={() => setFilter(value)}
                className={filter === value ? 'btn-primary flex-1 sm:flex-none' : 'btn-ghost flex-1 sm:flex-none'}>{label}</button>
            ))}
          </div>
        )}

        {activeQuery && <p className="mb-4 text-sm text-muted">“{activeQuery}” 在我的115中找到 {items.length} 部作品</p>}
        {message && <div className="mb-4 rounded-lg border border-line bg-surface-raised px-4 py-3 text-sm text-content">{message}</div>}

        {loading ? <div className="py-20 text-center text-muted">正在读取私人片库…</div>
          : items.length === 0 ? <EmptyLibrary query={activeQuery} onSync={sync} syncing={syncing} />
          : <section className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-x-3 gap-y-5">
              {items.map((item) => <WorkCard key={item.id} item={item} />)}
            </section>}
      </main>
      <MobileNav />
    </div>
  );
}

function WorkCard({ item }: { item: LibraryWork }) {
  const needsReview = item.scrapeStatus === 'review' || item.scrapeStatus === 'failed';
  return (
    <div className="min-w-0">
      <Link href={`/library/watch/${item.id}`} className="group block">
        <div className="aspect-[2/3] rounded-lg overflow-hidden bg-surface-raised border border-line shadow-sm relative">
          {item.posterUrl
            ? <img src={item.posterUrl} alt={item.title} loading="lazy" className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform" />
            : <div className="w-full h-full flex items-center justify-center px-3 text-center text-muted text-sm bg-gradient-to-br from-surface-raised to-surface">{item.title}</div>}
          <div className="absolute left-1.5 bottom-1.5 rounded bg-black/70 text-white text-[10px] px-1.5 py-0.5">115</div>
          {item.mediaType === 'tv' && item.fileCount > 0 && <div className="absolute right-1.5 bottom-1.5 rounded bg-black/70 text-white text-[10px] px-1.5 py-0.5">{item.fileCount} 集</div>}
          {item.scrapeStatus === 'pending' && <div className="absolute top-1.5 right-1.5 rounded bg-black/70 text-white text-[10px] px-1.5 py-0.5">待整理</div>}
        </div>
        <h2 className="mt-2 text-sm font-medium text-content truncate">{item.title}</h2>
        <p className="text-xs text-muted truncate">{[item.year, item.mediaType === 'movie' ? '电影' : '剧集'].filter(Boolean).join(' · ')}</p>
      </Link>
      {needsReview && (
        <Link href={`/library/match/${item.id}`} className="mt-1 inline-block text-xs text-warning hover:underline">
          {item.scrapeStatus === 'review' ? '需要确认匹配' : '识别失败，手动修正'}
        </Link>
      )}
    </div>
  );
}

function EmptyLibrary({ query, onSync, syncing }: { query: string; onSync: () => void; syncing: boolean }) {
  return <div className="py-20 text-center max-w-md mx-auto">
    <div className="text-4xl mb-4">🎬</div>
    <h2 className="text-lg font-semibold text-content">{query ? '我的115里还没有找到这部作品' : '片库还是空的'}</h2>
    <p className="text-sm text-muted mt-2 mb-5">{query ? '可以返回发现页继续看榜单，或把影片保存到115后重新同步。' : '配置115媒体目录后，手动同步一次即可建立本地作品索引。'}</p>
    {!query && <button className="btn-primary" onClick={onSync} disabled={syncing}>{syncing ? '同步中…' : '同步115媒体库'}</button>}
  </div>;
}

function MobileNav() {
  return <nav className="sm:hidden fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur px-5 h-16 flex items-center justify-around">
    <Link href="/" className="text-xs text-muted">发现</Link>
    <Link href="/library" className="text-xs font-semibold text-content">片库</Link>
    <Link href="/live" className="text-xs text-muted">直播</Link>
  </nav>;
}
