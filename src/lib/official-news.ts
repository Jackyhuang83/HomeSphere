export interface OfficialNewsChannel {
  id: string;
  name: string;
  region: '大陆' | '香港' | '台湾';
  officialUrl: string;
  provider: string;
  note: string;
}

export const OFFICIAL_NEWS_CHANNELS: OfficialNewsChannel[] = [
  {
    id: 'cctv13',
    name: 'CCTV-13 新闻',
    region: '大陆',
    officialUrl: 'https://tv.cctv.com/live/cctv13/',
    provider: '央视网',
    note: '24 小时新闻频道',
  },
  {
    id: 'cctv4',
    name: 'CCTV-4 中文国际',
    region: '大陆',
    officialUrl: 'https://tv.cctv.com/live/cctv4/',
    provider: '央视网',
    note: '中文国际频道（亚洲版）',
  },
  {
    id: 'phoenix-info',
    name: '凤凰卫视资讯台',
    region: '香港',
    officialUrl: 'https://m.ifeng.com/video/videozb?mid=MYwRG',
    provider: '凤凰网',
    note: '凤凰官方移动直播入口',
  },
  {
    id: 'global-news',
    name: '寰宇新闻',
    region: '台湾',
    officialUrl: 'https://www.youtube.com/@globalnewstw/live',
    provider: '寰宇新闻官方',
    note: '国际新闻为主',
  },
  {
    id: 'tvbs-news',
    name: 'TVBS 新闻',
    region: '台湾',
    officialUrl: 'https://news.tvbs.com.tw/playlists',
    provider: 'TVBS 新闻网',
    note: '官方 24 小时网络新闻直播',
  },
  {
    id: 'ftv-news',
    name: '民视新闻',
    region: '台湾',
    officialUrl: 'https://www.ftvnews.com.tw/',
    provider: '民视新闻网',
    note: '官方新闻网站直播入口',
  },
  {
    id: 'set-news',
    name: '三立 LIVE 新闻',
    region: '台湾',
    officialUrl: 'https://www.youtube.com/watch?v=iyfS2mQ8BuI',
    provider: 'Taiwan SETNEWS Live（官方验证）',
    note: '三立新闻 24 小时官方直播',
  },
  {
    id: 'ebc-news',
    name: '东森新闻',
    region: '台湾',
    officialUrl: 'https://news.ebc.net.tw/video',
    provider: '东森新闻网',
    note: '官方 24 小时线上直播',
  },
];
