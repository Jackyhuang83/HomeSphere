'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';

export default function PrivateWatchPage() {
  const params = useParams<{ id: string }>();
  const id = String(params.id ?? '');
  return <main className="min-h-screen bg-black text-white flex flex-col"><header className="h-14 px-4 flex items-center gap-3 bg-black/90 border-b border-white/10"><Link href="/library" className="text-sm text-white/80 hover:text-white">← 返回片库</Link><span className="text-sm text-white/50 ml-auto">115 直连播放</span></header><div className="flex-1 flex items-center justify-center"><video key={id} src={`/api/play/${encodeURIComponent(id)}`} controls autoPlay playsInline preload="metadata" className="w-full max-h-[calc(100vh-3.5rem)] bg-black" /></div></main>;
}
