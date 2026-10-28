import { AnimatePresence, motion } from 'framer-motion';
import { Database, Info, ShieldCheck, SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

import type { Metadata } from '@/types/market';
import { HIGH_LINE, LOW_LINE } from '@/utils/calculations';
import { formatClock, formatDateLong } from '@/utils/formatting';

export interface InfoDialogProps {
  open: boolean;
  onClose: () => void;
  metadata: Metadata | null;
  recordCount: number;
}

function Section({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 text-[13px] font-semibold text-ink">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-gold/10 text-gold">
          {icon}
        </span>
        {title}
      </h3>
      <div className="space-y-1.5 pl-8 text-[12.5px] leading-relaxed text-ink/80">{children}</div>
    </section>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-hairline/70 py-1 last:border-0">
      <span className="shrink-0 text-muted">{label}</span>
      <span className="text-right font-medium text-ink tnum">{value}</span>
    </div>
  );
}

/**
 * 说明弹窗：口径、参考线来历、数据源与局限。
 * 手机上以底部抽屉形式出现，PC 居中显示。
 */
export default function InfoDialog({ open, onClose, metadata, recordCount }: InfoDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  const timelineStart = metadata?.timelineStart ?? null;
  const startDate = metadata?.startDate ?? null;
  const latest = metadata?.latestTradingDate ?? null;

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="info"
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <button
            type="button"
            aria-label="关闭说明"
            onClick={onClose}
            className="absolute inset-0 h-full w-full cursor-default bg-ink/32 backdrop-blur-[3px]"
          />

          <motion.div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="info-dialog-title"
            initial={{ y: 28, opacity: 0, scale: 0.99 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 20, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            className="relative flex max-h-[88dvh] w-full flex-col rounded-t-2xl bg-card shadow-sheet outline-none sm:max-h-[82dvh] sm:max-w-[620px] sm:rounded-2xl"
            style={{ paddingBottom: 'var(--safe-bottom)' }}
          >
            <div className="flex items-start justify-between gap-3 border-b border-hairline px-4 py-3.5 sm:px-5">
              <div>
                <h2 id="info-dialog-title" className="text-[15px] font-semibold text-ink">
                  数据说明与计算口径
                </h2>
                <p className="mt-0.5 text-[11.5px] text-muted">
                  先看口径，再看曲线 —— 任何结论都受限于下面的规则。
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="关闭"
                className="touch-target -mr-1 -mt-1 rounded-full text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/40"
              >
                <X size={17} />
              </button>
            </div>

            <div className="thin-scroll flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-5">
              <Section icon={<Info size={13} />} title="这张图在比较什么">
                <p>
                  两条曲线来自两个不同的指数：<strong className="text-ink">创业板指数</strong>
                  （399006.SZ，代表成长风格）与<strong className="text-ink">中证红利指数</strong>
                  （000922.SH，代表高股息风格）。
                </p>
                <p>
                  单独看点位没有可比性——它们的基点与量级不同。所以页面用
                  <strong className="text-ink">相对比值</strong>
                  把两者压缩成一个数：比值上升，说明成长相对红利走强；比值下降则相反。
                </p>
              </Section>

              <Section icon={<SlidersHorizontal size={13} />} title="比值怎么算">
                <div className="surface-inset-sm rounded-lg bg-well px-3 py-2 font-mono text-[12px] text-ink">
                  相对比值 = 创业板指数收盘点位 ÷ 中证红利指数收盘点位
                </div>
                <p>
                  两个点位取<strong className="text-ink">同一交易日</strong>的收盘值，保留 3 位小数展示，
                  计算一律使用未舍入的原始点位。图表左轴是点位，右轴是比值，两轴独立、不共享刻度。
                </p>
                <p>
                  遇到某一侧缺失数据的交易日，该日不参与计算，也不做插值补点——
                  宁可在曲线上留空，也不编造点位。
                </p>
              </Section>

              <Section icon={<SlidersHorizontal size={13} />} title="两条虚线是什么">
                <p>
                  {LOW_LINE.toFixed(3)} 与 {HIGH_LINE.toFixed(3)} 是
                  <strong className="text-ink">使用者自设的研究参考阈值</strong>
                  ，不是统计显著性结论，也不是估值模型输出。
                </p>
                <p>
                  页面只把它们当作「回顾相对位置」的标尺：比值落在低位线以下时，历史上意味着成长风格
                  相对偏弱；落在高位线以上时相反。参考线不随缩放消失，方便随时对照。
                </p>
              </Section>

              <Section icon={<Database size={13} />} title="数据从哪来">
                <div className="space-y-0">
                  <KV label="数据提供方" value={metadata?.provider?.name ?? '—'} />
                  <KV label="接入方式" value="公开网页行情接口，无需密钥" />
                  <KV label="记录条数" value={`${recordCount.toLocaleString('zh-CN')} 个交易日`} />
                  <KV label="时间轴起点" value={timelineStart ? formatDateLong(timelineStart) : '—'} />
                  <KV label="首个可用交易日" value={startDate ? formatDateLong(startDate) : '—'} />
                  <KV label="数据截至" value={latest ? formatDateLong(latest) : '—'} />
                  <KV
                    label="快照生成"
                    value={
                      metadata?.generatedAt
                        ? `${metadata.generatedAt.slice(0, 10)} ${formatClock(metadata.generatedAt)}`
                        : '—'
                    }
                  />
                  <KV label="数据版本" value={metadata?.dataVersion ?? '—'} />
                </div>
                <p className="pt-1">
                  快照由脚本在收盘后生成。若快照落后于最新交易日，页面会用<strong className="text-ink">同一数据源</strong>
                  （腾讯日线接口）即时补齐缺口，并在顶栏标注「现场补齐」，因此不必等数据文件重新部署。
                  两种来源都只取收盘值，当天 16:00 前不会入库，所以这里展示的始终是
                  <strong className="text-ink">收盘后的历史数据</strong>，不是盘中行情。
                </p>
              </Section>

              {metadata?.coverageNote ? (
                <Section icon={<Info size={13} />} title="覆盖说明">
                  <p className="rounded-lg border border-gold/25 bg-gold/[0.07] px-3 py-2 text-[12px] text-ink/80">
                    {metadata.coverageNote}
                  </p>
                </Section>
              ) : null}

              <Section icon={<ShieldCheck size={13} />} title="局限与声明">
                <ul className="list-disc space-y-1 pl-4">
                  <li>历史相对强弱不代表未来走势，比值高低本身不构成任何买卖信号。</li>
                  <li>指数点位不含分红再投资的全部细节，比值只反映价格层面的相对变化。</li>
                  <li>数据来自第三方公开接口，可能存在延迟、缺失或接口变更，以交易所官方数据为准。</li>
                  <li>本页面为个人研究工具，不构成投资建议，据此操作风险自担。</li>
                </ul>
              </Section>
            </div>

            <div className="border-t border-hairline px-4 py-3 sm:px-5">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex min-h-[44px] w-full items-center justify-center rounded-full bg-ink text-[13px] font-medium text-white transition-colors hover:bg-ink/90"
              >
                我知道了
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
