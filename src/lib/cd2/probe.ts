import path from 'node:path';
import { checkUpstreamAllowed } from '@/lib/ssrf';
import {
  cd2ConfigFromEnv,
  getCd2DownloadUrlInfo,
  normalizeCd2Endpoint,
  type Cd2DownloadUrlInfo,
} from './client';

export interface Cd2ProbeResult {
  configured: boolean;
  endpointHost?: string;
  probeFile?: string;
  directUrlAvailable?: boolean;
  directHost?: string;
  downloadUrlPathAvailable?: boolean;
  expiresIn?: number;
  requiresSpecificUserAgent?: boolean;
  userAgentMatchesBrowser?: boolean;
  additionalHeaderNames?: string[];
  browser302Candidate?: boolean;
  finalUrlPublic?: boolean;
  note: string;
}

export function cd2ProbeConfigured(): boolean {
  return Boolean(cd2ConfigFromEnv() && process.env.HOMESPHERE_CD2_PROBE_PATH?.trim());
}

export async function runCd2Probe(userAgent: string, signal?: AbortSignal): Promise<Cd2ProbeResult> {
  const config = cd2ConfigFromEnv();
  const remotePath = process.env.HOMESPHERE_CD2_PROBE_PATH?.trim();
  if (!config || !remotePath) {
    return {
      configured: false,
      note: '请先在服务器环境变量中配置 HOMESPHERE_CD2_ENDPOINT、HOMESPHERE_CD2_TOKEN 和 HOMESPHERE_CD2_PROBE_PATH。',
    };
  }

  const endpoint = normalizeCd2Endpoint(config.endpoint);
  const info = await getCd2DownloadUrlInfo(remotePath, config, signal);
  return await sanitizeProbe(endpoint, remotePath, info, userAgent);
}

export async function getCd2BrowserProbeTarget(userAgent: string, signal?: AbortSignal): Promise<string> {
  const config = cd2ConfigFromEnv();
  const remotePath = process.env.HOMESPHERE_CD2_PROBE_PATH?.trim();
  if (!config || !remotePath) throw new Error('CloudDrive2 探针尚未配置');

  const info = await getCd2DownloadUrlInfo(remotePath, config, signal);
  const direct = info.directUrl?.trim();
  if (!direct) throw new Error('CloudDrive2 没有返回 directUrl；不能做浏览器直连验证');

  const headerNames = Object.keys(info.additionalHeaders).filter(Boolean);
  if (headerNames.length) {
    throw new Error(`该直链要求额外请求头（${headerNames.join(', ')}），浏览器302不能可靠附加这些 Header`);
  }

  const requiredUa = info.userAgent?.trim();
  if (requiredUa && requiredUa !== userAgent.trim()) {
    throw new Error('该直链要求特定 User-Agent，与当前浏览器不一致；不进行302测试');
  }

  const verdict = await checkUpstreamAllowed(direct);
  if (!verdict.ok) throw new Error(`CloudDrive2 directUrl 被安全策略拒绝：${verdict.reason}`);
  return direct;
}

async function sanitizeProbe(
  endpoint: URL,
  remotePath: string,
  info: Cd2DownloadUrlInfo,
  browserUserAgent: string
): Promise<Cd2ProbeResult> {
  const direct = info.directUrl?.trim();
  const requiredUa = info.userAgent?.trim();
  const headerNames = Object.keys(info.additionalHeaders).filter(Boolean).sort();
  let directHost: string | undefined;
  let finalUrlPublic = false;

  if (direct) {
    try {
      directHost = new URL(direct).hostname;
      finalUrlPublic = (await checkUpstreamAllowed(direct)).ok;
    } catch {
      finalUrlPublic = false;
    }
  }

  const uaMatches = !requiredUa || requiredUa === browserUserAgent.trim();
  const browser302Candidate = Boolean(direct && finalUrlPublic && headerNames.length === 0 && uaMatches);

  return {
    configured: true,
    endpointHost: endpoint.host,
    probeFile: path.posix.basename(remotePath),
    directUrlAvailable: Boolean(direct),
    directHost,
    downloadUrlPathAvailable: Boolean(info.downloadUrlPath?.trim()),
    expiresIn: info.expiresIn,
    requiresSpecificUserAgent: Boolean(requiredUa),
    userAgentMatchesBrowser: uaMatches,
    additionalHeaderNames: headerNames,
    browser302Candidate,
    finalUrlPublic,
    note: browser302Candidate
      ? '元数据条件允许做浏览器302实测；这仍不等于已经验证 iPhone/115 实际播放。'
      : direct
        ? 'CloudDrive2 返回了直链，但其 UA/Header 条件不适合直接交给普通浏览器302。'
        : 'CloudDrive2 未返回 directUrl；若只提供 downloadUrlPath，媒体字节可能经过 CloudDrive2，暂不符合 HomeSphere 默认播放目标。',
  };
}
