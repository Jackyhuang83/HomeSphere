import type { LibraryMatchHit, LibraryMatchRequestItem } from '@/lib/types';

export interface LocalMatchCandidate {
  id:string;
  title:string;
  originalTitle?:string;
  year?:string;
  mediaType:'movie'|'tv';
}

export function normalizeLibraryTitle(value:string):string {
  return value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'');
}

export function matchLocalCandidates(
  inputs:LibraryMatchRequestItem[],
  candidates:LocalMatchCandidate[]
):Record<string,LibraryMatchHit> {
  const index=new Map<string,LocalMatchCandidate[]>();

  for(const candidate of candidates) {
    const names=[candidate.title,candidate.originalTitle].filter((v):v is string=>Boolean(v?.trim()));
    for(const name of new Set(names)) {
      const normalized=normalizeLibraryTitle(name);
      if(!normalized) continue;
      const key=`${candidate.mediaType}:${normalized}`;
      const list=index.get(key) || [];
      if(!list.some(item=>item.id===candidate.id)) list.push(candidate);
      index.set(key,list);
    }
  }

  const result:Record<string,LibraryMatchHit>={};

  for(const input of inputs) {
    const title=input.title.trim();
    if(!input.key || !title) continue;
    const normalized=normalizeLibraryTitle(title);
    if(!normalized) continue;

    const mediaTypes:Array<'movie'|'tv'>=
      input.isTv===true ? ['tv'] :
      input.isTv===false ? ['movie'] :
      ['movie','tv'];

    let pool:LocalMatchCandidate[]=[];
    for(const mediaType of mediaTypes) {
      pool.push(...(index.get(`${mediaType}:${normalized}`) || []));
    }
    pool=[...new Map(pool.map(item=>[item.id,item])).values()];

    if(input.year) {
      const sameYear=pool.filter(item=>item.year===input.year);
      if(sameYear.length===1) {
        const item=sameYear[0];
        result[input.key]={
          workId:item.id,title:item.title,year:item.year,mediaType:item.mediaType,quality:'title-year'
        };
        continue;
      }
      if(sameYear.length>1) continue;
    }

    if(pool.length===1) {
      const item=pool[0];
      result[input.key]={
        workId:item.id,title:item.title,year:item.year,mediaType:item.mediaType,quality:'title'
      };
    }
  }

  return result;
}
