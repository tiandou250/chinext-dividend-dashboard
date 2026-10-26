import { Loader2, RefreshCw, TriangleAlert } from 'lucide-react';

import { formatClock } from '@/utils/formatting';

export type StatusTone = 'calm' | 'warning' | 'danger' | 'loading';

export interface StatusIndicatorProps {
  /** 数据截至（最新有效交易日） */
  latestTradingDate: string | null;
  sourceName: string;
  tone: StatusTone;
  /** 状态文字 */
  label: string;
  /** 附加说明（异常信息等） */
  detail?: string | null;
  /** metadata 的 lastUpdate 时间 */
  updatedAt?: string | null;
  refreshing: boolean;
  onRefresh: () => void;
  /** 顶栏收起时进入精简模式：只留"数据截至 + 状态 + 刷新" */
  compact?: boolean;
}

const TONE_DOT: Record<StatusTone, string> = {
  calm: 'bg-zone-low',
  warning: 'bg-gold',
  danger: 'bg-zone-high',
  loading: 'bg-muted',
};

/**
 * 顶部数据状态区：数据截至日期、来源、状态、刷新入口。
 * 刷新按钮的语义是"重新检查已部署的数据版本"，不是"强制拉取交易所行情"。
 */
export default function StatusIndicator({
  latestTradingDate,
  sourceName,
  tone,
  label,
  detail,
  updatedAt,
  refreshing,
  onRefresh,
  compact = false,
}: StatusIndicatorProps) {
  return (
    <div
      className={[
        'flex flex-wrap items-center gap-2 transition-all duration-300 sm:gap-3',
        compact ? 'opacity-100' : '',
      ].join(' ')}
    >
      <div className="surface-chip flex items-center gap-2 rounded-full px-3 py-1.5">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE_DOT[tone]}`} aria-hidden />
        <span className="whitespace-nowrap text-[12px] font-medium text-ink tnum">
          数据截至 {latestTradingDate ?? '—'}（收盘）
        </span>
      </div>

      {/* 数据来源在收起时隐藏，让状态条只占一行 */}
      <div
        className={[
          'surface-chip items-center gap-2 rounded-full px-3 py-1.5',
          compact ? 'hidden' : 'hidden sm:flex',
        ].join(' ')}
      >
        <span className="text-[12px] text-muted">数据来源</span>
        <span className="whitespace-nowrap text-[12px] font-medium text-ink">{sourceName}</span>
      </div>

      <div
        className="surface-chip flex items-center gap-1.5 rounded-full px-3 py-1.5"
        title={detail ?? undefined}
      >
        {tone === 'danger' || tone === 'warning' ? (
          <TriangleAlert size={12} className={tone === 'danger' ? 'text-zone-high' : 'text-gold'} />
        ) : null}
        <span className="whitespace-nowrap text-[12px] text-muted">{label}</span>
        {updatedAt && !compact ? (
          <span className="hidden whitespace-nowrap text-[11px] text-muted/80 tnum sm:inline">
            {formatClock(updatedAt)} 更新
          </span>
        ) : null}
      </div>

      <button
        type="button"
        onClick={onRefresh}
        disabled={refreshing}
        aria-label="重新检查数据版本并读取最新数据文件"
        title="重新检查数据版本并读取最新数据文件"
        className="surface-chip trace-line touch-target gap-1.5 rounded-full px-3 text-[12px] font-medium text-ink transition-colors hover:text-gold disabled:cursor-not-allowed disabled:opacity-60"
      >
        {refreshing ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <RefreshCw size={14} />
        )}
        <span>{refreshing ? '检查中' : '刷新'}</span>
      </button>
    </div>
  );
}
