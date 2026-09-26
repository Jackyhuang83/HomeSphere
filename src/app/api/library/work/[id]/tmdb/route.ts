import { NextResponse } from 'next/server';
import { guardRequest, jsonError } from '@/lib/api-guard';
import { getWork } from '@/lib/library/db';
import { activeLibraryProvider } from '@/lib/library/mode';
import { applyManualMatch } from '@/lib/tmdb/scraper';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function POST(req:Request,ctx:{params:Promise<{id:string}>}) {
  const guarded=guardRequest(req);
  if(guarded) return guarded;
  const {id}=await ctx.params;
  const work=getWork(id);
  if(!work || work.provider!==activeLibraryProvider()) return jsonError('作品不存在',404);

  let body:{tmdbId?:number;mediaType?:string};
  try { body=await req.json() as typeof body; } catch { return jsonError('请求格式错误',400); }
  const tmdbId=Number(body.tmdbId);
  if(!Number.isInteger(tmdbId)||tmdbId<=0) return jsonError('tmdbId 参数错误',400);
  if(body.mediaType!=='movie'&&body.mediaType!=='tv') return jsonError('mediaType 参数错误',400);

  try {
    await applyManualMatch(id,body.mediaType,tmdbId,req.signal);
    return NextResponse.json({success:true,work:getWork(id)});
  } catch(error) {
    return jsonError(error instanceof Error?error.message:'人工匹配失败',502);
  }
}
