'use client';

import { Header } from '@/components/header';
import { SiteFooter } from '@/components/site-footer';

export default function AboutPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-10 space-y-8">
        <section>
          <h1 className="text-xl font-bold text-content mb-3">关于 HomeSphere</h1>
          <p className="text-sm text-muted leading-relaxed">
            HomeSphere 是一个私人家庭影视门户。当前精简版只保留影视推荐与 IPTV，
            后续接入 115 私人影视库、TMDB 整理和 302 直连播放。
          </p>
        </section>
        <section>
          <h2 className="text-base font-semibold text-content mb-2.5">现在保留的能力</h2>
          <ul className="text-sm text-muted space-y-1.5 list-disc list-inside">
            <li>家庭密码访问，Cookie 有效期 30 天</li>
            <li>豆瓣 / Bangumi / 影视热榜</li>
            <li>M3U、EPG、直播搜索、收藏与测活</li>
            <li>iPhone / iPad / 桌面浏览器与 PWA</li>
          </ul>
        </section>
        <section>
          <h2 className="text-base font-semibold text-content mb-2.5">已删除</h2>
          <p className="text-sm text-muted leading-relaxed">
            公网点播采集站、Apple CMS 聚合、跨源搜索、点播换源、TVBOX/SourceList 导入发布和旧 VOD 播放链路均不再属于 HomeSphere。
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
