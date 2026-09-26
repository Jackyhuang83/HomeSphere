import { NextResponse } from 'next/server';
import { guardRequest } from '@/lib/api-guard';
import { isBlockedByDNS, isValidProxyUrl } from '@/lib/ssrf';
import { fetchWithSafeRedirects } from '@/lib/fetch-utils';

export const runtime = 'nodejs';

const TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT || '8000', 10);
const UA =
  process.env.USER_AGENT ||
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1';

function isDoubanHost(host: string): boolean {
  const h = host.toLowerCase();
  return h === 'douban.com' || h.endsWith('.douban.com') ||
    h === 'doubanio.com' || h.endsWith('.doubanio.com');
}

export async function GET(req: Request, ctx: { params: Promise<{ url: string }> }) {
  const guarded = guardRequest(req);
  if (guarded) return guarded;

  const { url: encodedUrl } = await ctx.params;
  const targetUrl = (() => {
    try { return decodeURIComponent(encodedUrl); } catch { return encodedUrl; }
  })();

  if (!isValidProxyUrl(targetUrl)) return new NextResponse('无效的图片 URL', { status: 400 });
  if (await isBlockedByDNS(targetUrl)) return new NextResponse('不允许访问私有/保留网络地址', { status: 403 });

  const headers: Record<string, string> = {
    'User-Agent': UA,
    Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
  };
  try {
    if (isDoubanHost(new URL(targetUrl).hostname)) headers.Referer = 'https://movie.douban.com/';
  } catch {}

  try {
    const { res } = await fetchWithSafeRedirects(targetUrl, {
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const contentType = res.headers.get('content-type') || '';
    if (contentType && !contentType.toLowerCase().startsWith('image/')) {
      return new NextResponse('上游返回的不是图片', { status: 415 });
    }

    const out = new Headers();
    if (contentType) out.set('Content-Type', contentType);
    const etag = res.headers.get('etag');
    if (etag) out.set('ETag', etag);
    out.set('Cache-Control', 'private, max-age=3600');

    return new NextResponse(res.body, { status: res.status, headers: out });
  } catch (error) {
    return new NextResponse(error instanceof Error ? error.message : '图片加载失败', { status: 502 });
  }
}
