import type { HistoricalRecord } from '@/types/market';
import { formatDateSlash, formatPoints, formatRatio } from '@/utils/formatting';

export interface RangeSummaryProps {
  /** 当前可见区间内的记录（按日期升序） */
  records: HistoricalRecord[];
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[10.5px] tracking-wide text-muted">{label}</span>
      <span className={`truncate text-[12.5px] font-medium tnum ${tone ?? 'text-ink'}`}>
        {value}
      </span>
    </div>
  );
}

/**
 * 可见区间速览。
 * 数据全部由前端在已加载记录上现算，不额外请求接口。
 */
export default function RangeSummary({ records }: RangeSummaryProps) {
  if (records.length === 0) return null;

  const first = records[0]!;
  const last = records[records.length - 1]!;

  let sum = 0;
  let minRatio = Number.POSITIVE_INFINITY;
  let maxRatio = Number.NEGATIVE_INFINITY;
  for (const row of records) {
    sum += row.ratio;
    if (row.ratio < minRatio) minRatio = row.ratio;
    if (row.ratio > maxRatio) maxRatio = row.ratio;
  }
  const mean = sum / records.length;
  const chinextChange = first.chinextClose > 0 ? (last.chinextClose / first.chinextClose - 1) * 100 : null;

  return (
    <div className="surface-raise-sm flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl px-3 py-2.5">
      <Stat label="区间起点" value={formatDateSlash(first.date)} />
      <Stat label="区间终点" value={formatDateSlash(last.date)} />
      <Stat label="交易日" value={`${records.length.toLocaleString('zh-CN')} 天`} />
      <Stat label="比值均值" value={formatRatio(mean)} />
      <Stat
        label="区间最低"
        value={formatRatio(minRatio)}
        tone="text-zone-low"
      />
      <Stat
        label="区间最高"
        value={formatRatio(maxRatio)}
        tone="text-zone-high"
      />
      <Stat
        label="创业板区间点位变动"
        value={
          chinextChange === null
            ? '—'
            : `${chinextChange > 0 ? '+' : chinextChange < 0 ? '−' : ''}${Math.abs(chinextChange).toFixed(1)}%`
        }
        tone={
          chinextChange === null
            ? 'text-muted'
            : chinextChange > 0
              ? 'text-zone-high'
              : chinextChange < 0
                ? 'text-zone-low'
                : 'text-muted'
        }
      />
      <span className="ml-auto hidden text-[10.5px] text-muted sm:block">
        {formatPoints(first.chinextClose)} → {formatPoints(last.chinextClose)} 点
      </span>
    </div>
  );
}
