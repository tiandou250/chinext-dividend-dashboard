import { useCallback, useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import {
  AxisPointerComponent,
  DataZoomComponent,
  GridComponent,
  MarkLineComponent,
  MarkPointComponent,
  TooltipComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

import {
  buildAxisPatch,
  buildOption,
  computeExtents,
  type ChartMode,
  type SeriesVisibility,
} from './chartOptions';
import type { Granularity, HistoricalRecord } from '@/types/market';

echarts.use([
  LineChart,
  GridComponent,
  TooltipComponent,
  DataZoomComponent,
  MarkLineComponent,
  MarkPointComponent,
  AxisPointerComponent,
  CanvasRenderer,
]);

const GROUP = 'market-style-dashboard';

export interface VisibleWindow {
  from: string;
  to: string;
  count: number;
}

export interface MainChartProps {
  records: HistoricalRecord[];
  granularity: Granularity;
  visible: SeriesVisibility;
  extremes: { min: HistoricalRecord | null; max: HistoricalRecord | null };
  isMobile: boolean;
  reducedMotion: boolean;
  /** 递增即触发"恢复完整区间" */
  resetToken: number;
  onSelectExtreme: (kind: 'min' | 'max') => void;
  onWindowChange: (window: VisibleWindow | null) => void;
}

/** 手机端过窄时拆成上下两张同步图：上=相对比值，下=创业板指数 */
export default function MainChart({
  records,
  granularity,
  visible,
  extremes,
  isMobile,
  reducedMotion,
  resetToken,
  onSelectExtreme,
  onWindowChange,
}: MainChartProps) {
  const dualRef = useRef<HTMLDivElement>(null);
  const ratioRef = useRef<HTMLDivElement>(null);
  const chinextRef = useRef<HTMLDivElement>(null);
  const instancesRef = useRef<Array<ReturnType<typeof echarts.init>>>([]);
  const rafRef = useRef<number | null>(null);
  const selectRef = useRef(onSelectExtreme);
  const windowRef = useRef(onWindowChange);
  const allRef = useRef(records);

  selectRef.current = onSelectExtreme;
  windowRef.current = onWindowChange;
  allRef.current = records;

  /** 缩放后按可见窗口重算纵轴范围，保证参考线与曲线都不被裁切 */
  const syncWindow = useCallback(
    (
      chart: ReturnType<typeof echarts.init>,
      mode: ChartMode,
      all: HistoricalRecord[],
      ids: string[],
    ) => {
      const option = chart.getOption() as unknown as {
        dataZoom?: Array<{ start?: number; end?: number }>;
      };
      const dz = option.dataZoom?.[0] ?? {};
      const n = all.length;
      if (n === 0) return;

      const startRatio = (typeof dz.start === 'number' ? dz.start : 0) / 100;
      const endRatio = (typeof dz.end === 'number' ? dz.end : 100) / 100;
      const from = Math.max(0, Math.floor(startRatio * (n - 1)));
      const to = Math.min(n - 1, Math.ceil(endRatio * (n - 1)));
      const win = all.slice(from, to + 1);
      if (win.length === 0) return;

      const extents = computeExtents(win, {
        includeChinext: mode !== 'ratio',
        includeRatio: mode !== 'chinext',
      });
      const patch = buildAxisPatch(mode, extents);
      if (patch.length > 0) {
        chart.setOption({ yAxis: patch }, { lazyUpdate: true });
      }

      const first = win[0];
      const last = win[win.length - 1];
      if (first && last && ids[0] === 'ratio') {
        windowRef.current({ from: first.date, to: last.date, count: win.length });
      }
    },
    [],
  );

  // ── 初始化图表实例（布局切换时重建）
  useEffect(() => {
    const hosts = isMobile
      ? [ratioRef.current, chinextRef.current]
      : [dualRef.current];
    const elements = hosts.filter((el): el is HTMLDivElement => el !== null);
    if (elements.length === 0) return undefined;

    const ids = isMobile ? ['ratio', 'chinext'] : ['dual'];
    const instances = elements.map((el) => echarts.init(el, undefined, { renderer: 'canvas' }));

    instances.forEach((chart, index) => {
      (chart as unknown as { group: string }).group = GROUP;
      const mode: ChartMode =
        ids[index] === 'ratio' ? 'ratio' : ids[index] === 'chinext' ? 'chinext' : 'dual';

      chart.on('dataZoom', () => {
        if (rafRef.current !== null) return;
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
          syncWindow(chart, mode, allRef.current, ids);
        });
      });

      chart.on('click', (raw: unknown) => {
        const params = raw as { componentType?: string; name?: string };
        if (params.componentType !== 'markPoint') return;
        const name = params.name ?? '';
        if (name.includes('最低')) selectRef.current('min');
        else if (name.includes('最高')) selectRef.current('max');
      });
    });

    instancesRef.current = instances;
    echarts.connect(GROUP);

    // 容器尺寸变化（含手机横竖屏切换）自动 resize
    const observer = new ResizeObserver(() => {
      instances.forEach((chart) => chart.resize());
    });
    elements.forEach((el) => observer.observe(el));

    const onOrientation = () => instances.forEach((chart) => chart.resize());
    window.addEventListener('orientationchange', onOrientation);

    return () => {
      observer.disconnect();
      window.removeEventListener('orientationchange', onOrientation);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      instances.forEach((chart) => chart.dispose());
      instancesRef.current = [];
      echarts.disconnect(GROUP);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile]);

  // ── 应用配置
  useEffect(() => {
    const instances = instancesRef.current;
    if (instances.length === 0) return;

    const base = { records, granularity, visible, extremes, isMobile, reducedMotion };

    if (isMobile) {
      const ratioChart = instances[0];
      const chinextChart = instances[1];
      if (!ratioChart || !chinextChart) return;

      ratioChart.setOption(
        buildOption({
          ...base,
          mode: 'ratio',
          extents: computeExtents(records, { includeChinext: false, includeRatio: true }),
          // 只在下图显示滑块，但两张图都保留同索引的 dataZoom 以便联动
          sliderVisible: false,
        }),
        { notMerge: true },
      );
      chinextChart.setOption(
        buildOption({
          ...base,
          mode: 'chinext',
          extents: computeExtents(records, { includeChinext: true, includeRatio: false }),
          sliderVisible: true,
        }),
        { notMerge: true },
      );
    } else {
      const chart = instances[0];
      if (!chart) return;
      const mode: ChartMode =
        visible.ratio && visible.chinext ? 'dual' : visible.ratio ? 'ratio' : 'chinext';
      chart.setOption(
        buildOption({
          ...base,
          mode,
          extents: computeExtents(records, {
            includeChinext: mode !== 'ratio',
            includeRatio: mode !== 'chinext',
          }),
        }),
        { notMerge: true },
      );
    }
  }, [records, granularity, visible, extremes, isMobile, reducedMotion]);

  // ── 重置缩放
  useEffect(() => {
    if (resetToken === 0) return;
    instancesRef.current.forEach((chart) => {
      chart.dispatchAction({ type: 'dataZoom', start: 0, end: 100 });
    });
  }, [resetToken]);

  const ratioHeight = isMobile ? 250 : 560;
  const chinextHeight = isMobile ? 190 : 560;

  return (
    <div className="flex flex-col gap-3">
      {isMobile ? (
        <>
          <div>
            <div className="mb-1.5 flex items-center gap-2 text-[12px] text-muted">
              <span className="h-2 w-2 rounded-full bg-gold" aria-hidden />
              创业板 / 中证红利 · 相对比值
            </div>
            <div
              ref={ratioRef}
              className="w-full"
              style={{ height: ratioHeight }}
              role="img"
              aria-label="创业板指数与中证红利指数相对比值走势图"
            />
          </div>
          <div>
            <div className="mb-1.5 flex items-center gap-2 text-[12px] text-muted">
              <span className="h-2 w-2 rounded-full bg-chinext" aria-hidden />
              创业板指数 · 收盘点位
            </div>
            <div
              ref={chinextRef}
              className="w-full"
              style={{ height: chinextHeight }}
              role="img"
              aria-label="创业板指数收盘点位走势图"
            />
          </div>
        </>
      ) : (
        <div
          ref={dualRef}
          className="w-full"
          style={{ height: 560 }}
          role="img"
          aria-label="创业板指数点位与相对比值双轴走势图，含 0.3 与 0.7 两条历史参考线"
        />
      )}
    </div>
  );
}
