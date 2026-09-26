'use client';

import Link from 'next/link';
import { Header } from '@/components/header';
import { RecommendSection } from '@/components/douban-section';
import { SiteFooter } from '@/components/site-footer';

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6">
        <section className="mb-7">
          <h1 className="text-3xl sm:text-4xl font-bold text-content">影视发现</h1>
          <p className="text-sm text-muted mt-2">
            看榜单发现新片；HomeSphere 会自动标出“已入库 / 未入库”，已入库可直接打开 <Link href="/library" className="text-accent hover:underline">我的片库</Link>。
          </p>
        </section>
        <RecommendSection />
      </main>
      <SiteFooter />
    </div>
  );
}
