export interface DoubanItem {
  id: string;
  title: string;
  cover: string;
  rating?: string;
  isTv?: boolean;
  year?: string;
}

export interface DoubanResponse {
  items: DoubanItem[];
}

export interface BangumiCalendarDay {
  weekday: number;
  items: DoubanItem[];
}

export interface BangumiCalendarResponse {
  days: BangumiCalendarDay[];
}

export interface LibraryMatchRequestItem {
  key: string;
  title: string;
  year?: string;
  isTv?: boolean;
}

export interface LibraryMatchHit {
  workId: string;
  title: string;
  year?: string;
  mediaType: 'movie'|'tv';
  quality: 'title'|'title-year';
}

export interface LibraryMatchResponse {
  matches: Record<string,LibraryMatchHit>;
}

export interface AuthStatusResponse {
  passwordRequired: boolean;
  verified: boolean;
  version: string;
  defaultLiveSources: LiveSourceConfig[];
}

export interface LiveSourceConfig {
  key: string;
  name: string;
  url: string;
  epg?: string;
}

export interface LiveChannel {
  id: string;
  name: string;
  url: string;
  logo?: string;
  group?: string;
  tvgId?: string;
  rawName?: string;
}

export interface LivePlaylistResponse {
  name?: string;
  channels: LiveChannel[];
  groups: string[];
}

export interface EpgProgram {
  channelId: string;
  start: number;
  stop: number;
  title: string;
  desc?: string;
}

export interface LiveEpgResponse {
  channelId: string;
  current?: EpgProgram;
  next?: EpgProgram;
  programs: EpgProgram[];
}
