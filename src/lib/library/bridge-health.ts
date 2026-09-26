import fs from 'node:fs';
import { bridgeAllowedHosts, strmPlaybackMode } from './bridge';
import { libraryMode, strmRoot } from './mode';

export interface BridgeHealth {
  applicable:boolean;
  ready:boolean;
  libraryMode:'strm'|'direct115';
  playbackMode:'resolve'|'direct';
  strmRoot:string;
  strmRootReadable:boolean;
  allowedHosts:string[];
  credentialsPresentInHomeSphere:boolean;
  errors:string[];
  warnings:string[];
}

export function getBridgeHealth():BridgeHealth {
  const mode=libraryMode();
  const playbackMode=strmPlaybackMode();
  const root=strmRoot();
  const hosts=[...bridgeAllowedHosts()].sort();
  const credentialsPresent=Boolean(process.env.HOMESPHERE_115_COOKIE?.trim());
  const errors:string[]=[];
  const warnings:string[]=[];
  let rootReadable=false;
  try { rootReadable=fs.statSync(root).isDirectory(); } catch { rootReadable=false; }

  if(mode==='strm') {
    if(!rootReadable) errors.push(`STRM 目录不可用：${root}`);
    if(playbackMode==='resolve' && hosts.length===0) errors.push('resolve 模式未配置 HOMESPHERE_STRM_ALLOWED_HOSTS');
    if(playbackMode==='direct') warnings.push('当前为 direct 模式：STRM URL 必须能被客户端直接访问；生产更推荐 resolve 内网 Bridge');
    if(credentialsPresent) warnings.push('STRM 模式下 HomeSphere 仍检测到 HOMESPHERE_115_COOKIE；生产部署建议删除，保持凭据只存在 Media Bridge');
  }

  return {
    applicable:mode==='strm',
    ready:mode==='strm' && errors.length===0,
    libraryMode:mode,
    playbackMode,
    strmRoot:root,
    strmRootReadable:rootReadable,
    allowedHosts:hosts,
    credentialsPresentInHomeSphere:credentialsPresent,
    errors,
    warnings,
  };
}
