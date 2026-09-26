import type { MediaType } from '@/lib/library/types';
import { SerialRateLimiter } from '@/lib/cloud/rate-limit';

const API_BASE='https://api.themoviedb.org/3';
const IMAGE_BASE='https://image.tmdb.org/t/p';
const limiter=new SerialRateLimiter(250);

export interface TmdbItem {
  id:number;
  mediaType:MediaType;
  title:string;
  originalTitle?:string;
  year?:string;
  posterUrl?:string;
  backdropUrl?:string;
  overview?:string;
}

interface RawItem {
  id:number;
  title?:string;
  name?:string;
  original_title?:string;
  original_name?:string;
  release_date?:string;
  first_air_date?:string;
  poster_path?:string|null;
  backdrop_path?:string|null;
  overview?:string;
}

export function tmdbConfigured():boolean {
  return Boolean(process.env.TMDB_API_TOKEN?.trim());
}

export async function searchTmdb(query:string,mediaType:MediaType,year?:string,signal?:AbortSignal):Promise<TmdbItem[]> {
  const q=query.trim();
  if(!q) return [];
  const params:Record<string,string>={
    query:q,
    language:process.env.TMDB_LANGUAGE?.trim() || 'zh-CN',
    include_adult:'false',
    page:'1',
  };
  if(year) params[mediaType==='movie'?'year':'first_air_date_year']=year;
  const data=await tmdbFetch<{results?:RawItem[]}>(`/search/${mediaType}`,params,signal);
  return (data.results || []).slice(0,12).map(item=>mapItem(item,mediaType));
}

export async function getTmdbDetails(mediaType:MediaType,id:number,signal?:AbortSignal):Promise<TmdbItem|null> {
  try {
    const data=await tmdbFetch<RawItem>(`/${mediaType}/${id}`,{
      language:process.env.TMDB_LANGUAGE?.trim() || 'zh-CN',
    },signal);
    return mapItem(data,mediaType);
  } catch(error) {
    if(error instanceof Error && error.message==='TMDB HTTP 404') return null;
    throw error;
  }
}

async function tmdbFetch<T>(pathname:string,params:Record<string,string>,signal?:AbortSignal):Promise<T> {
  const token=process.env.TMDB_API_TOKEN?.trim();
  if(!token) throw new Error('未配置 TMDB_API_TOKEN');
  return limiter.schedule(async()=>{
    const url=new URL(`${API_BASE}${pathname}`);
    for(const [key,value] of Object.entries(params)) if(value) url.searchParams.set(key,value);
    const response=await fetch(url,{
      headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},
      cache:'no-store',
      signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000),
    });
    if(!response.ok) throw new Error(`TMDB HTTP ${response.status}`);
    return await response.json() as T;
  },signal);
}

function mapItem(raw:RawItem,mediaType:MediaType):TmdbItem {
  const date=raw.release_date || raw.first_air_date || '';
  return {
    id:raw.id,
    mediaType,
    title:raw.title || raw.name || '',
    originalTitle:raw.original_title || raw.original_name || undefined,
    year:date ? date.slice(0,4) : undefined,
    posterUrl:raw.poster_path ? `${IMAGE_BASE}/w500${raw.poster_path}` : undefined,
    backdropUrl:raw.backdrop_path ? `${IMAGE_BASE}/w780${raw.backdrop_path}` : undefined,
    overview:raw.overview || undefined,
  };
}
