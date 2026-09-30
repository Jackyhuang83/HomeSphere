import type { LibraryWork } from '@/lib/library/types';
import { getTmdbAlternativeTitles, searchTmdb, type TmdbItem } from './client';

export interface MatchResult {
  candidate:TmdbItem|null;
  confidence:'high'|'medium'|'low'|'none';
  reason:string;
}

export async function matchWork(work:LibraryWork,signal?:AbortSignal):Promise<MatchResult> {
  const queries=titleVariants(work.title).slice(0,3);
  let results=await searchQueries(queries,work.mediaType,work.year,signal);

  if(!results.length && work.year) {
    results=await searchQueries(queries,work.mediaType,undefined,signal);
  }
  if(!results.length) return {candidate:null,confidence:'none',reason:'TMDB 无匹配'};

  const ranked=results.map(item=>score(item,work)).sort((a,b)=>b.score-a.score);
  const best=ranked[0];
  const second=ranked[1];

  if(best.titleEqual && best.yearEqual) {
    return {candidate:best.item,confidence:'high',reason:'标题和年份完全匹配'};
  }
  if(best.titleEqual) {
    if(!work.year || !best.item.year) return {candidate:best.item,confidence:'medium',reason:'标题完全匹配'};
    if(Math.abs(Number(work.year)-Number(best.item.year))<=1) {
      return {candidate:best.item,confidence:'medium',reason:'标题匹配，年份相差不超过1年'};
    }
  }

  const refined=await refineLowConfidence(ranked.slice(0,5),work,signal);
  if(refined)return refined;

  if(!second || best.score-second.score>=3) {
    return {candidate:best.item,confidence:'low',reason:'候选领先但证据不足，需要人工确认'};
  }
  return {candidate:best.item,confidence:'low',reason:'存在多个相近候选，需要人工确认'};
}

async function refineLowConfidence(
  ranked:Array<ReturnType<typeof score>>,
  work:LibraryWork,
  signal?:AbortSignal,
):Promise<MatchResult|null> {
  const expected=titleVariants(work.title).map(normalize).filter(Boolean);
  const aliasMatches:Array<{item:TmdbItem;yearRank:number}>=[];
  const nearMatches:Array<{item:TmdbItem;distance:number}>=[];

  for(const candidate of ranked){
    signal?.throwIfAborted();
    const aliases=await getTmdbAlternativeTitles(candidate.item.mediaType,candidate.item.id,signal);
    const candidateTitles=[
      candidate.item.title,
      candidate.item.originalTitle||'',
      ...aliases,
    ].map(normalize).filter(Boolean);

    const aliasEqual=candidateTitles.some(title=>expected.includes(title));
    if(aliasEqual){
      const yearRank=yearCompatibility(work.year,candidate.item.year);
      if(yearRank>=0) aliasMatches.push({item:candidate.item,yearRank});
      continue;
    }

    if(work.year&&candidate.item.year&&work.year===candidate.item.year){
      const distance=minTitleDistance(expected,candidateTitles);
      if(distance<=1) nearMatches.push({item:candidate.item,distance});
    }
  }

  aliasMatches.sort((a,b)=>b.yearRank-a.yearRank);
  if(aliasMatches.length){
    const first=aliasMatches[0];
    const second=aliasMatches[1];
    if(!second||first.yearRank>second.yearRank){
      return {
        candidate:first.item,
        confidence:first.yearRank>=2?'high':'medium',
        reason:first.yearRank>=2?'TMDB 别名和年份完全匹配':'TMDB 别名完全匹配',
      };
    }
  }

  nearMatches.sort((a,b)=>a.distance-b.distance);
  if(nearMatches.length===1||nearMatches[0].distance<nearMatches[1].distance){
    return {
      candidate:nearMatches[0].item,
      confidence:'medium',
      reason:'标题仅差1个字符且年份完全匹配',
    };
  }

  return null;
}

function yearCompatibility(expected?:string,actual?:string):number {
  if(!expected||!actual)return 1;
  const diff=Math.abs(Number(expected)-Number(actual));
  if(diff===0)return 2;
  if(diff===1)return 1;
  return -1;
}

function minTitleDistance(expected:string[],candidateTitles:string[]):number {
  let best=Number.POSITIVE_INFINITY;
  for(const left of expected){
    for(const right of candidateTitles){
      if(Math.min(left.length,right.length)<4)continue;
      best=Math.min(best,levenshtein(left,right));
    }
  }
  return best;
}

export function levenshtein(left:string,right:string):number {
  if(left===right)return 0;
  if(!left.length)return right.length;
  if(!right.length)return left.length;

  let previous=Array.from({length:right.length+1},(_,index)=>index);
  for(let i=1;i<=left.length;i++){
    const current=[i];
    for(let j=1;j<=right.length;j++){
      const cost=left[i-1]===right[j-1]?0:1;
      current[j]=Math.min(
        current[j-1]+1,
        previous[j]+1,
        previous[j-1]+cost,
      );
    }
    previous=current;
  }
  return previous[right.length];
}

async function searchQueries(
  queries:string[],
  mediaType:LibraryWork['mediaType'],
  year:string|undefined,
  signal?:AbortSignal,
):Promise<TmdbItem[]> {
  const merged=new Map<number,TmdbItem>();
  for(const query of queries){
    signal?.throwIfAborted();

    // TMDB search results are localized. For Latin release titles, search
    // English first so "Green Snake", "Detective Chinatown", etc. can be
    // compared against the exact title the STRM actually contains.
    if(/[A-Za-z]/.test(query)){
      const english=await searchTmdb(query,mediaType,year,signal,'en-US');
      for(const item of english) if(!merged.has(item.id)) merged.set(item.id,item);
    }

    const localized=await searchTmdb(query,mediaType,year,signal);
    for(const item of localized) if(!merged.has(item.id)) merged.set(item.id,item);
  }
  return [...merged.values()];
}

function score(item:TmdbItem,work:LibraryWork) {
  const expected=titleVariants(work.title).map(normalize).filter(Boolean);
  const titles=[item.title,item.originalTitle || ''].map(normalize).filter(Boolean);
  const titleEqual=titles.some(title=>expected.includes(title));

  let value=titleEqual?4:0;
  if(!titleEqual && expected.some(a=>a.length>=2&&titles.some(b=>b.includes(a)||a.includes(b)))) value+=1;

  let yearEqual=false;
  if(work.year && item.year) {
    const diff=Math.abs(Number(work.year)-Number(item.year));
    if(diff===0) {value+=2;yearEqual=true;}
    else if(diff===1) value+=1;
    else value-=1;
  }
  return {item,score:value,titleEqual,yearEqual};
}

export function titleVariants(value:string):string[] {
  const full=value.normalize('NFKC').replace(/\s+/g,' ').trim();
  if(!full)return [];

  const variants=[full];
  const cjkThenLatin=/^(.+?[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\d])\s+([A-Za-z][A-Za-z0-9'’:&+.,\- ]+)$/u.exec(full);
  const latinThenCjk=/^([A-Za-z][A-Za-z0-9'’:&+.,\- ]+)\s+([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}].+)$/u.exec(full);

  const match=cjkThenLatin||latinThenCjk;
  if(match){
    variants.push(match[1].trim(),match[2].trim());
  }

  // Release names sometimes append "1" to the first film although TMDB
  // stores the first instalment without that suffix.
  for(const item of [...variants]){
    if(/^[A-Za-z]/.test(item)&&/\s1$/.test(item)) variants.push(item.replace(/\s1$/,'').trim());
  }

  return [...new Set(variants.filter(item=>normalize(item).length>=2))];
}

export function normalize(value:string):string {
  return value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'');
}
