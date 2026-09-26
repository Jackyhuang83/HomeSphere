import fs from 'node:fs';
import path from 'node:path';
import type { CloudProviderKind } from '@/lib/cloud/provider';

export type LibraryMode = 'strm' | 'direct115';

export function libraryMode(): LibraryMode {
  return process.env.HOMESPHERE_LIBRARY_MODE?.trim().toLowerCase() === 'direct115'
    ? 'direct115'
    : 'strm';
}

export function activeLibraryProvider(): CloudProviderKind {
  return libraryMode() === 'strm' ? 'strm' : '115';
}

export function strmRoot(): string {
  return path.resolve(process.env.HOMESPHERE_STRM_ROOT?.trim() || '/media');
}

export function isLibraryConfigured(): boolean {
  if (libraryMode() === 'strm') {
    try {
      return fs.statSync(strmRoot()).isDirectory();
    } catch {
      return false;
    }
  }
  return Boolean(
    process.env.HOMESPHERE_115_COOKIE?.trim() &&
    process.env.HOMESPHERE_115_MEDIA_DIRS?.trim()
  );
}

export function librarySourceLabel(): string {
  return libraryMode() === 'strm' ? 'STRM' : '115 Direct';
}
