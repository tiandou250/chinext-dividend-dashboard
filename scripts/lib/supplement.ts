/**
 * 首段区间补充。
 *
 * 不同的公开数据源对创业板指数最早几个交易日（2010-06-01 前后）的覆盖并不一致：
 * 腾讯缺 2010-06-01，东方财富有。为了尽量贴近「时间轴起点」，
 * 在初始化时用一个补充源填补主源起点之前的空档。
 *
 * 注意：补充失败只告警，不影响初始化；缺口会在 metadata 里如实记录，绝不编造。
 */

import { shiftDate } from './beijingTime.ts';
import { AppError } from '../../shared/errors.ts';
import { createProvider } from './providers/index.ts';
import { INDEX_DEFINITIONS, type DailyClose, type IndexKey } from './types.ts';

export interface SupplementResult {
  chinext: DailyClose[];
  dividend: DailyClose[];
  /** 本次补齐的记录数（两个指数合计） */
  filled: number;
  /** 补齐后的实际起点 */
  effectiveStart: string | null;
  /** 未能补齐时的原因，供 metadata 记录 */
  note: string | null;
}

function mergeBars(primary: DailyClose[], extra: DailyClose[]): DailyClose[] {
  const map = new Map<string, number>();
  for (const bar of extra) map.set(bar.date, bar.close);
  // 主源优先：同日冲突时保留主源数值
  for (const bar of primary) map.set(bar.date, bar.close);
  return [...map.entries()]
    .map(([date, close]) => ({ date, close }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function fillEarliestWindow(params: {
  chinext: DailyClose[];
  dividend: DailyClose[];
  targetBegin: string;
  providerId?: string;
  attempts?: number;
}): Promise<SupplementResult> {
  const { chinext, dividend, targetBegin } = params;
  const supplementId = params.providerId ?? process.env.SUPPLEMENT_PROVIDER ?? 'eastmoney';

  const firstDates = [chinext[0]?.date, dividend[0]?.date].filter(
    (d): d is string => typeof d === 'string',
  );
  // 数据集起点 = 两个指数都取得到数据的第一个交易日（即较晚的那个）
  const datasetStart = firstDates.length > 0 ? firstDates.sort()[firstDates.length - 1] ?? null : null;

  const result: SupplementResult = {
    chinext,
    dividend,
    filled: 0,
    effectiveStart: datasetStart,
    note: null,
  };

  if (datasetStart === null || datasetStart <= targetBegin) return result;

  const gapEnd = shiftDate(datasetStart, -1);
  if (gapEnd < targetBegin) return result;

  let provider;
  try {
    provider = createProvider(supplementId, {
      // 补充是"尽力而为"，失败要快，不要拖长初始化时间
      attempts: Number(process.env.SUPPLEMENT_ATTEMPTS ?? 3),
    });
  } catch {
    result.note = `补充源不可用（${supplementId}）`;
    return result;
  }

  console.log(
    `\n[补充] 数据集起点为 ${datasetStart}，尝试用补充源「${provider.info.name}」补齐 ${targetBegin} → ${gapEnd}`,
  );

  try {
    const extraChinext = await provider.fetchDailyCloses(INDEX_DEFINITIONS.chinext, {
      begin: targetBegin,
      end: gapEnd,
    });
    const extraDividend = await provider.fetchDailyCloses(INDEX_DEFINITIONS.dividend, {
      begin: targetBegin,
      end: gapEnd,
    });

    const mergedChinext = mergeBars(chinext, extraChinext);
    const mergedDividend = mergeBars(dividend, extraDividend);
    result.filled = extraChinext.length + extraDividend.length;
    result.chinext = mergedChinext;
    result.dividend = mergedDividend;

    const newFirstDates = [mergedChinext[0]?.date, mergedDividend[0]?.date].filter(
      (d): d is string => typeof d === 'string',
    );
    const newStart =
      newFirstDates.length > 0 ? newFirstDates.sort()[newFirstDates.length - 1] ?? null : null;
    result.effectiveStart = newStart;
    console.log(`      补齐 ${result.filled} 条，数据集起点 ${datasetStart} → ${newStart}`);
  } catch (err) {
    const message = err instanceof AppError ? err.message : String(err);
    result.note = `补充源（${supplementId}）本次不可达，${targetBegin} → ${gapEnd} 区间未补齐：${message}`;
    console.warn(`      补齐失败，保留主源数据：${message}`);
  }

  return result;
}

export type { IndexKey };
