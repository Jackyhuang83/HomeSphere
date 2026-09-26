import type { CloudProvider, CloudProviderKind } from './provider';
import { Cloud115Provider } from './providers/115';

let provider115: Cloud115Provider | null = null;

export function getCloudProvider(kind: CloudProviderKind): CloudProvider {
  if (kind === '115') return provider115 ??= new Cloud115Provider();
  if (kind === 'strm') throw new Error('STRM 是本地媒体库来源，不是云盘 Provider');
  throw new Error('夸克 Provider 已预留，但当前版本尚未启用');
}

export function configuredProviderKinds(): CloudProviderKind[] {
  const result: CloudProviderKind[] = ['strm'];
  if (getCloudProvider('115').isConfigured()) result.push('115');
  return result;
}
