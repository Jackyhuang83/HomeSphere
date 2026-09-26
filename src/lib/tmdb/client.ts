import type { MediaType } from '@/lib/library/types';

const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMAGE_BASE = 'https://image.tmdb.org/t/p';

export interface TmdbSearchResult {
  id: number;
  mediaType: MediaType;
  title: string;
  originalTitle?: string;
  year?: string;
  posterUrl?: string;
  backdropUrl?: string;
  overview?: string;
}

export interface TmdbDetails extends TmdbSearchResult {
  originalTitle: string;
  aliases: string[];
}

let lastRequestAt = 0;
let chain: Promise<void> = Promise.resolve();

async function throttle(signal?: AbortSignal): Promise<void> {
  const next = chain.then(async () => {
    signal?.throwIfAborted();
    const wait = lastRequestAt + 300 - Date.now();
    if (wait > 0) await new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, wait);
      signal?.addEventListener('abort', () => { clearTimeout(t); reject(signal.reason); }, { once: true });
    });
    lastRequestAt = Date.now();
  });
  chain = next.catch(() => {});
  return next;
}

function token(): string {
  const value = process.env.TMDB_API_TOKEN?.trim();
  if (!value) throw new Error('未配置 TMDB_API_TOKEN');
  return value;
}
function language(): string { return process.env.TMDB_LANGUAGE?.trim() || 'zh-CN'; }

async function tmdbFetch<T>(path: string, params: Record<string, string | number | boolean | undefined>, signal?: AbortSignal): Promise<T> {
  await throttle(signal);
  const url = new URL(`${TMDB_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token()}`, Accept: 'application/json' },
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`TMDB HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

interface RawSearch {
  id: number; media_type?: string; title?: string; name?: string; original_title?: string; original_name?: string;
  release_date?: string; first_air_date?: string; poster_path?: string | null; backdrop_path?: string | null; overview?: string;
}
interface RawDetails extends RawSearch {
  alternative_titles?: { titles?: Array<{ title: string }>; results?: Array<{ title: string }> };
  translations?: { translations?: Array<{ data?: { title?: string; name?: string } }> };
}

function image(path: string | null | undefined, size: 'w500' | 'w780' = 'w500'): string | undefined {
  return path ? `${IMAGE_BASE}/${size}${path}` : undefined;
}
function toSearch(raw: RawSearch, mediaType: MediaType): TmdbSearchResult {
  const date = raw.release_date || raw.first_air_date || '';
  return {
    id: raw.id, mediaType, title: raw.title || raw.name || '', originalTitle: raw.original_title || raw.original_name || undefined,
    year: date ? date.slice(0, 4) : undefined, posterUrl: image(raw.poster_path), backdropUrl: image(raw.backdrop_path, 'w780'),
    overview: raw.overview || undefined,
  };
}

export async function searchTmdb(query: string, mediaType: MediaType | 'multi' = 'multi', year?: string, signal?: AbortSignal): Promise<TmdbSearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  if (mediaType === 'multi') {
    const data = await tmdbFetch<{ results?: RawSearch[] }>('/search/multi', { query: q, language: language(), include_adult: false, page: 1 }, signal);
    return (data.results ?? []).filter((r) => r.media_type === 'movie' || r.media_type === 'tv').slice(0, 10)
      .map((r) => toSearch(r, r.media_type as MediaType));
  }
  const params: Record<string, string | number | boolean | undefined> = {
    query: q, language: language(), include_adult: false, page: 1,
  };
  if (year) params[mediaType === 'movie' ? 'year' : 'first_air_date_year'] = year;
  const data = await tmdbFetch<{ results?: RawSearch[] }>(`/search/${mediaType}`, params, signal);
  return (data.results ?? []).slice(0, 10).map((r) => toSearch(r, mediaType));
}

export async function getTmdbDetails(mediaType: MediaType, id: number, signal?: AbortSignal): Promise<TmdbDetails | null> {
  const append = mediaType === 'movie' ? 'alternative_titles,translations' : 'alternative_titles,translations';
  let raw: RawDetails;
  try {
    raw = await tmdbFetch<RawDetails>(`/${mediaType}/${id}`, {
      language: language(), append_to_response: append,
    }, signal);
  } catch (error) {
    if (error instanceof Error && error.message === 'TMDB HTTP 404') return null;
    throw error;
  }
  const alt = raw.alternative_titles?.titles ?? raw.alternative_titles?.results ?? [];
  const aliases = new Set<string>();
  for (const item of alt) if (item.title) aliases.add(item.title);
  for (const tr of raw.translations?.translations ?? []) {
    const value = tr.data?.title || tr.data?.name;
    if (value) aliases.add(value);
  }
  return {
    ...toSearch(raw, mediaType),
    originalTitle: raw.original_title || raw.original_name || '',
    aliases: [...aliases],
  };
}

export function tmdbConfigured(): boolean { return Boolean(process.env.TMDB_API_TOKEN?.trim()); }
