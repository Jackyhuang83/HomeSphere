'use client';

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
          <p className="text-sm text-muted mt-2">这里只保留推荐榜单；私人115片库将在下一阶段接入。</p>
        </section>
        <RecommendSection />
      </main>
      <SiteFooter />
    </div>
  );
}
