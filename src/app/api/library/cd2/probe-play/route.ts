import { guardRequest, jsonError } from '@/lib/api-guard';
import { getCd2BrowserProbeTarget } from '@/lib/cd2/probe';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(req:Request) {
  const guarded=guardRequest(req);
  if(guarded) return guarded;
  try {
    const target=await getCd2BrowserProbeTarget(req.headers.get('user-agent') || '',req.signal);
    return new Response(null,{
      status:302,
      headers:{
        Location:target,
        'Cache-Control':'private, no-store, max-age=0',
        'Referrer-Policy':'no-referrer',
      },
    });
  } catch(error) {
    return jsonError(error instanceof Error?error.message:'CloudDrive2 浏览器直连验证失败',409);
  }
}
