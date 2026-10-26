/**
 * ECharts 配置构建。
 *
 * 关键设计：
 *  1) 双纵轴严格分离：左轴=创业板指数点位，右轴=相对比值，两者不共用数值轴。
 *  2) 0.300 / 0.700 参考线挂在「常驻系列」上（该系列在隐藏时把线色设为透明，
 *     而不是把整个系列移除），因此关掉比值曲线后参考线依然显示，
 *     同时 y 轴的取值范围也不会因为隐藏而塌缩。
 *  3) dataZoom 使用 filterMode:'none'，保证 dataIndex 与原始 records 一一对应，
 *     tooltip 里展示的数据直接来自真实记录，不依赖像素位置插值。
 *  4) 纵轴范围在缩放时按可见窗口重算，并强制包含 0.3 / 0.7，曲线永不被裁切。
 */

import type { EChartsOption } from 'echarts';

import { HIGH_LINE, LOW_LINE, resolveZone } from '@/utils/calculations';
import { formatPoints, formatRatio } from '@/utils/formatting';
import type { Granularity, HistoricalRecord, ZoneKey } from '@/types/market';

export const CHART_COLORS = {
  chinext: '#426997',
  gold: '#C5A46D',
  high: '#E65B64',
  low: '#20A97B',
  ink: '#000000',
  muted: '#55606E',
  grid: '#F0F3F8',
  axis: '#DDE3EC',
  tooltipBg: 'rgba(255,255,255,0.97)',
} as const;

/** 纵轴点位标签：取整显示，减少刻度噪声 */
const POINT_AXIS = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 });

const ZONE_COLOR: Record<ZoneKey, string> = {
  low: CHART_COLORS.low,
  mid: '#5B6478',
  high: CHART_COLORS.high,
};

export type ChartMode = 'dual' | 'ratio' | 'chinext';

export interface SeriesVisibility {
  chinext: boolean;
  ratio: boolean;
}

export interface BuildOptionParams {
  records: HistoricalRecord[];
  granularity: Granularity;
  mode: ChartMode;
  visible: SeriesVisibility;
  /** 可见区间内的极值（用于绘制标记） */
  extremes: { min: HistoricalRecord | null; max: HistoricalRecord | null };
  isMobile: boolean;
  reducedMotion: boolean;
  /** 纵轴范围（含参考线），由调用方按当前窗口计算 */
  extents: AxisExtents;
  /** 是否显示底部时间滑块（手机上下双图时只在下方图显示） */
  sliderVisible?: boolean;
}

/**
 * 缩放时只更新纵轴范围，避免整图重绘。
 * 返回数组按轴索引定位：0 = 创业盘点位，1 = 相对比值。
 * 两条轴始终存在，所以这里必须给出等长的占位对象，不能"少一条就前移"。
 */
export function buildAxisPatch(
  mode: ChartMode,
  extents: AxisExtents,
): Array<{ min?: number; max?: number }> {
  const left: { min?: number; max?: number } = {};
  const right: { min?: number; max?: number } = {};

  if (mode !== 'ratio' && extents.chinext) {
    left.min = extents.chinext[0];
    left.max = extents.chinext[1];
  }
  if (mode !== 'chinext' && extents.ratio) {
    right.min = extents.ratio[0];
    right.max = extents.ratio[1];
  }
  return [left, right];
}

export interface AxisExtents {
  chinext?: [number, number];
  ratio?: [number, number];
}

const PAD_RATIO = 0.08;

/** 刻度步长候选：优先 1 / 2 / 2.5 / 5 / 10 这类"整数感"的步长 */
function niceStep(span: number, targetTicks: number): number {
  const raw = span / targetTicks;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  const multiplier = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  return multiplier * magnitude;
}

/**
 * 纵轴范围。
 * 先把数据范围略微外扩，再向"好看的刻度"对齐：
 * 这样轴标签不会出现 4,599.31 这种数字，也不会和首末刻度叠在一起。
 */
function padExtent(min: number, max: number): [number, number] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min === max) {
    const delta = Math.max(Math.abs(min) * 0.02, 0.01);
    return [min - delta, max + delta];
  }

  const pad = (max - min) * PAD_RATIO;
  const paddedMin = min - pad;
  const paddedMax = max + pad;
  const step = niceStep(paddedMax - paddedMin, 6);

  const lo = Math.floor(paddedMin / step) * step;
  const hi = Math.ceil(paddedMax / step) * step;
  // 防止浮点误差带来的 0.30000000000000004
  return [Number(lo.toPrecision(12)), Number(hi.toPrecision(12))];
}

/**
 * 计算纵轴范围。
 * 比值轴永远包含 0.3 与 0.7，这样无论用户怎么缩放，两条参考线都在视野内。
 */
export function computeExtents(
  records: readonly HistoricalRecord[],
  options: { includeChinext: boolean; includeRatio: boolean },
): AxisExtents {
  const out: AxisExtents = {};
  if (records.length === 0) return out;

  if (options.includeChinext) {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const row of records) {
      if (row.chinextClose < min) min = row.chinextClose;
      if (row.chinextClose > max) max = row.chinextClose;
    }
    out.chinext = padExtent(min, max);
  }

  if (options.includeRatio) {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const row of records) {
      if (row.ratio < min) min = row.ratio;
      if (row.ratio > max) max = row.ratio;
    }
    // 强制纳入参考线，避免参考线被挤出可视区
    min = Math.min(min, LOW_LINE);
    max = Math.max(max, HIGH_LINE);
    // 比值轴固定 0.1 步长：参考线永远落在刻度上，缩放时刻度也不会跳变
    const pad = (max - min) * 0.04;
    const lo = Math.floor((min - pad) / 0.1) * 0.1;
    const hi = Math.ceil((max + pad) / 0.1) * 0.1;
    out.ratio = [Number(lo.toFixed(4)), Number(hi.toFixed(4))];
  }

  return out;
}

function axisLabelFormatter(granularity: Granularity) {
  switch (granularity) {
    case 'year':
      return (value: string) => value.slice(0, 4);
    case 'month':
      return (value: string) => value.slice(0, 7).replace('-', '/');
    default:
      return (value: string) => value.slice(5).replace('-', '/');
  }
}

function buildTooltipHtml(
  row: HistoricalRecord,
  visible: SeriesVisibility,
): string {
  const zone = resolveZone(row.ratio);
  const rows: string[] = [];

  if (visible.chinext) {
    rows.push(
      `<div style="display:flex;align-items:center;gap:8px;justify-content:space-between">
        <span style="display:flex;align-items:center;gap:6px;color:#55606E;font-size:12px">
          <i style="width:8px;height:8px;border-radius:99px;background:${CHART_COLORS.chinext};display:inline-block"></i>创业板指数
        </span>
        <b style="font-size:13px;color:#000000;font-variant-numeric:tabular-nums">${formatPoints(row.chinextClose)}</b>
      </div>`,
    );
  }
  if (visible.ratio) {
    rows.push(
      `<div style="display:flex;align-items:center;gap:8px;justify-content:space-between">
        <span style="display:flex;align-items:center;gap:6px;color:#55606E;font-size:12px">
          <i style="width:8px;height:8px;border-radius:99px;background:${CHART_COLORS.gold};display:inline-block"></i>相对比值
        </span>
        <b style="font-size:13px;color:#000000;font-variant-numeric:tabular-nums">${formatRatio(row.ratio)}</b>
      </div>`,
    );
  }
  // 中证红利点位是比值的分母，始终展示，便于核对计算
  rows.push(
    `<div style="display:flex;align-items:center;gap:8px;justify-content:space-between">
      <span style="display:flex;align-items:center;gap:6px;color:#55606E;font-size:12px">
        <i style="width:8px;height:8px;border-radius:99px;background:#C6CDD9;display:inline-block"></i>中证红利指数
      </span>
      <b style="font-size:13px;color:#000000;font-variant-numeric:tabular-nums">${formatPoints(row.dividendClose)}</b>
    </div>`,
  );

  return `<div style="min-width:196px;padding:2px 2px 0">
      <div style="font-size:12px;font-weight:600;color:#000000;margin-bottom:6px;font-variant-numeric:tabular-nums">${row.date}</div>
      <div style="display:flex;flex-direction:column;gap:4px">${rows.join('')}</div>
      <div style="margin-top:6px;padding-top:6px;border-top:1px solid #EDF0F6;display:flex;justify-content:space-between;gap:8px">
        <span style="font-size:12px;color:#55606E">相对状态</span>
        <b style="font-size:12px;color:${ZONE_COLOR[zone.key]}">${zone.label}</b>
      </div>
    </div>`;
}

function markPointData(extreme: HistoricalRecord | null, kind: 'min' | 'max') {
  if (!extreme) return [];
  return [
    {
      name: kind === 'min' ? '历史最低比值' : '历史最高比值',
      coord: [extreme.date, extreme.ratio],
      value: extreme.ratio,
      symbolSize: 11,
      itemStyle: {
        color: kind === 'min' ? CHART_COLORS.low : CHART_COLORS.high,
        borderColor: '#FFFFFF',
        borderWidth: 2,
      },
      label: {
        show: true,
        position: (kind === 'min' ? 'bottom' : 'top') as 'bottom' | 'top',
        distance: 7,
        formatter: `${kind === 'min' ? '低' : '高'} ${formatRatio(extreme.ratio)}`,
        color: kind === 'min' ? CHART_COLORS.low : CHART_COLORS.high,
        fontSize: 11,
        fontWeight: 500,
        backgroundColor: 'rgba(255,255,255,0.86)',
        padding: [2, 5],
        borderRadius: 4,
      },
    },
  ];
}


/**
 * 参考线：常驻系列。
 * 比值轴不可见时（只看创业板点位）不画线 —— 0.300 / 0.700 是比值刻度，
 * 落在点位轴上会变成两条毫无意义的横线。
 */
function referenceSeries(ratioAxisIndex: number, enabled: boolean) {
  return {
    name: '__reference__',
    type: 'line' as const,
    yAxisIndex: ratioAxisIndex,
    data: [] as number[],
    silent: true,
    showSymbol: false,
    symbol: 'none',
    animation: false,
    lineStyle: { width: 0, opacity: 0 },
    itemStyle: { opacity: 0 },
    emphasis: { disabled: true },
    tooltip: { show: false },
    markLine: {
      silent: true,
      symbol: 'none',
      animation: false,
      precision: 3,
      lineStyle: { type: 'dashed' as const, width: 1.4, opacity: 0.95 },
      data: enabled
        ? [
            {
              yAxis: LOW_LINE,
              lineStyle: {
                color: CHART_COLORS.low,
                shadowBlur: 7,
                shadowColor: 'rgba(32,169,123,0.34)',
              },
              label: { show: false },
            },
            {
              yAxis: HIGH_LINE,
              lineStyle: {
                color: CHART_COLORS.high,
                shadowBlur: 7,
                shadowColor: 'rgba(230,91,100,0.34)',
              },
              label: { show: false },
            },
          ]
        : [],
    },
  };
}

/**
 * 构建图表配置。
 *
 * 轴索引约定：0 = 创业板点位（左），1 = 相对比值（右）。
 * 两条轴**始终存在**，只通过 `show` 控制可见性 ——
 * 这样任何模式组合下系列引用的轴索引都成立，
 * 也避免"隐藏一条轴后索引整体前移"导致 yAxis not found。
 */
export function buildOption(params: BuildOptionParams): EChartsOption {
  const {
    records,
    granularity,
    mode,
    visible,
    extremes,
    isMobile,
    reducedMotion,
    extents,
    sliderVisible = true,
  } = params;

  const dates = records.map((row) => row.date);
  const chinextData = records.map((row) => row.chinextClose);
  const ratioData = records.map((row) => row.ratio);

  const showLeft = mode !== 'ratio';
  const showRight = mode !== 'chinext';
  const LEFT_AXIS = 0;
  const RIGHT_AXIS = 1;

  // 只有"轴存在 + 用户勾选"时才真正描线，其余情况画成透明，保持系列常驻
  const drawChinext = showLeft && visible.chinext;
  const drawRatio = showRight && visible.ratio;

  const yAxis: NonNullable<EChartsOption['yAxis']> = [
    {
      type: 'value',
      show: showLeft,
      name: showLeft ? '创业板指数' : '',
      nameTextStyle: { color: CHART_COLORS.muted, fontSize: 11, padding: [0, 0, 6, 0] },
      position: 'left',
      min: extents.chinext?.[0],
      max: extents.chinext?.[1],
      scale: true,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        show: showLeft,
        color: CHART_COLORS.muted,
        fontSize: 11,
        formatter: (value: number) => POINT_AXIS.format(value),
      },
      splitLine: {
        show: showLeft,
        lineStyle: { color: CHART_COLORS.grid, type: 'solid' },
      },
      axisPointer: {
        show: showLeft,
        label: { formatter: (p) => formatPoints(Number(p.value)), backgroundColor: '#5B6478' },
      },
    },
    {
      type: 'value',
      show: showRight,
      name: showRight ? '相对比值' : '',
      nameTextStyle: { color: CHART_COLORS.gold, fontSize: 11, padding: [0, 0, 6, 0] },
      position: showLeft ? 'right' : 'left',
      min: extents.ratio?.[0],
      max: extents.ratio?.[1],
      scale: true,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        show: showRight,
        color: CHART_COLORS.gold,
        fontSize: 11,
        formatter: (value: number) => {
          const text = value.toFixed(2);
          if (Math.abs(value - LOW_LINE) < 1e-9) return `{low|${text}}`;
          if (Math.abs(value - HIGH_LINE) < 1e-9) return `{high|${text}}`;
          return text;
        },
        rich: {
          low: { color: CHART_COLORS.low, fontWeight: 600, fontSize: 11 },
          high: { color: CHART_COLORS.high, fontWeight: 600, fontSize: 11 },
        },
      },
      splitLine: {
        show: showRight && !showLeft,
        lineStyle: { color: CHART_COLORS.grid },
      },
      axisPointer: {
        show: showRight,
        label: { formatter: (p) => Number(p.value).toFixed(3), backgroundColor: '#A98B54' },
      },
    },
  ];

  const tooltipFormatter = (raw: unknown): string => {
    const list = Array.isArray(raw) ? raw : [raw];
    const first = list[0] as { dataIndex?: number } | undefined;
    const index = typeof first?.dataIndex === 'number' ? first.dataIndex : -1;
    const row = records[index];
    if (!row) return '';
    return buildTooltipHtml(row, { chinext: drawChinext, ratio: drawRatio });
  };

  const series: NonNullable<EChartsOption['series']> = [];

  series.push({
    name: '创业板指数',
    type: 'line',
    yAxisIndex: LEFT_AXIS,
    data: chinextData,
    showSymbol: false,
    symbol: 'circle',
    symbolSize: 6,
    animationDuration: reducedMotion ? 0 : 700,
    animationEasing: 'cubicOut',
    lineStyle: {
      width: 1.4,
      color: drawChinext ? CHART_COLORS.chinext : 'transparent',
      opacity: drawChinext ? 0.85 : 0,
    },
    itemStyle: { color: drawChinext ? CHART_COLORS.chinext : 'transparent' },
    emphasis: { disabled: !drawChinext, focus: 'none' },
    z: 3,
  });

  series.push({
    name: '相对比值',
    type: 'line',
    yAxisIndex: RIGHT_AXIS,
    data: ratioData,
    showSymbol: false,
    symbol: 'circle',
    symbolSize: 7,
    animationDuration: reducedMotion ? 0 : 900,
    animationEasing: 'cubicOut',
    lineStyle: {
      width: 2.1,
      color: drawRatio ? CHART_COLORS.gold : 'transparent',
      opacity: drawRatio ? 1 : 0,
    },
    itemStyle: { color: drawRatio ? CHART_COLORS.gold : 'transparent' },
    areaStyle:
      drawRatio && mode === 'ratio'
        ? {
            opacity: 0.1,
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(197,164,109,0.42)' },
                { offset: 1, color: 'rgba(197,164,109,0)' },
              ],
            },
          }
        : undefined,
    emphasis: { disabled: !drawRatio, focus: 'none' },
    markPoint: {
      animation: false,
      data: drawRatio
        ? [...markPointData(extremes.min, 'min'), ...markPointData(extremes.max, 'max')]
        : [],
    },
    z: 5,
  });

  // 参考线系列始终存在（即使比值曲线被隐藏，只要比值轴还在就继续显示）
  series.push(referenceSeries(RIGHT_AXIS, showRight) as never);

  const gridBottom = isMobile ? 62 : 78;
  const gridLeft = showLeft ? (isMobile ? 52 : 62) : isMobile ? 44 : 56;
  const gridRight = showRight ? (isMobile ? 46 : 62) : isMobile ? 16 : 24;

  return {
    animation: !reducedMotion,
    animationDuration: reducedMotion ? 0 : 600,
    animationDurationUpdate: reducedMotion ? 0 : 420,
    textStyle: { fontFamily: 'inherit' },
    grid: {
      left: gridLeft,
      right: gridRight,
      top: isMobile ? 34 : 42,
      bottom: gridBottom,
      containLabel: false,
    },
    tooltip: {
      trigger: 'axis',
      triggerOn: 'mousemove|click',
      confine: true,
      appendToBody: false,
      transitionDuration: reducedMotion ? 0 : 0.18,
      backgroundColor: CHART_COLORS.tooltipBg,
      borderColor: '#E8ECF4',
      borderWidth: 1,
      padding: [10, 12],
      extraCssText:
        'border-radius:12px;box-shadow:0 12px 32px -12px rgba(32,44,64,0.28);backdrop-filter:blur(6px);',
      axisPointer: {
        type: 'cross',
        animation: false,
        label: { backgroundColor: '#5B6478', fontSize: 11 },
        crossStyle: { color: 'rgba(135,146,165,0.55)', type: 'dashed' },
        lineStyle: { color: 'rgba(135,146,165,0.55)', type: 'dashed' },
      },
      formatter: tooltipFormatter,
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: dates,
      axisLine: { lineStyle: { color: CHART_COLORS.axis } },
      axisTick: { show: false },
      axisLabel: {
        color: CHART_COLORS.muted,
        fontSize: 11,
        hideOverlap: true,
        margin: 12,
        formatter: axisLabelFormatter(granularity),
      },
      axisPointer: {
        show: true,
        label: { formatter: (p) => String(p.value), backgroundColor: '#5B6478', fontSize: 11 },
      },
      splitLine: { show: false },
    },
    yAxis,
    series,
    dataZoom: [
      {
        type: 'inside',
        xAxisIndex: 0,
        // none：数据不被真正裁剪，dataIndex 与原始记录一一对应
        filterMode: 'none',
        zoomOnMouseWheel: !isMobile,
        moveOnMouseMove: !isMobile,
        moveOnMouseWheel: false,
        // 手机上允许双指缩放，但单指拖动交给页面纵向滚动，避免冲突
        zoomOnPinch: true,
        preventDefaultMouseMove: true,
        minValueSpan: 8,
      },
      {
        type: 'slider',
        xAxisIndex: 0,
        filterMode: 'none',
        show: sliderVisible,
        height: isMobile ? 26 : 30,
        bottom: isMobile ? 10 : 14,
        borderColor: 'transparent',
        backgroundColor: '#F5F7FB',
        fillerColor: 'rgba(197,164,109,0.16)',
        handleSize: isMobile ? 20 : '110%',
        handleStyle: { color: '#FFFFFF', borderColor: CHART_COLORS.gold, borderWidth: 1.5 },
        moveHandleStyle: { color: 'rgba(197,164,109,0.5)' },
        dataBackground: {
          lineStyle: { color: 'rgba(66,105,151,0.4)', width: 1 },
          areaStyle: { color: 'rgba(66,105,151,0.10)' },
        },
        selectedDataBackground: {
          lineStyle: { color: CHART_COLORS.gold, width: 1 },
          areaStyle: { color: 'rgba(197,164,109,0.16)' },
        },
        textStyle: { color: CHART_COLORS.muted, fontSize: 10 },
        brushSelect: false,
        labelFormatter: (value: number) => String(value).slice(0, 10),
      },
    ],
  } as EChartsOption;
}
