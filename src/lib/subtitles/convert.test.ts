import { describe, expect, it } from 'vitest';
import { assToVtt, srtToVtt } from './convert';

describe('subtitle conversion',()=>{
  it('converts SRT timestamps to WebVTT',()=>{
    const out=srtToVtt('1\r\n00:00:01,250 --> 00:00:03,500\r\n你好\r\n');
    expect(out).toContain('WEBVTT');
    expect(out).toContain('00:00:01.250 --> 00:00:03.500');
    expect(out).toContain('你好');
  });

  it('converts ASS dialogue and strips style tags',()=>{
    const out=assToVtt(`[Script Info]
Title: Demo
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.20,0:00:03.45,Default,,0,0,0,,{\\b1}Hello\\N世界
`);
    expect(out).toContain('00:00:01.200 --> 00:00:03.450');
    expect(out).toContain('Hello\n世界');
    expect(out).not.toContain('\\b1');
  });
});
