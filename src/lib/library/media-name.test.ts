import { describe, expect, it } from 'vitest';
import { buildGroupKey, parseMediaName } from './media-name';

describe('parseMediaName', () => {
  it('groups TV episodes by title', () => {
    expect(parseMediaName('Silo.S01E03.2160p.WEB-DL.mkv')).toMatchObject({
      title: 'Silo', mediaType: 'tv', season: 1, episode: 3,
    });
  });

  it('uses a series folder for episode-only filenames', () => {
    expect(parseMediaName('S01E67.strm','遮天')).toMatchObject({
      title: '遮天', mediaType: 'tv', season: 1, episode: 67,
    });
    expect(parseMediaName('S01E66 2160p WEB DL H265 AAC-BestWEB.strm','遮天')).toMatchObject({
      title: '遮天', mediaType: 'tv', season: 1, episode: 66,
    });
  });

  it('extracts a movie year', () => {
    expect(parseMediaName('Dune.Part.Two.2024.2160p.BluRay.mkv')).toMatchObject({
      title: 'Dune Part Two', year: '2024', mediaType: 'movie',
    });
  });

  it('removes common Chinese release noise', () => {
    expect(parseMediaName('探灵档案 HD高清1280国语中字.strm').title).toBe('探灵档案');
  });

  it('removes known watermark-style prefixes without losing bilingual titles', () => {
    expect(parseMediaName('魅力社989pa com-古惑仔6之胜者为王 Young and Dangerous 6.strm').title)
      .toBe('古惑仔6之胜者为王 Young and Dangerous 6');
  });

  it('uses a meaningful movie folder when filename is only release noise', () => {
    expect(parseMediaName('4K60帧 1.strm','流浪地球2').title).toBe('流浪地球2');
  });

  it('normalizes group keys', () => {
    expect(buildGroupKey('movie','Dune.Part Two','2024'))
      .toBe(buildGroupKey('movie','dune part-two','2024'));
  });
});
