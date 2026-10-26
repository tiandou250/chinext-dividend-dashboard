/**
 * 前端数据契约。
 * 与 scripts/lib/types.ts 保持一致；前端只声明用得到的字段，
 * 对可选字段宽容处理，便于后续在 metadata 中扩展而不用改前端。
 */

export interface HistoricalRecord {
  date: string;
  chinextClose: number;
  dividendClose: number;
  ratio: number;
}

export interface IndexMeta {
  name: string;
  code: string;
  market: string;
  providerSymbol: string;
  firstDate: string | null;
  lastDate: string | null;
  recordCount: number;
  sourceFirstDate?: string | null;
  sourceLastDate?: string | null;
  note?: string;
}

export interface Metadata {
  schemaVersion: number;
  dataVersion: string;
  recordCount: number;
  timelineStart: string;
  startDate: string;
  latestTradingDate: string;
  generatedAt: string;
  lastUpdate?: {
    status: 'success' | 'no-change' | 'failed';
    runAt: string;
    message: string;
  };
  indices?: {
    chinext?: IndexMeta;
    dividend?: IndexMeta;
  };
  /** 数据覆盖不足等需要如实告知的说明 */
  coverageNote?: string;
  provider?: {
    id: string;
    name: string;
    endpoint: string;
    terms?: string;
    license?: string;
  };
  method?: {
    ratioFormula: string;
    ratioDecimals: number;
    priceBasis: string;
    calendarNote: string;
  };
  integrity?: {
    duplicateDates: number;
    invalidValues: number;
    suspiciousGaps: Array<{ from: string; to: string; calendarDays: number }>;
    maxCalendarGapDays: number;
  };
}

export interface MarketDataset {
  metadata: Metadata;
  records: HistoricalRecord[];
  /** 本次读取时间（本地时间） */
  loadedAt: number;
  /** 是否从网络缓存或浏览器缓存读取（用于提示） */
  fromCache: boolean;
}

export type RangeKey = '1y' | '3y' | '5y' | 'all';
export type Granularity = 'year' | 'month' | 'day';

/** 比值状态：仅表示位于哪个参考区域，不含任何操作含义 */
export type ZoneKey = 'low' | 'mid' | 'high';

export interface ZoneInfo {
  key: ZoneKey;
  label: string;
  /** 简短说明 */
  hint: string;
}

export interface ExtremePoint {
  kind: 'min' | 'max';
  record: HistoricalRecord;
}
