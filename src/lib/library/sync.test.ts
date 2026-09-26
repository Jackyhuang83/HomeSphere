import { describe, expect, it } from 'vitest';
import { buildGroupKey } from './media-name';

describe('buildGroupKey', () => {
  it('同一剧集不同集号归到同一作品', () => {
    expect(buildGroupKey('tv', 'Silo', '2023')).toBe(buildGroupKey('tv', 'Silo', '2023'));
  });

  it('电影与剧集不会混为同一作品', () => {
    expect(buildGroupKey('movie', 'Silo', '2023')).not.toBe(buildGroupKey('tv', 'Silo', '2023'));
  });

  it('标题大小写和常见分隔符归一化', () => {
    expect(buildGroupKey('movie', 'Dune.Part Two', '2024')).toBe(buildGroupKey('movie', 'dune part-two', '2024'));
  });
});
