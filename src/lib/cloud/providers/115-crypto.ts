/**
 * 115 download-link crypto adapted from OpenStrm (MIT).
 * Upstream: https://github.com/indown/openStrm
 * See THIRD_PARTY_NOTICES.md.
 */

const G_KTS = new Uint8Array([
  0xf0,0xe5,0x69,0xae,0xbf,0xdc,0xbf,0x8a,0x1a,0x45,0xe8,0xbe,0x7d,0xa6,0x73,0xb8,
  0xde,0x8f,0xe7,0xc4,0x45,0xda,0x86,0xc4,0x9b,0x64,0x8b,0x14,0x6a,0xb4,0xf1,0xaa,
  0x38,0x01,0x35,0x9e,0x26,0x69,0x2c,0x86,0x00,0x6b,0x4f,0xa5,0x36,0x34,0x62,0xa6,
  0x2a,0x96,0x68,0x18,0xf2,0x4a,0xfd,0xbd,0x6b,0x97,0x8f,0x4d,0x8f,0x89,0x13,0xb7,
  0x6c,0x8e,0x93,0xed,0x0e,0x0d,0x48,0x3e,0xd7,0x2f,0x88,0xd8,0xfe,0xfe,0x7e,0x86,
  0x50,0x95,0x4f,0xd1,0xeb,0x83,0x26,0x34,0xdb,0x66,0x7b,0x9c,0x7e,0x9d,0x7a,0x81,
  0x32,0xea,0xb6,0x33,0xde,0x3a,0xa9,0x59,0x34,0x66,0x3b,0xaa,0xba,0x81,0x60,0x48,
  0xb9,0xd5,0x81,0x9c,0xf8,0x6c,0x84,0x77,0xff,0x54,0x78,0x26,0x5f,0xbe,0xe8,0x1e,
  0x36,0x9f,0x34,0x80,0x5c,0x45,0x2c,0x9b,0x76,0xd5,0x1b,0x8f,0xcc,0xc3,0xb8,0xf5,
]);

const RSA_E = BigInt('0x8686980c0f5a24c4b9d43020cd2c22703ff3f450756529058b1cf88f09b8602136477198a6e2683149659bd122c33592fdb5ad47944ad1ea4d36c6b172aad6338c3bb6ac6227502d010993ac967d1aef00f0c8e038de2e4d3bc2ec368af2e9f10a6f1eda4f7262f136420c07c331b871bf139f74f3010e3c4fe57df3afb71683');
const RSA_N = BigInt('0x10001');
const XOR_KEY = new Uint8Array([0x8d,0xa5,0xa5,0x8d]);
const XOR_KEY2 = new Uint8Array([0x78,0x06,0xad,0x4c,0x33,0x86,0x5d,0x18,0x4c,0x01,0x3f,0x46]);

export function encrypt115(data: string): string {
  const bytes = new TextEncoder().encode(data);
  const xorText = new Uint8Array(16 + bytes.length);
  xorText.set(xor(xor(bytes, XOR_KEY).reverse(), XOR_KEY2), 16);
  const out = new Uint8Array(Math.ceil(xorText.length / 117) * 128);
  let start = 0;
  for (const [l,r] of accStep(0, xorText.length, 117)) {
    out.set(toBytes(pow(padPkcs1V15(xorText.subarray(l,r)), RSA_N, RSA_E), 128), start);
    start += 128;
  }
  return Buffer.from(out).toString('base64');
}

export function decrypt115(cipherData: string): string {
  const cipher = new Uint8Array(Buffer.from(cipherData, 'base64'));
  const data: number[] = [];
  for (const [l,r] of accStep(0, cipher.length, 128)) {
    const p = pow(fromBytes(cipher.subarray(l,r)), RSA_N, RSA_E);
    const b = toBytes(p);
    data.push(...b.subarray(b.indexOf(0) + 1));
  }
  const all = new Uint8Array(data);
  const key = genKey(all.subarray(0,16), 12);
  const tmp = xor(all.subarray(16), key).reverse();
  return new TextDecoder().decode(xor(tmp, XOR_KEY));
}

function padPkcs1V15(message: Uint8Array): bigint {
  const buffer = new Uint8Array(128);
  buffer.fill(0x02, 1, 127 - message.length);
  buffer.set(message, 128 - message.length);
  return fromBytes(buffer);
}
function pow(base: bigint, exponent: bigint, modulus: bigint): bigint {
  if (modulus === 1n) return 0n;
  let result = 1n;
  base %= modulus;
  while (exponent) {
    if (exponent & 1n) result = (result * base) % modulus;
    exponent >>= 1n;
    base = (base * base) % modulus;
  }
  return result;
}
function genKey(randKey: Uint8Array, len: number): Uint8Array {
  const out = new Uint8Array(len);
  let length = len * (len - 1);
  let index = 0;
  for (let i=0;i<len;i++) {
    out[i] = G_KTS[length] ^ ((randKey[i] + G_KTS[index]) & 0xff);
    length -= len;
    index += len;
  }
  return out;
}
function xor(src: Uint8Array, key: Uint8Array): Uint8Array {
  const out = new Uint8Array(src.length);
  for (let i=0;i<src.length;i++) out[i] = src[i] ^ key[i % key.length];
  return out;
}
function fromBytes(bytes: Uint8Array): bigint {
  let value = 0n;
  for (const b of bytes) value = (value << 8n) | BigInt(b);
  return value;
}
function toBytes(value: bigint, length?: number): Uint8Array {
  const len = length ?? Math.ceil(value.toString(16).length / 2);
  const out = new Uint8Array(len);
  for (let i=len-1;i>=0;i--) { out[i] = Number(value & 0xffn); value >>= 8n; }
  return out;
}
function* accStep(start: number, stop: number, step: number): Generator<[number,number]> {
  for (let i=start+step;i<stop;i+=step) { yield [start,i]; start=i; }
  if (start !== stop) yield [start,stop];
}
