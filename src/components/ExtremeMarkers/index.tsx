import { motion } from 'framer-motion';
import { TrendingDown, TrendingUp, X } from 'lucide-react';

import CountUp from '@/components/CountUp';
import type { HistoricalRecord } from '@/types/market';
import { resolveZone } from '@/utils/calculations';
import { formatPoints, formatRatio } from '@/utils/formatting';

export interface ExtremeMarkersProps {
  /** 全历史极值（信息卡始终展示） */
  allTime: { min: HistoricalRecord | null; max: HistoricalRecord | null };
  /** 当前可见区间内的极值（图表只绘制这一组标记） */
  inView: { min: HistoricalRecord | null; max: HistoricalRecord | null };
  selected: 'min' | 'max' | null;
  onSelect: (kind: 'min' | 'max' | null) => void;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-[12px] text-muted">{label}</span>
      <span className="text-[13px] font-medium text-ink tnum">{value}</span>
    </div>
  );
}

/**
 * 历史极值信息卡。
 * 全历史极值始终可见；图表上的标记只绘制在当前可见区间内（两者用文案区分）。
 */
export default function ExtremeMarkers({
  allTime,
  inView,
  selected,
  onSelect,
}: ExtremeMarkersProps) {
  const active = selected === 'min' ? allTime.min : selected === 'max' ? allTime.max : null;
  const activeKind = selected;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {(['min', 'max'] as const).map((kind) => {
          const record = kind === 'min' ? allTime.min : allTime.max;
          const visibleRecord = kind === 'min' ? inView.min : inView.max;
          const isActive = selected === kind;
          const tone = kind === 'min' ? 'text-zone-low' : 'text-zone-high';
          const ring = kind === 'min' ? 'ring-1 ring-zone-low/50' : 'ring-1 ring-zone-high/50';
          const Icon = kind === 'min' ? TrendingDown : TrendingUp;

          return (
            <button
              key={kind}
              type="button"
              onClick={() => onSelect(isActive ? null : kind)}
              className={[
                'card-surface trace-line flex min-h-[44px] items-center justify-between gap-3 p-3 text-left sm:p-4',
                isActive ? ring : '',
              ].join(' ')}
            >
              <span className="flex items-center gap-2.5">
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                    kind === 'min' ? 'bg-zone-low/10' : 'bg-zone-high/10'
                  } ${tone}`}
                >
                  <Icon size={15} aria-hidden />
                </span>
                <span>
                  <span className="block text-[12px] text-muted">
                    {kind === 'min' ? '全历史最低比值' : '全历史最高比值'}
                  </span>
                  <span className="block text-[11px] text-muted/80 tnum">
                    {record ? record.date : '暂无数据'}
                  </span>
                </span>
              </span>
              <span className="text-right">
                {record ? (
                  <CountUp
                    value={record.ratio}
                    decimals={3}
                    duration={2000}
                    className={`block text-[19px] font-semibold leading-none tnum ${tone}`}
                  />
                ) : (
                  <span className={`block text-[19px] font-semibold leading-none tnum ${tone}`}>
                    —
                  </span>
                )}
                <span className="mt-1 block text-[11px] text-muted tnum">
                  {visibleRecord
                    ? '当前区间含此标记'
                    : record
                      ? '需放大范围查看'
                      : ''}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {active && activeKind ? (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="card-surface relative p-3 sm:p-4"
        >
          <button
            type="button"
            onClick={() => onSelect(null)}
            aria-label="关闭极值详情"
            className="touch-target absolute right-1 top-1 rounded-full text-muted hover:text-ink"
          >
            <X size={15} />
          </button>
          <p className="text-[12px] font-medium text-ink">
            {activeKind === 'min' ? '历史最低比值' : '历史最高比值'} · {active.date}
          </p>
          <div className="mt-2 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
            <DetailRow label="创业板指数" value={formatPoints(active.chinextClose)} />
            <DetailRow label="中证红利指数" value={formatPoints(active.dividendClose)} />
            <DetailRow label="当日比值" value={formatRatio(active.ratio)} />
            <DetailRow label="相对状态" value={resolveZone(active.ratio).label} />
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-muted">
            历史比值极值不等于未来确定的投资买卖点，仅用于回顾相对位置。
          </p>
        </motion.div>
      ) : null}
    </div>
  );
}
