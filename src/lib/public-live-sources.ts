export interface PublicLiveSourcePreset {
  id: string;
  name: string;
  role: 'primary' | 'backup';
  url: string;
  projectUrl: string;
  description: string;
}

export const PUBLIC_LIVE_SOURCES: PublicLiveSourcePreset[] = [
  {
    id: 'iptv-org-news',
    name: '公共新闻源 · 主（iptv-org）',
    role: 'primary',
    url: 'https://iptv-org.github.io/iptv/categories/news.m3u',
    projectUrl: 'https://github.com/iptv-org/iptv',
    description: '每日生成的公开 News 分类列表，作为默认公共 M3U 主源。',
  },
  {
    id: 'free-tv-backup',
    name: '公共直播源 · 备（Free-TV/IPTV）',
    role: 'backup',
    url: 'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8',
    projectUrl: 'https://github.com/Free-TV/IPTV',
    description: '强调免费频道与质量优先，作为备用公共 M3U 源；默认停用。',
  },
];

export function publicLiveSourceByUrl(url: string): PublicLiveSourcePreset | undefined {
  return PUBLIC_LIVE_SOURCES.find((source) => source.url === url);
}
