'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/header';
import { RecommendSection } from '@/components/douban-section';
import { SiteFooter } from '@/components/site-footer';
import type { LibraryWork } from '@/lib/library/types';

export default function HomePage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<LibraryWork[]>([]);
  const [libraryReady, setLibraryReady] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/library?limit=12', { cache: 'no-store', signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error('片库读取失败');
        return res.json() as Promise<{ items: LibraryWork[] }>;
      })
      .then((data) => {
        setRecent(data.items);
        setLibraryReady(true);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setLibraryReady(true);
      });
    return () => controller.abort();
  }, []);

  const searchLibrary = (title: string) => {
    const q = title.trim().slice(0, 100);
    if (!q) return;
    router.push(`/library?q=${encodeURIComponent(q)}`);
  };

  return (
    <div className="min-h-screen flex flex-col bg-surface">
      <Header />
      <main className="relative flex-1 max-w-6xl w-full mx-auto px-4 py-6 sm:py-8">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[360px] -z-10"
          style={{
            background:
              'radial-gradient(60% 60% at 50% 0%, rgba(35,173,229,0.12) 0%, rgba(35,173,229,0.03) 48%, transparent 78%)',
          }}
        />

        <section className="text-center pt-5 sm:pt-10 pb-8">
          <h1 className="text-4xl sm:text-5xl font-bold brand-gradient">OneHubX Movies</h1>
          <p className="mt-3 text-sm sm:text-base text-muted">私人家庭影视库 · 115直连播放 · IPTV</p>

          <form
            className="mt-6 mx-auto flex w-full max-w-2xl items-stretch"
            onSubmit={(e) => {
              e.preventDefault();
              searchLibrary(query);
            }}
          >
            <input
              className="input flex-1 min-w-0 h-12 !rounded-r-none"
              value={query}
              maxLength={100}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索我的115影视库..."
              aria-label="搜索我的115影视库"
            />
            <button className="btn-primary h-12 !rounded-l-none px-5" type="submit">
              搜索
            </button>
          </form>

          <div className="mt-4 flex justify-center gap-2">
            <Link href="/library" className="btn-ghost">我的片库</Link>
            <Link href="/live" className="btn-ghost">IPTV直播</Link>
          </div>
        </section>

        <section className="mb-9">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-lg font-semibold text-content">最近加入115</h2>
              <p className="text-xs text-muted mt-0.5">来自本地索引，浏览不会请求115</p>
            </div>
            <Link href="/library" className="text-sm text-accent hover:underline">查看全部</Link>
          </div>

          {!libraryReady ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2.5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="aspect-[2/3] rounded-lg bg-chip animate-pulse" />
              ))}
            </div>
          ) : recent.length === 0 ? (
            <div className="rounded-xl border border-line bg-surface-raised px-5 py-8 text-center">
              <p className="text-sm text-muted">片库还是空的，先进入“我的片库”同步115。</p>
              <Link href="/library" className="btn-primary inline-flex mt-4">去同步115</Link>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2.5">
              {recent.map((work) => (
                <Link key={work.id} href={`/library/watch/${work.id}`} className="group min-w-0">
                  <div className="relative aspect-[2/3] overflow-hidden rounded-lg border border-line bg-chip">
                    {work.posterUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={work.posterUrl}
                        alt={work.title}
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform group-hover:scale-[1.02]"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center px-3 text-center text-xs text-muted">
                        {work.title}
                      </div>
                    )}
                    {work.mediaType === 'tv' && work.fileCount > 0 && (
                      <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">
                        {work.fileCount} 集
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 text-xs font-medium text-content truncate">{work.title}</div>
                  <div className="text-[11px] text-muted truncate">{work.year ?? (work.mediaType === 'movie' ? '电影' : '剧集')}</div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-content">发现</h2>
            <p className="text-xs text-muted mt-0.5">榜单只用于找片；点击影片只搜索你自己的115片库</p>
          </div>
          <RecommendSection onPick={searchLibrary} onLibrarySearch={searchLibrary} />
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
