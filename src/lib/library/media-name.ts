import path from 'node:path';
import type { MediaType } from './types';

const VIDEO_EXT = new Set(['.mp4','.mkv','.m4v','.mov','.avi','.ts','.m2ts','.webm','.flv']);
const NOISE = /\b(2160p|1080p|720p|4k|uhd|hdr10\+?|hdr|dv|dolby[ ._-]?vision|bluray|blu[ ._-]?ray|web[ ._-]?dl|webrip|remux|x26[45]|h26[45]|hevc|avc|aac|dts(?:-hd)?|truehd|atmos|10bit|8bit)\b/gi;

export interface ParsedMediaName {
  title: string;
  year?: string;
  mediaType: MediaType;
  season?: number;
  episode?: number;
}

export function isVideoFile(filename: string): boolean {
  return VIDEO_EXT.has(path.extname(filename).toLowerCase());
}

export function parseMediaName(filename: string): ParsedMediaName {
  const stem = filename.replace(/\.[^.]+$/, '');
  const episodeMatch =
    /(?:^|[ ._\-])S(\d{1,2})[ ._\-]*E(\d{1,3})(?:\b|[ ._\-])/i.exec(stem) ||
    /(?:^|[ ._\-])(\d{1,2})x(\d{1,3})(?:\b|[ ._\-])/i.exec(stem);
  const cnMatch = /第\s*(\d{1,2})\s*季.*?第\s*(\d{1,3})\s*集/.exec(stem);

  const season = episodeMatch ? Number(episodeMatch[1]) : cnMatch ? Number(cnMatch[1]) : undefined;
  const episode = episodeMatch ? Number(episodeMatch[2]) : cnMatch ? Number(cnMatch[2]) : undefined;
  const mediaType: MediaType = episode !== undefined ? 'tv' : 'movie';

  const yearMatch = /(?:^|[^0-9])((?:19|20)\d{2})(?:[^0-9]|$)/.exec(stem);
  const year = yearMatch?.[1];

  let title = stem;
  if (episodeMatch?.index != null) title = title.slice(0, episodeMatch.index);
  else if (cnMatch?.index != null) title = title.slice(0, cnMatch.index);
  if (yearMatch?.index != null && yearMatch.index > 0) title = title.slice(0, Math.min(title.length, yearMatch.index));

  title = title
    .replace(/[\[【(（][^\]】)）]{0,40}[\]】)）]/g, ' ')
    .replace(NOISE, ' ')
    .replace(/[._]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[-–—]+$/g, '')
    .trim();

  if (!title) {
    title = stem.replace(/[._]+/g,' ').replace(/\s+/g,' ').trim();
  }
  return { title, year, mediaType, season, episode };
}

export function buildGroupKey(mediaType: MediaType, title: string, year?: string): string {
  const normalized = title.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  return `${mediaType}:${normalized}:${year || ''}`;
}
