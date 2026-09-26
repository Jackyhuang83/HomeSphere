'use client';

import Link from 'next/link';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { ThemeToggle } from './theme';
import { SettingsDrawer } from './settings-drawer';
import { Icon } from './icon';
import { useAuth } from './auth';
import { cn } from '@/lib/utils';

export function Header() {
  const pathname = usePathname();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { verified, logout } = useAuth();

  return (
    <>
      <header className="sticky top-0 z-40 bg-surface/90 backdrop-blur border-b border-line">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2 shrink-0" aria-label="HomeSphere 首页">
            <img src="/icons/icon-512.png" alt="HomeSphere" className="w-7 h-7 rounded-lg" />
            <span className="hidden sm:inline text-sm font-semibold text-content">HomeSphere</span>
          </Link>
          <nav className="flex items-center gap-1 ml-auto">
            <HeaderLink href="/" active={pathname === '/'}>发现</HeaderLink>
            <HeaderLink href="/live" active={pathname === '/live'}>直播</HeaderLink>
            <ThemeToggle />
            <button className="p-2 rounded-md text-muted hover:text-content hover:bg-hover" onClick={() => setSettingsOpen(true)} aria-label="设置">
              <Icon name="gear" />
            </button>
            {verified && (
              <button className="hidden sm:inline-flex px-2.5 py-1.5 rounded-md text-sm text-muted hover:text-content hover:bg-hover" onClick={() => void logout()}>
                退出
              </button>
            )}
          </nav>
        </div>
      </header>
      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}

function HeaderLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return <Link href={href} className={cn('px-2.5 py-1.5 rounded-md text-sm', active ? 'text-content bg-hover' : 'text-muted hover:text-content')}>{children}</Link>;
}
