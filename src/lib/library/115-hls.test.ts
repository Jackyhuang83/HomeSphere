import { describe, expect, it } from 'vitest';
import { __rewrite115MasterForTest, __select115StreamForTest } from './115-hls';

describe('115 HLS stream selection',()=>{
  it('prefers a transcoded stream over definition=100 original',()=>{
    const selected=__select115StreamForTest([
      {url:'https://example.invalid/original.m3u8',width:3840,height:2160,definition:100,title:'original'},
      {url:'https://example.invalid/1080.m3u8',width:1920,height:1080,definition:4,title:'1080p'},
      {url:'https://example.invalid/720.m3u8',width:1280,height:720,definition:3,title:'720p'},
    ]);
    expect(selected.title).toBe('1080p');
  });

  it('prefers 720p transcoding on Windows browsers',()=>{
    const selected=__select115StreamForTest([
      {url:'https://example.invalid/1080.m3u8',width:1920,height:1080,definition:4,title:'1080p'},
      {url:'https://example.invalid/720.m3u8',width:1280,height:720,definition:3,title:'720p'},
      {url:'https://example.invalid/480.m3u8',width:854,height:480,definition:2,title:'480p'},
    ],'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/154.0.0.0 Safari/537.36');
    expect(selected.title).toBe('720p');
  });

  it('uses original only when no transcoded stream exists',()=>{
    const selected=__select115StreamForTest([
      {url:'https://example.invalid/original.m3u8',width:3840,height:2160,definition:100,title:'original'},
    ]);
    expect(selected.title).toBe('original');
  });

  it('preserves separate audio and video playlists in a master manifest',()=>{
    const master=[
      '#EXTM3U',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="AAC",DEFAULT=YES,AUTOSELECT=YES,URI="audio/index.m3u8"',
      '#EXT-X-STREAM-INF:BANDWIDTH=4500000,RESOLUTION=1920x1080,AUDIO="audio"',
      'video/index.m3u8',
      '',
    ].join('\n');

    const rewritten=__rewrite115MasterForTest(master,'https://cpats01.115.com/path/master.m3u8');

    expect(rewritten).toContain('URI="https://cpats01.115.com/path/audio/index.m3u8"');
    expect(rewritten).toContain('https://cpats01.115.com/path/video/index.m3u8');
    expect(rewritten).toContain('AUDIO="audio"');
  });
});
