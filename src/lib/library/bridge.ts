import { checkUpstreamAllowed } from '@/lib/ssrf';
import { validateStrmPlaybackUrl } from './strm-url';

export type StrmPlaybackMode = 'resolve' | 'direct';

const DEFAULT_TIMEOUT_MS = 12000;
const DEFAULT_MAX_INTERNAL_REDIRECTS = 3;
const DEFAULT_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';

export function strmPlaybackMode(): StrmPlaybackMode {
  return process.env.HOMESPHERE_STRM_PLAYBACK_MODE?.trim().toLowerCase() === 'direct'
    ? 'direct'
    : 'resolve';
}

export function bridgeAllowedHosts(): Set<string> {
  return new Set(
    (process.env.HOMESPHERE_STRM_ALLOWED_HOSTS || '')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  );
}

export async function resolveStrmPlaybackTarget(
  sourceUrl: string,
  opts?: { signal?: AbortSignal; userAgent?: string }
): Promise<string> {
  const source = validateStrmPlaybackUrl(sourceUrl);
  if (strmPlaybackMode() === 'direct') return source;

  const allowedHosts = bridgeAllowedHosts();
  if (!allowedHosts.size) {
    throw new Error(
      'STRM 服务端解析模式要求配置 HOMESPHERE_STRM_ALLOWED_HOSTS，避免把 HomeSphere 变成 SSRF 跳板'
    );
  }

  let current = new URL(source);
  ensureInternalBridgeHost(current, allowedHosts);

  const timeoutMs = intEnv('HOMESPHERE_BRIDGE_TIMEOUT_MS', DEFAULT_TIMEOUT_MS, 1000, 60000);
  const maxRedirects = intEnv(
    'HOMESPHERE_BRIDGE_MAX_REDIRECTS',
    DEFAULT_MAX_INTERNAL_REDIRECTS,
    1,
    8
  );
  const userAgent = opts?.userAgent?.trim() || DEFAULT_UA;

  for (let step = 0; step <= maxRedirects; step++) {
    opts?.signal?.throwIfAborted();

    const response = await fetch(current, {
      method: 'GET',
      headers: {
        'User-Agent': userAgent,
        Accept: '*/*',
      },
      cache: 'no-store',
      redirect: 'manual',
      signal: combinedSignal(opts?.signal, timeoutMs),
    });

    if (response.status < 300 || response.status >= 400) {
      try { await response.body?.cancel(); } catch {}
      throw new Error(
        `Media Bridge 必须返回 3xx 重定向，当前返回 HTTP ${response.status}。请关闭 Bridge 本地字节代理并启用直链302。`
      );
    }

    const location = response.headers.get('location');
    try { await response.body?.cancel(); } catch {}
    if (!location) throw new Error('Media Bridge 返回重定向但缺少 Location');

    const next = new URL(location, current);
    ensureHttpUrl(next);

    if (allowedHosts.has(next.hostname.toLowerCase())) {
      current = next;
      continue;
    }

    const verdict = await checkUpstreamAllowed(next.toString());
    if (!verdict.ok) {
      throw new Error(`Media Bridge 最终跳转地址被安全策略拒绝：${verdict.reason}`);
    }
    return next.toString();
  }

  throw new Error(`Media Bridge 内部重定向超过上限 ${maxRedirects}`);
}

function ensureInternalBridgeHost(url: URL, allowedHosts: Set<string>): void {
  ensureHttpUrl(url);
  if (!allowedHosts.has(url.hostname.toLowerCase())) {
    throw new Error(`STRM Bridge 主机不在允许列表：${url.hostname}`);
  }
}

function ensureHttpUrl(url: URL): void {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('播放地址仅允许 http/https');
  }
  if (url.username || url.password) {
    throw new Error('播放地址不能包含 URL 用户名/密码');
  }
}

function combinedSignal(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function intEnv(name: string, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}
