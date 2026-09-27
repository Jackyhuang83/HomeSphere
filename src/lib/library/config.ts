import fs from 'node:fs';
import path from 'node:path';

export function strmRoot():string {
  return path.resolve(process.env.HOMESPHERE_STRM_ROOT?.trim() || '/media');
}

export function isLibraryConfigured():boolean {
  try { return fs.statSync(strmRoot()).isDirectory(); }
  catch { return false; }
}
