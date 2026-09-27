import fs from 'node:fs';
import { bridgeAllowedHosts } from './bridge';
import { strmRoot } from './config';

export interface BridgeHealth {
  ready:boolean;
  strmRoot:string;
  strmRootReadable:boolean;
  allowedHosts:string[];
  errors:string[];
}

export function getBridgeHealth():BridgeHealth {
  const root=strmRoot();
  const hosts=[...bridgeAllowedHosts()].sort();
  const errors:string[]=[];
  let rootReadable=false;
  try{rootReadable=fs.statSync(root).isDirectory();}catch{rootReadable=false;}
  if(!rootReadable) errors.push(`STRM 目录不可用：${root}`);
  if(hosts.length===0) errors.push('未配置 HOMESPHERE_STRM_ALLOWED_HOSTS');
  return {ready:errors.length===0,strmRoot:root,strmRootReadable:rootReadable,allowedHosts:hosts,errors};
}
