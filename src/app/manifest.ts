import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'HomeSphere',
    short_name: 'HomeSphere',
    description: '私人家庭影视门户',
    start_url: '/',
    display: 'standalone',
    background_color: '#111111',
    theme_color: '#0b101a',
    icons: [
      { src: '/icons/homesphere.svg?v=2', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icons/icon-192.png?v=2', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png?v=2', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ],
  };
}
