import { RefreshCw, ServerCrash, TriangleAlert } from 'lucide-react';

export interface ErrorPanelProps {
  message: string;
  hint: string;
  code: string;
  refreshing: boolean;
  onRetry: () => void;
}

/** 首屏加载失败：说明「失败在哪一步」+ 可执行的重试入口，不展示任何占位数字 */
export default function ErrorPanel({ message, hint, code, refreshing, onRetry }: ErrorPanelProps) {
  return (
    <div className="card-surface mx-auto flex max-w-[560px] flex-col items-center gap-4 px-5 py-10 text-center sm:py-14">
      <span
        className="flex h-12 w-12 items-center justify-center rounded-2xl border border-zone-high/25 bg-zone-high/10 text-zone-high"
        aria-hidden
      >
        <ServerCrash size={22} />
      </span>

      <div className="space-y-1.5">
        <h2 className="text-[16px] font-semibold text-ink">行情数据读取失败</h2>
        <p className="text-[13px] leading-relaxed text-ink/75">{message}</p>
        <p className="text-[12px] leading-relaxed text-muted">{hint}</p>
      </div>

      <div className="surface-inset-sm flex items-center gap-2 rounded-lg bg-well px-2.5 py-1.5 text-[11px] text-muted">
        <TriangleAlert size={12} aria-hidden />
        错误类型 <span className="font-mono">{code}</span>
      </div>

      <button
        type="button"
        onClick={onRetry}
        disabled={refreshing}
        className="trace-line inline-flex min-h-[44px] items-center gap-2 rounded-full bg-ink px-4 text-[13px] font-medium text-white transition-colors hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <RefreshCw size={14} className={refreshing ? 'animate-spin' : undefined} aria-hidden />
        {refreshing ? '正在重试' : '重新读取'}
      </button>

      <p className="max-w-[420px] text-[11px] leading-relaxed text-muted">
        本页面只读取已部署的静态数据文件，失败通常意味着文件尚未生成或部署路径不正确。
        本地开发请先执行 <span className="font-mono text-ink/70">npm run data:init</span>。
      </p>
    </div>
  );
}
