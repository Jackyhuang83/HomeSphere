'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { useToast } from './toast';
import { api } from '@/lib/client-api';
import { hostnameOf, validateSourceUrl, cn } from '@/lib/utils';
import { SearchInput, SectionTitle, TestBadge, useSourceTests } from './settings-shared';
import { EmptyState } from './states';
import { Icon } from './icon';
import { PUBLIC_LIVE_SOURCES, publicLiveSourceByUrl } from '@/lib/public-live-sources';

type Filter = 'all' | 'enabled' | 'disabled' | 'preset' | 'public' | 'manual';

export function LiveSourceManager() {
  const store = useAppStore();
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const { tests, runTest } = useSourceTests();

  const rows = useMemo(() => {
    const preset = store.liveEnvSources.map((s) => ({ ...s, preset: true }));
    const manual = store.liveSubscriptions.map((s) => {
      const publicPreset = publicLiveSourceByUrl(s.url);
      return {
        key: s.url,
        name: s.name || publicPreset?.name || hostnameOf(s.url),
        url: s.url,
        epg: s.epg,
        preset: Boolean(publicPreset),
        publicPreset,
      };
    });
    const q = query.trim().toLowerCase();
    return [...preset, ...manual].filter((row) => {
      const enabled = store.liveSelectedUrls.includes(row.url);
      if (filter === 'enabled' && !enabled) return false;
      if (filter === 'disabled' && enabled) return false;
      if (filter === 'preset' && !row.preset) return false;
      if (filter === 'public' && !publicLiveSourceByUrl(row.url)) return false;
      if (filter === 'manual' && row.preset) return false;
      return !q || row.name.toLowerCase().includes(q) || row.url.toLowerCase().includes(q);
    });
  }, [store.liveEnvSources, store.liveSubscriptions, store.liveSelectedUrls, query, filter]);

  const editingSource = editing ? store.liveSubscriptions.find((s) => s.url === editing) : undefined;
  const allEnabled = rows.length > 0 && rows.every((r) => store.liveSelectedUrls.includes(r.url));

  const toggleAll = () => {
    const targets = rows.filter((r) => store.liveSelectedUrls.includes(r.url) === allEnabled).map((r) => r.url);
    if (targets.length) useAppStore.getState().toggleLiveSelectedMany(targets);
  };

  const publicInstalled = PUBLIC_LIVE_SOURCES.every((source) =>
    store.liveSubscriptions.some((item) => item.url === source.url)
  );

  const installPublicSources = () => {
    const state = useAppStore.getState();
    for (const source of PUBLIC_LIVE_SOURCES) {
      const exists = state.liveSubscriptions.some((item) => item.url === source.url);
      if (!exists) {
        state.addLiveSubscription(source.url, source.name);
        if (source.role === 'backup') {
          const next = useAppStore.getState();
          if (next.liveSelectedUrls.includes(source.url)) next.toggleLiveSelected(source.url);
        }
      }
    }
    toast('中文 M3U 双源已安装：主源启用，备用源默认停用', 'success');
  };

  return (
    <section>
      <SectionTitle
        title="IPTV 直播源"
        hint={`共 ${store.liveEnvSources.length + store.liveSubscriptions.length} 个 · 已启用 ${store.liveSelectedUrls.length}`}
        extra={<button className="btn-primary btn-sm" onClick={() => setAdding(true)}><Icon name="plus" className="w-3.5 h-3.5" />添加 M3U</button>}
      />

      <LiveSourceForm
        visible={adding || Boolean(editingSource)}
        initial={editingSource}
        onCancel={() => { setAdding(false); setEditing(null); }}
        onSubmit={(data) => {
          if (editing) store.updateLiveSubscription(editing, { name: data.name, epg: data.epg });
          else {
            store.addLiveSubscription(data.url, data.name, data.epg);
            void runTest(data.url, () => api.liveTest(data.url));
          }
          setAdding(false); setEditing(null);
        }}
      />

      {rows.length === 0 && !adding ? (
        <EmptyState icon="link" title="还没有直播源" description="添加 M3U 地址后即可在「直播」页面观看。" />
      ) : (
        <>
          <div className="space-y-2 mb-3">
            <SearchInput value={query} onChange={setQuery} placeholder="搜索名称或地址" />
            <div className="flex flex-wrap gap-1">
              {([
                ['all','全部'],['enabled','已启用'],['disabled','已停用'],['preset','预置'],['public','公共'],['manual','手动']
              ] as const).map(([id,label]) => (
                <button key={id} className={cn('chip', filter === id ? 'bg-accent/10 text-accent font-medium' : 'text-muted hover:bg-hover')} onClick={() => setFilter(id)}>
                  {label}
                </button>
              ))}
              <button className="btn-ghost btn-sm ml-auto" onClick={toggleAll}>{allEnabled ? '全部停用' : '全部启用'}</button>
            </div>
          </div>

          <ul className="space-y-2">
            {rows.map((row) => {
              const enabled = store.liveSelectedUrls.includes(row.url);
              const publicPreset = publicLiveSourceByUrl(row.url);
              return (
                <li key={row.url} className={cn('bg-card rounded-lg p-3', !enabled && 'opacity-70')}>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" className="h-4 w-4 accent-accent" checked={enabled}
                      onChange={() => useAppStore.getState().toggleLiveSelected(row.url)} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-content truncate">
                        {row.name}
                        {publicPreset ? (
                          <span className="ml-1.5 text-[10px] text-faint">{publicPreset.role === 'primary' ? '公共主源' : '公共备用'}</span>
                        ) : row.preset ? (
                          <span className="ml-1.5 text-[10px] text-faint">预置</span>
                        ) : null}
                      </div>
                      <div className="text-xs text-faint truncate">{row.url}{row.epg && ' · EPG'}</div>
                    </div>
                    <TestBadge state={tests[row.url]} onTest={() => runTest(row.url, () => api.liveTest(row.url))}
                      title="测试直播源" badgeWhenOk={({ count }) => `✓ ${count ?? 0} 频道`} />
                    <button className="rounded-md p-2 text-muted hover:text-accent hover:bg-hover" onClick={() => window.open(api.liveExportUrl(row.url), '_blank', 'noopener')} title="导出 M3U">
                      <Icon name="download" className="w-4 h-4" />
                    </button>
                    {!row.preset && (
                      <>
                        <button className="rounded-md p-2 text-muted hover:text-accent hover:bg-hover" onClick={() => setEditing(row.url)} title="编辑">
                          <Icon name="edit" className="w-4 h-4" />
                        </button>
                        <button className="rounded-md p-2 text-muted hover:text-danger hover:bg-hover" onClick={() => {
                          const snapshot = useAppStore.getState().removeLiveSubscription(row.url);
                          if (!snapshot) return;
                          toast(`已移除「${row.name}」`, 'info', {
                            action: { label: '撤销', onClick: () => useAppStore.getState().restoreLiveSubscription(snapshot) },
                          });
                        }} title="删除">
                          <Icon name="trash" className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

function LiveSourceForm({ visible, initial, onCancel, onSubmit }: {
  visible: boolean;
  initial?: { url: string; name?: string; epg?: string };
  onCancel: () => void;
  onSubmit: (data: { url: string; name?: string; epg?: string }) => void;
}) {
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [epg, setEpg] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    if (!visible) return;
    setUrl(initial?.url ?? '');
    setName(initial?.name ?? '');
    setEpg(initial?.epg ?? '');
  }, [visible, initial]);

  if (!visible) return null;

  const submit = () => {
    const target = initial?.url ?? url.trim();
    if (!validateSourceUrl(target)) {
      toast('M3U 地址需以 http:// 或 https:// 开头', 'warning');
      return;
    }
    onSubmit({ url: target, name: name.trim() || undefined, epg: epg.trim() || undefined });
  };

  return (
    <div className="space-y-2 border border-line rounded-lg p-3 bg-chip mb-3">
      <input className="input w-full" placeholder="M3U 地址" value={url} disabled={Boolean(initial)} onChange={(e) => setUrl(e.target.value)} />
      <input className="input w-full" placeholder="名称（可选）" value={name} onChange={(e) => setName(e.target.value)} />
      <input className="input w-full" placeholder="EPG XMLTV 地址（可选）" value={epg} onChange={(e) => setEpg(e.target.value)} />
      <div className="flex gap-2 justify-end">
        <button className="btn-ghost btn-sm" onClick={onCancel}>取消</button>
        <button className="btn-primary btn-sm" onClick={submit}>{initial ? '保存' : '添加'}</button>
      </div>
    </div>
  );
}
