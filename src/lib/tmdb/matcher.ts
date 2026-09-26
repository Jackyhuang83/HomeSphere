import type { LibraryWork } from '@/lib/library/types';
import { searchTmdb, type TmdbItem } from './client';

export interface MatchResult {
  candidate:TmdbItem|null;
  confidence:'high'|'medium'|'low'|'none';
  reason:string;
}

export async function matchWork(work:LibraryWork,signal?:AbortSignal):Promise<MatchResult> {
  let results=await searchTmdb(work.title,work.mediaType,work.year,signal);
  if(!results.length && work.year) results=await searchTmdb(work.title,work.mediaType,undefined,signal);
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
  if(!second || best.score-second.score>=3) {
    return {candidate:best.item,confidence:'low',reason:'候选领先但证据不足，需要人工确认'};
  }
  return {candidate:best.item,confidence:'low',reason:'存在多个相近候选，需要人工确认'};
}

function score(item:TmdbItem,work:LibraryWork) {
  const expected=normalize(work.title);
  const titles=[item.title,item.originalTitle || ''].map(normalize).filter(Boolean);
  const titleEqual=titles.includes(expected);
  let value=titleEqual?4:0;
  if(!titleEqual && expected.length>=2 && titles.some(t=>t.includes(expected)||expected.includes(t))) value+=1;
  let yearEqual=false;
  if(work.year && item.year) {
    const diff=Math.abs(Number(work.year)-Number(item.year));
    if(diff===0) {value+=2;yearEqual=true;}
    else if(diff===1) value+=1;
    else value-=1;
  }
  return {item,score:value,titleEqual,yearEqual};
}

export function normalize(value:string):string {
  return value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'');
}
