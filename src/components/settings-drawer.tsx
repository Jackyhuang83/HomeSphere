'use client';

import { Drawer } from './drawer';
import { LiveSourceManager } from './live-source-manager';
import { SelectRow, ToggleRow } from './settings-shared';
import { useAppStore } from '@/lib/store';

export function SettingsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const doubanEnabled = useAppStore((s) => s.doubanEnabled);
  const recommendSource = useAppStore((s) => s.recommendSource);
  const updateSettings = useAppStore((s) => s.updateSettings);

  return (
    <Drawer open={open} onClose={onClose} title="设置" width="max-w-lg">
      <div className="space-y-8">
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-content">影视发现</h3>
          <ToggleRow
            label="显示推荐榜单"
            description="保留豆瓣、Bangumi 与影视热榜"
            checked={doubanEnabled}
            onChange={(value) => updateSettings({ doubanEnabled: value })}
          />
          <SelectRow
            label="推荐来源"
            value={recommendSource}
            onChange={(value) => updateSettings({ recommendSource: value as 'douban' | 'bangumi' | 'hot-list' })}
            options={[
              { value: 'hot-list', label: '影视热榜' },
              { value: 'douban', label: '豆瓣' },
              { value: 'bangumi', label: 'Bangumi' },
            ]}
          />
        </section>

        <LiveSourceManager />
      </div>
    </Drawer>
  );
}
