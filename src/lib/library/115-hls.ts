import { checkUpstreamAllowed } from '@/lib/ssrf';
import { validateStrmPlaybackUrl } from './strm-url';

const DEFAULT_UA='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
const DEFAULT_TIMEOUT_MS=12000;
const DEFAULT_MIN_INTERVAL_MS=1000;
const DEFAULT_CACHE_TTL_MS=60_000;
const MAX_CACHE_ENTRIES=200;

type QmsAccount={
  user_id?:string|number;
  token?:string;
};

type QmsAccountResponse={
  data?:QmsAccount[];
  message?:string;
};

type V115VideoUrl={
  url?:string;
  width?:number;
  height?:number;
  definition?:number;
  title?:string;
};

type V115PlayResponse={
  state?:boolean;
  message?:string;
  data?:{video_url?:V115VideoUrl[]};
  video_url?:V115VideoUrl[];
};

let playTail:Promise<void>=Promise.resolve();
let lastPlayRequestAt=0;
export type Resolved115Hls={
  kind:'master'|'direct';
  upstreamUrl:string;
  playlist?:string;
  target?:string;
};

const hlsCache=new Map<string,{result:Resolved115Hls;expiresAt:number}>();

export async function resolve115HlsPlayback(
  sourceUrl:string,
  opts?:{signal?:AbortSignal;userAgent?:string}
):Promise<Resolved115Hls>{
  const source=new URL(validateStrmPlaybackUrl(sourceUrl));
  if(!source.pathname.startsWith('/115/url/')&&source.pathname!=='/115/newurl'){
    throw new Error('当前 STRM 不是 115 播放地址');
  }

  const pickCode=source.searchParams.get('pickcode')?.trim();
  if(!pickCode) throw new Error('STRM 缺少 115 pickcode');

  const userId=(source.searchParams.get('userid')||source.searchParams.get('user_id')||'').trim();
  const userAgent=opts?.userAgent?.trim()||DEFAULT_UA;
  const cacheKey=`${userAgent}\n${pickCode}`;
  const cached=getCached(cacheKey);
  if(cached) return cached;

  const token=await get115TokenFromQms(source,userId,opts?.signal);
  const play=await schedulePlayRequest(async()=>{
    const endpoint=new URL('https://proapi.115.com/open/video/play');
    endpoint.searchParams.set('pick_code',pickCode);
    const response=await fetch(endpoint,{
      method:'GET',
      headers:{
        Authorization:`Bearer ${token}`,
        'User-Agent':userAgent,
        Accept:'application/json',
      },
      cache:'no-store',
      signal:combinedSignal(opts?.signal,timeoutMs()),
    });
    if(!response.ok) throw new Error(`115 播放接口返回 HTTP ${response.status}`);
    return await response.json() as V115PlayResponse;
  },opts?.signal);

  if(play.state===false) throw new Error(play.message||'115 播放接口返回失败');
  const root=play.data||play;
  const streams=(root.video_url||[]).filter(item=>typeof item.url==='string'&&item.url.length>0);
  if(!streams.length) throw new Error('115 播放接口没有返回 HLS 地址');

  const selected=selectBrowserCompatibleStream(streams,userAgent);
  const masterUrl=new URL(selected.url!);
  ensureHttp(masterUrl);
  await ensurePublic(masterUrl,'115 主播放清单');

  const master=await fetch(masterUrl,{
    headers:{
      'User-Agent':userAgent,
      Accept:'application/vnd.apple.mpegurl,application/x-mpegURL,*/*',
    },
    cache:'no-store',
    signal:combinedSignal(opts?.signal,timeoutMs()),
  });
  if(!master.ok) throw new Error(`115 HLS 主播放清单返回 HTTP ${master.status}`);

  const text=await master.text();

  if(isMasterPlaylist(text,masterUrl)){
    const playlist=await rewriteMasterPlaylist(text,masterUrl);
    const result:Resolved115Hls={
      kind:'master',
      upstreamUrl:masterUrl.toString(),
      playlist,
    };
    cacheResult(cacheKey,result);
    return result;
  }

  // 少数情况下 115 可能直接返回媒体播放清单。
  // 这种清单直接交给浏览器，让其中的相对分片继续相对 115 CDN 解析。
  const result:Resolved115Hls={
    kind:'direct',
    upstreamUrl:masterUrl.toString(),
    target:masterUrl.toString(),
  };
  cacheResult(cacheKey,result);
  return result;
}

async function get115TokenFromQms(source:URL,userId:string,signal?:AbortSignal):Promise<string>{
  const apiKey=process.env.QMS_API_KEY?.trim();
  if(!apiKey) throw new Error('缺少 QMS_API_KEY，请先运行 HomeSphere 更新脚本初始化内部播放密钥');

  const endpoint=new URL('/api/account/list',source);
  endpoint.searchParams.set('api_key',apiKey);

  const response=await fetch(endpoint,{
    headers:{Accept:'application/json'},
    cache:'no-store',
    signal:combinedSignal(signal,timeoutMs()),
  });
  if(!response.ok) throw new Error('QMediaSync 内部 API Key 校验失败');

  const body=await response.json() as QmsAccountResponse;
  const accounts=Array.isArray(body.data)?body.data.filter(item=>typeof item.token==='string'&&item.token.length>0):[];
  if(!accounts.length) throw new Error(body.message||'QMediaSync 没有可用的 115 授权');

  const matched=userId
    ? accounts.find(item=>String(item.user_id??'')===userId)
    : undefined;
  const account=matched||(accounts.length===1?accounts[0]:undefined);
  if(!account?.token) throw new Error('无法确定 STRM 对应的 115 账号');

  return account.token;
}

function isMasterPlaylist(text:string,base:URL):boolean{
  const lines=text.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
  if(lines.some(line=>line.startsWith('#EXT-X-STREAM-INF')||line.startsWith('#EXT-X-MEDIA:'))) return true;

  return lines.some(line=>{
    if(line.startsWith('#')) return /URI="[^"]+\.m3u8(?:\?[^"]*)?"/i.test(line);
    try{return new URL(line,base).pathname.toLowerCase().endsWith('.m3u8');}
    catch{return false;}
  });
}

async function rewriteMasterPlaylist(text:string,base:URL):Promise<string>{
  const {playlist,urls}=rewriteMasterPlaylistText(text,base);

  for(const url of urls){
    await ensurePublic(url,'115 HLS 关联播放清单');
  }

  return playlist;
}

function rewriteMasterPlaylistText(text:string,base:URL):{playlist:string;urls:URL[]}{
  const lines=text.split(/\r?\n/);
  const urls=new Map<string,URL>();

  const playlist=lines.map(raw=>{
    const line=raw.trim();
    if(!line) return raw;

    if(line.startsWith('#')){
      return raw.replace(/URI="([^"]+)"/g,(_match,value:string)=>{
        const absolute=new URL(value,base);
        ensureHttp(absolute);
        urls.set(absolute.toString(),absolute);
        return `URI="${absolute.toString()}"`;
      });
    }

    const absolute=new URL(line,base);
    ensureHttp(absolute);
    urls.set(absolute.toString(),absolute);
    return absolute.toString();
  }).join('\n');

  return {playlist,urls:[...urls.values()]};
}

export function __rewrite115MasterForTest(text:string,base:string):string{
  return rewriteMasterPlaylistText(text,new URL(base)).playlist;
}

function selectBrowserCompatibleStream(streams:V115VideoUrl[],userAgent=''):V115VideoUrl{
  // 115 的 definition=100 是原画。网页端优先使用转码流。
  const transcoded=streams.filter(item=>item.definition!==100);

  // Windows Chrome/Edge 通过 hls.js + MSE 播放。
  // 优先 720P（definition=3）以避开部分高档转码的 HEVC/H.265 兼容问题。
  if(/Windows NT/i.test(userAgent)){
    const preference=[3,2,1,4,5];
    for(const definition of preference){
      const match=transcoded.find(item=>item.definition===definition);
      if(match)return match;
    }
    if(transcoded.length){
      return [...transcoded].sort((a,b)=>streamScore(a)-streamScore(b))[0];
    }
  }

  const candidates=transcoded.length?transcoded:streams;
  return [...candidates].sort((a,b)=>streamScore(b)-streamScore(a))[0];
}

function streamScore(item:V115VideoUrl):number{
  return Math.max(0,item.width||0)*Math.max(0,item.height||0)*1000+Math.max(0,item.definition||0);
}

export function __select115StreamForTest(streams:V115VideoUrl[],userAgent=''):V115VideoUrl{
  return selectBrowserCompatibleStream(streams,userAgent);
}

async function ensurePublic(url:URL,label:string):Promise<void>{
  const verdict=await checkUpstreamAllowed(url.toString());
  if(!verdict.ok) throw new Error(`${label}被安全策略拒绝：${verdict.reason}`);
}

function ensureHttp(url:URL):void{
  if(url.protocol!=='http:'&&url.protocol!=='https:') throw new Error('HLS 地址仅允许 http/https');
  if(url.username||url.password) throw new Error('HLS 地址不能包含 URL 用户名/密码');
}

async function schedulePlayRequest<T>(task:()=>Promise<T>,signal?:AbortSignal):Promise<T>{
  let release!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  const previous=playTail;
  playTail=previous.catch(()=>{}).then(()=>gate);

  await previous.catch(()=>{});
  try{
    signal?.throwIfAborted();
    const wait=lastPlayRequestAt+minIntervalMs()-Date.now();
    if(wait>0) await sleep(wait,signal);
    lastPlayRequestAt=Date.now();
    return await task();
  }finally{
    release();
  }
}

function getCached(key:string):Resolved115Hls|undefined{
  const item=hlsCache.get(key);
  if(!item) return undefined;
  if(item.expiresAt<=Date.now()){
    hlsCache.delete(key);
    return undefined;
  }
  return item.result;
}

function cacheResult(key:string,result:Resolved115Hls):void{
  const ttl=cacheTtlMs();
  if(ttl<=0) return;
  if(hlsCache.size>=MAX_CACHE_ENTRIES){
    const oldest=hlsCache.keys().next().value as string|undefined;
    if(oldest) hlsCache.delete(oldest);
  }
  hlsCache.set(key,{result,expiresAt:Date.now()+ttl});
}

function timeoutMs():number{
  return intEnv('HOMESPHERE_HLS_TIMEOUT_MS',DEFAULT_TIMEOUT_MS,1000,60000);
}

function minIntervalMs():number{
  return intEnv('HOMESPHERE_HLS_MIN_INTERVAL_MS',DEFAULT_MIN_INTERVAL_MS,0,10000);
}

function cacheTtlMs():number{
  return intEnv('HOMESPHERE_HLS_CACHE_TTL_MS',DEFAULT_CACHE_TTL_MS,0,10*60_000);
}

function combinedSignal(signal:AbortSignal|undefined,timeout:number):AbortSignal{
  const timeoutSignal=AbortSignal.timeout(timeout);
  return signal?AbortSignal.any([signal,timeoutSignal]):timeoutSignal;
}

function sleep(ms:number,signal?:AbortSignal):Promise<void>{
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(resolve,ms);
    if(!signal) return;
    const abort=()=>{
      clearTimeout(timer);
      reject(signal.reason??new DOMException('Aborted','AbortError'));
    };
    if(signal.aborted) abort();
    else signal.addEventListener('abort',abort,{once:true});
  });
}

function intEnv(name:string,fallback:number,min:number,max:number):number{
  const n=Number.parseInt(process.env[name]||'',10);
  return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;
}

export function __reset115HlsForTest():void{
  playTail=Promise.resolve();
  lastPlayRequestAt=0;
  hlsCache.clear();
}
