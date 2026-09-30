import path from 'node:path';
import type { MediaType } from './types';

const VIDEO_EXT = new Set(['.mp4','.mkv','.m4v','.mov','.avi','.ts','.m2ts','.webm','.flv']);
const NOISE = /\b(2160p|1080p|720p|4k|uhd|hdr10\+?|hdr|dv|dolby[ ._-]?vision|bluray|blu[ ._-]?ray|web[ ._-]?dl|webrip|remux|x26[45]|h26[45]|hevc|avc|aac|dts(?:-hd)?|truehd|atmos|10bit|8bit|60fps|50fps|24fps)\b/gi;
const CN_NOISE = /(?:HD)?高清(?:1280|1920|1080|720)?|(?:国语|粤语|国粤|双语)(?:中字|字幕)?|(?:简体|繁体|简繁|中英)?(?:中字|字幕)|60帧|50帧/gi;
const WATERMARK_PREFIX = /^(?:(?:魅力社[ ._-]*)?989pa[ ._-]*com|[\p{L}\p{N}]{2,24}[ ._-]+(?:com|net|org|cn|tv))[ ._-]*/iu;

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

export function parseMediaName(filename: string, contextTitle?: string): ParsedMediaName {
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

  let rawTitle = stem;
  if (episodeMatch?.index != null) rawTitle = rawTitle.slice(0, episodeMatch.index);
  else if (cnMatch?.index != null) rawTitle = rawTitle.slice(0, cnMatch.index);
  if (yearMatch?.index != null && yearMatch.index > 0) rawTitle = rawTitle.slice(0, Math.min(rawTitle.length, yearMatch.index));

  let title = cleanMediaTitle(rawTitle);
  const context = contextTitle ? cleanMediaTitle(contextTitle) : '';

  // TV STRM is often stored as Show/Season/S01E01.strm. When a meaningful
  // show-folder hint is available, it is more stable than release filenames
  // and prevents one series from being split into dozens of works.
  if (mediaType === 'tv' && context) title = context;

  // A movie filename can occasionally be nothing but a release marker such as
  // "4K60帧 1". Use its meaningful parent folder only as a last resort.
  if ((!title || isWeakTitle(title)) && context) title = context;

  if (!title) title = cleanMediaTitle(stem) || stem.trim();
  return { title, year, mediaType, season, episode };
}

export function cleanMediaTitle(value: string): string {
  return value
    .replace(WATERMARK_PREFIX, '')
    .replace(/[\[【(（][^\]】)）]{0,60}[\]】)）]/g, ' ')
    .replace(NOISE, ' ')
    .replace(CN_NOISE, ' ')
    .replace(/[._]+/g, ' ')
    .replace(/\s*[-–—]+\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isWeakTitle(value: string): boolean {
  const compact = value.replace(/\s+/g, '');
  if (!compact || compact.length < 2) return true;
  if (/^S\d{1,2}E\d{1,3}$/i.test(compact)) return true;
  if (/^\d+$/.test(compact)) return true;
  return false;
}

export function buildGroupKey(mediaType: MediaType, title: string, year?: string): string {
  const normalized = title.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  return `${mediaType}:${normalized}:${year || ''}`;
}
