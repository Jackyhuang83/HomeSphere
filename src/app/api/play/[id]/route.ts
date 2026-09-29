import { guardRequest, jsonError } from '@/lib/api-guard';
import { getMedia } from '@/lib/library/db';
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
    const target=await resolveStrmPlaybackTarget(media.sourceUrl,{
      signal:req.signal,userAgent:req.headers.get('user-agent')||undefined,
    });

    // 浏览器播放器优先先解析直链，再把最终 CDN URL 直接交给 <video>。
    // 这样仍然由客户端直连 115 CDN，但避免移动端浏览器处理跨域媒体 302 时的兼容差异。
    if(new URL(req.url).searchParams.get('resolve')==='1'){
      return Response.json({url:target},{headers:{
        'Cache-Control':'private, no-store, max-age=0',
        'Referrer-Policy':'no-referrer',
      }});
    }

    // 保留原 302 行为，兼容现有调用方和直接访问。
    return new Response(null,{status:302,headers:{
      Location:target,
      'Cache-Control':'private, no-store, max-age=0',
      'Referrer-Policy':'no-referrer',
    }});
  }catch(error){return jsonError(error instanceof Error?error.message:'获取播放地址失败',502);}
}
