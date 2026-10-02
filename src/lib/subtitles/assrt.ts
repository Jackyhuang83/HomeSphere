import { decodeSubtitleBuffer, subtitleToVtt } from './convert';

const API_BASES=['https://api.assrt.net/v1','https://api.makedie.me/v1'] as const;
const MAX_DOWNLOAD_BYTES=3*1024*1024;

export interface AssrtCandidate {
  id:number;
  title:string;
  videoName?:string;
  format:string;
  language:string;
  source?:string;
  score:number;
}

interface RawSearchItem {
  id?:number;
  native_name?:string;
  videoname?:string;
  subtype?:string;
  vote_score?:number;
  release_site?:string;
  lang?:{desc?:string;langlist?:Record<string,boolean>};
}
interface RawDetailItem extends RawSearchItem {
  filename?:string;
  url?:string;
  filelist?:Array<{url?:string;f?:string;s?:string}>;
  title?:string;
}

export function assrtConfigured():boolean {
  return Boolean(process.env.ASSRT_API_TOKEN?.trim());
}

export async function searchAssrt(queries:string[],signal?:AbortSignal):Promise<AssrtCandidate[]> {
  const token=requireToken();
  const seen=new Map<number,AssrtCandidate>();
  for(const query of queries.map(item=>item.trim()).filter(item=>item.length>=3)){
    const data=await assrtFetch('/sub/search',{
      q:query,
      cnt:'15',
      is_file:'1',
    },token,signal) as {status?:number;sub?:{subs?:RawSearchItem[]}};
    for(const raw of data.sub?.subs||[]){
      if(typeof raw.id!=='number'||!Number.isInteger(raw.id)||!isChinese(raw))continue;
      const item=mapCandidate(raw);
      const current=seen.get(item.id);
      if(!current||item.score>current.score)seen.set(item.id,item);
    }
    if(seen.size>=8)break;
  }
  return [...seen.values()].sort((a,b)=>b.score-a.score||a.id-b.id).slice(0,10);
}

export async function downloadAssrtSubtitle(candidateId:number,episode?:number,signal?:AbortSignal):Promise<{
  vtt:string;
  sourceFile:string;
  title:string;
  language:string;
}> {
  const token=requireToken();
  if(!Number.isInteger(candidateId)||candidateId<=0)throw new Error('字幕 ID 无效');
  const data=await assrtFetch('/sub/detail',{
    id:String(candidateId),
  },token,signal) as {status?:number;sub?:{subs?:RawDetailItem[]}};
  const detail=data.sub?.subs?.[0];
  if(!detail)throw new Error('ASSRT 没有返回字幕详情');

  const file=pickTextFile(detail,episode);
  if(!file?.url)throw new Error('这个字幕包没有可直接使用的 SRT/ASS/SSA/VTT 文件');
  const response=await fetchSubtitleFile(file.url,signal);
  if(!response.ok)throw new Error(`字幕下载失败（HTTP ${response.status}）`);
  const length=Number(response.headers.get('content-length')||0);
  if(length>MAX_DOWNLOAD_BYTES)throw new Error('字幕文件超过 3MB，已拒绝下载');
  const buffer=await response.arrayBuffer();
  if(buffer.byteLength>MAX_DOWNLOAD_BYTES)throw new Error('字幕文件超过 3MB，已拒绝下载');
  const text=decodeSubtitleBuffer(buffer);
  const sourceFile=file.name||detail.filename||`assrt-${candidateId}.srt`;
  return {
    vtt:subtitleToVtt(text,sourceFile),
    sourceFile,
    title:detail.native_name||detail.title||sourceFile,
    language:detail.lang?.desc||'中文',
  };
}

function requireToken():string {
  const token=process.env.ASSRT_API_TOKEN?.trim();
  if(!token)throw new Error('尚未配置 ASSRT API Token，请在 SSH 运行 homesphere → 14. 字幕中心');
  return token;
}

async function assrtFetch(
  pathname:string,
  params:Record<string,string>,
  token:string,
  signal?:AbortSignal
):Promise<unknown>{
  let lastError:unknown;
  for(const base of API_BASES){
    const url=new URL(`${base}${pathname}`);
    for(const [key,value] of Object.entries(params))url.searchParams.set(key,value);
    try{
      const response=await fetch(url,{
        headers:{Authorization:`Bearer ${token}`,Accept:'application/json','User-Agent':'HomeSphere/0.1'},
        signal:signal?AbortSignal.any([signal,AbortSignal.timeout(12000)]):AbortSignal.timeout(12000),
        cache:'no-store',
      });
      const text=await response.text();
      let data:{status?:number;errmsg?:string}|null=null;
      try{data=JSON.parse(text) as {status?:number;errmsg?:string};}catch{}
      if(!response.ok){
        if(response.status>=500){
          lastError=new Error(`ASSRT ${new URL(base).hostname} 请求失败（HTTP ${response.status}）`);
          continue;
        }
        throw new Error(data?.errmsg||`ASSRT 请求失败（HTTP ${response.status}）`);
      }
      if(!data){
        lastError=new Error(`ASSRT ${new URL(base).hostname} 返回了非 JSON 响应`);
        continue;
      }
      if(data.status!==0)throw new Error(data.errmsg||`ASSRT 返回错误状态 ${data.status??'unknown'}`);
      return data;
    }catch(error){
      if(signal?.aborted)throw error;
      const message=error instanceof Error?error.message:'ASSRT 请求失败';
      if(/invalid token|配额|exceed|missing essential arguments/i.test(message))throw error;
      lastError=error;
    }
  }
  throw lastError instanceof Error?lastError:new Error('ASSRT 主线路和备用线路均不可用');
}

function mapCandidate(raw:RawSearchItem):AssrtCandidate {
  const language=raw.lang?.desc||'中文';
  const title=raw.native_name||raw.videoname||`字幕 #${raw.id}`;
  let score=Number(raw.vote_score||0);
  if(raw.lang?.langlist?.langchs)score+=30;
  if(raw.lang?.langlist?.langcht)score+=20;
  if(/简|繁|中/.test(language))score+=15;
  if(/srt|ass|ssa|webvtt|vtt/i.test(raw.subtype||''))score+=8;
  return {
    id:Number(raw.id),
    title,
    videoName:raw.videoname||undefined,
    format:raw.subtype||'未知格式',
    language,
    source:raw.release_site||undefined,
    score,
  };
}

function isChinese(raw:RawSearchItem):boolean {
  const list=raw.lang?.langlist||{};
  const desc=raw.lang?.desc||'';
  return Boolean(list.langchs||list.langcht||/简|繁|中/.test(desc));
}

function pickTextFile(detail:RawDetailItem,episode?:number):{url:string;name:string}|undefined {
  const candidates=(detail.filelist||[])
    .filter(item=>item.url&&item.f&&/\.(?:srt|ass|ssa|vtt)$/i.test(item.f))
    .map(item=>({url:item.url!,name:item.f!}));
  if(candidates.length){
    if(episode){
      const patterns=[
        new RegExp(`S\\d{1,2}E0?${episode}(?:\\D|$)`,'i'),
        new RegExp(`(?:^|\\D)E0?${episode}(?:\\D|$)`,'i'),
        new RegExp(`(?:^|\\D)0?${episode}(?:\\D|$)`,'i'),
      ];
      for(const pattern of patterns){
        const hit=candidates.find(item=>pattern.test(item.name));
        if(hit)return hit;
      }
    }
    return candidates[0];
  }
  if(detail.url&&detail.filename&&/\.(?:srt|ass|ssa|vtt)$/i.test(detail.filename)){
    return {url:detail.url,name:detail.filename};
  }
  return undefined;
}

async function fetchSubtitleFile(value:string,signal?:AbortSignal):Promise<Response> {
  let current=normalizeDownloadUrl(value);
  for(let redirect=0;redirect<=3;redirect++){
    const response=await fetch(current,{
      headers:{'User-Agent':'HomeSphere/0.1 (+private household media portal)'},
      redirect:'manual',
      signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000),
      cache:'no-store',
    });
    if(response.status>=300&&response.status<400){
      const location=response.headers.get('location');
      if(!location)throw new Error('字幕下载重定向缺少 Location');
      if(redirect===3)throw new Error('字幕下载重定向次数过多');
      current=normalizeDownloadUrl(new URL(location,current).toString());
      continue;
    }
    return response;
  }
  throw new Error('字幕下载失败');
}

function normalizeDownloadUrl(value:string):string {
  const url=new URL(value);
  const host=url.hostname.toLowerCase();
  const allowed=host==='assrt.net'||host.endsWith('.assrt.net')||host==='makedie.me'||host.endsWith('.makedie.me');
  if(!allowed)throw new Error('字幕下载地址不在 ASSRT 允许域名内');
  if(url.protocol==='http:')url.protocol='https:';
  if(url.protocol!=='https:')throw new Error('字幕下载地址协议不安全');
  return url.toString();
}
