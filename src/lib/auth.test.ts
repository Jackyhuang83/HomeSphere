import crypto from 'node:crypto';
import { afterEach, beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { SESSION_COOKIE, checkPassword, checkRateLimit, clearRateLimit, sessionFromCookieHeader, signSession, verifySession } from './auth';

const TEST_PASSWORD = 'test-password-123';

beforeAll(() => {
  process.env.PASSWORD = TEST_PASSWORD;
});

afterAll(() => {
  delete process.env.PASSWORD;
});

describe('signSession / verifySession', () => {
  it('freshly 签发的会话 token 校验通过，TTL 为 30 天', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const { token } = signSession();
    vi.setSystemTime(new Date('2026-01-30T23:59:59Z'));
    expect(verifySession(token)).toBe(true);
    vi.setSystemTime(new Date('2026-01-31T00:00:01Z'));
    expect(verifySession(token)).toBe(false);
    vi.useRealTimers();
  });

  it('篡改 payload 被拒绝', () => {
    const { token } = signSession();
    const sig = token.slice(token.lastIndexOf('.') + 1);
    const forged = `${String(Date.now() + 60 * 24 * 3600 * 1000)}.${sig}`;
    expect(verifySession(forged)).toBe(false);
  });

  it('用错误派生密钥伪造签名无法通过', () => {
    const payload = String(Date.now() + 60_000);
    const naiveSecret = crypto.createHash('sha256').update(TEST_PASSWORD).digest('hex');
    const naive = crypto.createHmac('sha256', naiveSecret).update(payload).digest('hex');
    expect(verifySession(`${payload}.${naive}`)).toBe(false);
  });

  it('格式非法的 token 一律拒绝', () => {
    expect(verifySession(undefined)).toBe(false);
    expect(verifySession('')).toBe(false);
    expect(verifySession('no-dot-token')).toBe(false);
    expect(verifySession('.sig')).toBe(false);
    expect(verifySession('abc.not-hex-sig')).toBe(false);
  });
});

describe('checkPassword', () => {
  it('正确密码通过', () => expect(checkPassword(TEST_PASSWORD)).toBe(true));
  it('错误密码拒绝', () => {
    expect(checkPassword('wrong')).toBe(false);
    expect(checkPassword('')).toBe(false);
  });
  it('未配置 PASSWORD 时拒绝', () => {
    const saved = process.env.PASSWORD;
    delete process.env.PASSWORD;
    try { expect(checkPassword(TEST_PASSWORD)).toBe(false); }
    finally { process.env.PASSWORD = saved; }
  });
});

describe('sessionFromCookieHeader', () => {
  it('含有效会话的 Cookie 头通过', () => {
    const { token } = signSession();
    expect(sessionFromCookieHeader(`${SESSION_COOKIE}=${token}`)).toBe(true);
    expect(sessionFromCookieHeader(`other=1; ${SESSION_COOKIE}=${token}; x=2`)).toBe(true);
  });
  it('缺失/篡改/无关 Cookie 拒绝', () => {
    const { token } = signSession();
    expect(sessionFromCookieHeader(null)).toBe(false);
    expect(sessionFromCookieHeader('')).toBe(false);
    expect(sessionFromCookieHeader('other=1')).toBe(false);
    expect(sessionFromCookieHeader(`${SESSION_COOKIE}=${token}x`)).toBe(false);
  });
});

describe('checkRateLimit', () => {
  afterEach(() => {
    clearRateLimit('1.2.3.4');
    clearRateLimit('5.6.7.8');
  });
  it('窗口内允许 10 次后拒绝', () => {
    for (let i = 0; i < 10; i++) expect(checkRateLimit('1.2.3.4')).toBe(true);
    expect(checkRateLimit('1.2.3.4')).toBe(false);
  });
  it('不同 IP 互不影响', () => {
    expect(checkRateLimit('5.6.7.8')).toBe(true);
    for (let i = 0; i < 11; i++) checkRateLimit('1.2.3.4');
    expect(checkRateLimit('5.6.7.8')).toBe(true);
  });
  it('clearRateLimit 解除限制', () => {
    for (let i = 0; i < 11; i++) checkRateLimit('1.2.3.4');
    expect(checkRateLimit('1.2.3.4')).toBe(false);
    clearRateLimit('1.2.3.4');
    expect(checkRateLimit('1.2.3.4')).toBe(true);
  });
});
