import { BarChart3 } from 'lucide-react';

import type { StatusTone } from '@/components/StatusIndicator';
import StatusIndicator from '@/components/StatusIndicator';
import { useScrollCollapse } from '@/hooks/useScrollCollapse';

export interface HeaderProps {
  latestTradingDate: string | null;
  sourceName: string;
  tone: StatusTone;
  statusLabel: string;
  statusDetail: string | null;
  updatedAt: string | null;
  refreshing: boolean;
  onRefresh: () => void;
}

/**
 * 顶栏：向下滚动自动收起（隐藏图标与副标题、缩小标题、精简状态条），向上滚动展开。
 * 收起只改变高度与透明度，状态信息始终保留，不会出现"关键信息被藏起来"的情况。
 */
export default function Header({
  latestTradingDate,
  sourceName,
  tone,
  statusLabel,
  statusDetail,
  updatedAt,
  refreshing,
  onRefresh,
}: HeaderProps) {
  const collapsed = useScrollCollapse(72);

  return (
    <header
      className={[
        'sticky top-0 z-30 border-b border-hairline bg-canvas/95',
        // 禁止滚动锚定介入：顶栏高度变化时浏览器会尝试补偿滚动位置，与收起逻辑互相拉扯
        '[overflow-anchor:none]',
        'transition-shadow duration-300 ease-out',
        collapsed ? 'shadow-[0_10px_24px_-20px_rgba(32,44,64,0.55)]' : 'shadow-none',
      ].join(' ')}
      style={{ paddingTop: 'var(--safe-top)' }}
      data-collapsed={collapsed ? 'true' : 'false'}
    >
      <div
        className={[
          'mx-auto flex w-full max-w-[1440px] flex-col px-4 transition-[padding,gap] duration-200 ease-out sm:px-6',
          'lg:flex-row lg:items-center lg:justify-between',
          collapsed ? 'gap-1 py-1 sm:py-1.5' : 'gap-3 py-3 sm:py-4',
        ].join(' ')}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={[
              'flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-gold/30 bg-gold/10 text-gold',
              'transition-[width,height,opacity] duration-200 ease-out',
              collapsed ? 'h-0 w-0 border-0 opacity-0' : 'h-9 w-9 opacity-100',
            ].join(' ')}
            aria-hidden
          >
            <BarChart3 size={18} />
          </span>

          <div className="min-w-0">
            <h1
              className={[
                'font-semibold leading-tight text-ink transition-[font-size] duration-200 ease-out',
                collapsed ? 'text-[14px] sm:text-[15px]' : 'text-[17px] sm:text-[20px]',
              ].join(' ')}
            >
              创业板 · 红利风格观察仪表盘
              <span
                className={[
                  'ml-2 font-normal text-muted transition-opacity duration-200',
                  collapsed ? 'hidden' : 'hidden text-[12px] xl:inline',
                ].join(' ')}
              >
                ChiNext / CSI Dividend Style Monitor
              </span>
            </h1>

            {/* 副标题：收起时高度归零，避免整页内容跟着往下跳太多 */}
            <div
              className={[
                'overflow-hidden transition-[max-height,opacity] duration-200 ease-out',
                collapsed ? 'max-h-0 opacity-0' : 'max-h-10 opacity-100',
              ].join(' ')}
              aria-hidden={collapsed}
            >
              <p className="mt-1 text-[12px] leading-snug text-muted sm:text-[13px]">
                基于历史指数相对强弱，观察成长与红利风格变化。
              </p>
            </div>
          </div>
        </div>

        <StatusIndicator
          latestTradingDate={latestTradingDate}
          sourceName={sourceName}
          tone={tone}
          label={statusLabel}
          detail={statusDetail}
          updatedAt={updatedAt}
          refreshing={refreshing}
          onRefresh={onRefresh}
          compact={collapsed}
        />
      </div>
    </header>
  );
}
