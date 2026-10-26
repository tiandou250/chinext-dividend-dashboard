/**
 * 行情数据读取层。
 *
 * 访问流程（与设计目标一致）：
 *   1. 读 metadata.json 判断当前数据版本（默认 no-cache，走协商缓存，保证能发现新版）
 *   2. 按版本号请求 historical.json（URL 带 v=<dataVersion>，可长期强缓存）
 *   3. 数据进入页面内存，图表的时间切换 / 缩放 / 拖动全部本地完成，不再请求接口
 *
 * 刷新按钮只做一件事：绕过缓存重新读取**已部署的**数据文件并比对版本，
 * 它无法触发交易所行情更新，也没有服务端更新权限。
 */

import type { HistoricalRecord, MarketDataset, Metadata } from '@/types/market';

const BASE_URL = import.meta.env.BASE_URL || '/';
const DATA_DIR = `${BASE_URL.replace(/\/+$/, '')}/data`;

export type MarketDataErrorCode =
  | 'OFFLINE'
  | 'NETWORK'
  | 'NOT_FOUND'
  | 'INVALID_PAYLOAD'
  | 'VERSION_MISMATCH';

export class MarketDataError extends Error {
  readonly code: MarketDataErrorCode;
  readonly hint: string;

  constructor(code: MarketDataErrorCode, message: string, hint: string) {
    super(message);
    this.name = 'MarketDataError';
    this.code = code;
    this.hint = hint;
  }
}

function describeError(err: unknown, what: string): MarketDataError {
  if (err instanceof MarketDataError) return err;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return new MarketDataError('OFFLINE', '当前网络不可用', '请检查网络连接后重试。');
  }
  const message = err instanceof Error ? err.message : String(err);
  return new MarketDataError(
    'NETWORK',
    `${what}失败：${message}`,
    '可能是网络中断或数据文件尚未部署。可点击刷新重试。',
  );
}

async function fetchJson<T>(
  url: string,
  init: RequestInit,
  what: string,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (err) {
    // AbortError 保持原样向上抛，交给调用方忽略
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw describeError(err, what);
  }

  if (response.status === 404) {
    throw new MarketDataError(
      'NOT_FOUND',
      `${what}：文件不存在（404）`,
      '数据文件可能尚未生成。本地请先执行 npm run data:init。',
    );
  }
  if (!response.ok) {
    throw new MarketDataError(
      'NETWORK',
      `${what}：服务返回 ${response.status}`,
      '数据文件读取失败，可稍后重试。',
    );
  }

  try {
    return (await response.json()) as T;
  } catch (err) {
    throw new MarketDataError(
      'INVALID_PAYLOAD',
      `${what}：返回内容不是合法 JSON`,
      '数据文件可能损坏，请重新运行数据更新任务。',
    );
  }
}

/** 读取 metadata.json */
export async function loadMetadata(options: {
  refresh?: boolean;
  signal?: AbortSignal;
} = {}): Promise<Metadata> {
  const { refresh = false, signal } = options;
  const url = refresh
    ? `${DATA_DIR}/metadata.json?t=${Date.now()}`
    : `${DATA_DIR}/metadata.json`;

  const metadata = await fetchJson<Metadata>(
    url,
    { cache: refresh ? 'reload' : 'no-cache', signal },
    '读取数据版本信息',
  );

  if (!metadata || typeof metadata.dataVersion !== 'string' || !metadata.dataVersion) {
    throw new MarketDataError(
      'INVALID_PAYLOAD',
      'metadata.json 结构不完整（缺少 dataVersion）',
      '请重新运行数据初始化脚本。',
    );
  }
  return metadata;
}

/** 校验历史记录结构，坏数据直接拒绝，避免图表画出无意义的线 */
function isRecord(value: unknown): value is HistoricalRecord {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(row.date) &&
    typeof row.chinextClose === 'number' &&
    typeof row.dividendClose === 'number' &&
    typeof row.ratio === 'number' &&
    Number.isFinite(row.chinextClose) &&
    Number.isFinite(row.dividendClose) &&
    Number.isFinite(row.ratio)
  );
}

/** 按数据版本读取 historical.json */
export async function loadRecords(
  dataVersion: string,
  signal?: AbortSignal,
): Promise<HistoricalRecord[]> {
  const url = `${DATA_DIR}/historical.json?v=${encodeURIComponent(dataVersion)}`;
  const payload = await fetchJson<unknown>(url, { cache: 'force-cache', signal }, '读取历史行情');

  if (!Array.isArray(payload)) {
    throw new MarketDataError(
      'INVALID_PAYLOAD',
      'historical.json 不是数组结构',
      '请重新运行数据初始化脚本。',
    );
  }
  if (payload.length === 0) {
    throw new MarketDataError('INVALID_PAYLOAD', '历史数据为空', '请先初始化数据。');
  }
  if (!payload.every(isRecord)) {
    throw new MarketDataError(
      'INVALID_PAYLOAD',
      '历史数据存在字段缺失或非法数值的记录',
      '数据文件可能损坏，请执行 npm run data:validate -- --full --repair。',
    );
  }
  return payload as HistoricalRecord[];
}

export interface LoadDatasetOptions {
  refresh?: boolean;
  signal?: AbortSignal;
}

export interface LoadDatasetResult extends MarketDataset {
  /** 数据结构自检提示（不阻断展示，但要如实告知） */
  warning: string | null;
}

/** 完整加载：metadata → historical */
export async function loadDataset(options: LoadDatasetOptions = {}): Promise<LoadDatasetResult> {
  const { refresh = false, signal } = options;
  const metadata = await loadMetadata({ refresh, signal });
  const records = await loadRecords(metadata.dataVersion, signal);

  let warning: string | null = null;
  const last = records[records.length - 1];
  if (typeof metadata.recordCount === 'number' && metadata.recordCount !== records.length) {
    warning = `记录的条数与版本信息不一致（metadata ${metadata.recordCount} / 文件 ${records.length}）`;
  } else if (last && metadata.latestTradingDate !== last.date) {
    warning = `最新交易日与版本信息不一致（metadata ${metadata.latestTradingDate} / 文件 ${last.date}）`;
  }

  return {
    metadata,
    records,
    loadedAt: Date.now(),
    fromCache: !refresh,
    warning,
  };
}

/** 供界面展示的数据源短名 */
export function shortSourceName(metadata: Metadata | null): string {
  const id = metadata?.provider?.id;
  switch (id) {
    case 'tencent':
      return '腾讯财经';
    case 'eastmoney':
      return '东方财富';
    case 'sina':
      return '新浪财经';
    default:
      return metadata?.provider?.name ?? '—';
  }
}
