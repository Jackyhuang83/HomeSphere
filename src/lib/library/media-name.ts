import type { MediaType } from './types';
const VIDEO_EXT=/\.(mkv|mp4|m4v|mov|avi|ts|m2ts|webm|flv)$/i;const EPISODE=/(?:^|[. _-])S(\d{1,2})E(\d{1,3})(?:$|[. _-])/i;const YEAR=/(?:^|[. _[(\- ])((?:19|20)\d{2})(?:$|[. _)\]-])/;const NOISE=/\b(?:2160p|1080p|720p|4k|uhd|bluray|blu[- .]?ray|web[- .]?dl|webrip|hdr10\+?|hdr|dv|dolby[ .]?vision|remux|x26[45]|h\.?26[45]|hevc|avc|aac|ddp?\d(?:\.\d)?|dts(?:-hd)?|atmos)\b/gi;
export interface ParsedMediaName{title:string;year?:string;mediaType:MediaType;season?:number;episode?:number;}
export function parseMediaName(fileName:string):ParsedMediaName{const stem=fileName.replace(VIDEO_EXT,'');const episode=EPISODE.exec(stem);const year=YEAR.exec(stem)?.[1];const cutAt=[episode?.index,year?stem.indexOf(year):undefined].filter((v):v is number=>typeof v==='number'&&v>=0).reduce((min,v)=>Math.min(min,v),stem.length);const rawTitle=stem.slice(0,cutAt).replace(NOISE,' ');const title=rawTitle.replace(/[._]+/g,' ').replace(/\s*-\s*/g,' ').replace(/\s+/g,' ').trim()||stem;return{title,year,mediaType:episode?'tv':'movie',season:episode?Number(episode[1]):undefined,episode:episode?Number(episode[2]):undefined};}
export function isVideoFile(name:string){return VIDEO_EXT.test(name);}


export function buildGroupKey(mediaType: 'movie' | 'tv', title: string, year?: string): string {
  const normalized = title.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  return `${mediaType}:${normalized}:${year ?? ''}`;
}
