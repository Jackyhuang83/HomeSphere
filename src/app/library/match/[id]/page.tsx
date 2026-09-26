'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { LibraryWorkDetail } from '@/lib/library/types';
import type { TmdbSearchResult } from '@/lib/tmdb/client';

export default function MatchPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = String(params.id ?? '');
  const [work, setWork] = useState<LibraryWorkDetail | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TmdbSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<number | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    fetch(`/api/library/work/${encodeURIComponent(id)}`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error || '作品读取失败');
        return res.json() as Promise<LibraryWorkDetail>;
      })
      .then((value) => { setWork(value); setQuery(value.title); })
      .catch((err) => setError(err instanceof Error ? err.message : '作品读取失败'));
  }, [id]);

  const search = async () => {
    if (!query.trim() || !work) return;
    setLoading(true); setError('');
    try {
      const sp = new URLSearchParams({ q: query.trim(), type: work.mediaType });
      if (work.year) sp.set('year', work.year);
      const res = await fetch(`/api/library/tmdb/search?${sp}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'TMDB 搜索失败');
      setResults(data.items);
    } catch (err) { setError(err instanceof Error ? err.message : 'TMDB 搜索失败'); }
    finally { setLoading(false); }
  };

  const choose = async (item: TmdbSearchResult) => {
    setSaving(item.id); setError('');
    try {
      const res = await fetch(`/api/library/work/${encodeURIComponent(id)}/tmdb`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tmdbId: item.id, mediaType: item.mediaType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '保存失败');
      router.push('/library');
    } catch (err) { setError(err instanceof Error ? err.message : '保存失败'); }
    finally { setSaving(null); }
  };

  return (
    <main className="min-h-screen bg-surface text-content">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <Link href="/library" className="text-sm text-muted hover:text-content">← 返回片库</Link>
        <h1 className="text-2xl font-semibold mt-5">修正 TMDB 匹配</h1>
        {work && <p className="text-sm text-muted mt-1">当前作品：{work.title}{work.year ? ` (${work.year})` : ''}</p>}

        <form className="flex gap-2 mt-5" onSubmit={(e) => { e.preventDefault(); void search(); }}>
          <input className="input flex-1" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="输入片名" />
          <button className="btn-primary" disabled={loading || !work}>{loading ? '搜索中…' : '搜索TMDB'}</button>
        </form>
        {error && <div className="mt-4 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm">{error}</div>}

        <div className="mt-6 space-y-3">
          {results.map((item) => (
            <div key={`${item.mediaType}:${item.id}`} className="card p-3 flex gap-3">
              <div className="w-16 aspect-[2/3] bg-chip rounded overflow-hidden shrink-0">
                {item.posterUrl && <img src={item.posterUrl} alt={item.title} className="w-full h-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-medium">{item.title}</h2>
                <p className="text-xs text-muted mt-1">{[item.originalTitle, item.year, item.mediaType === 'movie' ? '电影' : '剧集', `TMDB ${item.id}`].filter(Boolean).join(' · ')}</p>
                {item.overview && <p className="text-xs text-muted mt-2 line-clamp-2">{item.overview}</p>}
              </div>
              <button className="btn-primary btn-sm self-center shrink-0" disabled={saving !== null} onClick={() => void choose(item)}>
                {saving === item.id ? '保存中…' : '选这个'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
