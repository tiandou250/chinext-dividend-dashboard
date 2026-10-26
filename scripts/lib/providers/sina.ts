/**
 * 新浪财经行情适配器（用于交叉校验，不作为主数据源）。
 *
 * 接口：https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData
 *   symbol=sz399006 / sh000922　scale=240（日线）　datalen=N（N ≤ 1023）
 *
 * 限制：只提供「最近 N 个交易日」，无法取到 2009 年以来的完整历史。
 * 因此它在本项目中的定位是**交叉校验源**：
 *   - 验证主数据源最近一段时间的收盘点位是否一致
 *   - 主数据源不可用时，至少能确认最新交易日的数值
 */

import { isDailyBarFinal } from '../beijingTime.ts';
import { AppError } from '../../../shared/errors.ts';
import { fetchJson } from '../http.ts';
import type { DailyClose, IndexDefinition } from '../types.ts';
import type { FetchRange, MarketDataProvider, ProviderInfo } from './types.ts';

const ENDPOINT =
  'https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData';

/** 新浪单次可返回的最大条数 */
const MAX_DATALEN = 1023;

export function toSinaSymbol(index: IndexDefinition): string {
  const prefix = index.market === 'SZ' ? 'sz' : 'sh';
  return `${prefix}${index.code}`;
}

interface SinaBar {
  day: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

export class SinaProvider implements MarketDataProvider {
  readonly info: ProviderInfo = {
    id: 'sina',
    name: '新浪财经行情接口（money.finance.sina.com.cn）',
    endpoint: ENDPOINT,
    terms:
      '公开网页行情接口，无需密钥。仅覆盖最近约 1000 个交易日，本项目将其作为交叉校验源使用。',
    license: '行情数据版权归上海证券交易所 / 深圳证券交易所及数据提供方所有；本项目仅作个人研究用途。',
  };

  private readonly attempts: number;
  private readonly timeoutMs: number;

  constructor(options: { attempts?: number; timeoutMs?: number } = {}) {
    this.attempts = options.attempts ?? 5;
    this.timeoutMs = options.timeoutMs ?? 20_000;
  }

  buildUrl(index: IndexDefinition, datalen = MAX_DATALEN): string {
    const params = new URLSearchParams({
      symbol: toSinaSymbol(index),
      scale: '240',
      ma: 'no',
      datalen: String(datalen),
    });
    return `${ENDPOINT}?${params.toString()}`;
  }

  async fetchDailyCloses(index: IndexDefinition, range: FetchRange): Promise<DailyClose[]> {
    const symbol = toSinaSymbol(index);
    // 按区间长度估算需要的条数，但不超过接口上限
    const requested = Math.min(MAX_DATALEN, Math.max(64, daysBetween(range.begin, range.end) + 20));
    const json = await fetchJson<SinaBar[]>(this.buildUrl(index, requested), {
      label: `${index.name}(${index.code}) 日线（新浪）`,
      attempts: this.attempts,
      timeoutMs: this.timeoutMs,
      headers: { Referer: 'https://finance.sina.com.cn/' },
    });

    if (!Array.isArray(json) || json.length === 0) {
      throw new AppError('E_INPUT', `新浪接口未返回 ${symbol} 的日线数据`, {
        context: { symbol, range },
      });
    }

    const bars: DailyClose[] = [];
    for (const row of json) {
      const date = row.day;
      const close = Number(row.close);
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      if (!Number.isFinite(close) || close <= 0) continue;
      if (date < range.begin || date > range.end) continue;
      if (!isDailyBarFinal(date)) continue;
      bars.push({ date, close });
    }

    bars.sort((a, b) => a.date.localeCompare(b.date));
    if (bars.length === 0) {
      throw new AppError('E_INPUT', `新浪接口在 ${range.begin} ~ ${range.end} 区间内无有效记录`, {
        context: { symbol, returned: json.length },
      });
    }
    return bars;
  }
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
