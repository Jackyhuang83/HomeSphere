'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Header } from '@/components/header';
import { SiteFooter } from '@/components/site-footer';

interface SetupStep{
  id:string;
  title:string;
  required:boolean;
  ok:boolean;
  detail:string;
}
interface SetupStatus{
  ready:boolean;
  vps:{cpu:string;memory:string;disk:string;bandwidth:string;suitable:boolean;note:string};
  steps:SetupStep[];
}

export default function SetupPage(){
  const [status,setStatus]=useState<SetupStatus|null>(null);
  const [error,setError]=useState('');

  const load=async()=>{
    setError('');
    try{
      const res=await fetch('/api/setup/status',{cache:'no-store'});
      const data=await res.json();
      if(!res.ok)throw new Error(data.error||'检查失败');
      setStatus(data);
    }catch(err){
      setError(err instanceof Error?err.message:'检查失败');
    }
  };

  useEffect(()=>{void load();},[]);

  return <div className="min-h-screen flex flex-col">
    <Header/>
    <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-content">首次使用检查</h1>
        <p className="text-sm text-muted mt-2">你只需要一台 VPS 和一个115账号。其他组件都运行在这台 VPS 上。</p>
      </div>

      <section className="rounded-xl border border-line bg-card p-4 mb-5">
        <h2 className="font-semibold text-content">你的 VPS 可以用</h2>
        <p className="text-sm text-muted mt-2">
          1C1G、50GB、10Mbps 足够运行 HomeSphere + QMediaSync Media Bridge，前提是不开转码、不代理视频字节。
          视频必须由最终 CDN 直接传给 iPhone / iPad。
        </p>
      </section>

      {error&&<div className="rounded-lg border border-danger/30 bg-danger/10 p-4 text-sm mb-4">{error}</div>}

      {!status?<div className="py-16 text-center text-muted">正在检查…</div>:<>
        <div className="space-y-3">
          {status.steps.map((step,index)=><section key={step.id} className="rounded-xl border border-line bg-card p-4">
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${step.ok?'bg-green-500/15 text-green-500':'bg-chip text-muted'}`}>
                {step.ok?'✓':index+1}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold text-content">{step.title}</h2>
                  {!step.required&&<span className="text-[10px] rounded bg-chip px-1.5 py-0.5 text-muted">可选</span>}
                </div>
                <p className="text-sm text-muted mt-1 break-words">{step.detail}</p>
              </div>
            </div>
          </section>)}
        </div>

        <div className="mt-6 rounded-xl border border-line bg-surface-raised p-4">
          <h2 className="font-semibold text-content">{status.ready?'基础片库已就绪':'你现在只需要按顺序做'}</h2>
          {status.ready
            ? <p className="text-sm text-muted mt-2">进入片库测试播放链路，再整理 TMDB 海报。</p>
            : <ol className="text-sm text-muted mt-2 space-y-1 list-decimal pl-5">
                <li>进入 QMediaSync，完成 115 OAuth 授权。</li>
                <li>让 QMediaSync 把 STRM 写到 /media，并把 STRM 直连地址设为 http://media-bridge:12333。</li>
                <li>回到 HomeSphere 点击“同步STRM”。</li>
              </ol>}
          <div className="flex gap-2 mt-4">
            <Link className="btn-primary" href="/library">进入片库</Link>
            <button className="btn-ghost" onClick={()=>void load()}>重新检查</button>
          </div>
        </div>
      </>}
    </main>
    <SiteFooter/>
  </div>;
}
