/**
 * 数据层的公共类型定义。
 * 前端与服务端脚本共享同一套结构，保证 JSON 契约稳定。
 */

/** 单个指数的日线收盘记录（仅保留本项目需要的字段） */
export interface DailyClose {
  /** 交易日，YYYY-MM-DD（数据源时区为 Asia/Shanghai） */
  date: string;
  /** 收盘点位 */
  close: number;
}

/** 指数标识 */
export type IndexKey = 'chinext' | 'dividend';

/** 市场标识：0=深圳，1=上海（东方财富 secid 前缀） */
export type MarketCode = 'SZ' | 'SH';

export interface IndexDefinition {
  key: IndexKey;
  /** 展示名 */
  name: string;
  /** 交易所原始代码，例如 399006 / 000922 */
  code: string;
  market: MarketCode;
  /** 数据源内部标识（东方财富 secid），由适配层生成，避免代码格式混用 */
  providerSymbol: string;
}

export const INDEX_DEFINITIONS: Record<IndexKey, IndexDefinition> = {
  chinext: {
    key: 'chinext',
    name: '创业板指数',
    code: '399006',
    market: 'SZ',
    providerSymbol: '0.399006',
  },
  dividend: {
    key: 'dividend',
    name: '中证红利指数',
    code: '000922',
    market: 'SH',
    providerSymbol: '1.000922',
  },
};

/** 时间轴起点：创业板开市日。早于指数正式发布日的区间保留为空，不编造数据。 */
export const TIMELINE_START = '2009-10-30';

/** 比值保留小数位（存储精度，界面展示 3 位） */
export const RATIO_DECIMALS = 6;

/** historical.json 中的一条记录 */
export interface HistoricalRecord {
  date: string;
  chinextClose: number;
  dividendClose: number;
  ratio: number;
}

export interface IndexMeta {
  name: string;
  code: string;
  market: MarketCode;
  providerSymbol: string;
  /** 该指数在数据集（两指数交集）中的首个有效交易日 */
  firstDate: string | null;
  /** 该指数在数据集中的最新有效交易日 */
  lastDate: string | null;
  /** 该指数在数据集中的有效记录数 */
  recordCount: number;
  /** 数据源自身的覆盖起点（可能早于本项目时间轴起点） */
  sourceFirstDate: string | null;
  /** 数据源能提供的最新交易日 */
  sourceLastDate: string | null;
  /** 数据口径说明 */
  note: string;
}

export interface Metadata {
  schemaVersion: number;
  /** 数据版本，由 historical.json 内容哈希生成，用于前端缓存失效 */
  dataVersion: string;
  recordCount: number;
  /** 时间轴起点 */
  timelineStart: string;
  /** 首个有效比值交易日 */
  startDate: string;
  /** 最新有效交易日（收盘） */
  latestTradingDate: string;
  /** 数据文件生成时间（Asia/Shanghai, ISO8601） */
  generatedAt: string;
  /** 最近一次更新任务结果 */
  lastUpdate: {
    status: 'success' | 'no-change' | 'failed';
    runAt: string;
    message: string;
  };
  /** 数据覆盖情况说明：首段区间是否补齐、有无缺口等 */
  coverageNote: string | null;
  indices: Record<IndexKey, IndexMeta>;
  provider: {
    id: string;
    name: string;
    endpoint: string;
    terms: string;
    license: string;
  };
  method: {
    ratioFormula: string;
    ratioDecimals: number;
    priceBasis: string;
    calendarNote: string;
  };
  integrity: {
    duplicateDates: number;
    invalidValues: number;
    suspiciousGaps: Array<{ from: string; to: string; calendarDays: number }>;
    maxCalendarGapDays: number;
  };
}
