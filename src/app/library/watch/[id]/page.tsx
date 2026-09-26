'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import type { LibraryWorkDetail, MediaItem } from '@/lib/library/types';

export default function PrivateWatchPage() {
  const params = useParams<{ id: string }>();
  const id = String(params.id ?? '');
  const [work, setWork] = useState<LibraryWorkDetail | null>(null);
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    fetch(`/api/library/work/${encodeURIComponent(id)}`, { signal: controller.signal, cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error || '作品读取失败');
        return res.json() as Promise<LibraryWorkDetail>;
      })
      .then((value) => { setWork(value); setSelected(value.files[0] ?? null); })
      .catch((err) => { if (err?.name !== 'AbortError') setError(err instanceof Error ? err.message : '作品读取失败'); });
    return () => controller.abort();
  }, [id]);

  const grouped = useMemo(() => {
    if (!work) return new Map<number, MediaItem[]>();
    const map = new Map<number, MediaItem[]>();
    for (const file of work.files) {
      const season = file.season ?? 1;
      const list = map.get(season) ?? [];
      list.push(file);
      map.set(season, list);
    }
    return map;
  }, [work]);

  if (error) return <Centered text={error} />;
  if (!work) return <Centered text="正在读取作品…" />;

  return (
    <main className="min-h-screen bg-black text-white flex flex-col">
      <header className="min-h-14 px-4 py-3 flex items-center gap-3 bg-black/90 border-b border-white/10">
        <Link href="/library" className="text-sm text-white/80 hover:text-white">← 返回片库</Link>
        <span className="font-medium truncate">{work.title}</span>
        <Link href={`/library/match/${work.id}`} className="text-xs text-white/50 ml-auto shrink-0">修正TMDB</Link>
      </header>

      <div className="w-full bg-black flex items-center justify-center min-h-[35vh] sm:min-h-[55vh]">
        {selected
          ? <video key={selected.id} src={`/api/play/${encodeURIComponent(selected.id)}`} controls autoPlay playsInline preload="metadata" className="w-full max-h-[70vh] bg-black" />
          : <div className="text-white/50">没有可播放文件</div>}
      </div>

      <section className="bg-[#111] px-4 py-5 flex-1">
        <div className="max-w-5xl mx-auto">
          <div className="flex gap-4">
            {work.posterUrl && <img src={work.posterUrl} alt={work.title} className="hidden sm:block w-28 aspect-[2/3] object-cover rounded-lg shrink-0" />}
            <div className="min-w-0">
              <h1 className="text-xl font-semibold">{work.title}</h1>
              <p className="text-sm text-white/50 mt-1">{[work.year, work.mediaType === 'movie' ? '电影' : '剧集', work.tmdbId ? `TMDB ${work.tmdbId}` : '未匹配TMDB'].filter(Boolean).join(' · ')}</p>
              {work.overview && <p className="text-sm text-white/70 leading-relaxed mt-3 line-clamp-4">{work.overview}</p>}
            </div>
          </div>

          {work.mediaType === 'tv' && work.files.length > 0 && (
            <div className="mt-6 space-y-5">
              {[...grouped.entries()].map(([season, files]) => (
                <div key={season}>
                  <h2 className="text-sm font-medium text-white/70 mb-2">第 {season} 季</h2>
                  <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-2">
                    {files.map((file, index) => (
                      <button key={file.id} onClick={() => setSelected(file)}
                        className={selected?.id === file.id ? 'rounded-md bg-white text-black py-2 text-sm' : 'rounded-md bg-white/10 hover:bg-white/20 py-2 text-sm'}>
                        {file.episode ?? index + 1}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function Centered({ text }: { text: string }) {
  return <main className="min-h-screen bg-black text-white flex items-center justify-center px-6 text-center">{text}</main>;
}
