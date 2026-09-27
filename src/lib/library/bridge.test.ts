import { afterEach, describe, expect, it, vi } from 'vitest';
import { __resetBridgeSafetyForTest, resolveStrmPlaybackTarget } from './bridge';

const keys=[
  'HOMESPHERE_STRM_ALLOWED_HOSTS',
  'HOMESPHERE_BRIDGE_MIN_INTERVAL_MS',
  'HOMESPHERE_BRIDGE_CACHE_TTL_MS',
  'HOMESPHERE_BRIDGE_CIRCUIT_MS',
] as const;
const original=Object.fromEntries(keys.map(key=>[key,process.env[key]]));

afterEach(()=>{
  vi.unstubAllGlobals();
  __resetBridgeSafetyForTest();
  for(const key of keys){
    const value=original[key];
    if(value===undefined) delete process.env[key];
    else process.env[key]=value;
  }
});

describe('resolveStrmPlaybackTarget',()=>{
  it('requires a bridge allowlist',async()=>{
    delete process.env.HOMESPHERE_STRM_ALLOWED_HOSTS;
    await expect(resolveStrmPlaybackTarget('http://media-bridge:12333/play/abc'))
      .rejects.toThrow('HOMESPHERE_STRM_ALLOWED_HOSTS');
  });

  it('resolves a private bridge redirect to an external CDN target',async()=>{
    process.env.HOMESPHERE_STRM_ALLOWED_HOSTS='media-bridge';
    process.env.HOMESPHERE_BRIDGE_MIN_INTERVAL_MS='0';
    const fetchMock=vi.fn().mockResolvedValue(new Response(null,{status:302,headers:{location:'https://cdn.example.invalid/video.mp4?token=abc'}}));
    vi.stubGlobal('fetch',fetchMock);
    const result=await resolveStrmPlaybackTarget('http://media-bridge:12333/play/abc',{userAgent:'HomeSphere-Test-UA'});
    expect(result).toBe('https://cdn.example.invalid/video.mp4?token=abc');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init=fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string,string>)['User-Agent']).toBe('HomeSphere-Test-UA');
    expect(init.redirect).toBe('manual');
  });

  it('follows only internal bridge redirects before returning the public target',async()=>{
    process.env.HOMESPHERE_STRM_ALLOWED_HOSTS='media-bridge';
    process.env.HOMESPHERE_BRIDGE_MIN_INTERVAL_MS='0';
    const fetchMock=vi.fn()
      .mockResolvedValueOnce(new Response(null,{status:302,headers:{location:'/redirect/2'}}))
      .mockResolvedValueOnce(new Response(null,{status:302,headers:{location:'https://cdn.example.invalid/video.mp4'}}));
    vi.stubGlobal('fetch',fetchMock);
    expect(await resolveStrmPlaybackTarget('http://media-bridge:12333/play/1')).toBe('https://cdn.example.invalid/video.mp4');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects bridges that proxy media bytes instead of redirecting',async()=>{
    process.env.HOMESPHERE_STRM_ALLOWED_HOSTS='media-bridge';
    process.env.HOMESPHERE_BRIDGE_MIN_INTERVAL_MS='0';
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('bytes',{status:200,headers:{'content-type':'video/mp4'}})));
    await expect(resolveStrmPlaybackTarget('http://media-bridge:12333/play/1')).rejects.toThrow('必须返回 3xx');
  });

  it('short-caches the final CDN URL for the same STRM and user-agent',async()=>{
    process.env.HOMESPHERE_STRM_ALLOWED_HOSTS='media-bridge';
    process.env.HOMESPHERE_BRIDGE_MIN_INTERVAL_MS='0';
    process.env.HOMESPHERE_BRIDGE_CACHE_TTL_MS='60000';
    const fetchMock=vi.fn().mockResolvedValue(new Response(null,{status:302,headers:{location:'https://cdn.example.invalid/video.mp4'}}));
    vi.stubGlobal('fetch',fetchMock);

    const first=await resolveStrmPlaybackTarget('http://media-bridge:12333/play/1',{userAgent:'UA'});
    const second=await resolveStrmPlaybackTarget('http://media-bridge:12333/play/1',{userAgent:'UA'});

    expect(first).toBe(second);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('opens a circuit after 429 instead of retrying aggressively',async()=>{
    process.env.HOMESPHERE_STRM_ALLOWED_HOSTS='media-bridge';
    process.env.HOMESPHERE_BRIDGE_MIN_INTERVAL_MS='0';
    process.env.HOMESPHERE_BRIDGE_CIRCUIT_MS='60000';
    const fetchMock=vi.fn().mockResolvedValue(new Response(null,{status:429}));
    vi.stubGlobal('fetch',fetchMock);

    await expect(resolveStrmPlaybackTarget('http://media-bridge:12333/play/1')).rejects.toThrow('熔断');
    await expect(resolveStrmPlaybackTarget('http://media-bridge:12333/play/2')).rejects.toThrow('熔断');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
