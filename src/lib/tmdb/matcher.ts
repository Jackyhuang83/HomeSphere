import type { LibraryWork } from '@/lib/library/types';
import { getTmdbDetails, searchTmdb, type TmdbSearchResult } from './client';

export interface MatchResult {
  candidate: TmdbSearchResult | null;
  confidence: 'high' | 'medium' | 'low' | 'none';
  reason: string;
}

export async function matchWork(work: LibraryWork, signal?: AbortSignal): Promise<MatchResult> {
  let results = await searchTmdb(work.title, work.mediaType, work.year, signal);
  if (results.length === 0) results = await searchTmdb(work.title, 'multi', work.year, signal);
  if (results.length === 0 && work.year) results = await searchTmdb(work.title, work.mediaType, undefined, signal);
  if (results.length === 0) return { candidate: null, confidence: 'none', reason: 'TMDB 无匹配' };

  const scored = results.map((item) => score(item, work)).sort((a, b) => b.score - a.score);
  const pick = scored[0];
  const second = scored[1];

  if (pick.titleEqual && pick.yearEqual) return { candidate: pick.item, confidence: 'high', reason: '标题和年份都匹配' };
  if (pick.titleEqual && (!work.year || !pick.item.year || Math.abs(Number(work.year) - Number(pick.item.year)) <= 1)) {
    return { candidate: pick.item, confidence: 'medium', reason: work.year ? '标题匹配，年份接近' : '标题匹配' };
  }

  const normalizedNeedles = [work.title, work.originalTitle ?? ''].map(normalizeTitle).filter(Boolean);
  for (const candidate of scored.slice(0, 5)) {
    const details = await getTmdbDetails(candidate.item.mediaType, candidate.item.id, signal);
    if (!details) continue;
    const aliases = [details.title, details.originalTitle, ...details.aliases].map(normalizeTitle).filter(Boolean);
    if (!normalizedNeedles.some((needle) => aliases.includes(needle))) continue;
    if (work.year && details.year && Math.abs(Number(work.year) - Number(details.year)) > 1) continue;
    return { candidate: details, confidence: work.year ? 'high' : 'medium', reason: work.year ? '别名和年份匹配' : '别名匹配' };
  }

  if (!second || pick.score - second.score >= 3) {
    return { candidate: pick.item, confidence: 'low', reason: '搜索结果明显领先，但标题未完全匹配' };
  }
  return { candidate: pick.item, confidence: 'low', reason: '存在多个相近候选，需要人工确认' };
}

function score(item: TmdbSearchResult, work: LibraryWork) {
  const titles = [work.title, work.originalTitle ?? ''].map(normalizeTitle).filter(Boolean);
  const itemTitles = [item.title, item.originalTitle ?? ''].map(normalizeTitle).filter(Boolean);
  const titleEqual = titles.some((title) => itemTitles.includes(title));
  let value = 0;
  if (titleEqual) value += 3;
  else if (titles.some((title) => title.length >= 2 && itemTitles.some((it) => it.includes(title) || title.includes(it)))) value += 1;
  let yearEqual = false;
  if (work.year && item.year) {
    const diff = Math.abs(Number(work.year) - Number(item.year));
    if (diff === 0) { value += 2; yearEqual = true; }
    else if (diff === 1) value += 1;
    else value -= 1;
  }
  if (item.mediaType === work.mediaType) value += 1;
  return { item, score: value, titleEqual, yearEqual };
}

export function normalizeTitle(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[\s._\-:：·'"“”‘’()（）\[\]【】]/g, '');
}
