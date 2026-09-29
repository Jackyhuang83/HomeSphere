import { guardRequest, jsonError } from '@/lib/api-guard';
import { getMedia } from '@/lib/library/db';
import { resolve115HlsPlayback } from '@/lib/library/115-hls';
import { resolveStrmPlaybackTarget } from '@/lib/library/bridge';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(req:Request,ctx:{params:Promise<{id:string}>}){
  const guarded=guardRequest(req);if(guarded)return guarded;
  const {id}=await ctx.params;
  const media=getMedia(id);
  if(!media)return jsonError('媒体文件不存在',404);
  if(!media.sourceUrl)return jsonError('STRM 条目没有播放地址',502);

  try{
    const url=new URL(req.url);
    const userAgent=req.headers.get('user-agent')||undefined;

    if(url.searchParams.get('direct')==='1'){
      const target=await resolveStrmPlaybackTarget(media.sourceUrl,{
        signal:req.signal,
        userAgent,
      });
      return Response.json({url:target,type:'direct'},{headers:{
        'Cache-Control':'private, no-store, max-age=0',
        'Referrer-Policy':'no-referrer',
      }});
    }

    const resolved=await resolve115HlsPlayback(media.sourceUrl,{
      signal:req.signal,
      userAgent,
    });
    if(url.searchParams.get('resolve')==='1'){
      const playbackUrl=resolved.kind==='master'
        ? `/api/play/${encodeURIComponent(id)}`
        : resolved.target!;
      return Response.json({url:playbackUrl,type:'hls'},{headers:{
        'Cache-Control':'private, no-store, max-age=0',
        'Referrer-Policy':'no-referrer',
      }});
    }

    if(resolved.kind==='master'){
      return new Response(resolved.playlist!,{
        status:200,
        headers:{
          'Content-Type':'application/vnd.apple.mpegurl; charset=utf-8',
          'Content-Disposition':'inline',
          'Cache-Control':'private, no-store, max-age=0',
          'Referrer-Policy':'no-referrer',
        },
      });
    }

    return new Response(null,{status:302,headers:{
      Location:resolved.target!,
      'Cache-Control':'private, no-store, max-age=0',
      'Referrer-Policy':'no-referrer',
    }});
  }catch(error){
    return jsonError(error instanceof Error?error.message:'获取 HLS 播放地址失败',502);
  }
}
