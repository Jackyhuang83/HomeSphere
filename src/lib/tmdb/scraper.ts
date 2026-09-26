import { getWork, listWorksForScrape, setWorkMatch, setWorkScrapeState } from '@/lib/library/db';
import { getTmdbDetails, tmdbConfigured } from './client';
import { matchWork } from './matcher';

export interface ScrapeSummary {
  requested: number;
  matched: number;
  review: number;
  failed: number;
  skipped: number;
}

export async function scrapePendingWorks(limit = 50, signal?: AbortSignal): Promise<ScrapeSummary> {
  if (!tmdbConfigured()) throw new Error('未配置 TMDB_API_TOKEN');
  const works = listWorksForScrape(limit);
  const summary: ScrapeSummary = { requested: works.length, matched: 0, review: 0, failed: 0, skipped: 0 };

  for (const work of works) {
    signal?.throwIfAborted();
    if (work.manualMatch) { summary.skipped++; continue; }
    try {
      const result = await matchWork(work, signal);
      if (!result.candidate) {
        setWorkScrapeState(work.id, 'failed', result.reason);
        summary.failed++;
        continue;
      }
      if (result.confidence === 'low') {
        setWorkScrapeState(work.id, 'review', result.reason);
        summary.review++;
        continue;
      }

      const details = await getTmdbDetails(result.candidate.mediaType, result.candidate.id, signal);
      const candidate = details ?? result.candidate;
      setWorkMatch(work.id, {
        title: candidate.title || work.title,
        originalTitle: candidate.originalTitle,
        year: candidate.year,
        mediaType: candidate.mediaType,
        tmdbId: candidate.id,
        posterUrl: candidate.posterUrl,
        backdropUrl: candidate.backdropUrl,
        overview: candidate.overview,
        scrapeStatus: 'matched',
        matchConfidence: result.confidence,
        scrapeError: undefined,
        manualMatch: false,
      });
      summary.matched++;
    } catch (error) {
      setWorkScrapeState(work.id, 'failed', error instanceof Error ? error.message : String(error));
      summary.failed++;
    }
  }
  return summary;
}

export async function applyManualMatch(workId: string, mediaType: 'movie' | 'tv', tmdbId: number, signal?: AbortSignal): Promise<void> {
  const work = getWork(workId);
  if (!work) throw new Error('作品不存在');
  if (!tmdbConfigured()) throw new Error('未配置 TMDB_API_TOKEN');
  const details = await getTmdbDetails(mediaType, tmdbId, signal);
  if (!details) throw new Error('TMDB 条目不存在');
  setWorkMatch(workId, {
    title: details.title || work.title,
    originalTitle: details.originalTitle,
    year: details.year,
    mediaType,
    tmdbId,
    posterUrl: details.posterUrl,
    backdropUrl: details.backdropUrl,
    overview: details.overview,
    scrapeStatus: 'manual',
    matchConfidence: 'high',
    manualMatch: true,
  });
}
