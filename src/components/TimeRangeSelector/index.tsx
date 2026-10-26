import { RotateCcw } from 'lucide-react';

import type { Granularity, RangeKey } from '@/types/market';

const RANGES: Array<{ key: RangeKey; label: string }> = [
  { key: '1y', label: '近 1 年' },
  { key: '3y', label: '近 3 年' },
  { key: '5y', label: '近 5 年' },
  { key: 'all', label: '全部' },
];

const GRANULARITIES: Array<{ key: Granularity; label: string; hint: string }> = [
  { key: 'year', label: '年', hint: '横轴按年显示' },
  { key: 'month', label: '月', hint: '横轴按月显示' },
  { key: 'day', label: '日', hint: '横轴按交易日显示' },
];

export interface TimeRangeSelectorProps {
  range: RangeKey;
  granularity: Granularity;
  visible: { chinext: boolean; ratio: boolean };
  /** 当前实际可见区间，例如 2010-06-02 → 2026-10-23 */
  visibleSpan: string;
  onRangeChange: (range: RangeKey) => void;
  onGranularityChange: (granularity: Granularity) => void;
  onToggleSeries: (key: 'chinext' | 'ratio') => void;
  onReset: () => void;
}

function segmentClass(active: boolean): string {
  return [
    'inline-flex min-h-[44px] items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[12px] font-medium transition-all sm:min-h-[34px]',
    active
      ? 'surface-chip text-ink'
      : 'text-muted hover:text-ink',
  ].join(' ');
}

function GroupLabel({ children }: { children: string }) {
  return <span className="mr-1 shrink-0 text-[11px] text-muted">{children}</span>;
}

/** 时间范围 / 时间刻度 / 图例 / 重置 —— 时间范围与刻度是两组独立控制 */
export default function TimeRangeSelector({
  range,
  granularity,
  visible,
  visibleSpan,
  onRangeChange,
  onGranularityChange,
  onToggleSeries,
  onReset,
}: TimeRangeSelectorProps) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="snap-x-row -mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-0.5 sm:mx-0 sm:flex-wrap sm:px-0">
        <div
          className="surface-inset-sm flex shrink-0 items-center rounded-full bg-well p-1"
          role="group"
          aria-label="快捷时间范围"
        >
          {RANGES.map((item) => (
            <button
              key={item.key}
              type="button"
              aria-pressed={range === item.key}
              onClick={() => onRangeChange(item.key)}
              className={segmentClass(range === item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div
          className="surface-inset-sm flex shrink-0 items-center rounded-full bg-well p-1"
          role="group"
          aria-label="时间刻度粒度"
        >
          <GroupLabel>刻度</GroupLabel>
          {GRANULARITIES.map((item) => (
            <button
              key={item.key}
              type="button"
              title={item.hint}
              aria-pressed={granularity === item.key}
              onClick={() => onGranularityChange(item.key)}
              className={segmentClass(granularity === item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:ml-auto">
          <div
            className="surface-inset-sm flex items-center gap-1 rounded-full bg-well p-1"
            role="group"
            aria-label="曲线显示控制"
          >
            <button
              type="button"
              aria-pressed={visible.chinext}
              onClick={() => onToggleSeries('chinext')}
              className={[
                'inline-flex min-h-[44px] items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[12px] transition-colors sm:min-h-[32px]',
                visible.chinext ? 'text-ink' : 'text-muted/60 line-through',
              ].join(' ')}
            >
              <span
                className={`h-2 w-2 rounded-full ${visible.chinext ? 'bg-chinext' : 'bg-muted/40'}`}
                aria-hidden
              />
              创业板指数
            </button>
            <button
              type="button"
              aria-pressed={visible.ratio}
              onClick={() => onToggleSeries('ratio')}
              className={[
                'inline-flex min-h-[44px] items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[12px] transition-colors sm:min-h-[32px]',
                visible.ratio ? 'text-ink' : 'text-muted/60 line-through',
              ].join(' ')}
            >
              <span
                className={`h-2 w-2 rounded-full ${visible.ratio ? 'bg-gold' : 'bg-muted/40'}`}
                aria-hidden
              />
              相对比值
            </button>
          </div>

          <button
            type="button"
            onClick={onReset}
            aria-label="恢复完整时间区间"
            title="恢复完整时间区间"
            className="surface-chip trace-line inline-flex min-h-[44px] items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[12px] font-medium text-muted transition-colors hover:text-gold sm:min-h-[34px]"
          >
            <RotateCcw size={13} aria-hidden />
            重置
          </button>
        </div>
      </div>

      <p className="text-[11px] text-muted tnum">当前可见区间：{visibleSpan}</p>
    </div>
  );
}
