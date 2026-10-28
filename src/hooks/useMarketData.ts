import { useCallback, useEffect, useRef, useState } from 'react';

import { loadDataset, MarketDataError, type LoadDatasetResult } from '@/services/marketData';
import { syncLatestBars } from '@/services/marketData/liveSync';

export interface MarketDataState {
  status: 'loading' | 'ready' | 'error';
  dataset: LoadDatasetResult | null;
  error: { message: string; hint: string; code: string } | null;
  /** 刷新中（已有数据时不清空页面） */
  refreshing: boolean;
  /** 本次刷新是否读到了新的数据版本 */
  lastRefreshFoundNewVersion: boolean | null;
  /** 浏览器端自动补齐的交易日（快照落后时才有值） */
  liveAppended: string[];
}

const INITIAL: MarketDataState = {
  status: 'loading',
  dataset: null,
  error: null,
  refreshing: false,
  lastRefreshFoundNewVersion: null,
  liveAppended: [],
};

export interface UseMarketDataResult extends MarketDataState {
  refresh: () => void;
}

/**
 * 加载已部署的行情数据，并提供"重新检查数据版本"的刷新能力。
 *
 * 读到快照后还会尝试用数据源接口补齐快照之后缺失的交易日 —— 静态文件只能靠外部任务刷新，
 * 而外部定时任务不可靠，所以让页面自己兜底。补齐失败时静默回落到快照。
 */
export function useMarketData(): UseMarketDataResult {
  const [state, setState] = useState<MarketDataState>(INITIAL);
  const abortRef = useRef<AbortController | null>(null);
  const datasetRef = useRef<LoadDatasetResult | null>(null);

  const run = useCallback(async (mode: 'initial' | 'refresh') => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState((prev) =>
      mode === 'initial'
        ? { ...prev, status: prev.dataset ? prev.status : 'loading', refreshing: false, error: null }
        : { ...prev, refreshing: true, error: null },
    );

    try {
      const loaded = await loadDataset({ refresh: mode === 'refresh', signal: controller.signal });

      // 快照落后时用数据源补齐；无需补齐或补齐失败都原样返回
      const synced = await syncLatestBars(loaded.records, controller.signal);
      if (controller.signal.aborted) return;

      const dataset: LoadDatasetResult =
        synced.appended.length > 0
          ? {
              ...loaded,
              records: synced.records,
              metadata: {
                ...loaded.metadata,
                latestTradingDate: synced.appended[synced.appended.length - 1],
                recordCount: synced.records.length,
              },
            }
          : loaded;

      const prevVersion = datasetRef.current?.metadata.dataVersion ?? null;
      datasetRef.current = dataset;

      setState({
        status: 'ready',
        dataset,
        error: null,
        refreshing: false,
        lastRefreshFoundNewVersion:
          mode === 'refresh' ? prevVersion !== dataset.metadata.dataVersion : null,
        liveAppended: synced.appended,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;

      const message = err instanceof Error ? err.message : String(err);
      const hint = err instanceof MarketDataError ? err.hint : '请稍后重试。';
      const code = err instanceof MarketDataError ? err.code : 'UNKNOWN';

      setState((prev) => ({
        // 已有数据时保留旧数据，只在顶部提示失败，不静默假装是最新
        status: prev.dataset ? prev.status : 'error',
        dataset: prev.dataset,
        error: { message, hint, code },
        refreshing: false,
        lastRefreshFoundNewVersion: null,
        liveAppended: prev.liveAppended,
      }));
    }
  }, []);

  useEffect(() => {
    void run('initial');
    return () => abortRef.current?.abort();
  }, [run]);

  const refresh = useCallback(() => {
    void run('refresh');
  }, [run]);

  return { ...state, refresh };
}
