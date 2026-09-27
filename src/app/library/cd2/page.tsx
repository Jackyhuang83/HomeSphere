'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Header } from '@/components/header';
import { SiteFooter } from '@/components/site-footer';

type Probe={
  configured:boolean;
  endpointHost?:string;
  probeFile?:string;
  directUrlAvailable?:boolean;
  directHost?:string;
  downloadUrlPathAvailable?:boolean;
  expiresIn?:number;
  requiresSpecificUserAgent?:boolean;
  userAgentMatchesBrowser?:boolean;
  additionalHeaderNames?:string[];
  browser302Candidate?:boolean;
  finalUrlPublic?:boolean;
  note:string;
};

export default function Cd2ProbePage(){
  const [data,setData]=useState<Probe|null>(null);
  const [error,setError]=useState('');

  const run=async()=>{
    setError('');
    setData(null);
    try{
      const res=await fetch('/api/library/cd2/probe',{cache:'no-store'});
      const body=await res.json();
      if(!res.ok) throw new Error(body.error||'CD2探针失败');
      setData(body);
    }catch(err){
      setError(err instanceof Error?err.message:'CD2探针失败');
    }
  };

  useEffect(()=>{void run();},[]);

  return <div className="min-h-screen flex flex-col">
    <Header/>
    <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-5">
        <Link href="/library" className="text-sm text-muted hover:text-content">← 返回片库</Link>
        <button className="btn-ghost ml-auto" onClick={()=>void run()}>重新检测</button>
      </div>
      <h1 className="text-2xl font-semibold text-content">CloudDrive2 兼容性探针</h1>
      <p className="text-sm text-muted mt-2">
        只检查服务器端 CD2 API Token 与一个测试文件，不会把 Token、完整直链或 Header 值发送到浏览器。
      </p>

      {error && <Box>{error}</Box>}
      {!data && !error && <div className="py-16 text-center text-muted">正在检测…</div>}
      {data && !data.configured && <Box>{data.note}</Box>}
      {data?.configured && <div className="mt-6 space-y-3">
        <Row label="CD2">{data.endpointHost || '-'}</Row>
        <Row label="测试文件">{data.probeFile || '-'}</Row>
        <Row label="返回 directUrl">{yes(data.directUrlAvailable)}</Row>
        <Row label="最终主机">{data.directHost || '-'}</Row>
        <Row label="最终 URL 为公网">{yes(data.finalUrlPublic)}</Row>
        <Row label="要求特定 User-Agent">{yes(data.requiresSpecificUserAgent)}</Row>
        <Row label="UA 与当前浏览器一致">{yes(data.userAgentMatchesBrowser)}</Row>
        <Row label="额外 Header">{data.additionalHeaderNames?.length ? data.additionalHeaderNames.join(', ') : '无'}</Row>
        <Row label="浏览器302候选">{yes(data.browser302Candidate)}</Row>
        <Box>{data.note}</Box>

        {data.browser302Candidate && <div className="card p-4">
          <h2 className="font-medium text-content">iPhone / Safari 实测</h2>
          <p className="text-sm text-muted mt-1">
            下面只在元数据条件允许时开放。点击后 HomeSphere 会重新向 CD2 请求一次临时直链并直接302，不会把签名URL显示在页面。
          </p>
          <a href="/api/library/cd2/probe-play" className="btn-primary inline-flex mt-4">打开测试直链</a>
        </div>}
      </div>}
    </main>
    <SiteFooter/>
  </div>;
}

function Row({label,children}:{label:string;children:React.ReactNode}){
  return <div className="card px-4 py-3 flex gap-4 justify-between">
    <span className="text-sm text-muted">{label}</span>
    <span className="text-sm text-content text-right break-all">{children}</span>
  </div>;
}
function Box({children}:{children:React.ReactNode}){
  return <div className="mt-4 rounded-lg border border-line bg-surface-raised px-4 py-3 text-sm text-content">{children}</div>;
}
function yes(value?:boolean){return value?'是':'否';}
