export type CloudProviderKind = 'strm' | '115' | 'quark';

export interface CloudEntry {
  id: string;
  name: string;
  isDir: boolean;
  size?: number;
  hash?: string;
  token?: string;
}

export interface CloudNode {
  id: string;
  isDir: boolean;
}

export interface CloudDownloadLink {
  url: string;
  headers?: Record<string, string>;
}

export interface DownloadLinkOptions {
  signal?: AbortSignal;
  userAgent?: string;
}

export interface CloudProvider {
  readonly kind: Exclude<CloudProviderKind, 'strm'>;
  readonly rootId: string;
  readonly readOnly: boolean;
  isConfigured(): boolean;
  resolvePath(path: string, signal?: AbortSignal): Promise<CloudNode | null>;
  listDir(id: string, signal?: AbortSignal): Promise<CloudEntry[]>;
  downloadLink(file: { id: string; token?: string; path: string }, opts?: DownloadLinkOptions): Promise<CloudDownloadLink>;
}
