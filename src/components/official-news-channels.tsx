'use client';

import { useEffect, useState } from 'react';
import { OFFICIAL_NEWS_CHANNELS } from '@/lib/official-news';

const REGION_ORDER = ['大陆', '香港', '台湾'] as const;

export function OfficialNewsChannels({ activePlayback = false }: { activePlayback?: boolean }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (activePlayback) setOpen(false);
  }, [activePlayback]);

  return (
    <section className="mb-3 rounded-lg border border-line bg-surface-raised">
      <button
        type="button"
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-hover transition-colors rounded-lg"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className="live-dot shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-semibold text-content shrink-0">官方新闻直播</span>
            <span className="text-xs text-faint truncate">CCTV · 凤凰 · TVBS · 民视 · 三立 · 东森</span>
          </div>
        </div>
        <span className="text-[11px] text-faint shrink-0">8 个</span>
        <svg
          className={`w-4 h-4 text-muted shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-line px-3 py-3">
          <p className="text-[11px] text-faint mb-3">
            打开频道官网或官方直播平台；视频不经过 HomeSphere VPS。
          </p>

          <div className="space-y-3">
            {REGION_ORDER.map((region) => {
              const list = OFFICIAL_NEWS_CHANNELS.filter((item) => item.region === region);
              return (
                <div key={region}>
                  <div className="text-[11px] font-medium text-faint mb-1.5">{region}</div>
                  <div className="flex flex-wrap gap-2">
                    {list.map((channel) => (
                      <a
                        key={channel.id}
                        href={channel.officialUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-md border border-line bg-card px-2.5 py-2 text-xs text-content hover:bg-hover hover:text-accent transition-colors"
                        title={`打开 ${channel.name} 官方直播 · ${channel.provider}`}
                      >
                        <span className="live-dot shrink-0" />
                        <span>{channel.name}</span>
                        <span className="text-faint">↗</span>
                      </a>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
