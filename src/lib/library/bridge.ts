import { checkUpstreamAllowed } from '@/lib/ssrf';
import { validateStrmPlaybackUrl } from './strm-url';

const DEFAULT_TIMEOUT_MS=12000;
const DEFAULT_MAX_INTERNAL_REDIRECTS=3;
const DEFAULT_UA='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
const DEFAULT_MIN_INTERVAL_MS=1000;
const DEFAULT_CACHE_TTL_MS=60_000;
const DEFAULT_CIRCUIT_MS=60_000;
const MAX_CACHE_ENTRIES=200;

let bridgeTail:Promise<void>=Promise.resolve();
let lastBridgeRequestAt=0;
let circuitUntil=0;
const finalUrlCache=new Map<string,{target:string;expiresAt:number}>();

export function bridgeAllowedHosts():Set<string>{
  return new Set((process.env.HOMESPHERE_STRM_ALLOWED_HOSTS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean));
}

export async function resolveStrmPlaybackTarget(
  sourceUrl:string,
  opts?:{signal?:AbortSignal;userAgent?:string}
):Promise<string>{
  const source=validateStrmPlaybackUrl(sourceUrl);
  const allowedHosts=bridgeAllowedHosts();
  if(!allowedHosts.size) throw new Error('必须配置 HOMESPHERE_STRM_ALLOWED_HOSTS，避免把 HomeSphere 变成 SSRF 跳板');

  const userAgent=opts?.userAgent?.trim()||DEFAULT_UA;
  const cacheKey=`${userAgent}\n${source}`;
  const cached=getCachedTarget(cacheKey);
  if(cached) return cached;

  let current=new URL(source);
  ensureInternalBridgeHost(current,allowedHosts);
  const timeoutMs=intEnv('HOMESPHERE_BRIDGE_TIMEOUT_MS',DEFAULT_TIMEOUT_MS,1000,60000);
  const maxRedirects=intEnv('HOMESPHERE_BRIDGE_MAX_REDIRECTS',DEFAULT_MAX_INTERNAL_REDIRECTS,1,8);

  for(let step=0;step<=maxRedirects;step++){
    opts?.signal?.throwIfAborted();
    ensureCircuitClosed();

    const response=await scheduleBridgeRequest(()=>fetch(current,{
      method:'GET',
      headers:{'User-Agent':userAgent,Accept:'*/*'},
      cache:'no-store',
      redirect:'manual',
      signal:combinedSignal(opts?.signal,timeoutMs),
    }),opts?.signal);

    if(response.status===429 || response.status>=500){
      tripCircuit();
      try{await response.body?.cancel();}catch{}
      throw new Error(`Media Bridge 返回 HTTP ${response.status}，已触发保守熔断，暂停解析一段时间`);
    }

    if(response.status<300 || response.status>=400){
      try{await response.body?.cancel();}catch{}
      throw new Error(`Media Bridge 必须返回 3xx 重定向，当前返回 HTTP ${response.status}`);
    }

    const location=response.headers.get('location');
    try{await response.body?.cancel();}catch{}
    if(!location) throw new Error('Media Bridge 返回重定向但缺少 Location');

    const next=new URL(location,current);
    ensureHttpUrl(next);

    if(allowedHosts.has(next.hostname.toLowerCase())){
      current=next;
      continue;
    }

    const verdict=await checkUpstreamAllowed(next.toString());
    if(!verdict.ok) throw new Error(`Media Bridge 最终跳转地址被安全策略拒绝：${verdict.reason}`);

    const target=next.toString();
    cacheTarget(cacheKey,target);
    return target;
  }

  throw new Error(`Media Bridge 内部重定向超过上限 ${maxRedirects}`);
}

function ensureCircuitClosed():void{
  const now=Date.now();
  if(circuitUntil<=now) return;
  const seconds=Math.max(1,Math.ceil((circuitUntil-now)/1000));
  throw new Error(`Media Bridge 处于保守熔断期，请 ${seconds} 秒后再试`);
}

function tripCircuit():void{
  circuitUntil=Date.now()+intEnv('HOMESPHERE_BRIDGE_CIRCUIT_MS',DEFAULT_CIRCUIT_MS,10_000,10*60_000);
}

async function scheduleBridgeRequest<T>(task:()=>Promise<T>,signal?:AbortSignal):Promise<T>{
  let release!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  const previous=bridgeTail;
  bridgeTail=previous.catch(()=>{}).then(()=>gate);

  await previous.catch(()=>{});
  try{
    signal?.throwIfAborted();
    const minInterval=intEnv('HOMESPHERE_BRIDGE_MIN_INTERVAL_MS',DEFAULT_MIN_INTERVAL_MS,0,10_000);
    const wait=lastBridgeRequestAt+minInterval-Date.now();
    if(wait>0) await sleep(wait,signal);
    lastBridgeRequestAt=Date.now();
    return await task();
  }finally{
    release();
  }
}

function getCachedTarget(key:string):string|undefined{
  const item=finalUrlCache.get(key);
  if(!item) return undefined;
  if(item.expiresAt<=Date.now()){
    finalUrlCache.delete(key);
    return undefined;
  }
  return item.target;
}

function cacheTarget(key:string,target:string):void{
  const ttl=intEnv('HOMESPHERE_BRIDGE_CACHE_TTL_MS',DEFAULT_CACHE_TTL_MS,0,10*60_000);
  if(ttl<=0) return;
  if(finalUrlCache.size>=MAX_CACHE_ENTRIES){
    const oldest=finalUrlCache.keys().next().value as string|undefined;
    if(oldest) finalUrlCache.delete(oldest);
  }
  finalUrlCache.set(key,{target,expiresAt:Date.now()+ttl});
}

function ensureInternalBridgeHost(url:URL,allowedHosts:Set<string>):void{
  ensureHttpUrl(url);
  if(!allowedHosts.has(url.hostname.toLowerCase())) throw new Error(`STRM Bridge 主机不在允许列表：${url.hostname}`);
}

function ensureHttpUrl(url:URL):void{
  if(url.protocol!=='http:'&&url.protocol!=='https:') throw new Error('播放地址仅允许 http/https');
  if(url.username||url.password) throw new Error('播放地址不能包含 URL 用户名/密码');
}

function combinedSignal(signal:AbortSignal|undefined,timeoutMs:number):AbortSignal{
  const timeout=AbortSignal.timeout(timeoutMs);
  return signal?AbortSignal.any([signal,timeout]):timeout;
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

export function __resetBridgeSafetyForTest():void{
  bridgeTail=Promise.resolve();
  lastBridgeRequestAt=0;
  circuitUntil=0;
  finalUrlCache.clear();
}
