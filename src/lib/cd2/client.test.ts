import { describe, expect, it } from 'vitest';
import {
  decodeDownloadUrlPathInfo,
  encodeGetDownloadUrlPathRequest,
  frameGrpcMessage,
  normalizeCd2Endpoint,
  unframeGrpcMessage,
} from './client';

function v(value:number):Buffer {
  const bytes:number[]=[];
  let n=value;
  do {
    let b=n & 0x7f;
    n >>>= 7;
    if(n) b|=0x80;
    bytes.push(b);
  } while(n);
  return Buffer.from(bytes);
}
function s(field:number,value:string):Buffer {
  const b=Buffer.from(value);
  return Buffer.concat([v((field<<3)|2),v(b.length),b]);
}
function n(field:number,value:number):Buffer {
  return Buffer.concat([v(field<<3),v(value)]);
}
function mapEntry(key:string,value:string):Buffer {
  const body=Buffer.concat([s(1,key),s(2,value)]);
  return Buffer.concat([v((5<<3)|2),v(body.length),body]);
}

describe('CloudDrive2 minimal gRPC codec',()=>{
  it('encodes GetDownloadUrlPath with path and get_direct_url=true',()=>{
    const encoded=encodeGetDownloadUrlPathRequest('/115open/Movies/Test.mp4');
    expect(encoded.includes(Buffer.from('/115open/Movies/Test.mp4'))).toBe(true);
    expect(encoded.subarray(-2)).toEqual(Buffer.from([0x20,0x01]));
  });

  it('decodes direct URL metadata without exposing a full proto dependency',()=>{
    const message=Buffer.concat([
      s(1,'/static/x?token=hidden'),
      n(2,3000),
      s(3,'https://cdn.example.com/video.mp4?token=secret'),
      s(4,'Safari-UA'),
      mapEntry('Referer','https://example.com/'),
      mapEntry('X-Test','1'),
    ]);
    expect(decodeDownloadUrlPathInfo(message)).toEqual({
      downloadUrlPath:'/static/x?token=hidden',
      expiresIn:3000,
      directUrl:'https://cdn.example.com/video.mp4?token=secret',
      userAgent:'Safari-UA',
      additionalHeaders:{Referer:'https://example.com/','X-Test':'1'},
    });
  });

  it('frames and unframes standard unary gRPC messages',()=>{
    const message=Buffer.from('abc');
    expect(unframeGrpcMessage(frameGrpcMessage(message))).toEqual(message);
  });

  it('only accepts a bare http(s) CD2 endpoint',()=>{
    expect(normalizeCd2Endpoint('clouddrive:19798').toString()).toBe('http://clouddrive:19798/');
    expect(()=>normalizeCd2Endpoint('ftp://clouddrive:19798')).toThrow();
    expect(()=>normalizeCd2Endpoint('http://clouddrive:19798/dav')).toThrow();
  });
});
