export interface PublicLiveSourcePreset {
  id: string;
  name: string;
  role: 'primary' | 'backup';
  priority: number;
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
    name: '中文线路 1 · iptv-org',
    role: 'primary',
    priority: 1,
    url: 'https://iptv-org.github.io/iptv/languages/zho.m3u',
    projectUrl: 'https://github.com/iptv-org/iptv',
    description: 'iptv-org 自动生成的 Chinese 语言列表，作为第一候选线路。',
  },
  {
    id: 'iptv-cn-chinese',
    name: '中文线路 2 · IPTV-CN',
    role: 'backup',
    priority: 2,
    url: 'https://iptv-cn.github.io/IPTV/languages/zho.m3u',
    projectUrl: 'https://github.com/IPTV-CN/IPTV',
    description: '偏 CCTV、卫视、地方与港澳频道的中文列表，作为第二候选线路。',
  },
  {
    id: 'vbskycn-ipv4',
    name: '中文线路 3 · vbskycn',
    role: 'backup',
    priority: 3,
    url: 'https://raw.githubusercontent.com/vbskycn/iptv/master/tv/iptv4.m3u',
    projectUrl: 'https://github.com/vbskycn/iptv',
    description: '自动扫描验证的 IPv4 中文直播列表，作为第三候选线路。',
  },
  {
    id: 'hujingguang-chinaiptv',
    name: '中文线路 4 · ChinaIPTV',
    role: 'backup',
    priority: 4,
    url: 'https://raw.githubusercontent.com/hujingguang/ChinaIPTV/main/cnTV_AutoUpdate.m3u8',
    projectUrl: 'https://github.com/hujingguang/ChinaIPTV',
    description: '持续自动更新的中文直播列表，作为第四候选线路。',
  },
];

export function publicLiveSourceByUrl(url: string): PublicLiveSourcePreset | undefined {
  return PUBLIC_LIVE_SOURCES.find((source) => source.url === url);
}
