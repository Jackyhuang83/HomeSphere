import type { CloudProviderKind } from '@/lib/cloud/provider';

export type MediaType = 'movie' | 'tv';
export type ScrapeStatus = 'pending' | 'matched' | 'review' | 'failed' | 'manual';

export interface MediaItem {
  id: string;
  workId?: string;
  provider: CloudProviderKind;
  remoteId: string;
  token?: string;
  path: string;
  title: string;
  originalTitle?: string;
  year?: string;
  mediaType: MediaType;
  posterUrl?: string;
  backdropUrl?: string;
  overview?: string;
  season?: number;
  episode?: number;
  size?: number;
  updatedAt: number;
}

export interface LibraryWork {
  id: string;
  provider: CloudProviderKind;
  groupKey: string;
  title: string;
  originalTitle?: string;
  year?: string;
  mediaType: MediaType;
  tmdbId?: number;
  posterUrl?: string;
  backdropUrl?: string;
  overview?: string;
  scrapeStatus: ScrapeStatus;
  scrapeError?: string;
  matchConfidence?: 'high' | 'medium' | 'low';
  manualMatch: boolean;
  fileCount: number;
  updatedAt: number;
}

export interface LibraryWorkDetail extends LibraryWork {
  files: MediaItem[];
}

export interface MediaListResult {
  items: MediaItem[];
  total: number;
}

export interface WorkListResult {
  items: LibraryWork[];
  total: number;
}
