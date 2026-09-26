export function validateStrmPlaybackUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('STRM 仅允许 http/https 播放地址');
  }
  if (url.username || url.password) {
    throw new Error('STRM 播放地址不能包含 URL 用户名/密码');
  }

  const rawAllow = process.env.HOMESPHERE_STRM_ALLOWED_HOSTS?.trim();
  if (rawAllow) {
    const allowed = new Set(
      rawAllow.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean)
    );
    if (!allowed.has(url.hostname.toLowerCase())) {
      throw new Error(`STRM Bridge 主机不在允许列表：${url.hostname}`);
    }
  }

  return url.toString();
}
