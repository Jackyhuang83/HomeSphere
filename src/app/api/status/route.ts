import { NextResponse } from 'next/server';
import { isPasswordConfigured, sessionFromCookieHeader } from '@/lib/auth';
import { getEnvLiveSources } from '@/lib/env-live-sources';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const passwordRequired = isPasswordConfigured();
  const verified = passwordRequired && sessionFromCookieHeader(req.headers.get('cookie'));
  return NextResponse.json({
    passwordRequired,
    verified,
    version: process.env.APP_VERSION || 'dev',
    defaultLiveSources: getEnvLiveSources(),
  });
}
