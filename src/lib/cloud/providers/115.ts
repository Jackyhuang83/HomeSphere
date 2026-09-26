import type { CloudDownloadLink, CloudEntry, CloudNode, CloudProvider, DownloadLinkOptions } from '../provider';
import { SerialRateLimiter } from '../rate-limit';
import { decrypt115, encrypt115 } from './115-crypto';

const WEB_API = 'https://webapi.115.com';
const PRO_API = 'https://proapi.115.com';
const DEFAULT_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';

type RawEntry = {
  n?: string;
  cid?: string | number;
  fid?: string | number;
  sha?: string;
  s?: string | number;
  pc?: string;
};

const limiter = new SerialRateLimiter(intEnv('HOMESPHERE_115_MIN_INTERVAL_MS', 500, 250, 5000));

export class Cloud115Provider implements CloudProvider {
  readonly kind = '115' as const;
  readonly rootId = '0';
  readonly readOnly = true;

  isConfigured(): boolean {
    return Boolean(cookie());
  }

  async resolvePath(remotePath: string, signal?: AbortSignal): Promise<CloudNode | null> {
    const normalized = normalizePath(remotePath);
    if (normalized === '/') return { id: '0', isDir: true };
    const data = await request115<{ id?: string | number; state?: boolean; errno?: number; error?: string }>(
      `${WEB_API}/files/getid?path=${encodeURIComponent(normalized.slice(1))}`,
      { signal }
    );
    ensureOk(data);
    const id = data.id == null ? '' : String(data.id);
    return id && id !== '0' ? { id, isDir: true } : null;
  }

  async listDir(id: string, signal?: AbortSignal): Promise<CloudEntry[]> {
    const limit = 1000;
    const all: CloudEntry[] = [];
    for (let offset=0;;offset+=limit) {
      const sp = new URLSearchParams({ cid: id || '0', limit: String(limit), offset: String(offset) });
      const page = await request115<{ data?: RawEntry[]; count?: number; state?: boolean; errno?: number; error?: string }>(
        `${WEB_API}/files?${sp}`, { signal }
      );
      ensureOk(page);
      const items = page.data ?? [];
      all.push(...items.map(toEntry).filter((x): x is CloudEntry => Boolean(x)));
      const count = typeof page.count === 'number' ? page.count : undefined;
      if (items.length < limit || (count !== undefined && all.length >= count)) break;
    }
    return all;
  }

  async downloadLink(file: { id: string; token?: string; path: string }, opts?: DownloadLinkOptions): Promise<CloudDownloadLink> {
    const pickCode = file.token || await this.pickCodeForId(file.id, opts?.signal);
    if (!pickCode) throw new Error(`115 文件没有 pickcode：${file.path}`);

    const ua = opts?.userAgent?.trim() || DEFAULT_UA;
    const payload = `data=${encodeURIComponent(encrypt115(JSON.stringify({ pick_code: pickCode })))}`;
    const response = await request115<{ data?: string; state?: boolean; errno?: number; error?: string }>(
      `${PRO_API}/android/2.0/ufile/download`,
      {
        method: 'POST',
        body: payload,
        userAgent: ua,
        contentType: 'application/x-www-form-urlencoded',
        signal: opts?.signal,
      }
    );
    ensureOk(response);
    if (!response.data) throw new Error('115 未返回下载数据');
    const decoded = JSON.parse(decrypt115(response.data)) as unknown;
    const url = findHttpUrl(decoded);
    if (!url) throw new Error('115 未返回可用的直链');
    return { url };
  }

  private async pickCodeForId(id: string, signal?: AbortSignal): Promise<string | undefined> {
    const data = await request115<{ state?: boolean; data?: Array<{ pick_code?: string }>; errno?: number; error?: string }>(
      `${WEB_API}/files/file?file_id=${encodeURIComponent(id)}`, { signal }
    );
    ensureOk(data);
    return data.data?.[0]?.pick_code;
  }
}

function toEntry(raw: RawEntry): CloudEntry | null {
  const name = raw.n?.trim();
  if (!name) return null;
  const isDir = raw.fid == null || !raw.sha;
  const id = String(isDir ? raw.cid ?? '' : raw.fid ?? '');
  if (!id) return null;
  return {
    id,
    name,
    isDir,
    size: raw.s == null ? undefined : Number(raw.s),
    hash: raw.sha || undefined,
    token: raw.pc || undefined,
  };
}

async function request115<T>(
  url: string,
  opts?: { method?: 'GET'|'POST'; body?: BodyInit; userAgent?: string; contentType?: string; signal?: AbortSignal }
): Promise<T> {
  const attempts = 2;
  let last: unknown;
  for (let attempt=0;attempt<attempts;attempt++) {
    try {
      return await limiter.schedule(async () => {
        const headers: Record<string,string> = {
          'User-Agent': opts?.userAgent || DEFAULT_UA,
          Accept: 'application/json, text/plain, */*',
          Referer: 'https://115.com/',
          Origin: 'https://115.com',
          Cookie: requiredCookie(),
        };
        if (opts?.contentType) headers['Content-Type'] = opts.contentType;
        const response = await fetch(url, {
          method: opts?.method || 'GET',
          headers,
          body: opts?.body,
          cache: 'no-store',
          signal: combinedSignal(opts?.signal, intEnv('HOMESPHERE_115_TIMEOUT_MS', 15000, 3000, 60000)),
        });
        if (!response.ok) {
          const body = (await response.text()).slice(0,300);
          const error = new Error(`115 HTTP ${response.status}: ${body || response.statusText}`);
          if (response.status === 429 || response.status >= 500) throw Object.assign(error,{ retryable:true });
          throw error;
        }
        return await response.json() as T;
      }, opts?.signal);
    } catch (error) {
      last = error;
      const retryable = Boolean((error as { retryable?: boolean })?.retryable);
      if (!retryable || attempt === attempts - 1) break;
      await delay(1000 * (attempt + 1), opts?.signal);
    }
  }
  throw last instanceof Error ? last : new Error('115 请求失败');
}

function ensureOk(value: { state?: boolean; errno?: number; error?: string }): void {
  if (value.state === false || value.errno) {
    throw new Error(`115：${value.error || `接口错误 errno=${value.errno}`}`);
  }
}
function cookie(): string { return process.env.HOMESPHERE_115_COOKIE?.trim() || ''; }
function requiredCookie(): string {
  const value = cookie();
  if (!value) throw new Error('未配置 HOMESPHERE_115_COOKIE');
  return value;
}
function normalizePath(value: string): string {
  const parts = value.replace(/\\/g,'/').split('/').map(x=>x.trim()).filter(Boolean);
  return parts.length ? `/${parts.join('/')}` : '/';
}
function findHttpUrl(value: unknown): string | undefined {
  if (typeof value === 'string' && /^https?:\/\//i.test(value)) return value;
  if (Array.isArray(value)) {
    for (const item of value) { const hit = findHttpUrl(item); if (hit) return hit; }
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value as Record<string,unknown>)) { const hit = findHttpUrl(item); if (hit) return hit; }
  }
  return undefined;
}
function combinedSignal(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  return signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
}
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve,reject)=>{
    const t=setTimeout(resolve,ms);
    if (!signal) return;
    const abort=()=>{clearTimeout(t);reject(signal.reason ?? new DOMException('Aborted','AbortError'));};
    if(signal.aborted) abort(); else signal.addEventListener('abort',abort,{once:true});
  });
}
function intEnv(name: string, fallback: number, min: number, max: number): number {
  const n=Number.parseInt(process.env[name] || '',10);
  return Number.isFinite(n) ? Math.max(min,Math.min(max,n)) : fallback;
}
