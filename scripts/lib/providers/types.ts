/**
 * 数据源适配层接口。
 *
 * 上层（初始化 / 增量更新 / 校验脚本）只依赖这个接口，
 * 更换数据供应商时只需新增一个 Provider 实现并在 factory 中注册，
 * 不需要改动数据合并与校验逻辑。
 */

import type { DailyClose, IndexDefinition } from '../types.ts';

export interface FetchRange {
  /** 起始交易日 YYYY-MM-DD（含） */
  begin: string;
  /** 结束日期 YYYY-MM-DD（含） */
  end: string;
}

export interface ProviderInfo {
  id: string;
  name: string;
  endpoint: string;
  /** 使用条款 / 授权说明，写入 metadata 供查阅 */
  terms: string;
  license: string;
}

export interface MarketDataProvider {
  readonly info: ProviderInfo;
  /**
   * 拉取单个指数的日线收盘序列，按日期升序返回。
   * 实现方必须保证：
   *  - 只返回「已收盘」的完整日线（不得混入盘中数据）
   *  - 校验返回的指数身份，避免代码格式差异导致取错指数
   *  - 无效记录（价格为 0 / 缺失）直接丢弃，不填补
   */
  fetchDailyCloses(index: IndexDefinition, range: FetchRange): Promise<DailyClose[]>;
}
