/**
 * 直播频道列表的纯函数过滤/排序工具。
 * 从 live-channel-list 组件中抽出为可测试的纯逻辑：
 * - 搜索归一化：忽略分隔符差异（cctv1 可命中 CCTV-1 综合）；
 * - 可用性两档筛选：仅绿点（分片级验证）/ 含琥珀（弱验证或超时）；
 * - 排序：默认 / 名称 / 分组 / 可用性优先 / 最近观看。
 */

/** 与 store 的 LiveProbeEntry 结构兼容的测活结果子集（避免 lib 依赖 client store 类型） */
export interface ProbeLike {
  ok: boolean;
  ms?: number;
  level?: 'segment' | 'manifest' | 'head';
  timedOut?: boolean;
  kbps?: number;
}

export type LiveSortMode = 'default' | 'name' | 'group' | 'probe' | 'recent';
export type AliveFilter = 'off' | 'ok' | 'green';

/**
 * 「源限速」阈值（kbps）：分片可达但吞吐低于该值的源无法流畅缓冲。
 * 低于 1Mbps 的直播流基本必然卡顿，标记为琥珀色（介于绿点与不可达之间）。
 */
export const SLOW_SOURCE_KBPS = 1000;

/** 分片可达但吞吐不足（测活绿点却播不了的主因） */
export function isSlowSource(probe: ProbeLike | undefined): boolean {
  return Boolean(
    probe?.ok &&
      probe.level === 'segment' &&
      probe.kbps != null &&
      probe.kbps < SLOW_SOURCE_KBPS
  );
}

/** 常见台名分隔符（空格、连字符、下划线、点、竖线、括号等），搜索时忽略 */
const SEPARATOR_RE = /[\s\-_./·|+()（）[\]【】]/g;

export function normalizeForSearch(input: string): string {
  return input.toLowerCase().replace(SEPARATOR_RE, '');
}

export interface KeywordMatchable {
  name: string;
  tvgId?: string;
  group?: string;
}

/** 关键字匹配台名 / tvg-id / 分组名（三者都做分隔符归一化）；空关键字恒匹配 */
export function matchesKeyword(channel: KeywordMatchable, normalizedKeyword: string): boolean {
  if (!normalizedKeyword) return true;
  if (normalizeForSearch(channel.name).includes(normalizedKeyword)) return true;
  if (channel.tvgId && normalizeForSearch(channel.tvgId).includes(normalizedKeyword)) return true;
  if (channel.group && normalizeForSearch(channel.group).includes(normalizedKeyword)) return true;
  return false;
}

/**
 * 可用性筛选：
 * - 'ok'：任何验证级别通过（绿点、限速源或琥珀中的弱验证）
 * - 'green'：仅「分片级验证通过且吞吐达标」（真实可流畅播放置信度最高）
 */
export function matchesAlive(probe: ProbeLike | undefined, mode: AliveFilter): boolean {
  if (mode === 'off') return true;
  if (!probe?.ok) return false;
  if (mode === 'green') return probe.level === 'segment' && !isSlowSource(probe);
  return true;
}

/** 探测状态排序权重：绿点 → 限速分片 → 弱验证 → 超时 → 失败 → 未测 */
export function probeRank(probe: ProbeLike | undefined): number {
  if (!probe) return 5;
  if (probe.ok) {
    if (probe.level !== 'segment') return 2;
    return isSlowSource(probe) ? 1 : 0;
  }
  return probe.timedOut ? 3 : 4;
}

export interface SortContext {
  /** url → 最近观看序（liveRecent 下标，越小越近） */
  recentOrder?: Map<string, number>;
  probeOf?: (url: string) => ProbeLike | undefined;
}

export function sortChannels<T extends KeywordMatchable & { url: string }>(
  list: T[],
  mode: LiveSortMode,
  ctx: SortContext = {}
): T[] {
  const out = [...list];
  switch (mode) {
    case 'name':
      out.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
      break;
    case 'group':
      out.sort(
        (a, b) =>
          (a.group ?? '').localeCompare(b.group ?? '', 'zh') ||
          a.name.localeCompare(b.name, 'zh')
      );
      break;
    case 'probe': {
      const probeOf = ctx.probeOf;
      out.sort((a, b) => {
        const pa = probeOf?.(a.url);
        const pb = probeOf?.(b.url);
        const rank = probeRank(pa) - probeRank(pb);
        if (rank !== 0) return rank;
        // 同级内：有吞吐数据的按带宽降序，否则按分片延迟升序
        if (pa?.kbps != null && pb?.kbps != null && pa.kbps !== pb.kbps) return pb.kbps - pa.kbps;
        return (pa?.ms ?? Number.POSITIVE_INFINITY) - (pb?.ms ?? Number.POSITIVE_INFINITY);
      });
      break;
    }
    case 'recent': {
      const recentOrder = ctx.recentOrder;
      out.sort(
        (a, b) =>
          (recentOrder?.get(a.url) ?? Number.POSITIVE_INFINITY) -
          (recentOrder?.get(b.url) ?? Number.POSITIVE_INFINITY)
      );
      break;
    }
    default:
      break;
  }
  return out;
}


export type ChineseChannelCategory = 'cctv' | 'satellite' | 'hongkong' | 'taiwan' | 'local' | 'other';

export const CHINESE_CHANNEL_CATEGORIES: Array<{ id: ChineseChannelCategory; label: string }> = [
  { id: 'cctv', label: 'CCTV' },
  { id: 'satellite', label: '卫视' },
  { id: 'hongkong', label: '香港' },
  { id: 'taiwan', label: '台湾' },
  { id: 'local', label: '地方' },
  { id: 'other', label: '其他' },
];

const HONG_KONG_RE = /(香港|hong\s*kong|\bhk\b|tvb|無綫|无线|翡翠|明珠|鳳凰|凤凰|rthk|港台)/i;
const TAIWAN_RE = /(台灣|台湾|taiwan|tvbs|民視|民视|三立|東森|东森|寰宇|中天|華視|华视|台視|台视|中視|中视|公視|公视|年代|非凡|鏡新聞|镜新闻|壹電視|壹电视|momo)/i;
const CCTV_RE = /(cctv|央視|央视|中央電視台|中央电视台)/i;
const SATELLITE_RE = /(衛視|卫视|satellite)/i;
const LOCAL_REGION_RE = /(北京|上海|天津|重慶|重庆|河北|河南|山東|山东|山西|湖北|湖南|廣東|广东|廣西|广西|海南|浙江|江蘇|江苏|安徽|福建|江西|遼寧|辽宁|吉林|黑龍江|黑龙江|四川|貴州|贵州|雲南|云南|陝西|陕西|甘肅|甘肃|青海|寧夏|宁夏|新疆|西藏|內蒙古|内蒙古|深圳|廣州|广州|杭州|南京|蘇州|苏州|成都|武漢|武汉|長沙|长沙|廈門|厦门|大連|大连|青島|青岛|寧波|宁波|珠江|都市|地方|local|province|city)/i;

/**
 * 中文频道智能分类。
 * 先按港澳台/CCTV/卫视等高置信规则分类，再把带省市/地方特征的频道归入“地方”。
 * 原始 M3U group-title 只作为辅助文本，因此不同公共源的分组命名不会影响 HomeSphere UI。
 */
export function classifyChineseChannel(channel: KeywordMatchable): ChineseChannelCategory {
  const text = `${channel.name} ${channel.group ?? ''} ${channel.tvgId ?? ''}`;
  if (HONG_KONG_RE.test(text)) return 'hongkong';
  if (TAIWAN_RE.test(text)) return 'taiwan';
  if (CCTV_RE.test(text)) return 'cctv';
  if (SATELLITE_RE.test(text)) return 'satellite';
  if (LOCAL_REGION_RE.test(text)) return 'local';
  return 'other';
}
