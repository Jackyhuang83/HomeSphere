import { describe, expect, it } from 'vitest';
import { __select115StreamForTest } from './115-hls';

describe('115 HLS stream selection',()=>{
  it('prefers a transcoded stream over definition=100 original',()=>{
    const selected=__select115StreamForTest([
      {url:'https://example.invalid/original.m3u8',width:3840,height:2160,definition:100,title:'original'},
      {url:'https://example.invalid/1080.m3u8',width:1920,height:1080,definition:4,title:'1080p'},
      {url:'https://example.invalid/720.m3u8',width:1280,height:720,definition:3,title:'720p'},
    ]);
    expect(selected.title).toBe('1080p');
  });

  it('uses original only when no transcoded stream exists',()=>{
    const selected=__select115StreamForTest([
      {url:'https://example.invalid/original.m3u8',width:3840,height:2160,definition:100,title:'original'},
    ]);
    expect(selected.title).toBe('original');
  });
});
