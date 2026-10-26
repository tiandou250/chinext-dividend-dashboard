#!/usr/bin/env tsx
/**
 * 首次初始化：拉取两个指数的完整可用日线，生成 public/data/historical.json 与 metadata.json。
 *
 * 用法：
 *   npx tsx scripts/initialize-data.ts
 *   npx tsx scripts/initialize-data.ts --out public/data --dry-run
 *
 * 安全约定：
 *  - 只写入「两个指数同日都有有效收盘」的记录
 *  - 不插值、不复制截图、不根据图形还原数据
 *  - 写盘前必须通过 assertRecordsValid
 */

import { resolve } from 'node:path';
import { parseArgs, strFlag, boolFlag } from './lib/args.ts';
import { beijingISO, beijingToday } from './lib/beijingTime.ts';
import {
  assertRecordsValid,
  buildIndexMeta,
  buildMetadata,
  buildRecords,
  computeDataVersion,
  describeCoverage,
  readJsonFile,
  serializeRecords,
  writeFileAtomic,
} from './lib/dataset.ts';
import { AppError, describeError } from '../shared/errors.ts';
import { createProvider } from './lib/providers/index.ts';
import { fillEarliestWindow } from './lib/supplement.ts';
import {
  INDEX_DEFINITIONS,
  TIMELINE_START,
  type DailyClose,
  type HistoricalRecord,
  type Metadata,
} from './lib/types.ts';

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const outDir = resolve(strFlag(args, 'out', 'o') ?? 'public/data');
  const dryRun = boolFlag(args, 'dry-run');
  const today = beijingToday();

  const provider = createProvider();
  console.log('━'.repeat(64));
  console.log(`初始化历史数据｜数据源：${provider.info.name}`);
  console.log(`时间轴起点：${TIMELINE_START}　抓取截止：${today}`);
  console.log(`输出目录：${outDir}${dryRun ? '（dry-run，不写盘）' : ''}`);
  console.log('━'.repeat(64));

  const existingPaths = {
    historical: resolve(outDir, 'historical.json'),
    metadata: resolve(outDir, 'metadata.json'),
  };
  if (!dryRun) {
    const existing = await readJsonFile<HistoricalRecord[]>(existingPaths.historical).catch(
      () => null,
    );
    if (existing && existing.length > 0) {
      console.warn(
        `! 已存在历史文件（${existing.length} 条），本次初始化将覆盖。若只想补最新数据，请改用 update-data.ts`,
      );
    }
  }

  // ── 顺序抓取：并发请求更容易触发行情接口的连接中断
  console.log('\n[1/5] 拉取创业板指数（399006.SZ）…');
  const chinextRaw: DailyClose[] = await provider.fetchDailyCloses(INDEX_DEFINITIONS.chinext, {
    begin: TIMELINE_START,
    end: today,
  });
  console.log(`      收到 ${chinextRaw.length} 条，${chinextRaw[0]?.date} → ${chinextRaw[chinextRaw.length - 1]?.date}`);

  console.log('\n[2/5] 拉取中证红利指数（000922.SH）…');
  const dividendRaw: DailyClose[] = await provider.fetchDailyCloses(INDEX_DEFINITIONS.dividend, {
    begin: TIMELINE_START,
    end: today,
  });
  console.log(
    `      收到 ${dividendRaw.length} 条，${dividendRaw[0]?.date} → ${dividendRaw[dividendRaw.length - 1]?.date}`,
  );

  // ── 首段区间补充：各数据源对创业板最早几个交易日的覆盖不一致
  const supplement = await fillEarliestWindow({
    chinext: chinextRaw,
    dividend: dividendRaw,
    targetBegin: TIMELINE_START,
  });
  const chinext = supplement.chinext;
  const dividend = supplement.dividend;

  console.log('\n[3/5] 按交易日对齐并计算比值…');
  const { records, onlyChinext, onlyDividend } = buildRecords(chinext, dividend);
  if (onlyChinext > 0 || onlyDividend > 0) {
    console.log(`      单边缺失：创业板独有 ${onlyChinext} 天，红利独有 ${onlyDividend} 天（已跳过，不插值）`);
  }

  console.log('\n[4/5] 校验…');
  const integrity = assertRecordsValid(records);
  if (integrity.suspiciousGaps.length > 0) {
    console.warn(`! 发现 ${integrity.suspiciousGaps.length} 处超过 ${12} 天的缺口（需人工确认是否长假）：`);
    for (const gap of integrity.suspiciousGaps.slice(0, 8)) {
      console.warn(`    ${gap.from} → ${gap.to}（${gap.calendarDays} 天）`);
    }
  } else {
    console.log(`      无异常缺口，最大间隔 ${integrity.maxCalendarGapDays} 天`);
  }

  const runAt = beijingISO();
  const coverageNote = describeCoverage({
    datasetStart: records[0]?.date ?? null,
    chinextSourceFirst: chinext[0]?.date ?? null,
    dividendSourceFirst: dividend[0]?.date ?? null,
    supplementNote: supplement.note,
  });
  console.log(`\n  覆盖说明：${coverageNote}`);

  const metadata: Metadata = buildMetadata({
    records,
    provider: provider.info,
    indices: {
      chinext: buildIndexMeta('chinext', records, {
        firstDate: chinext[0]?.date ?? null,
        lastDate: chinext[chinext.length - 1]?.date ?? null,
      }, provider.info.id),
      dividend: buildIndexMeta('dividend', records, {
        firstDate: dividend[0]?.date ?? null,
        lastDate: dividend[dividend.length - 1]?.date ?? null,
      }, provider.info.id),
    },
    lastUpdate: {
      status: 'success',
      runAt,
      message: `首次初始化：${records.length} 条记录`,
    },
    coverageNote,
    integrity,
  });

  const ratios = records.map((r) => r.ratio);
  const minIdx = ratios.indexOf(Math.min(...ratios));
  const maxIdx = ratios.indexOf(Math.max(...ratios));
  const minRecord = records[minIdx];
  const maxRecord = records[maxIdx];

  console.log('\n── 数据集概览 ────────────────────────────────');
  console.log(`  记录数        ${records.length}`);
  console.log(`  首个交易日    ${records[0]?.date}`);
  console.log(`  最新交易日    ${records[records.length - 1]?.date}`);
  if (minRecord && maxRecord) {
    console.log(`  历史最低比值  ${minRecord.ratio.toFixed(6)}（${minRecord.date}）`);
    console.log(`  历史最高比值  ${maxRecord.ratio.toFixed(6)}（${maxRecord.date}）`);
  }
  console.log(`  数据版本      ${computeDataVersion(records)}`);

  if (dryRun) {
    console.log('\n  dry-run：未写入任何文件。');
    return;
  }

  await writeFileAtomic(existingPaths.historical, serializeRecords(records));
  await writeFileAtomic(existingPaths.metadata, `${JSON.stringify(metadata, null, 2)}\n`);
  console.log(`\n✓ 已写入 ${existingPaths.historical}`);
  console.log(`✓ 已写入 ${existingPaths.metadata}`);
}

main().catch((err: unknown) => {
  const { code, message } = describeError(err);
  console.error(`\n✗ 初始化失败 [${code}]：${message}`);
  if (err instanceof AppError && err.context) {
    console.error('  上下文：', JSON.stringify(err.context));
  }
  process.exit(err instanceof AppError ? err.exitCode : 1);
});
