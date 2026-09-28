export interface PublicLiveSourcePreset {
  id: string;
  name: string;
  role: 'primary' | 'backup';
  url: string;
  projectUrl: string;
  description: string;
}

export const LEGACY_PUBLIC_LIVE_SOURCE_URLS = [
  'https://iptv-org.github.io/iptv/categories/news.m3u',
  'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8',
] as const;

export const PUBLIC_LIVE_SOURCES: PublicLiveSourcePreset[] = [
  {
    id: 'iptv-org-chinese',
    name: '中文频道 · 主（iptv-org）',
    role: 'primary',
    url: 'https://iptv-org.github.io/iptv/languages/zho.m3u',
    projectUrl: 'https://github.com/iptv-org/iptv',
    description: 'iptv-org 自动生成的 Chinese 语言列表，作为 HomeSphere 默认中文主源。',
  },
  {
    id: 'iptv-cn-chinese',
    name: '中文频道 · 备（IPTV-CN）',
    role: 'backup',
    url: 'https://iptv-cn.github.io/IPTV/languages/zho.m3u',
    projectUrl: 'https://github.com/IPTV-CN/IPTV',
    description: '偏 CCTV、卫视、地方与港澳频道的中文列表，作为备用源；默认停用。',
  },
];

export function publicLiveSourceByUrl(url: string): PublicLiveSourcePreset | undefined {
  return PUBLIC_LIVE_SOURCES.find((source) => source.url === url);
}
