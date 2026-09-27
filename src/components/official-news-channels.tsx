'use client';

import { OFFICIAL_NEWS_CHANNELS } from '@/lib/official-news';

const REGION_ORDER = ['大陆', '香港', '台湾'] as const;

export function OfficialNewsChannels() {
  return (
    <section className="mb-5 rounded-xl border border-line bg-surface-raised p-4">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="font-semibold text-content">官方新闻直播</h2>
          <p className="text-xs text-muted mt-1">
            精简保留常看的官方频道；点击后由频道官网或官方直播平台直接播放，视频不经过 HomeSphere VPS。
          </p>
        </div>
        <span className="tag bg-chip text-faint">8 个核心频道</span>
      </div>

      <div className="space-y-4">
        {REGION_ORDER.map((region) => {
          const list = OFFICIAL_NEWS_CHANNELS.filter((item) => item.region === region);
          return (
            <div key={region}>
              <div className="text-xs font-medium text-faint mb-2">{region}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
                {list.map((channel) => (
                  <a
                    key={channel.id}
                    href={channel.officialUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="card p-3 block hover:bg-hover transition-colors"
                    title={`打开 ${channel.name} 官方直播`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="live-dot shrink-0" />
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-content truncate">{channel.name}</div>
                        <div className="text-[11px] text-faint truncate mt-0.5">{channel.provider}</div>
                      </div>
                    </div>
                    <p className="text-xs text-muted mt-2">{channel.note}</p>
                    <div className="text-[11px] text-accent mt-2">打开官方直播 ↗</div>
                  </a>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-faint mt-4">
        下方 M3U 播放器仍保留给你自己的 IPTV 订阅；官方频道与自定义 M3U 相互独立。
      </p>
    </section>
  );
}
