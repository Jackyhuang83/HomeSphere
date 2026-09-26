import { guardRequest, jsonError } from '@/lib/api-guard';
import { getCloudProvider } from '@/lib/cloud/registry';
import { getMedia } from '@/lib/library/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guarded = guardRequest(req);
  if (guarded) return guarded;

  const { id } = await ctx.params;
  const media = getMedia(id);
  if (!media) return jsonError('影片不存在', 404);

  try {
    const provider = getCloudProvider(media.provider);
    const userAgent = req.headers.get('user-agent') ?? undefined;
    const link = await provider.getPlaybackLink(
      { id: media.remoteId, name: media.title, token: media.token },
      { userAgent, signal: req.signal },
    );

    const location = safeLocation(link.url);
    return new Response(null, {
      status: 302,
      headers: {
        Location: location,
        'Cache-Control': 'private, no-store, max-age=0',
        Pragma: 'no-cache',
      },
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : '获取播放地址失败', 502);
  }
}

// Preserve already-escaped ASCII in signed URLs; escape only literal non-ASCII chars.
const NON_ASCII = /[^\x00-\x7F]/;
const NON_ASCII_ALL = /[^\x00-\x7F]/g;
function safeLocation(url: string): string {
  if (!NON_ASCII.test(url)) return url;
  return url.replace(NON_ASCII_ALL, (ch) => encodeURIComponent(ch));
}
