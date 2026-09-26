import { describe, expect, it } from 'vitest';
import { buildGroupKey, parseMediaName } from './media-name';

describe('parseMediaName', () => {
  it('groups TV episodes by title', () => {
    expect(parseMediaName('Silo.S01E03.2160p.WEB-DL.mkv')).toMatchObject({
      title: 'Silo', mediaType: 'tv', season: 1, episode: 3,
    });
  });

  it('extracts a movie year', () => {
    expect(parseMediaName('Dune.Part.Two.2024.2160p.BluRay.mkv')).toMatchObject({
      title: 'Dune Part Two', year: '2024', mediaType: 'movie',
    });
  });

  it('normalizes group keys', () => {
    expect(buildGroupKey('movie','Dune.Part Two','2024'))
      .toBe(buildGroupKey('movie','dune part-two','2024'));
  });
});
