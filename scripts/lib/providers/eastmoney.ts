/**
 * 东方财富行情接口适配器。
 *
 * 接口：https://push2his.eastmoney.com/api/qt/stock/kline/get
 * 关键参数：
 *   secid  —— 市场前缀 + 代码，0=深圳 / 1=上海。这个格式只属于该数据源，
 *             所以由本适配器根据 IndexDefinition 生成，业务层不接触。
 *   klt=101 —— 日线
 *   fqt=1   —— 指数点位本身不需要复权，固定取 1 保证与行情软件一致
 *   fields2 —— f51 日期 / f53 收盘 ...
 *
 * 身份校验：返回体内 data.code / data.name 必须与请求的指数一致，
 * 否则抛错。这是防止「代码格式不同取到别的指数」的最后一道闸门。
 */

import { AppError } from '../../../shared/errors.ts';
import { isDailyBarFinal } from '../beijingTime.ts';
import { fetchJson } from '../http.ts';
import type { DailyClose, IndexDefinition } from '../types.ts';
import type { FetchRange, MarketDataProvider, ProviderInfo } from './types.ts';

const ENDPOINT = 'https://push2his.eastmoney.com/api/qt/stock/kline/get';

/** 请求的字段顺序，解析时按这个数组下标取值，避免接口字段顺序变化导致错位 */
const FIELDS2 = ['f51', 'f52', 'f53', 'f54', 'f55', 'f56', 'f57', 'f58'] as const;
const DATE_AT = FIELDS2.indexOf('f51');
const CLOSE_AT = FIELDS2.indexOf('f53');

interface EastmoneyKlineResponse {
  rc: number;
  data:
    | {
        code: string;
        market: number;
        name: string;
        decimal: number;
        dktotal?: number;
        klines: string[];
      }
    | null;
}

export interface EastmoneyProviderOptions {
  /** 每次请求的尝试次数，默认 6 */
  attempts?: number;
  timeoutMs?: number;
}

export class EastmoneyProvider implements MarketDataProvider {
  readonly info: ProviderInfo = {
    id: 'eastmoney',
    name: '东方财富行情接口（push2his.eastmoney.com）',
    endpoint: ENDPOINT,
    terms:
      '公开网页行情接口，无需密钥。本项目仅缓存日线收盘点位用于个人研究与展示，不对外分发原始数据。接口为非承诺性服务，可能变更或限流，因此内置可替换的适配层。',
    license: '数据版权归上海证券交易所 / 深圳证券交易所及数据提供方所有；本项目仅作个人研究用途。',
  };

  private readonly attempts: number;
  private readonly timeoutMs: number;

  constructor(options: EastmoneyProviderOptions = {}) {
    this.attempts = options.attempts ?? 6;
    this.timeoutMs = options.timeoutMs ?? 20_000;
  }

  buildUrl(index: IndexDefinition, range: FetchRange): string {
    const params = new URLSearchParams({
      secid: index.providerSymbol,
      fields1: 'f1,f2,f3,f4,f5,f6',
      fields2: FIELDS2.join(','),
      klt: '101',
      fqt: '1',
      beg: range.begin.replace(/-/g, ''),
      end: range.end.replace(/-/g, ''),
    });
    return `${ENDPOINT}?${params.toString()}`;
  }

  async fetchDailyCloses(index: IndexDefinition, range: FetchRange): Promise<DailyClose[]> {
    const url = this.buildUrl(index, range);
    const json = await fetchJson<EastmoneyKlineResponse>(url, {
      label: `${index.name}(${index.code}) 日线`,
      attempts: this.attempts,
      timeoutMs: this.timeoutMs,
      headers: { Referer: 'https://quote.eastmoney.com/' },
    });

    if (json.rc !== 0 || !json.data) {
      throw new AppError('E_IO', `数据源返回异常：rc=${json.rc}，无 data 字段`, {
        context: { index: index.code },
      });
    }

    const { code, name, klines } = json.data;

    // ── 身份校验：这是防止取错指数的关键
    if (String(code) !== index.code) {
      throw new AppError(
        'E_INPUT',
        `指数身份不匹配：请求 ${index.code}，返回 ${code}`,
        { context: { requested: index.code, returned: code, symbol: index.providerSymbol } },
      );
    }
    if (!name || name.trim() === '') {
      throw new AppError('E_INPUT', '数据源未返回指数名称，无法确认身份', {
        context: { code },
      });
    }
    if (!Array.isArray(klines) || klines.length === 0) {
      throw new AppError('E_INPUT', `数据源返回空行情：${index.name}`, {
        context: { code, range },
      });
    }

    const out: DailyClose[] = [];
    let invalid = 0;
    let notFinal = 0;

    for (const row of klines) {
      const parts = row.split(',');
      const date = parts[DATE_AT];
      const closeRaw = parts[CLOSE_AT];
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        invalid += 1;
        continue;
      }
      const close = Number(closeRaw);
      // 价格为 0 / 非数字 / 负数一律视为无效，不填补、不猜测
      if (!Number.isFinite(close) || close <= 0) {
        invalid += 1;
        continue;
      }
      // 未收盘的当日数据不采纳；晚于今天的日期直接丢弃
      if (!isDailyBarFinal(date)) {
        notFinal += 1;
        continue;
      }
      out.push({ date, close });
    }

    if (invalid > 0 || notFinal > 0) {
      console.warn(
        `  · ${index.name}：丢弃无效记录 ${invalid} 条，未完成/未来交易日 ${notFinal} 条`,
      );
    }

    out.sort((a, b) => a.date.localeCompare(b.date));

    // 去重（同一日期保留最后一条，接口偶发重复）
    const deduped: DailyClose[] = [];
    for (const bar of out) {
      const last = deduped[deduped.length - 1];
      if (last && last.date === bar.date) {
        deduped[deduped.length - 1] = bar;
      } else {
        deduped.push(bar);
      }
    }

    if (deduped.length === 0) {
      throw new AppError('E_INPUT', `${index.name} 无有效日线记录`, { context: { range } });
    }

    return deduped;
  }
}
