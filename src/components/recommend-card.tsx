'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { buildImageUrl, cn } from '@/lib/utils';
import type { DoubanItem } from '@/lib/types';

export function RecommendCard({ item, source }: { item: DoubanItem; source: 'douban'|'bangumi'|'hot' }) {
  const [failed, setFailed] = useState(false);
  const src = buildImageUrl(item.cover);
  useEffect(() => setFailed(false), [src]);

  const href = useMemo(() => {
    const params = new URLSearchParams({
      title: item.title,
      cover: item.cover,
      type: item.isTv ? 'tv' : 'movie',
    });
    if (item.rating) params.set('rating', item.rating);
    return `/discover/${source}/${encodeURIComponent(item.id)}?${params.toString()}`;
  }, [item, source]);

  return (
    <Link
      href={href}
      className="card overflow-hidden block transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      aria-label={`查看 ${item.title} 详情`}
    >
      <article>
        <div className="relative aspect-[2/3] bg-chip">
          {src && !failed
            ? <img src={src} alt={item.title} className="w-full h-full object-cover" loading="lazy" onError={() => setFailed(true)} />
            : <div className="w-full h-full flex items-center justify-center px-3 text-center text-xs text-faint">{item.title}</div>}
          {item.rating && <span className={cn('absolute top-1.5 right-1.5 tag bg-black/70 text-rating font-medium')}>★ {item.rating}</span>}
        </div>
        <div className="p-2 text-xs font-medium text-content truncate" title={item.title}>{item.title}</div>
      </article>
    </Link>
  );
}
