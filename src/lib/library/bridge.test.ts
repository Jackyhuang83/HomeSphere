import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveStrmPlaybackTarget } from './bridge';

const original = {
  mode: process.env.HOMESPHERE_STRM_PLAYBACK_MODE,
  hosts: process.env.HOMESPHERE_STRM_ALLOWED_HOSTS,
};

afterEach(() => {
  vi.unstubAllGlobals();
  if (original.mode === undefined) delete process.env.HOMESPHERE_STRM_PLAYBACK_MODE;
  else process.env.HOMESPHERE_STRM_PLAYBACK_MODE = original.mode;
  if (original.hosts === undefined) delete process.env.HOMESPHERE_STRM_ALLOWED_HOSTS;
  else process.env.HOMESPHERE_STRM_ALLOWED_HOSTS = original.hosts;
});

describe('resolveStrmPlaybackTarget', () => {
  it('requires an allowlist in server-side resolve mode', async () => {
    process.env.HOMESPHERE_STRM_PLAYBACK_MODE = 'resolve';
    delete process.env.HOMESPHERE_STRM_ALLOWED_HOSTS;
    await expect(resolveStrmPlaybackTarget('http://media-bridge:12333/play/abc'))
      .rejects.toThrow('HOMESPHERE_STRM_ALLOWED_HOSTS');
  });

  it('can keep legacy direct redirect mode without server fetch', async () => {
    process.env.HOMESPHERE_STRM_PLAYBACK_MODE = 'direct';
    delete process.env.HOMESPHERE_STRM_ALLOWED_HOSTS;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await resolveStrmPlaybackTarget('https://media.example.com/play/abc');
    expect(result).toBe('https://media.example.com/play/abc');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('resolves a private bridge redirect to the external CDN target', async () => {
    process.env.HOMESPHERE_STRM_PLAYBACK_MODE = 'resolve';
    process.env.HOMESPHERE_STRM_ALLOWED_HOSTS = 'media-bridge';

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: 'https://cdn.example.invalid/video.mp4?token=abc' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await resolveStrmPlaybackTarget(
      'http://media-bridge:12333/115/newurl?pickcode=abc',
      { userAgent: 'HomeSphere-Test-UA' }
    );

    expect(result).toBe('https://cdn.example.invalid/video.mp4?token=abc');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string,string>)['User-Agent']).toBe('HomeSphere-Test-UA');
    expect(init.redirect).toBe('manual');
  });

  it('follows only internal bridge redirects before returning the public target', async () => {
    process.env.HOMESPHERE_STRM_PLAYBACK_MODE = 'resolve';
    process.env.HOMESPHERE_STRM_ALLOWED_HOSTS = 'media-bridge';

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, {
        status: 302,
        headers: { location: '/redirect/2' },
      }))
      .mockResolvedValueOnce(new Response(null, {
        status: 302,
        headers: { location: 'https://cdn.example.invalid/video.mp4' },
      }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await resolveStrmPlaybackTarget('http://media-bridge:12333/play/1');
    expect(result).toBe('https://cdn.example.invalid/video.mp4');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects bridges that proxy media bytes instead of redirecting', async () => {
    process.env.HOMESPHERE_STRM_PLAYBACK_MODE = 'resolve';
    process.env.HOMESPHERE_STRM_ALLOWED_HOSTS = 'media-bridge';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('bytes', { status: 200, headers: { 'content-type': 'video/mp4' } })
    ));

    await expect(resolveStrmPlaybackTarget('http://media-bridge:12333/play/1'))
      .rejects.toThrow('必须返回 3xx');
  });
});
