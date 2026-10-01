import { NextResponse } from 'next/server';
import { guardRequest, jsonError } from '@/lib/api-guard';
import { getWork, setWorkHidden, updateWorkBasics } from '@/lib/library/db';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(req:Request,ctx:{params:Promise<{id:string}>}){
  const guarded=guardRequest(req);if(guarded)return guarded;
  const {id}=await ctx.params;
  const item=getWork(id);
  if(!item)return jsonError('作品不存在',404);
  return NextResponse.json(item,{headers:{'Cache-Control':'private, no-store'}});
}

export async function PATCH(req:Request,ctx:{params:Promise<{id:string}>}){
  const guarded=guardRequest(req);if(guarded)return guarded;
  const {id}=await ctx.params;
  if(!getWork(id))return jsonError('作品不存在',404);

  let body:unknown;
  try{body=await req.json();}
  catch{return jsonError('请求格式错误',400);}
  if(!body||typeof body!=='object')return jsonError('请求格式错误',400);
  const input=body as Record<string,unknown>;

  if(typeof input.hidden==='boolean'){
    if(!setWorkHidden(id,input.hidden))return jsonError('作品不存在',404);
    return NextResponse.json({success:true,work:getWork(id)},{
      headers:{'Cache-Control':'private, no-store'}
    });
  }

  if(input.action==='edit'){
    const title=typeof input.title==='string'?input.title.normalize('NFKC').trim():'';
    const year=typeof input.year==='string'?input.year.trim():'';
    const mediaType=input.mediaType;
    if(!title||title.length>160)return jsonError('片名不能为空且不能超过 160 个字符',400);
    if(year&&!/^(?:19|20)\d{2}$/.test(year))return jsonError('年份格式错误',400);
    if(mediaType!=='movie'&&mediaType!=='tv')return jsonError('类型参数错误',400);
    const work=updateWorkBasics(id,{title,year:year||undefined,mediaType});
    if(!work)return jsonError('作品不存在',404);
    return NextResponse.json({success:true,work},{headers:{'Cache-Control':'private, no-store'}});
  }

  return jsonError('不支持的更新操作',400);
}
