import { ArrowRight, Database, Divide, Ruler, TrendingUp, MousePointer2, LineChart } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

export interface GuideGateProps {
  open: boolean;
  /** 点击「已读」后进入页面 */
  onRead: () => void;
}

interface GuideItem {
  icon: ReactNode;
  title: string;
  desc: string;
}

const ITEMS: GuideItem[] = [
  {
    icon: <Divide size={15} />,
    title: '相对比值（核心）',
    desc: '创业板指数 ÷ 中证红利指数。比值上行＝成长跑赢红利，下行＝红利更抗跌。',
  },
  {
    icon: <LineChart size={15} />,
    title: '两个指数点位',
    desc: '创业板 399006.SZ、中证红利 000922.SH。两者量级不同，不要直接比大小。',
  },
  {
    icon: <Ruler size={15} />,
    title: '两条参考线',
    desc: '0.300 与 0.700 是自设的研究阈值，只用来判断相对位置，不是买卖信号。',
  },
  {
    icon: <TrendingUp size={15} />,
    title: '区间与刻度',
    desc: '「时间范围」决定看哪一段；「刻度」只改横轴标签密度，不改变数据本身。',
  },
  {
    icon: <MousePointer2 size={15} />,
    title: '极值标记',
    desc: '图上直接标出区间内最高/最低比值，点一下卡片可看当天两个指数的点位。',
  },
  {
    icon: <Database size={15} />,
    title: '数据口径',
    desc: '收盘后生成的静态快照，不是盘中实时行情；某日缺数据就留空，绝不插值。',
  },
];

/**
 * 首屏使用说明。
 * 浅灰底 + 明显凸起的卡片（新拟态），读完后点「已读」进入仪表盘。
 * 刻意不做入场动画：避免动画被系统节流时内容停在透明态。
 */
export default function GuideGate({ open, onRead }: GuideGateProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // 聚焦面板而不是按钮：聚焦按钮会让浏览器滚到按钮位置，
    // 用户一进来就停在指南底部；preventScroll 保证从顶部开始读。
    if (overlayRef.current) overlayRef.current.scrollTop = 0;
    panelRef.current?.focus({ preventScroll: true });

    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[60] overflow-y-auto overscroll-contain bg-[#E6ECF5]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="guide-title"
    >
      {/* 背景柔光，避免大片纯色显得死板 */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(680px 420px at 50% 0%, rgba(255,255,255,0.85), rgba(255,255,255,0) 70%)',
        }}
        aria-hidden
      />

      <div className="flex min-h-full flex-col items-center px-4 py-6 sm:py-10">
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative my-auto w-full max-w-[680px] rounded-[26px] bg-[#F1F5FB] px-4 py-5 outline-none sm:px-8 sm:py-8"
        style={{
          boxShadow:
            '14px 14px 34px rgba(140,157,184,0.55), -14px -14px 34px rgba(255,255,255,1), 0 30px 60px -40px rgba(32,44,64,0.55)',
        }}
      >
        <p className="text-[11px] font-medium tracking-[0.18em] text-gold">使用说明</p>
        <h2 id="guide-title" className="mt-2 text-[20px] font-semibold leading-tight text-ink sm:text-[24px]">
          先花 10 秒，看懂这张图
        </h2>
        <p className="mt-2 text-[12.5px] leading-relaxed text-muted sm:text-[13px]">
          这是一个「成长 vs 红利」的相对强弱观察工具。所有数字都来自历史收盘点位，
          不预测走势，也不构成任何投资建议。
        </p>

        <ul className="mt-4 grid grid-cols-1 gap-2 sm:mt-5 sm:grid-cols-2 sm:gap-3">
          {ITEMS.map((item) => (
            <li
              key={item.title}
              className="flex gap-2.5 rounded-2xl bg-[#EDF1F9] p-2.5 sm:p-3"
              style={{
                boxShadow:
                  '4px 4px 10px rgba(150,166,190,0.38), -4px -4px 10px rgba(255,255,255,0.95)',
              }}
            >
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#F1F5FB] text-gold shadow-[2px_2px_6px_rgba(150,166,190,0.4),-2px_-2px_6px_rgba(255,255,255,0.95)]">
                {item.icon}
              </span>
              <div className="min-w-0">
                <h3 className="text-[12.5px] font-semibold text-ink">{item.title}</h3>
                <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted">{item.desc}</p>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11.5px] text-muted">
            之后可在页脚「使用指南」再次查看。
          </p>

          <div className="flex items-center gap-3">
            <span className="text-[11.5px] text-muted">点击右侧按钮进入仪表盘</span>
            <button
              type="button"
              onClick={onRead}
              className="trace-line inline-flex min-h-[44px] items-center gap-2 rounded-full bg-[#F1F5FB] px-5 text-[13px] font-semibold text-ink shadow-[5px_5px_12px_rgba(150,166,190,0.55),-5px_-5px_12px_rgba(255,255,255,1)] transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[8px_10px_20px_rgba(140,157,184,0.6),-5px_-5px_14px_rgba(255,255,255,1)] focus-visible:outline-none"
            >
              已读
              <ArrowRight size={15} aria-hidden />
            </button>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
