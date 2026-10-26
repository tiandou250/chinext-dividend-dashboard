#!/usr/bin/env tsx
/**
 * 数据完整性校验。
 *
 *   npm run data:validate            # 结构自检 + 与 metadata 比对（不发请求，秒级）
 *   npm run data:validate -- --full  # 额外全量重拉数据源逐日比对（发现早期缺口与历史修订）
 *   npm run data:validate -- --full --repair   # 比对后按数据源修复并写入
 *
 * 退出码：0 通过；3 发现问题（可用于 CI 守门）。
 */

import { resolve } from 'node:path';
import { boolFlag, parseArgs, strFlag } from './lib/args.ts';
import { beijingISO, beijingToday } from './lib/beijingTime.ts';
import {
  buildIndexMeta,
  buildMetadata,
  buildRecords,
  computeDataVersion,
  inspectRecords,
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

const PRICE_TOLERANCE = 0.005;

interface Problem {
  area: string;
  detail: string;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const outDir = resolve(strFlag(args, 'out', 'o') ?? 'public/data');
  const full = boolFlag(args, 'full');
  const repair = boolFlag(args, 'repair');
  const paths = {
    historical: resolve(outDir, 'historical.json'),
    metadata: resolve(outDir, 'metadata.json'),
  };

  const records = await readJsonFile<HistoricalRecord[]>(paths.historical);
  const meta = await readJsonFile<Metadata>(paths.metadata);
  const problems: Problem[] = [];

  console.log('━'.repeat(64));
  console.log(`数据校验｜${records.length} 条记录｜${full ? '结构 + 全量比对' : '结构自检'}`);
  console.log('━'.repeat(64));

  // ── 1. 结构检查
  const report = inspectRecords(records);
  console.log('\n[结构]');
  console.log(`  重复日期        ${report.duplicateDates}`);
  console.log(`  无效数值        ${report.invalidValues}`);
  console.log(`  比值不一致      ${report.ratioMismatch}`);
  console.log(`  顺序错误        ${report.orderErrors}`);
  console.log(`  最大自然日间隔  ${report.maxCalendarGapDays} 天`);
  console.log(`  可疑缺口        ${report.suspiciousGaps.length} 处`);

  if (report.duplicateDates > 0) problems.push({ area: '结构', detail: `重复日期 ${report.duplicateDates} 条` });
  if (report.invalidValues > 0) problems.push({ area: '结构', detail: `无效数值 ${report.invalidValues} 条` });
  if (report.ratioMismatch > 0) problems.push({ area: '结构', detail: `比值不一致 ${report.ratioMismatch} 条` });
  if (report.orderErrors > 0) problems.push({ area: '结构', detail: `日期顺序错误 ${report.orderErrors} 条` });

  // ── 2. metadata 一致性
  const first = records[0];
  const last = records[records.length - 1];
  const version = computeDataVersion(records);
  console.log('\n[metadata]');
  console.log(`  recordCount     ${meta.recordCount} / 实际 ${records.length}`);
  console.log(`  startDate       ${meta.startDate} / 实际 ${first?.date}`);
  console.log(`  latestTradingDate ${meta.latestTradingDate} / 实际 ${last?.date}`);
  console.log(`  dataVersion     ${meta.dataVersion} / 实际 ${version}`);

  if (meta.recordCount !== records.length)
    problems.push({ area: 'metadata', detail: `recordCount 不一致（${meta.recordCount} vs ${records.length}）` });
  if (meta.startDate !== first?.date)
    problems.push({ area: 'metadata', detail: `startDate 不一致（${meta.startDate} vs ${first?.date}）` });
  if (meta.latestTradingDate !== last?.date)
    problems.push({
      area: 'metadata',
      detail: `latestTradingDate 不一致（${meta.latestTradingDate} vs ${last?.date}）`,
    });
  if (meta.dataVersion !== version)
    problems.push({ area: 'metadata', detail: `dataVersion 与 historical 内容不匹配，前端缓存会失效` });

  // ── 3. 极值抽样（人工核对用）
  if (first && last) {
    const ratios = records.map((r) => r.ratio);
    let minRec = records[0] as HistoricalRecord;
    let maxRec = records[0] as HistoricalRecord;
    for (const r of records) {
      if (r.ratio < minRec.ratio) minRec = r;
      if (r.ratio > maxRec.ratio) maxRec = r;
    }
    console.log('\n[极值]');
    console.log(`  最低 ${minRec.ratio} @ ${minRec.date}（创业板 ${minRec.chinextClose} / 红利 ${minRec.dividendClose}）`);
    console.log(`  最高 ${maxRec.ratio} @ ${maxRec.date}（创业板 ${maxRec.chinextClose} / 红利 ${maxRec.dividendClose}）`);
    console.log(`  当前 ${last.ratio} @ ${last.date}`);
    void ratios;
  }

  // ── 4. 全量比对
  if (full) {
    console.log('\n[全量比对] 重新拉取数据源…');
    const provider = createProvider();
    const today = beijingToday();
    const chinext = await provider.fetchDailyCloses(INDEX_DEFINITIONS.chinext, {
      begin: TIMELINE_START,
      end: today,
    });
    const dividend = await provider.fetchDailyCloses(INDEX_DEFINITIONS.dividend, {
      begin: TIMELINE_START,
      end: today,
    });
    const { records: expected } = buildRecords(chinext, dividend);

    const localByDate = new Map(records.map((r) => [r.date, r]));
    const expectedByDate = new Map(expected.map((r) => [r.date, r]));

    const missing = expected.filter((r) => !localByDate.has(r.date));
    const extra = records.filter((r) => !expectedByDate.has(r.date));
    const mismatched = expected.filter((r) => {
      const local = localByDate.get(r.date);
      if (!local) return false;
      return (
        Math.abs(local.chinextClose - r.chinextClose) > PRICE_TOLERANCE ||
        Math.abs(local.dividendClose - r.dividendClose) > PRICE_TOLERANCE
      );
    });

    console.log(`  数据源 ${expected.length} 条 / 本地 ${records.length} 条`);
    console.log(`  本地缺失 ${missing.length} 条，本地多余 ${extra.length} 条，数值不一致 ${mismatched.length} 条`);

    for (const r of missing.slice(0, 8)) {
      console.log(`    缺失 ${r.date}：创业板 ${r.chinextClose} / 红利 ${r.dividendClose}`);
    }
    for (const r of extra.slice(0, 8)) {
      console.log(`    多余 ${r.date}：本地创业板 ${r.chinextClose}（数据源无此交易日）`);
    }
    for (const r of mismatched.slice(0, 8)) {
      const local = localByDate.get(r.date);
      console.log(
        `    不一致 ${r.date}：本地 ${local?.chinextClose}/${local?.dividendClose} → 数据源 ${r.chinextClose}/${r.dividendClose}`,
      );
    }

    if (missing.length > 0) problems.push({ area: '全量', detail: `本地缺失 ${missing.length} 个交易日` });
    if (extra.length > 0) problems.push({ area: '全量', detail: `本地多出 ${extra.length} 个交易日` });
    if (mismatched.length > 0)
      problems.push({ area: '全量', detail: `收盘点位不一致 ${mismatched.length} 条` });

    if (repair && expected.length > 0) {
      const runAt = beijingISO();
      const healed = buildMetadata({
        records: expected,
        provider: provider.info,
        indices: {
          chinext: buildIndexMeta('chinext', expected, {
            firstDate: chinext[0]?.date ?? null,
            lastDate: chinext[chinext.length - 1]?.date ?? null,
          }, provider.info.id),
          dividend: buildIndexMeta('dividend', expected, {
            firstDate: dividend[0]?.date ?? null,
            lastDate: dividend[dividend.length - 1]?.date ?? null,
          }, provider.info.id),
        },
        lastUpdate: {
          status: 'success',
          runAt,
          message: `完整性校验修复：${expected.length} 条`,
        },
        integrity: inspectRecords(expected),
      });
      await writeFileAtomic(paths.historical, serializeRecords(expected));
      await writeFileAtomic(paths.metadata, `${JSON.stringify(healed, null, 2)}\n`);
      console.log(`  ✓ 已按数据源修复并写入（${expected.length} 条，版本 ${healed.dataVersion}）`);
      problems.length = 0;
    } else if (repair) {
      console.warn('  ! 数据源无返回，跳过修复');
    }
  }

  // ── 汇总
  console.log('\n' + '─'.repeat(64));
  if (problems.length === 0) {
    console.log('✓ 校验通过');
    return;
  }
  console.error(`✗ 发现 ${problems.length} 项问题：`);
  for (const p of problems) console.error(`   [${p.area}] ${p.detail}`);
  if (!repair) console.error('  提示：加 --full 做数据源比对，加 --repair 按数据源修复。');
  process.exitCode = 3;
}

main().catch((err: unknown) => {
  const { code, message } = describeError(err);
  console.error(`\n✗ 校验脚本异常 [${code}]：${message}`);
  if (err instanceof AppError && err.context) console.error('  上下文：', JSON.stringify(err.context));
  process.exit(err instanceof AppError ? err.exitCode : 1);
});
