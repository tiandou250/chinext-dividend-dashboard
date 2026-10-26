/**
 * Provider 工厂：通过环境变量 DATA_PROVIDER 切换数据源。
 *
 * 已实现：
 *   tencent   —— 默认。支持按日期范围翻页取全量历史，本机实测最稳定。
 *   eastmoney —— 备用。一次请求即可返回全量历史，但在部分网络环境下会间歇性连接中断。
 *   sina      —— 仅覆盖最近约 1000 个交易日，作为交叉校验源。
 *
 * 新增供应商只需实现 MarketDataProvider 并在此注册，其余脚本无需改动。
 */

import { AppError } from '../../../shared/errors.ts';
import type { IndexDefinition } from '../types.ts';
import { EastmoneyProvider } from './eastmoney.ts';
import { SinaProvider, toSinaSymbol } from './sina.ts';
import { TencentProvider, toTencentSymbol } from './tencent.ts';
import type { MarketDataProvider } from './types.ts';

export type ProviderId = 'tencent' | 'eastmoney' | 'sina';

export const PROVIDER_IDS: ProviderId[] = ['tencent', 'eastmoney', 'sina'];

export interface ProviderOptions {
  attempts?: number;
  timeoutMs?: number;
}

export function createProvider(
  id: string = process.env.DATA_PROVIDER ?? 'tencent',
  options: ProviderOptions = {},
): MarketDataProvider {
  const normalized = id.trim().toLowerCase();
  switch (normalized) {
    case 'tencent':
      return new TencentProvider(options);
    case 'eastmoney':
      return new EastmoneyProvider(options);
    case 'sina':
      return new SinaProvider(options);
    default:
      throw new AppError('E_USAGE', `未知的数据源：${id}（可选：${PROVIDER_IDS.join(' / ')}）`, {
        context: { DATA_PROVIDER: id },
      });
  }
}

/** 交叉校验源：选一个与主源不同、且覆盖能力足够做近期比对的源 */
export function createCrossCheckProvider(primaryId: string): MarketDataProvider | null {
  const normalized = primaryId.trim().toLowerCase();
  if (normalized === 'sina') return new TencentProvider();
  if (normalized === 'tencent' || normalized === 'eastmoney') return new SinaProvider();
  return null;
}

/**
 * 该数据源下使用的指数标识。
 * 各家代码格式不同（腾讯 sz399006 / 新浪 sz399006 / 东方财富 0.399006），
 * metadata 里必须记录真实使用的那一种，避免读者误以为代码被混用。
 */
export function symbolFor(providerId: string, index: IndexDefinition): string {
  switch (providerId.trim().toLowerCase()) {
    case 'tencent':
      return toTencentSymbol(index);
    case 'sina':
      return toSinaSymbol(index);
    case 'eastmoney':
    default:
      return index.providerSymbol;
  }
}

export type { MarketDataProvider } from './types.ts';
