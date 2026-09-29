import { guardRequest, jsonError } from '@/lib/api-guard';
import { getMedia } from '@/lib/library/db';
import { resolve115HlsPlaybackTarget } from '@/lib/library/115-hls';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(req:Request,ctx:{params:Promise<{id:string}>}){
  const guarded=guardRequest(req);if(guarded)return guarded;
  const {id}=await ctx.params;
  const media=getMedia(id);
  if(!media)return jsonError('媒体文件不存在',404);
  if(!media.sourceUrl)return jsonError('STRM 条目没有播放地址',502);
  try{
    const target=await resolve115HlsPlaybackTarget(media.sourceUrl,{
      signal:req.signal,userAgent:req.headers.get('user-agent')||undefined,
    });

    if(new URL(req.url).searchParams.get('resolve')==='1'){
      return Response.json({url:target,type:'hls'},{headers:{
        'Cache-Control':'private, no-store, max-age=0',
        'Referrer-Policy':'no-referrer',
      }});
    }

    return new Response(null,{status:302,headers:{
      Location:target,
      'Cache-Control':'private, no-store, max-age=0',
      'Referrer-Policy':'no-referrer',
    }});
  }catch(error){return jsonError(error instanceof Error?error.message:'获取 HLS 播放地址失败',502);}
}
