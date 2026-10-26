#!/usr/bin/env tsx
/**
 * 增量更新：只抓取本地缺失的交易日，并额外重查最近 5 个交易日以吸收数据源的历史修订。
 *
 * 用法：
 *   npx tsx scripts/update-data.ts
 *   npx tsx scripts/update-data.ts --out public/data
 *
 * 行为保证：
 *  - 无变化时不写任何文件（避免 Actions 产生空提交）
 *  - 网络失败 / 数据异常时退出码非 0，且不触碰现有文件
 *  - 同一天多次运行不会产生重复记录
 */

import { resolve } from 'node:path';
import { parseArgs, strFlag } from './lib/args.ts';
import { beijingISO, beijingToday } from './lib/beijingTime.ts';
import {
  assertRecordsValid,
  buildIndexMeta,
  buildMetadata,
  buildRecords,
  inspectRecords,
  mergeRecords,
  readJsonFile,
  serializeRecords,
  writeFileAtomic,
} from './lib/dataset.ts';
import { AppError, describeError } from '../shared/errors.ts';
import { createProvider } from './lib/providers/index.ts';
import {
  INDEX_DEFINITIONS,
  TIMELINE_START,
  type HistoricalRecord,
  type Metadata,
} from './lib/types.ts';

/** 回溯重查的交易日数量（处理数据源事后修订） */
const RECHECK_TRADING_DAYS = 5;

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const outDir = resolve(strFlag(args, 'out', 'o') ?? 'public/data');
  const paths = {
    historical: resolve(outDir, 'historical.json'),
    metadata: resolve(outDir, 'metadata.json'),
  };
  const today = beijingToday();

  let records: HistoricalRecord[];
  let previousMeta: Metadata;
  try {
    records = await readJsonFile<HistoricalRecord[]>(paths.historical);
    previousMeta = await readJsonFile<Metadata>(paths.metadata);
  } catch (err) {
    if (err instanceof AppError && err.code === 'E_NOT_FOUND') {
      throw new AppError('E_USAGE', '本地还没有历史数据，请先执行：npm run data:init', {
        cause: err,
      });
    }
    throw err;
  }

  if (records.length === 0) {
    throw new AppError('E_INPUT', '本地历史文件为空，请重新初始化');
  }

  const oldLast = records[records.length - 1] as HistoricalRecord;
  // 从倒数第 6 个交易日开始重查：覆盖最近 5 个交易日 + 首个缺失日
  const anchor = records[Math.max(0, records.length - 1 - RECHECK_TRADING_DAYS)] as HistoricalRecord;
  const begin = anchor.date < TIMELINE_START ? TIMELINE_START : anchor.date;

  console.log('━'.repeat(64));
  console.log(`增量更新｜本地 ${records.length} 条，最新 ${oldLast.date}`);
  console.log(`重查区间：${begin} → ${today}（含最近 ${RECHECK_TRADING_DAYS} 个交易日修订）`);
  console.log('━'.repeat(64));

  const provider = createProvider();
  // 失败时直接抛错退出：现有文件保持原样
  const chinext = await provider.fetchDailyCloses(INDEX_DEFINITIONS.chinext, { begin, end: today });
  const dividend = await provider.fetchDailyCloses(INDEX_DEFINITIONS.dividend, { begin, end: today });
  console.log(
    `抓取完成：创业板 ${chinext.length} 条（至 ${chinext[chinext.length - 1]?.date}），红利 ${dividend.length} 条（至 ${dividend[dividend.length - 1]?.date}）`,
  );

  const { records: incoming } = buildRecords(chinext, dividend);
  if (incoming.length === 0) {
    console.log('数据源未返回任何可比对交易日，保持现状。');
    return;
  }

  const merged = mergeRecords(records, incoming);

  if (merged.added === 0 && merged.updated === 0) {
    console.log(`无变化：重查 ${incoming.length} 个交易日，数据已是最新（${oldLast.date}）。`);
    return;
  }

  // ── 写盘前的保守校验：不允许数据"倒退"或大面积丢失
  const oldCount = records.length;
  const newLast = merged.records[merged.records.length - 1] as HistoricalRecord;
  if (merged.records.length < oldCount) {
    throw new AppError(
      'E_INPUT',
      `合并后记录数减少（${oldCount} → ${merged.records.length}），疑似数据源异常，已放弃写入`,
    );
  }
  if (newLast.date < oldLast.date) {
    throw new AppError(
      'E_INPUT',
      `合并后最新日期倒退（${oldLast.date} → ${newLast.date}），已放弃写入`,
    );
  }

  const integrity = assertRecordsValid(merged.records);
  const runAt = beijingISO();

  const metadata = buildMetadata({
    records: merged.records,
    provider: provider.info,
    indices: {
      chinext: buildIndexMeta('chinext', merged.records, {
        firstDate: previousMeta.indices?.chinext?.sourceFirstDate ?? null,
        lastDate: chinext[chinext.length - 1]?.date ?? null,
      }, provider.info.id),
      dividend: buildIndexMeta('dividend', merged.records, {
        firstDate: previousMeta.indices?.dividend?.sourceFirstDate ?? null,
        lastDate: dividend[dividend.length - 1]?.date ?? null,
      }, provider.info.id),
    },
    lastUpdate: {
      status: 'success',
      runAt,
      message: `新增 ${merged.added} 条，修订 ${merged.updated} 条`,
    },
    coverageNote: previousMeta.coverageNote ?? null,
    integrity,
  });

  await writeFileAtomic(paths.historical, serializeRecords(merged.records));
  await writeFileAtomic(paths.metadata, `${JSON.stringify(metadata, null, 2)}\n`);

  const added = merged.records.slice(oldCount);
  console.log('\n── 更新结果 ──────────────────────────────────');
  console.log(`  新增 ${merged.added} 条，修订 ${merged.updated} 条，总记录 ${merged.records.length}`);
  if (added.length > 0) {
    console.log(`  新增区间：${added[0]?.date} → ${added[added.length - 1]?.date}`);
  }
  console.log(`  最新交易日：${newLast.date}`);
  console.log(`  数据版本：${metadata.dataVersion}`);
  console.log(`  ✓ 已更新 ${paths.historical}`);
  console.log(`  ✓ 已更新 ${paths.metadata}`);

  const report = inspectRecords(merged.records);
  if (report.suspiciousGaps.length > 0) {
    console.warn(`  ! 存在 ${report.suspiciousGaps.length} 处 >12 天缺口，建议跑一次 data:validate --full`);
  }
}

main().catch((err: unknown) => {
  const { code, message } = describeError(err);
  console.error(`\n✗ 更新失败 [${code}]：${message}`);
  if (err instanceof AppError && err.context) console.error('  上下文：', JSON.stringify(err.context));
  console.error('  现有历史文件未被修改。');
  process.exit(err instanceof AppError ? err.exitCode : 1);
});
