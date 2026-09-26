'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { buildImageUrl, cn } from '@/lib/utils';

export function RecommendCard({ item }: { item: { title: string; cover: string; rating?: string } }) {
  const imageProxyMode = useAppStore((s) => s.imageProxyMode);
  const customImageProxy = useAppStore((s) => s.customImageProxy);
  const [failed, setFailed] = useState(false);
  const src = buildImageUrl(item.cover, imageProxyMode, customImageProxy);
  useEffect(() => setFailed(false), [src]);

  return (
    <article className="card overflow-hidden">
      <div className="relative aspect-[2/3] bg-chip">
        {src && !failed
          ? <img src={src} alt={item.title} className="w-full h-full object-cover" loading="lazy" onError={() => setFailed(true)} />
          : <div className="w-full h-full flex items-center justify-center px-3 text-center text-xs text-faint">{item.title}</div>}
        {item.rating && <span className={cn('absolute top-1.5 right-1.5 tag bg-black/70 text-rating font-medium')}>★ {item.rating}</span>}
      </div>
      <div className="p-2 text-xs font-medium text-content truncate" title={item.title}>{item.title}</div>
    </article>
  );
}
