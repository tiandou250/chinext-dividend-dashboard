/**
 * 腾讯财经行情适配器（默认数据源）。
 *
 * 接口：https://web.ifzq.gtimg.cn/appstock/app/fqkline/get
 *   param = <symbol>,day,<begin>,<end>,<count>,
 *     symbol：sz399006 / sh000922（小写市场前缀 + 代码，同样只属于该数据源）
 *     count ：单次最多约 640 根，因此需要按 end 向前翻页取全量历史
 *     末位留空 = 不复权（指数点位本身无需复权）
 *
 * 返回体 data[symbol].day 每行格式：[日期, 开, 收, 高, 低, 量]
 * 身份校验使用 data[symbol].qt[2]（代码）与 qt[1]（名称）。
 */

import { isDailyBarFinal, shiftDate } from '../beijingTime.ts';
import { AppError } from '../../../shared/errors.ts';
import { fetchJson, sleep } from '../http.ts';
import type { DailyClose, IndexDefinition } from '../types.ts';
import type { FetchRange, MarketDataProvider, ProviderInfo } from './types.ts';

const ENDPOINT = 'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get';

/** 单次请求的最大根数（实测超过 640 会返回 param error） */
const PAGE_SIZE = 640;

/** 翻页安全上限，防止数据源异常导致死循环 */
const MAX_PAGES = 40;

const DATE_AT = 0;
const CLOSE_AT = 2;

interface TencentSymbolBlock {
  day?: string[][];
  qfqday?: string[][];
  qt?: Record<string, string[]>;
}

interface TencentResponse {
  code: number;
  msg?: string;
  data: Record<string, TencentSymbolBlock> | [];
}

export function toTencentSymbol(index: IndexDefinition): string {
  const prefix = index.market === 'SZ' ? 'sz' : 'sh';
  return `${prefix}${index.code}`;
}

export class TencentProvider implements MarketDataProvider {
  readonly info: ProviderInfo = {
    id: 'tencent',
    name: '腾讯财经行情接口（web.ifzq.gtimg.cn）',
    endpoint: ENDPOINT,
    terms:
      '公开网页行情接口，无需密钥。本项目仅缓存日收盘点位用于个人研究与展示，不分发原始数据。接口为非承诺性服务，可能变更或限流，故内置可替换适配层。',
    license: '行情数据版权归上海证券交易所 / 深圳证券交易所及数据提供方所有；本项目仅作个人研究用途。',
  };

  private readonly attempts: number;
  private readonly timeoutMs: number;
  /** 翻页间隔：请求过密会触发接口限流（实测返回 501） */
  private readonly pageDelayMs: number;

  constructor(options: { attempts?: number; timeoutMs?: number; pageDelayMs?: number } = {}) {
    this.attempts = options.attempts ?? 6;
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.pageDelayMs = options.pageDelayMs ?? 900;
  }

  buildUrl(index: IndexDefinition, range: FetchRange, count = PAGE_SIZE): string {
    const symbol = toTencentSymbol(index);
    const param = `${symbol},day,${range.begin},${range.end},${count},`;
    return `${ENDPOINT}?param=${param}`;
  }

  async fetchDailyCloses(index: IndexDefinition, range: FetchRange): Promise<DailyClose[]> {
    const symbol = toTencentSymbol(index);
    const collected = new Map<string, number>();
    let end = range.end;
    let pages = 0;

    while (pages < MAX_PAGES) {
      pages += 1;
      const rows = await this.fetchPage(index, { begin: range.begin, end });
      if (rows.length === 0) break;

      for (const [date, close] of rows) {
        if (!collected.has(date)) collected.set(date, close);
      }

      const earliest = rows[0]?.[0];
      if (!earliest || earliest <= range.begin) break;

      const nextEnd = shiftDate(earliest, -1);
      // 防御：若数据源返回的区间没有向前推进，立即停止，避免无限循环
      if (nextEnd >= end) break;
      end = nextEnd;
      // 翻页之间留出间隔，避免触发接口限流
      await sleep(this.pageDelayMs);
    }

    const bars: DailyClose[] = [];
    for (const [date, close] of collected) {
      if (date < range.begin || date > range.end) continue;
      if (!isDailyBarFinal(date)) continue;
      if (!Number.isFinite(close) || close <= 0) continue;
      bars.push({ date, close });
    }

    bars.sort((a, b) => a.date.localeCompare(b.date));
    if (bars.length === 0) {
      throw new AppError('E_INPUT', `${index.name} 未返回有效日线`, {
        context: { symbol, range, pages },
      });
    }
    return bars;
  }

  /** 抓取单页，返回 [日期, 收盘] 数组（已按日期升序） */
  private async fetchPage(
    index: IndexDefinition,
    range: FetchRange,
  ): Promise<Array<[string, number]>> {
    const symbol = toTencentSymbol(index);
    const json = await fetchJson<TencentResponse>(this.buildUrl(index, range), {
      label: `${index.name}(${index.code}) 日线`,
      attempts: this.attempts,
      timeoutMs: this.timeoutMs,
      headers: { Referer: 'https://gu.qq.com/' },
    });

    if (json.code !== 0) {
      throw new AppError('E_IO', `数据源返回 code=${json.code}${json.msg ? `（${json.msg}）` : ''}`, {
        context: { symbol, range },
      });
    }

    // data 为空数组时代表参数不被接受（例如 count 超限）
    const block = Array.isArray(json.data) ? undefined : json.data[symbol];
    if (!block) {
      throw new AppError('E_INPUT', `数据源返回中缺少 ${symbol} 的数据块`, {
        context: { symbol, keys: Array.isArray(json.data) ? [] : Object.keys(json.data) },
      });
    }

    // ── 身份校验：代码必须一致，名称必须存在
    const quote = block.qt?.[symbol];
    if (quote) {
      const returnedCode = quote[2];
      const returnedName = quote[1];
      if (returnedCode !== undefined && String(returnedCode) !== index.code) {
        throw new AppError('E_INPUT', `指数身份不匹配：请求 ${index.code}，返回 ${returnedCode}`, {
          context: { symbol, requested: index.code, returned: returnedCode },
        });
      }
      if (!returnedName || returnedName.trim() === '') {
        throw new AppError('E_INPUT', '数据源未返回指数名称，无法确认身份', { context: { symbol } });
      }
    }

    const raw = block.day ?? block.qfqday ?? [];
    const out: Array<[string, number]> = [];
    for (const row of raw) {
      const date = row[DATE_AT];
      const close = Number(row[CLOSE_AT]);
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      if (!Number.isFinite(close) || close <= 0) continue;
      out.push([date, close]);
    }
    out.sort((a, b) => a[0].localeCompare(b[0]));
    return out;
  }
}
