'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { LibraryMatchHit } from '@/lib/types';
import { buildImageUrl, cn } from '@/lib/utils';

export function RecommendCard({
  item,
  match,
  matchKnown=false,
}:{
  item:{title:string;cover:string;rating?:string};
  match?:LibraryMatchHit;
  matchKnown?:boolean;
}) {
  const [failed,setFailed]=useState(false);
  const src=buildImageUrl(item.cover);
  useEffect(()=>setFailed(false),[src]);

  const body=<article className={cn('card overflow-hidden h-full',match&&'ring-1 ring-accent/40')}>
    <div className="relative aspect-[2/3] bg-chip">
      {src && !failed
        ? <img src={src} alt={item.title} className="w-full h-full object-cover" loading="lazy" onError={()=>setFailed(true)} />
        : <div className="w-full h-full flex items-center justify-center px-3 text-center text-xs text-faint">{item.title}</div>}
      {item.rating && <span className="absolute top-1.5 right-1.5 tag bg-black/70 text-rating font-medium">★ {item.rating}</span>}
      {matchKnown && (
        <span className={cn(
          'absolute left-1.5 bottom-1.5 rounded px-1.5 py-0.5 text-[10px] font-medium',
          match ? 'bg-accent text-on-accent' : 'bg-black/65 text-white/85'
        )}>
          {match?'已入库':'未入库'}
        </span>
      )}
    </div>
    <div className="p-2">
      <div className="text-xs font-medium text-content truncate" title={item.title}>{item.title}</div>
      {match && <div className="text-[10px] text-accent mt-1 truncate">打开我的片库</div>}
    </div>
  </article>;

  return match
    ? <Link href={`/library/${encodeURIComponent(match.workId)}`} className="block h-full" aria-label={`打开片库中的 ${match.title}`}>{body}</Link>
    : body;
}
