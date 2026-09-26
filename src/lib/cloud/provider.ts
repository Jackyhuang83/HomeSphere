export type CloudProviderKind = '115' | 'quark';
export interface CloudEntry { id:string; name:string; isDir:boolean; size?:number; hash?:string; token?:string; modifiedAt?:number; }
export interface PlaybackLink { url:string; headers?:Record<string,string>; }
export interface ProviderHealth { ok:boolean; message:string; }
export interface CloudProvider { readonly kind:CloudProviderKind; readonly rootId:string; readonly capabilities:{read:boolean;directPlay:boolean;write:boolean}; listDir(id:string,signal?:AbortSignal):Promise<CloudEntry[]>; resolvePath(path:string,signal?:AbortSignal):Promise<CloudEntry|null>; getPlaybackLink(entry:Pick<CloudEntry,'id'|'name'|'token'>,opts?:{userAgent?:string;signal?:AbortSignal}):Promise<PlaybackLink>; healthCheck(signal?:AbortSignal):Promise<ProviderHealth>; }
