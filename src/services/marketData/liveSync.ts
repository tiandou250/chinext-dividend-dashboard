/**
 * 浏览器端补数：用与构建脚本完全相同的接口，把快照之后缺失的交易日补上。
 *
 * 为什么需要它：
 *   静态站的数据文件只能靠外部任务（GitHub Actions 定时任务）刷新，而 GitHub 的
 *   `schedule` 是"尽力而为"的 —— 会延迟、会跳过，实测在本仓库长期不触发。
 *   而腾讯这个日线接口返回 `Access-Control-Allow-Origin: *`，浏览器可以直接取数，
 *   所以让页面自己补齐，用户打开就是最新收盘，不依赖任何定时任务。
 *
 * 口径与脚本保持一致（scripts/lib/providers/tencent.ts + beijingTime.ts）：
 *   - 同一接口、同一参数：param=<symbol>,day,,,<count>,
 *   - 只用 row[2] 作为收盘价
 *   - 当天 16:00 前不上库（数据源收盘后仍会修订）
 *   - 比值永远由落库后的收盘价推出，保留 6 位小数；收盘价保留 4 位
 *
 * 失败一律静默：拿到什么用什么，不影响快照本身的展示。
 */

import type { HistoricalRecord } from '@/types/market';

const ENDPOINT = 'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get';
const CHINEXT_SYMBOL = 'sz399006';
const DIVIDEND_SYMBOL = 'sh000922';

const PRICE_DECIMALS = 4;
const RATIO_DECIMALS = 6;
/** 与 scripts/lib/beijingTime.ts 的 DAILY_BAR_READY_CLOCK_MINUTES 对齐 */
const DAILY_BAR_READY_CLOCK_MINUTES = 16 * 60;
/** 一次取 60 根日线，够补两个月内的缺口；再多也不值得为静态站付出这个流量 */
const BAR_FETCH_COUNT = 60;
const TIMEOUT_MS = 8_000;

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** 取北京时间的日期与"当天第几分钟"，避免海外访客按本地时区判错"今天是哪天" */
function beijingClock(now: Date = new Date()): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';
  return {
    date: `${pick('year')}-${pick('month')}-${pick('day')}`,
    minutes: Number(pick('hour')) * 60 + Number(pick('minute')),
  };
}

interface TencentKlineRow extends Array<string> {}
interface TencentKlineResponse {
  code?: number;
  data?: Record<string, { day?: TencentKlineRow[]; qfqday?: TencentKlineRow[] }>;
}

/** 抓一个指数最近的日线收盘，返回 date → close */
async function fetchCloses(symbol: string, signal?: AbortSignal): Promise<Map<string, number>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const forwardAbort = () => controller.abort();
  signal?.addEventListener('abort', forwardAbort, { once: true });

  try {
    const url = `${ENDPOINT}?param=${symbol},day,,,${BAR_FETCH_COUNT},`;
    // 不加自定义请求头，避免触发预检；这个接口本身允许任意来源跨域
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const json = (await response.json()) as TencentKlineResponse;
    if (json.code !== 0) throw new Error(`数据源返回 code=${json.code}`);

    const block = json.data?.[symbol];
    const rows = block?.day ?? block?.qfqday ?? [];
    const out = new Map<string, number>();
    for (const row of rows) {
      const date = row[0];
      const close = Number(row[2]);
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      if (!Number.isFinite(close) || close <= 0) continue;
      out.set(date, close);
    }
    return out;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', forwardAbort);
  }
}

export interface LiveSyncResult {
  records: HistoricalRecord[];
  /** 本次补齐的交易日（升序），为空表示没有缺口 */
  appended: string[];
}

/**
 * 把快照补齐到最新收盘。
 * 快照本来就没落后时**不发任何请求**；任何异常都当作"没有新数据"，不阻断页面。
 */
export async function syncLatestBars(
  records: readonly HistoricalRecord[],
  signal?: AbortSignal,
): Promise<LiveSyncResult> {
  const unchanged: LiveSyncResult = { records: [...records], appended: [] };

  const last = records[records.length - 1];
  if (!last) return unchanged;

  const { date: today, minutes } = beijingClock();
  // 快照已经是今天（或更新的数据）→ 没必要碰网络
  if (last.date >= today) return unchanged;

  try {
    const [chinext, dividend] = await Promise.all([
      fetchCloses(CHINEXT_SYMBOL, signal),
      fetchCloses(DIVIDEND_SYMBOL, signal),
    ]);

    const dates = [...chinext.keys()]
      .filter((date) => dividend.has(date) && date > last.date && date <= today)
      .sort();

    if (dates.length === 0) return unchanged;

    const merged = [...records];
    const appended: string[] = [];
    for (const date of dates) {
      // 当天 16:00 之前的日线还会被数据源修订，这个口径必须跟脚本一致
      if (date === today && minutes < DAILY_BAR_READY_CLOCK_MINUTES) continue;

      const chinextClose = round(chinext.get(date) as number, PRICE_DECIMALS);
      const dividendClose = round(dividend.get(date) as number, PRICE_DECIMALS);
      if (!(dividendClose > 0)) continue;

      merged.push({
        date,
        chinextClose,
        dividendClose,
        ratio: round(chinextClose / dividendClose, RATIO_DECIMALS),
      });
      appended.push(date);
    }

    return { records: merged, appended };
  } catch {
    // 断网、跨域被拦、接口改版 —— 都只是"补不到"，回落到快照
    return unchanged;
  }
}
