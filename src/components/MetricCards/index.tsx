import { ArrowDownRight, ArrowUpRight, MoveDown, MoveUp, Minus } from 'lucide-react';
import type { ReactNode } from 'react';

import CountUp from '@/components/CountUp';
import type { HistoricalRecord, ZoneInfo } from '@/types/market';
import { bandPosition, distanceTo, HIGH_LINE, LOW_LINE } from '@/utils/calculations';
import { formatChange, formatRatio, formatSignedDiff } from '@/utils/formatting';

const ZONE_STYLE: Record<ZoneInfo['key'], string> = {
  low: 'bg-zone-low/10 text-zone-low',
  mid: 'bg-well text-[#5B6478]',
  high: 'bg-zone-high/10 text-zone-high',
};

/** 涨红跌绿（中国市场惯例） */
function changeTone(value: number | null): string {
  if (value === null) return 'text-muted';
  if (value > 0) return 'text-zone-high';
  if (value < 0) return 'text-zone-low';
  return 'text-muted';
}

function ChangeRow({ value, label }: { value: number | null; label: string }) {
  const tone = changeTone(value);
  const Icon = value === null ? Minus : value > 0 ? ArrowUpRight : value < 0 ? ArrowDownRight : Minus;
  return (
    <span className={`inline-flex items-center gap-1 text-[13px] font-medium tnum ${tone}`}>
      <Icon size={13} aria-hidden />
      {formatChange(value)}
      <span className="font-normal text-muted">{label}</span>
    </span>
  );
}

function MetricCard({
  title,
  hint,
  children,
  accent,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  accent?: ReactNode;
}) {
  return (
    <section className="card-surface flex flex-col justify-between gap-3 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-[12px] font-medium tracking-wide text-muted">{title}</h2>
          {hint ? <p className="mt-0.5 text-[11px] text-muted/80">{hint}</p> : null}
        </div>
        {accent}
      </div>
      {children}
    </section>
  );
}

export interface MetricCardsProps {
  latest: HistoricalRecord;
  previous: HistoricalRecord | null;
  zone: ZoneInfo;
  chinextChange: number | null;
  dividendChange: number | null;
}

export default function MetricCards({
  latest,
  previous,
  zone,
  chinextChange,
  dividendChange,
}: MetricCardsProps) {
  const band = bandPosition(latest.ratio);
  const toLow = distanceTo(latest.ratio, LOW_LINE);
  const toHigh = distanceTo(latest.ratio, HIGH_LINE);

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {/* 卡片一：当前相对比值 */}
      <MetricCard
        title="当前相对比值"
        hint="创业板 ÷ 中证红利"
        accent={
          <span className={`pill shrink-0 whitespace-nowrap ${ZONE_STYLE[zone.key]}`}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
            {zone.label}
          </span>
        }
      >
        <div>
          <div className="flex items-baseline gap-2">
            <CountUp
              value={latest.ratio}
              decimals={3}
              duration={2000}
              className="text-[30px] font-semibold leading-none text-ink tnum sm:text-[36px]"
            />
            <span className="text-[11px] text-muted tnum">{latest.date}</span>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-1 text-[12px] sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <div className="flex items-center gap-1.5 text-muted">
              <span className="h-1 w-3 rounded-full bg-zone-low" aria-hidden />
              距低位线
              <span className="font-medium text-ink tnum">{formatSignedDiff(toLow)}</span>
            </div>
            <div className="flex items-center gap-1.5 text-muted">
              <span className="h-1 w-3 rounded-full bg-zone-high" aria-hidden />
              距高位线
              <span className="font-medium text-ink tnum">{formatSignedDiff(toHigh)}</span>
            </div>
          </div>
        </div>
      </MetricCard>

      {/* 卡片二：创业板指数 */}
      <MetricCard
        title="创业板指数"
        hint="399006.SZ · 收盘点位"
        accent={<span className="h-2 w-2 shrink-0 rounded-full bg-chinext" aria-hidden />}
      >
        <div>
          <CountUp
            value={latest.chinextClose}
            decimals={2}
            duration={2000}
            className="block text-[26px] font-semibold leading-none text-ink tnum sm:text-[30px]"
          />
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
            <ChangeRow value={chinextChange} label="较前一交易日" />
            <span className="text-[11px] text-muted tnum">{latest.date}</span>
          </div>
          {previous === null ? (
            <p className="mt-1 text-[11px] text-muted">缺少上一有效交易日，涨跌幅显示为 —</p>
          ) : null}
        </div>
      </MetricCard>

      {/* 卡片三：中证红利指数 */}
      <MetricCard
        title="中证红利指数"
        hint="000922.SH · 收盘点位"
        accent={<span className="h-2 w-2 shrink-0 rounded-full bg-gold" aria-hidden />}
      >
        <div>
          <CountUp
            value={latest.dividendClose}
            decimals={2}
            duration={2000}
            className="block text-[26px] font-semibold leading-none text-ink tnum sm:text-[30px]"
          />
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
            <ChangeRow value={dividendChange} label="较前一交易日" />
            <span className="text-[11px] text-muted tnum">{latest.date}</span>
          </div>
        </div>
      </MetricCard>

      {/* 卡片四：历史参考区间 */}
      <MetricCard
        title="历史参考区间"
        hint="用户指定的研究阈值"
        accent={
          band.outside ? (
            <span
              className={`pill shrink-0 whitespace-nowrap ${
                band.outside === 'below'
                  ? 'bg-zone-low/10 text-zone-low'
                  : 'bg-zone-high/10 text-zone-high'
              }`}
            >
              {band.outside === 'below' ? (
                <MoveDown size={12} aria-hidden />
              ) : (
                <MoveUp size={12} aria-hidden />
              )}
              {band.outside === 'below' ? '低于参考区间' : '高于参考区间'}
            </span>
          ) : (
            <span className="pill shrink-0 whitespace-nowrap bg-well text-[#5B6478]">区间内</span>
          )
        }
      >
        <div>
          <div className="flex items-center justify-between text-[11px] text-muted">
            <span className="inline-flex items-center gap-1">
              <span className="h-1 w-3 rounded-full bg-zone-low" aria-hidden />
              低位 {LOW_LINE.toFixed(3)}
            </span>
            <span className="inline-flex items-center gap-1">
              高位 {HIGH_LINE.toFixed(3)}
              <span className="h-1 w-3 rounded-full bg-zone-high" aria-hidden />
            </span>
          </div>

          {/* 进度槽做成凹陷，滑块浮在上面 */}
          <div className="surface-inset-sm relative mt-3 h-2.5 rounded-full">
            <span
              className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-ink shadow-chip"
              style={{ left: `${band.percent}%` }}
              aria-hidden
            />
          </div>

          <div className="mt-2 flex items-center justify-between">
            <span className="text-[11px] text-muted">区间位置</span>
            <span className="text-[12px] font-medium text-ink tnum">
              {band.outside
                ? band.outside === 'below'
                  ? `低于下限 0.300（当前 ${formatRatio(latest.ratio)}）`
                  : `高于上限 0.700（当前 ${formatRatio(latest.ratio)}）`
                : `当前 ${formatRatio(latest.ratio)}`}
            </span>
          </div>
        </div>
      </MetricCard>
    </div>
  );
}
