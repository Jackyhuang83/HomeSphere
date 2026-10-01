export type MediaType = 'movie' | 'tv';
export type ScrapeStatus = 'pending' | 'matched' | 'review' | 'failed' | 'manual';
export type MediaRegion = 'mainland' | 'hmt' | 'overseas';

export interface MediaItem {
  id:string;
  workId:string;
  sourceUrl?:string;
  path:string;
  filename:string;
  title:string;
  year?:string;
  mediaType:MediaType;
  season?:number;
  episode?:number;
  size?:number;
  hash?:string;
  updatedAt:number;
}

export interface LibraryWork {
  id:string;
  groupKey:string;
  title:string;
  originalTitle?:string;
  year?:string;
  mediaType:MediaType;
  tmdbId?:number;
  posterUrl?:string;
  backdropUrl?:string;
  overview?:string;
  region?:MediaRegion;
  isAnimation?:boolean;
  scrapeStatus:ScrapeStatus;
  scrapeError?:string;
  matchConfidence?:'high'|'medium'|'low';
  manualMatch:boolean;
  hidden:boolean;
  fileCount:number;
  addedAt?:number;
  updatedAt:number;
}

export interface LibraryWorkDetail extends LibraryWork {
  files:MediaItem[];
}

export interface WorkListResult {
  items:LibraryWork[];
  total:number;
}
