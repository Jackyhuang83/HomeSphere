export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function buildImageUrl(url: string | undefined): string | undefined {
  return url ? `/api/image/${encodeURIComponent(url)}?v=26` : undefined;
}

export function validateSourceUrl(url: string): boolean {
  return /^https?:\/\/.+/.test(url);
}

export function hostnameOf(url: string): string {
  try { return new URL(url).hostname; } catch { return url; }
}
