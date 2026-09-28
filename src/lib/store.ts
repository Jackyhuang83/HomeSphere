'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { LiveSourceConfig } from './types';
import { LEGACY_PUBLIC_LIVE_SOURCE_URLS, PUBLIC_LIVE_SOURCES } from './public-live-sources';

export interface LiveSubscription {
  url: string;
  name?: string;
  epg?: string;
}

export interface LiveRecentEntry {
  url: string;
  name: string;
  logo?: string;
  group?: string;
  tvgId?: string;
  epg?: string;
  sourceUrl?: string;
  timestamp: number;
}

export const LIVE_PROBE_TTL_MS = 6 * 60 * 60 * 1000;

export interface LiveProbeEntry {
  ok: boolean;
  ms?: number;
  level?: 'segment' | 'manifest' | 'head';
  error?: string;
  codec?: string;
  timedOut?: boolean;
  kbps?: number;
  timestamp: number;
}

interface AppState {
  doubanEnabled: boolean;
  recommendSource: 'douban' | 'bangumi' | 'hot-list';
  liveEnvSources: LiveSourceConfig[];
  liveEnvKeysSeen: string[];
  liveSubscriptions: LiveSubscription[];
  liveSelectedUrls: string[];
  liveFavorites: string[];
  liveRecent: LiveRecentEntry[];
  liveProbeResults: Record<string, LiveProbeEntry>;
  livePublicPresetVersion: number;

  setLiveEnvSources: (list: LiveSourceConfig[]) => void;
  ensurePublicLiveSources: () => void;
  addLiveSubscription: (url: string, name?: string, epg?: string) => void;
  removeLiveSubscription: (url: string) => { entry: LiveSubscription; selected: boolean } | null;
  restoreLiveSubscription: (snapshot: { entry: LiveSubscription; selected: boolean }) => void;
  updateLiveSubscription: (url: string, patch: { name?: string; epg?: string }) => void;
  toggleLiveSelected: (url: string) => void;
  toggleLiveSelectedMany: (urls: string[]) => void;
  toggleLiveFavorite: (url: string) => void;
  addLiveRecent: (entry: Omit<LiveRecentEntry, 'timestamp'>) => void;
  removeLiveRecent: (url: string) => void;
  clearLiveRecent: () => void;
  setLiveProbeResults: (entries: Record<string, LiveProbeEntry>) => void;
  clearLiveProbeResults: () => void;
  updateSettings: (patch: Partial<Pick<AppState, 'doubanEnabled' | 'recommendSource'>>) => void;
}

export function allLiveSources(state: Pick<AppState, 'liveEnvSources' | 'liveSubscriptions'>): LiveSourceConfig[] {
  return [
    ...state.liveEnvSources,
    ...state.liveSubscriptions.map((s, i) => ({
      key: `manual_${i}`,
      name: s.name || s.url,
      url: s.url,
      epg: s.epg,
    })),
  ];
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      doubanEnabled: true,
      recommendSource: 'hot-list',
      liveEnvSources: [],
      liveEnvKeysSeen: [],
      liveSubscriptions: [],
      liveSelectedUrls: [],
      liveFavorites: [],
      liveRecent: [],
      liveProbeResults: {},
      livePublicPresetVersion: 0,

      setLiveEnvSources: (list) => {
        const seen = new Set(get().liveEnvKeysSeen);
        const freshUrls = list.filter((s) => !seen.has(s.key)).map((s) => s.url);
        set({
          liveEnvSources: list,
          liveEnvKeysSeen: [...new Set([...get().liveEnvKeysSeen, ...list.map((s) => s.key)])],
          liveSelectedUrls: [...new Set([...get().liveSelectedUrls, ...freshUrls])],
        });
      },

      ensurePublicLiveSources: () => {
        if (get().livePublicPresetVersion >= 2) return;

        const legacy = new Set<string>(LEGACY_PUBLIC_LIVE_SOURCE_URLS);
        const currentSubscriptions = get().liveSubscriptions.filter((item) => !legacy.has(item.url));
        const currentSelected = get().liveSelectedUrls.filter((url) => !legacy.has(url));
        const nextSubscriptions = [...currentSubscriptions];

        for (const source of PUBLIC_LIVE_SOURCES) {
          if (!nextSubscriptions.some((item) => item.url === source.url)) {
            nextSubscriptions.push({ url: source.url, name: source.name });
          }
        }

        const primaryUrls = PUBLIC_LIVE_SOURCES
          .filter((source) => source.role === 'primary')
          .map((source) => source.url);
        const backupUrls = new Set(
          PUBLIC_LIVE_SOURCES.filter((source) => source.role === 'backup').map((source) => source.url)
        );

        set({
          liveSubscriptions: nextSubscriptions,
          liveSelectedUrls: [
            ...new Set([...currentSelected.filter((url) => !backupUrls.has(url)), ...primaryUrls]),
          ],
          livePublicPresetVersion: 2,
        });
      },

      addLiveSubscription: (url, name, epg) => {
        const trimmed = url.trim();
        if (!trimmed || get().liveSubscriptions.some((s) => s.url === trimmed)) return;
        set({
          liveSubscriptions: [...get().liveSubscriptions, { url: trimmed, name, epg }],
          liveSelectedUrls: [...new Set([...get().liveSelectedUrls, trimmed])],
        });
      },

      removeLiveSubscription: (url) => {
        const entry = get().liveSubscriptions.find((s) => s.url === url);
        if (!entry) return null;
        const selected = get().liveSelectedUrls.includes(url);
        set({
          liveSubscriptions: get().liveSubscriptions.filter((s) => s.url !== url),
          liveSelectedUrls: get().liveSelectedUrls.filter((u) => u !== url),
          liveRecent: get().liveRecent.filter((r) => r.sourceUrl !== url),
        });
        return { entry, selected };
      },

      restoreLiveSubscription: ({ entry, selected }) => {
        if (get().liveSubscriptions.some((s) => s.url === entry.url)) return;
        set({
          liveSubscriptions: [...get().liveSubscriptions, entry],
          liveSelectedUrls: selected
            ? [...new Set([...get().liveSelectedUrls, entry.url])]
            : get().liveSelectedUrls,
        });
      },

      updateLiveSubscription: (url, patch) => {
        set({
          liveSubscriptions: get().liveSubscriptions.map((s) => s.url === url ? { ...s, ...patch } : s),
        });
      },

      toggleLiveSelected: (url) => {
        const current = get().liveSelectedUrls;
        set({ liveSelectedUrls: current.includes(url) ? current.filter((u) => u !== url) : [...current, url] });
      },

      toggleLiveSelectedMany: (urls) => {
        const setOf = new Set(get().liveSelectedUrls);
        for (const url of urls) setOf.has(url) ? setOf.delete(url) : setOf.add(url);
        set({ liveSelectedUrls: [...setOf] });
      },

      toggleLiveFavorite: (url) => {
        const current = get().liveFavorites;
        set({ liveFavorites: current.includes(url) ? current.filter((u) => u !== url) : [...current, url] });
      },

      addLiveRecent: (entry) => {
        const rest = get().liveRecent.filter((r) => r.url !== entry.url);
        set({ liveRecent: [{ ...entry, timestamp: Date.now() }, ...rest].slice(0, 20) });
      },

      removeLiveRecent: (url) => set({ liveRecent: get().liveRecent.filter((r) => r.url !== url) }),
      clearLiveRecent: () => set({ liveRecent: [] }),

      setLiveProbeResults: (entries) => {
        const now = Date.now();
        const next: Record<string, LiveProbeEntry> = {};
        for (const [url, item] of Object.entries(get().liveProbeResults)) {
          if (now - item.timestamp < LIVE_PROBE_TTL_MS) next[url] = item;
        }
        Object.assign(next, entries);
        set({ liveProbeResults: next });
      },

      clearLiveProbeResults: () => set({ liveProbeResults: {} }),

      updateSettings: (patch) => set(patch),
    }),
    {
      name: 'homesphere-settings',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        doubanEnabled: s.doubanEnabled,
        recommendSource: s.recommendSource,
        liveEnvKeysSeen: s.liveEnvKeysSeen,
        liveSubscriptions: s.liveSubscriptions,
        liveSelectedUrls: s.liveSelectedUrls,
        liveFavorites: s.liveFavorites,
        liveRecent: s.liveRecent,
        livePublicPresetVersion: s.livePublicPresetVersion,
      }),
      skipHydration: true,
    }
  )
);
