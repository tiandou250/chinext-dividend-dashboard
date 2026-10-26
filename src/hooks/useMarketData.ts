import { useCallback, useEffect, useRef, useState } from 'react';

import { loadDataset, MarketDataError, type LoadDatasetResult } from '@/services/marketData';

export interface MarketDataState {
  status: 'loading' | 'ready' | 'error';
  dataset: LoadDatasetResult | null;
  error: { message: string; hint: string; code: string } | null;
  /** 刷新中（已有数据时不清空页面） */
  refreshing: boolean;
  /** 本次刷新是否读到了新的数据版本 */
  lastRefreshFoundNewVersion: boolean | null;
}

const INITIAL: MarketDataState = {
  status: 'loading',
  dataset: null,
  error: null,
  refreshing: false,
  lastRefreshFoundNewVersion: null,
};

export interface UseMarketDataResult extends MarketDataState {
  refresh: () => void;
}

/**
 * 加载已部署的行情数据，并提供"重新检查数据版本"的刷新能力。
 * 刷新只重新读取 metadata.json 与（版本变化时的）historical.json，
 * 不会、也无法触发交易所行情更新。
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
      const dataset = await loadDataset({ refresh: mode === 'refresh', signal: controller.signal });
      const prevVersion = datasetRef.current?.metadata.dataVersion ?? null;
      datasetRef.current = dataset;

      setState({
        status: 'ready',
        dataset,
        error: null,
        refreshing: false,
        lastRefreshFoundNewVersion:
          mode === 'refresh' ? prevVersion !== dataset.metadata.dataVersion : null,
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
