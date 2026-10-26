/**
 * 业务计算：状态判定、时间切片、涨跌幅、极值。
 * 与展示解耦，全部基于原始收盘点位计算。
 */

import type {
  ExtremePoint,
  HistoricalRecord,
  RangeKey,
  ZoneInfo,
} from '@/types/market';

/** 历史参考线（用户指定的研究阈值，非统计检验结论） */
export const LOW_LINE = 0.3;
export const HIGH_LINE = 0.7;

/**
 * 比值所在区域。
 * 注意：这里只做区域归类，不产生任何买卖含义。
 */
export function resolveZone(ratio: number): ZoneInfo {
  if (!Number.isFinite(ratio)) {
    return { key: 'mid', label: '数据不足', hint: '暂无有效比值' };
  }
  if (ratio <= LOW_LINE) {
    return { key: 'low', label: '历史低位参考区', hint: `比值 ≤ ${LOW_LINE.toFixed(3)}` };
  }
  if (ratio >= HIGH_LINE) {
    return { key: 'high', label: '历史高位参考区', hint: `比值 ≥ ${HIGH_LINE.toFixed(3)}` };
  }
  return { key: 'mid', label: '历史参考区间', hint: `${LOW_LINE.toFixed(3)} – ${HIGH_LINE.toFixed(3)}` };
}

/** 与某条参考线的绝对差值（保持符号，避免被误读为涨跌幅） */
export function distanceTo(ratio: number, line: number): number {
  return ratio - line;
}

/** 单日涨跌幅（%）；缺少上一交易日返回 null，界面显示“—” */
export function changeRate(current: number | undefined, previous: number | undefined): number | null {
  if (
    current === undefined ||
    previous === undefined ||
    !Number.isFinite(current) ||
    !Number.isFinite(previous) ||
    previous <= 0
  ) {
    return null;
  }
  return (current / previous - 1) * 100;
}

/** 全历史极值（用全量数据，不受时间范围影响） */
export function findExtremes(records: readonly HistoricalRecord[]): {
  min: ExtremePoint | null;
  max: ExtremePoint | null;
} {
  if (records.length === 0) return { min: null, max: null };
  let minRec = records[0] as HistoricalRecord;
  let maxRec = records[0] as HistoricalRecord;
  for (const row of records) {
    if (row.ratio < minRec.ratio) minRec = row;
    if (row.ratio > maxRec.ratio) maxRec = row;
  }
  return { min: { kind: 'min', record: minRec }, max: { kind: 'max', record: maxRec } };
}

/**
 * 按时间范围切片。
 * 以「最新有效交易日」为锚点向前推 N 年，日期边界用字符串比较（ISO 日期可直接比较）。
 */
export function sliceByRange(
  records: readonly HistoricalRecord[],
  range: RangeKey,
): HistoricalRecord[] {
  if (range === 'all' || records.length === 0) return [...records];
  const years = range === '1y' ? 1 : range === '3y' ? 3 : 5;
  const anchor = records[records.length - 1];
  if (!anchor) return [...records];

  const [y, m, d] = anchor.date.split('-');
  const cutoffYear = Number(y) - years;
  // 2 月 29 日等边界不做特殊处理：作为切分阈值，字符串比较仍然单调
  const cutoff = `${cutoffYear}-${m}-${d}`;
  return records.filter((row) => row.date >= cutoff);
}

/** 当前比值在 0.3–0.7 区间中的相对位置（0–100，超出区间会被夹紧） */
export function bandPosition(ratio: number): { percent: number; outside: 'below' | 'above' | null } {
  const percent = ((ratio - LOW_LINE) / (HIGH_LINE - LOW_LINE)) * 100;
  const clamped = Math.min(100, Math.max(0, percent));
  const outside = percent < 0 ? 'below' : percent > 100 ? 'above' : null;
  return { percent: clamped, outside };
}

/** 可见区间内的极值（用于只在图表可见范围绘制标记） */
export function extremesWithin(
  records: readonly HistoricalRecord[],
  minDate: string,
  maxDate: string,
): { min: HistoricalRecord | null; max: HistoricalRecord | null } {
  let minRec: HistoricalRecord | null = null;
  let maxRec: HistoricalRecord | null = null;
  for (const row of records) {
    if (row.date < minDate || row.date > maxDate) continue;
    if (!minRec || row.ratio < minRec.ratio) minRec = row;
    if (!maxRec || row.ratio > maxRec.ratio) maxRec = row;
  }
  return { min: minRec, max: maxRec };
}

/** 最新一条与其前一条 */
export function latestPair(records: readonly HistoricalRecord[]): {
  latest: HistoricalRecord | null;
  previous: HistoricalRecord | null;
} {
  const n = records.length;
  if (n === 0) return { latest: null, previous: null };
  return {
    latest: records[n - 1] as HistoricalRecord,
    previous: n >= 2 ? (records[n - 2] as HistoricalRecord) : null,
  };
}
