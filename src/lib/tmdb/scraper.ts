import { getWork, listWorksForScrape, listWorksMissingMetadata, mergeDuplicateTmdbWorks, setWorkMatch, setWorkMetadata, setWorkScrapeState } from '@/lib/library/db';
import { getTmdbDetails, tmdbConfigured } from './client';
import type { MediaRegion } from '@/lib/library/types';
import { matchWork } from './matcher';

export interface ScrapeSummary {requested:number;matched:number;review:number;failed:number;merged:number;regionsUpdated:number;}

export async function scrapePendingWorks(limit=50,signal?:AbortSignal):Promise<ScrapeSummary>{
  if(!tmdbConfigured()) throw new Error('未配置 TMDB_API_TOKEN');
  const works=listWorksForScrape(limit);
  const summary:ScrapeSummary={requested:works.length,matched:0,review:0,failed:0,merged:0,regionsUpdated:0};
  for(const work of works){
    signal?.throwIfAborted();
    try{
      const result=await matchWork(work,signal);
      if(!result.candidate){setWorkScrapeState(work.id,'failed',result.reason);summary.failed++;continue;}
      if(result.confidence==='low'){setWorkScrapeState(work.id,'review',result.reason);summary.review++;continue;}
      const confidence:'high'|'medium'=result.confidence==='high'?'high':'medium';
      const details=await getTmdbDetails(result.candidate.mediaType,result.candidate.id,signal)||result.candidate;
      setWorkMatch(work.id,{
        title:details.title||work.title,originalTitle:details.originalTitle,year:details.year||work.year,
        mediaType:details.mediaType,tmdbId:details.id,posterUrl:details.posterUrl,backdropUrl:details.backdropUrl,
        overview:details.overview,region:classifyRegion(details.countryCodes),isAnimation:details.isAnimation,
        scrapeStatus:'matched',matchConfidence:confidence,manualMatch:false,
      });
      summary.matched++;
    }catch(error){
      setWorkScrapeState(work.id,'failed',error instanceof Error?error.message:String(error));
      summary.failed++;
    }
  }
  summary.merged=mergeDuplicateTmdbWorks();

  const missingMetadata=listWorksMissingMetadata(100);
  for(const work of missingMetadata){
    signal?.throwIfAborted();
    if(!work.tmdbId)continue;
    try{
      const details=await getTmdbDetails(work.mediaType,work.tmdbId,signal);
      const region=classifyRegion(details?.countryCodes);
      setWorkMetadata(work.id,region,details?.isAnimation);
      if(region)summary.regionsUpdated++;
    }catch{}
  }

  return summary;
}

export async function applyManualMatch(workId:string,mediaType:'movie'|'tv',tmdbId:number,signal?:AbortSignal):Promise<void>{
  const work=getWork(workId);
  if(!work) throw new Error('作品不存在');
  if(!tmdbConfigured()) throw new Error('未配置 TMDB_API_TOKEN');
  const details=await getTmdbDetails(mediaType,tmdbId,signal);
  if(!details) throw new Error('TMDB 条目不存在');
  setWorkMatch(workId,{
    title:details.title||work.title,originalTitle:details.originalTitle,year:details.year||work.year,
    mediaType,tmdbId,posterUrl:details.posterUrl,backdropUrl:details.backdropUrl,overview:details.overview,
    region:classifyRegion(details.countryCodes),isAnimation:details.isAnimation,
    scrapeStatus:'manual',matchConfidence:'high',manualMatch:true,
  });
}


export function classifyRegion(countryCodes?:string[]):MediaRegion|undefined{
  const codes=(countryCodes||[]).map(code=>code.toUpperCase());
  if(codes.some(code=>code==='HK'||code==='MO'||code==='TW'))return 'hmt';
  if(codes.includes('CN'))return 'mainland';
  if(codes.length)return 'overseas';
  return undefined;
}
