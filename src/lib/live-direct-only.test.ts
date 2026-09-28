import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('live playback safety boundary', () => {
  it('keeps browser playback direct-only', () => {
    const playerPath = join(process.cwd(), 'src/components/live-player.tsx');
    const source = readFileSync(playerPath, 'utf8');

    expect(source).not.toContain('/api/live/stream/');
    expect(source).not.toContain('STREAM_PROXY_PREFIX');
    expect(source).not.toContain('proxyUrl(');
  });

  it('does not expose a server-side live video proxy route', () => {
    const routePath = join(process.cwd(), 'src/app/api/live/stream/[url]/route.ts');
    expect(existsSync(routePath)).toBe(false);
  });
});
