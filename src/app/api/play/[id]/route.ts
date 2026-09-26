import { guardRequest, jsonError } from '@/lib/api-guard';
import { getCloudProvider } from '@/lib/cloud/registry';
import { getMedia } from '@/lib/library/db';
import { activeLibraryProvider } from '@/lib/library/mode';
import { validateStrmPlaybackUrl } from '@/lib/library/strm';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(req:Request,ctx:{params:Promise<{id:string}>}) {
  const guarded=guardRequest(req);
  if(guarded) return guarded;
  const {id}=await ctx.params;
  const media=getMedia(id);
  if(!media || media.provider!==activeLibraryProvider()) return jsonError('媒体文件不存在',404);

  try {
    let target:string;

    if(media.provider==='strm') {
      if(!media.sourceUrl) return jsonError('STRM 条目没有播放地址',502);
      target=validateStrmPlaybackUrl(media.sourceUrl);
    } else {
      const provider=getCloudProvider(media.provider);
      const link=await provider.downloadLink(
        {id:media.remoteId,token:media.token,path:media.path},
        {signal:req.signal,userAgent:req.headers.get('user-agent') || undefined}
      );
      target=link.url;
    }

    return new Response(null,{
      status:302,
      headers:{
        Location:target,
        'Cache-Control':'private, no-store, max-age=0',
        'Referrer-Policy':'no-referrer',
      },
    });
  } catch(error) {
    return jsonError(error instanceof Error?error.message:'获取播放地址失败',502);
  }
}
