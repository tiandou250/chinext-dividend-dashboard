/**
 * 数据集构建、合并、校验与持久化。
 * 这里是「数据准确性」的唯一出口：所有写盘前都要过 validateRecords。
 */

import { createHash } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { calendarDaysBetween } from './beijingTime.ts';
import { AppError, fromNodeError } from '../../shared/errors.ts';
import { round } from '../../shared/math.ts';
import {
  INDEX_DEFINITIONS,
  RATIO_DECIMALS,
  TIMELINE_START,
  type DailyClose,
  type HistoricalRecord,
  type IndexKey,
  type IndexMeta,
  type Metadata,
} from './types.ts';
import type { ProviderInfo } from './providers/types.ts';
import { symbolFor } from './providers/index.ts';

/** 相邻两个交易日之间允许的最大自然日间隔；超过则记为可疑缺口（长假最多约 9~10 天） */
export const SUSPICIOUS_GAP_DAYS = 12;

/**
 * 收盘点位落库精度。
 * 取 4 位是为了无损容纳各数据源的原始精度（腾讯 3 位、东方财富 2 位），
 * 同时保证「比值永远由落库后的收盘价推出」，避免出现"比值与收盘价对不上"的自相矛盾。
 */
export const PRICE_DECIMALS = 4;

/** 计算比值，保留 6 位小数；计算永远基于原始收盘点位，不使用展示值 */
export function computeRatio(chinextClose: number, dividendClose: number): number {
  if (!Number.isFinite(chinextClose) || !Number.isFinite(dividendClose)) {
    throw new AppError('E_INPUT', '收盘点位必须是有限数', { context: { chinextClose, dividendClose } });
  }
  if (dividendClose <= 0) {
    throw new AppError('E_INPUT', '中证红利收盘点位必须大于 0', { context: { dividendClose } });
  }
  return round(chinextClose / dividendClose, RATIO_DECIMALS);
}

/**
 * 按交易日取交集：只有两个指数都有有效收盘时才产生记录。
 * 缺失一侧的日期直接跳过，绝不插值或沿用前值。
 */
export function buildRecords(
  chinext: readonly DailyClose[],
  dividend: readonly DailyClose[],
): { records: HistoricalRecord[]; onlyChinext: number; onlyDividend: number } {
  const right = new Map(dividend.map((bar) => [bar.date, bar.close]));
  const records: HistoricalRecord[] = [];
  let onlyChinext = 0;

  for (const bar of chinext) {
    const other = right.get(bar.date);
    if (other === undefined) {
      onlyChinext += 1;
      continue;
    }
    if (bar.close <= 0 || other <= 0) continue;
    const chinextClose = round(bar.close, PRICE_DECIMALS);
    const dividendClose = round(other, PRICE_DECIMALS);
    records.push({
      date: bar.date,
      chinextClose,
      dividendClose,
      // 比值由落库后的点位推出，保证任何时刻都能用文件内的数据复算出同一个比值
      ratio: computeRatio(chinextClose, dividendClose),
    });
  }

  const leftDates = new Set(chinext.map((bar) => bar.date));
  let onlyDividend = 0;
  for (const bar of dividend) {
    if (!leftDates.has(bar.date)) onlyDividend += 1;
  }

  records.sort((a, b) => a.date.localeCompare(b.date));
  return { records, onlyChinext, onlyDividend };
}

export interface MergeResult {
  records: HistoricalRecord[];
  added: number;
  updated: number;
  unchanged: number;
}

/**
 * 增量合并：以新抓取的数据覆盖同日旧记录（修复数据源历史修订），
 * 再按日期升序去重合并，并重算受影响日期的比值。
 */
export function mergeRecords(
  existing: readonly HistoricalRecord[],
  incoming: readonly HistoricalRecord[],
): MergeResult {
  const map = new Map<string, HistoricalRecord>();
  for (const row of existing) map.set(row.date, row);

  let added = 0;
  let updated = 0;
  let unchanged = 0;

  for (const row of incoming) {
    const prev = map.get(row.date);
    if (!prev) {
      added += 1;
    } else if (
      prev.chinextClose !== row.chinextClose ||
      prev.dividendClose !== row.dividendClose
    ) {
      updated += 1;
    } else {
      unchanged += 1;
    }
    // 无论新增还是修订，都写入最新值（比值以原始点位重算，不沿用旧值）
    map.set(row.date, { ...row, ratio: computeRatio(row.chinextClose, row.dividendClose) });
  }

  const records = [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
  return { records, added, updated, unchanged };
}

export interface IntegrityReport {
  duplicateDates: number;
  invalidValues: number;
  ratioMismatch: number;
  orderErrors: number;
  suspiciousGaps: Array<{ from: string; to: string; calendarDays: number }>;
  maxCalendarGapDays: number;
  beforeTimelineStart: number;
}

/** 结构完整性检查（不发网络请求） */
export function inspectRecords(records: readonly HistoricalRecord[]): IntegrityReport {
  const seen = new Set<string>();
  let duplicateDates = 0;
  let invalidValues = 0;
  let ratioMismatch = 0;
  let orderErrors = 0;
  let beforeTimelineStart = 0;
  const suspiciousGaps: IntegrityReport['suspiciousGaps'] = [];
  let maxGap = 0;

  let prevDate: string | null = null;
  for (const row of records) {
    if (seen.has(row.date)) duplicateDates += 1;
    seen.add(row.date);

    if (row.date < TIMELINE_START) beforeTimelineStart += 1;
    if (
      !Number.isFinite(row.chinextClose) ||
      !Number.isFinite(row.dividendClose) ||
      row.chinextClose <= 0 ||
      row.dividendClose <= 0 ||
      !Number.isFinite(row.ratio) ||
      row.ratio <= 0
    ) {
      invalidValues += 1;
    } else if (Math.abs(computeRatio(row.chinextClose, row.dividendClose) - row.ratio) > 1e-9) {
      ratioMismatch += 1;
    }

    if (prevDate !== null) {
      if (row.date <= prevDate) orderErrors += 1;
      const gap = calendarDaysBetween(prevDate, row.date);
      if (gap > maxGap) maxGap = gap;
      if (gap > SUSPICIOUS_GAP_DAYS) {
        suspiciousGaps.push({ from: prevDate, to: row.date, calendarDays: gap });
      }
    }
    prevDate = row.date;
  }

  return {
    duplicateDates,
    invalidValues,
    ratioMismatch,
    orderErrors,
    suspiciousGaps: suspiciousGaps.slice(0, 50),
    maxCalendarGapDays: maxGap,
    beforeTimelineStart,
  };
}

/**
 * 写盘前的强校验。任何一项失败都抛错，调用方不得写入。
 */
export function assertRecordsValid(records: readonly HistoricalRecord[]): IntegrityReport {
  if (records.length === 0) {
    throw new AppError('E_INPUT', '数据集为空，拒绝写入');
  }
  const report = inspectRecords(records);
  const problems: string[] = [];
  if (report.duplicateDates > 0) problems.push(`重复日期 ${report.duplicateDates} 条`);
  if (report.invalidValues > 0) problems.push(`无效数值 ${report.invalidValues} 条`);
  if (report.ratioMismatch > 0) problems.push(`比值与收盘点位不一致 ${report.ratioMismatch} 条`);
  if (report.orderErrors > 0) problems.push(`日期顺序错误 ${report.orderErrors} 条`);
  if (report.beforeTimelineStart > 0) problems.push(`早于时间轴起点 ${report.beforeTimelineStart} 条`);

  if (problems.length > 0) {
    throw new AppError('E_INPUT', `数据校验失败：${problems.join('；')}`, { context: { ...report } });
  }
  return report;
}

/** 数据版本 = historical.json 内容哈希前 12 位，用于前端缓存失效 */
export function computeDataVersion(records: readonly HistoricalRecord[]): string {
  const digest = createHash('sha256').update(JSON.stringify(records)).digest('hex');
  return digest.slice(0, 12);
}

/** 稳定序列化：字段顺序固定，便于 diff 审阅 */
export function serializeRecords(records: readonly HistoricalRecord[]): string {
  const compact = records.map(
    (r) =>
      `{"date":"${r.date}","chinextClose":${r.chinextClose},"dividendClose":${r.dividendClose},"ratio":${r.ratio}}`,
  );
  return `[${compact.join(',')}]\n`;
}

export async function readJsonFile<T>(path: string): Promise<T> {
  try {
    const text = await readFile(path, 'utf8');
    return JSON.parse(text.replace(/^\uFEFF/, '')) as T;
  } catch (err) {
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr.code === 'ENOENT') {
      throw new AppError('E_NOT_FOUND', `数据文件不存在：${path}`, { context: { path } });
    }
    if (err instanceof SyntaxError) {
      throw new AppError('E_INPUT', `数据文件不是合法 JSON：${path}`, { context: { path }, cause: err });
    }
    throw fromNodeError(err);
  }
}

/**
 * 原子写入：先写临时文件 → fsync → 校验可解析 → rename 覆盖。
 * 中途崩溃只会留下 .tmp，正式文件永远保持上一份完整版本。
 */
export async function writeFileAtomic(path: string, content: string): Promise<void> {
  const dir = dirname(path);
  await mkdir(dir, { recursive: true });
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;

  try {
    const handle = await open(tmp, 'w');
    try {
      await handle.writeFile(content, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }

    // 落盘前先自检，避免把坏 JSON 替换到正式文件
    JSON.parse((await readFile(tmp, 'utf8')).replace(/^\uFEFF/, ''));
    await rename(tmp, path);
  } catch (err) {
    await unlink(tmp).catch(() => undefined);
    throw fromNodeError(err);
  }
}

/**
 * 覆盖情况说明：把"时间轴起点 vs 实际数据集起点"的差异写清楚，
 * 便于前端与 README 如实交代哪些区间没有数据（而不是看起来数据是完整的）。
 */
export function describeCoverage(params: {
  datasetStart: string | null;
  chinextSourceFirst: string | null;
  dividendSourceFirst: string | null;
  supplementNote: string | null;
}): string {
  const { datasetStart, chinextSourceFirst, dividendSourceFirst, supplementNote } = params;
  const parts: string[] = [];

  parts.push(`时间轴起点 ${TIMELINE_START}；数据集自 ${datasetStart ?? '—'} 起`);

  if (chinextSourceFirst) {
    parts.push(`创业板指数在所配数据源的首条日线为 ${chinextSourceFirst}（该指数 2010-06-01 正式发布，2010-05-31 为基日）`);
  }
  if (dividendSourceFirst) {
    parts.push(`中证红利指数在所配数据源的首条日线为 ${dividendSourceFirst}`);
  }
  parts.push('两指数同日均有有效收盘才生成记录，缺失一侧的交易日留空、不插值不沿用');
  if (supplementNote) parts.push(`首段补充：${supplementNote}`);

  return parts.join('；') + '。';
}

export function buildIndexMeta(
  key: IndexKey,
  records: readonly HistoricalRecord[],
  source: { firstDate: string | null; lastDate: string | null },
  providerId: string,
): IndexMeta {
  const def = INDEX_DEFINITIONS[key];
  const first = records[0];
  const last = records[records.length - 1];
  return {
    name: def.name,
    code: def.code,
    market: def.market,
    providerSymbol: symbolFor(providerId, def),
    firstDate: first?.date ?? null,
    lastDate: last?.date ?? null,
    recordCount: records.length,
    sourceFirstDate: source.firstDate,
    sourceLastDate: source.lastDate,
    note:
      key === 'chinext'
        ? '创业板指数 2010-06-01 正式发布（基日 2010-05-31、基点 1000）。2009-10-30 至 2010-05-31 无可核实点位，按规则留空，不编造。'
        : '中证红利指数数据源可覆盖至 2005 年以前，本项目自 2009-10-30 时间轴起点开始取数。',
  };
}

export function buildMetadata(params: {
  records: readonly HistoricalRecord[];
  provider: ProviderInfo;
  indices: Record<IndexKey, IndexMeta>;
  lastUpdate: Metadata['lastUpdate'];
  integrity: IntegrityReport;
  coverageNote?: string | null;
}): Metadata {
  const { records, provider, indices, lastUpdate, integrity } = params;
  const first = records[0];
  const last = records[records.length - 1];
  if (!first || !last) throw new AppError('E_INTERNAL', '数据集为空，无法生成 metadata');

  return {
    schemaVersion: 1,
    dataVersion: computeDataVersion(records),
    recordCount: records.length,
    timelineStart: TIMELINE_START,
    startDate: first.date,
    latestTradingDate: last.date,
    generatedAt: lastUpdate.runAt,
    lastUpdate,
    coverageNote: params.coverageNote ?? null,
    indices,
    provider: {
      id: provider.id,
      name: provider.name,
      endpoint: provider.endpoint,
      terms: provider.terms,
      license: provider.license,
    },
    method: {
      ratioFormula: 'ratio = chinextClose / dividendClose',
      ratioDecimals: RATIO_DECIMALS,
      priceBasis: '日线收盘点位（不复权，指数点位本身无需复权）',
      calendarNote:
        '仅收录两个指数均有有效收盘的交易日的记录；周末、节假日不产生记录；当日未收盘的行情不采纳。',
    },
    integrity: {
      duplicateDates: integrity.duplicateDates,
      invalidValues: integrity.invalidValues,
      suspiciousGaps: integrity.suspiciousGaps,
      maxCalendarGapDays: integrity.maxCalendarGapDays,
    },
  };
}
