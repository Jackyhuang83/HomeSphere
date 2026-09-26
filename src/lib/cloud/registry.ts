import type { CloudProvider, CloudProviderKind } from './provider'; import { Cloud115Provider } from './providers/cloud115';
let provider115:Cloud115Provider|null=null;
export function getCloudProvider(kind:CloudProviderKind):CloudProvider{if(kind==='115'){provider115??=new Cloud115Provider();return provider115;}throw new Error(`Provider ${kind} is reserved for a later phase`);}
export function configuredProviderKinds():CloudProviderKind[]{const out:CloudProviderKind[]=[];const p115=getCloudProvider('115') as Cloud115Provider;if(p115.configured)out.push('115');return out;}
