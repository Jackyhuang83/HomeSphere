import { NextResponse } from 'next/server';
import { guardRequest } from '@/lib/api-guard';
import { getBridgeHealth } from '@/lib/library/bridge-health';
import { getProbeMedia } from '@/lib/library/db';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(req:Request){
  const guarded=guardRequest(req);if(guarded)return guarded;
  const health=getBridgeHealth();
  return NextResponse.json({...health,sampleAvailable:Boolean(getProbeMedia())},{
    headers:{'Cache-Control':'private, no-store'}
  });
}
