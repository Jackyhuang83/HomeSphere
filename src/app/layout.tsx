import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/components/providers';

export const metadata: Metadata = {
  title: {
    default: 'HomeSphere',
    template: '%s - HomeSphere',
  },
  description: '私人家庭影视门户：影视发现、IPTV，后续接入115私人片库。',
  manifest: '/manifest.webmanifest',
  robots: { index: false, follow: false, noarchive: true, nosnippet: true },
  icons: {
    icon: [{ url: '/icons/homesphere.svg?v=2', type: 'image/svg+xml' }],
    shortcut: ['/icons/homesphere.svg?v=2'],
    apple: [{ url: '/icons/homesphere.svg?v=2', type: 'image/svg+xml' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#0b101a',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <meta name="robots" content="noindex,nofollow,noarchive,nosnippet" />
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('homesphere-theme')||'dark';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})()",
          }}
        />
      </head>
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
