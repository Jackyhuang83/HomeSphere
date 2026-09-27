import * as http2 from 'node:http2';

const SERVICE = '/clouddrive.CloudDriveFileSrv/GetDownloadUrlPath';
const MAX_GRPC_BODY = 1024 * 1024;

export interface Cd2DownloadUrlInfo {
  downloadUrlPath?: string;
  expiresIn?: number;
  directUrl?: string;
  userAgent?: string;
  additionalHeaders: Record<string, string>;
}

export interface Cd2ClientConfig {
  endpoint: string;
  token: string;
  timeoutMs?: number;
}

export function cd2ConfigFromEnv(): Cd2ClientConfig | null {
  const endpoint = process.env.HOMESPHERE_CD2_ENDPOINT?.trim();
  const token = process.env.HOMESPHERE_CD2_TOKEN?.trim();
  if (!endpoint || !token) return null;
  return {
    endpoint,
    token,
    timeoutMs: intEnv('HOMESPHERE_CD2_TIMEOUT_MS', 8000, 1000, 60000),
  };
}

export function normalizeCd2Endpoint(value: string): URL {
  const raw = value.trim();
  if (!raw) throw new Error('CloudDrive2 endpoint 不能为空');
  const url = new URL(raw.includes('://') ? raw : `http://${raw}`);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('CloudDrive2 endpoint 仅支持 http/https');
  }
  if (url.username || url.password) throw new Error('CloudDrive2 endpoint 不能包含用户名/密码');
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new Error('CloudDrive2 endpoint 只能填写 scheme://host:port，不要附加路径或查询参数');
  }
  return url;
}

export async function getCd2DownloadUrlInfo(
  remotePath: string,
  config: Cd2ClientConfig,
  signal?: AbortSignal
): Promise<Cd2DownloadUrlInfo> {
  const path = normalizeRemotePath(remotePath);
  const endpoint = normalizeCd2Endpoint(config.endpoint);
  const message = encodeGetDownloadUrlPathRequest(path);
  const payload = frameGrpcMessage(message);
  const response = await grpcUnary(endpoint, SERVICE, config.token, payload, config.timeoutMs ?? 8000, signal);
  return decodeDownloadUrlPathInfo(response);
}

export function normalizeRemotePath(value: string): string {
  const input = value.trim().replace(/\\/g, '/');
  if (!input.startsWith('/')) throw new Error('CloudDrive2 文件路径必须以 / 开头');
  if (input.length > 4096) throw new Error('CloudDrive2 文件路径过长');
  const parts = input.split('/').filter(Boolean);
  if (parts.some((part) => part === '.' || part === '..')) throw new Error('CloudDrive2 文件路径不能包含 . 或 ..');
  return '/' + parts.join('/');
}

export function encodeGetDownloadUrlPathRequest(path: string): Buffer {
  return Buffer.concat([
    encodeStringField(1, normalizeRemotePath(path)),
    encodeBoolField(4, true),
  ]);
}

export function decodeDownloadUrlPathInfo(message: Buffer): Cd2DownloadUrlInfo {
  const result: Cd2DownloadUrlInfo = { additionalHeaders: {} };
  let offset = 0;
  while (offset < message.length) {
    const key = readVarint(message, offset);
    offset = key.next;
    const field = Number(key.value >> 3n);
    const wire = Number(key.value & 7n);

    if (wire === 2) {
      const len = readVarint(message, offset);
      offset = len.next;
      const size = safeLength(len.value);
      if (offset + size > message.length) throw new Error('CloudDrive2 protobuf 响应截断');
      const bytes = message.subarray(offset, offset + size);
      offset += size;
      if (field === 1) result.downloadUrlPath = bytes.toString('utf8');
      else if (field === 3) result.directUrl = bytes.toString('utf8');
      else if (field === 4) result.userAgent = bytes.toString('utf8');
      else if (field === 5) {
        const pair = decodeStringMapEntry(bytes);
        if (pair.key) result.additionalHeaders[pair.key] = pair.value;
      }
      continue;
    }

    if (wire === 0) {
      const value = readVarint(message, offset);
      offset = value.next;
      if (field === 2) result.expiresIn = Number(value.value);
      continue;
    }

    offset = skipWire(message, offset, wire);
  }
  return result;
}

export function frameGrpcMessage(message: Buffer): Buffer {
  const frame = Buffer.allocUnsafe(5 + message.length);
  frame[0] = 0;
  frame.writeUInt32BE(message.length, 1);
  message.copy(frame, 5);
  return frame;
}

export function unframeGrpcMessage(body: Buffer): Buffer {
  if (body.length < 5) throw new Error('CloudDrive2 gRPC 响应过短');
  const compressed = body[0];
  if (compressed !== 0) throw new Error('CloudDrive2 返回了不支持的压缩 gRPC 消息');
  const length = body.readUInt32BE(1);
  if (length > MAX_GRPC_BODY || body.length < 5 + length) throw new Error('CloudDrive2 gRPC 响应长度无效');
  return body.subarray(5, 5 + length);
}

async function grpcUnary(
  endpoint: URL,
  method: string,
  token: string,
  payload: Buffer,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<Buffer> {
  signal?.throwIfAborted();

  return await new Promise<Buffer>((resolve, reject) => {
    const client = http2.connect(endpoint.origin);
    let settled = false;
    let httpStatus = 0;
    let grpcStatus = '';
    let grpcMessage = '';
    const chunks: Buffer[] = [];
    let size = 0;

    const finish = (error?: Error, value?: Buffer) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', onAbort);
      try { client.close(); } catch {}
      if (error) reject(error);
      else resolve(value!);
    };

    const onAbort = () => {
      try { stream.close(http2.constants.NGHTTP2_CANCEL); } catch {}
      finish(signal?.reason instanceof Error ? signal.reason : new Error('CloudDrive2 请求已取消'));
    };

    client.once('error', (error) => finish(new Error(`CloudDrive2 连接失败：${error.message}`)));

    const stream = client.request({
      ':method': 'POST',
      ':path': method,
      'content-type': 'application/grpc',
      'te': 'trailers',
      'authorization': `Bearer ${token}`,
      'grpc-accept-encoding': 'identity',
      'user-agent': 'HomeSphere-CD2-Probe/0.1',
    });

    stream.setTimeout(timeoutMs, () => {
      try { stream.close(http2.constants.NGHTTP2_CANCEL); } catch {}
      finish(new Error(`CloudDrive2 gRPC 请求超时（${timeoutMs}ms）`));
    });

    stream.on('response', (headers) => {
      httpStatus = Number(headers[':status'] || 0);
      if (headers['grpc-status'] != null) grpcStatus = String(headers['grpc-status']);
      if (headers['grpc-message'] != null) grpcMessage = decodeGrpcMessage(String(headers['grpc-message']));
    });
    stream.on('trailers', (headers) => {
      if (headers['grpc-status'] != null) grpcStatus = String(headers['grpc-status']);
      if (headers['grpc-message'] != null) grpcMessage = decodeGrpcMessage(String(headers['grpc-message']));
    });
    stream.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_GRPC_BODY + 5) {
        try { stream.close(http2.constants.NGHTTP2_CANCEL); } catch {}
        finish(new Error('CloudDrive2 gRPC 响应过大'));
        return;
      }
      chunks.push(Buffer.from(chunk));
    });
    stream.once('error', (error) => finish(new Error(`CloudDrive2 gRPC 失败：${error.message}`)));
    stream.once('end', () => {
      if (httpStatus && httpStatus !== 200) {
        finish(new Error(`CloudDrive2 HTTP ${httpStatus}`));
        return;
      }
      if (grpcStatus && grpcStatus !== '0') {
        finish(new Error(`CloudDrive2 gRPC status=${grpcStatus}${grpcMessage ? `：${grpcMessage}` : ''}`));
        return;
      }
      try {
        finish(undefined, unframeGrpcMessage(Buffer.concat(chunks)));
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    });

    if (signal) {
      if (signal.aborted) return onAbort();
      signal.addEventListener('abort', onAbort, { once: true });
    }

    stream.end(payload);
  });
}

function encodeStringField(field: number, value: string): Buffer {
  const bytes = Buffer.from(value, 'utf8');
  return Buffer.concat([encodeVarint(BigInt((field << 3) | 2)), encodeVarint(BigInt(bytes.length)), bytes]);
}

function encodeBoolField(field: number, value: boolean): Buffer {
  if (!value) return Buffer.alloc(0);
  return Buffer.concat([encodeVarint(BigInt(field << 3)), Buffer.from([1])]);
}

function encodeVarint(input: bigint): Buffer {
  let value = input;
  const bytes: number[] = [];
  do {
    let byte = Number(value & 0x7fn);
    value >>= 7n;
    if (value) byte |= 0x80;
    bytes.push(byte);
  } while (value);
  return Buffer.from(bytes);
}

function readVarint(buffer: Buffer, start: number): { value: bigint; next: number } {
  let value = 0n;
  let shift = 0n;
  let offset = start;
  while (offset < buffer.length && shift <= 63n) {
    const byte = buffer[offset++];
    value |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return { value, next: offset };
    shift += 7n;
  }
  throw new Error('CloudDrive2 protobuf varint 无效');
}

function decodeStringMapEntry(buffer: Buffer): { key: string; value: string } {
  let key = '';
  let value = '';
  let offset = 0;
  while (offset < buffer.length) {
    const tag = readVarint(buffer, offset);
    offset = tag.next;
    const field = Number(tag.value >> 3n);
    const wire = Number(tag.value & 7n);
    if (wire !== 2) {
      offset = skipWire(buffer, offset, wire);
      continue;
    }
    const len = readVarint(buffer, offset);
    offset = len.next;
    const size = safeLength(len.value);
    if (offset + size > buffer.length) throw new Error('CloudDrive2 header map 截断');
    const text = buffer.subarray(offset, offset + size).toString('utf8');
    offset += size;
    if (field === 1) key = text;
    else if (field === 2) value = text;
  }
  return { key, value };
}

function skipWire(buffer: Buffer, offset: number, wire: number): number {
  if (wire === 0) return readVarint(buffer, offset).next;
  if (wire === 1) return offset + 8;
  if (wire === 2) {
    const len = readVarint(buffer, offset);
    return len.next + safeLength(len.value);
  }
  if (wire === 5) return offset + 4;
  throw new Error(`CloudDrive2 protobuf wire type 不支持：${wire}`);
}

function safeLength(value: bigint): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0 || n > MAX_GRPC_BODY) throw new Error('CloudDrive2 protobuf 长度无效');
  return n;
}

function decodeGrpcMessage(value: string): string {
  try { return decodeURIComponent(value); } catch { return value; }
}

function intEnv(name: string, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}
