import type { CloudProviderKind } from '@/lib/cloud/provider';

export type MediaType = 'movie' | 'tv';

export interface MediaItem {
  id: string;
  workId: string;
  provider: CloudProviderKind;
  remoteId: string;
  token?: string;
  path: string;
  filename: string;
  title: string;
  year?: string;
  mediaType: MediaType;
  season?: number;
  episode?: number;
  size?: number;
  hash?: string;
  updatedAt: number;
}

export interface LibraryWork {
  id: string;
  provider: CloudProviderKind;
  groupKey: string;
  title: string;
  year?: string;
  mediaType: MediaType;
  posterUrl?: string;
  backdropUrl?: string;
  overview?: string;
  fileCount: number;
  updatedAt: number;
}

export interface LibraryWorkDetail extends LibraryWork {
  files: MediaItem[];
}

export interface WorkListResult {
  items: LibraryWork[];
  total: number;
}
