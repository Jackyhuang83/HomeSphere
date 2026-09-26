'use client';

import { useAuth } from '@/components/auth';

export function SiteFooter() {
  const { version } = useAuth();
  return (
    <footer className="border-t border-line py-4">
      <p className="text-center text-xs text-faint">
        HomeSphere{version ? ` v${version}` : ''} · 基于 LibreTV · AGPL-3.0
      </p>
    </footer>
  );
}
