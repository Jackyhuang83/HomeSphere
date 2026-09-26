'use client';

import { useCallback, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Icon } from './icon';
import { Spinner } from './states';

export type TestState =
  | { status: 'loading' }
  | { status: 'done'; ok: boolean; ms?: number; count?: number; error?: string };

export function useSourceTests() {
  const [tests, setTests] = useState<Record<string, TestState>>({});
  const runTest = useCallback(async (
    key: string,
    run: () => Promise<{ ok: boolean; ms?: number; count?: number; error?: string }>
  ) => {
    setTests((prev) => ({ ...prev, [key]: { status: 'loading' } }));
    try {
      const r = await run();
      setTests((prev) => ({
        ...prev,
        [key]: r.ok
          ? { status: 'done', ok: true, ms: r.ms, count: r.count }
          : { status: 'done', ok: false, error: r.error },
      }));
    } catch (err) {
      setTests((prev) => ({
        ...prev,
        [key]: { status: 'done', ok: false, error: err instanceof Error ? err.message : '测试失败' },
      }));
    }
  }, []);
  return { tests, runTest };
}

export function SectionTitle({ title, hint, extra }: { title: string; hint?: string; extra?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 mb-2.5">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-content">{title}</h3>
        {hint && <p className="text-[11px] text-faint truncate">{hint}</p>}
      </div>
      {extra}
    </div>
  );
}

export function ToggleRow({ label, description, checked, onChange }: {
  label: string; description: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="text-sm text-content">{label}</div>
        <div className="text-xs text-faint">{description}</div>
      </div>
      <button
        role="switch"
        aria-checked={checked}
        className={cn('relative h-[22px] w-10 rounded-full transition-colors', checked ? 'bg-accent' : 'bg-chip ring-1 ring-inset ring-line')}
        onClick={() => onChange(!checked)}
      >
        <span className={cn('absolute left-[2px] top-[2px] h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform', checked && 'translate-x-[18px]')} />
      </button>
    </div>
  );
}

export function SelectRow({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-content">{label}</span>
      <div className="relative">
        <select className="input !py-1.5 !pl-2.5 !pr-7 text-xs" value={value} onChange={(e) => onChange(e.target.value)}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <Icon name="chevronDown" className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
      </div>
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <Icon name="search" className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
      <input className="input w-full !pl-8 !py-1.5 text-xs" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

export function TestBadge({ state, onTest, title, badgeWhenOk }: {
  state?: TestState;
  onTest: () => void;
  title: string;
  badgeWhenOk: (t: { ms?: number; count?: number }) => string;
}) {
  return (
    <span className="flex items-center gap-1 shrink-0">
      {state?.status === 'done' && (
        <span className={cn('text-[10px] px-1.5 py-0.5 rounded', state.ok ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger')}>
          {state.ok ? badgeWhenOk({ ms: state.ms, count: state.count }) : '✗ 失败'}
        </span>
      )}
      <button className="rounded-md p-2 text-muted hover:text-accent hover:bg-hover disabled:opacity-40"
        disabled={state?.status === 'loading'} onClick={onTest} aria-label={title} title={title}>
        {state?.status === 'loading' ? <Spinner size="sm" /> : <Icon name="bolt" className="w-4 h-4" />}
      </button>
    </span>
  );
}
