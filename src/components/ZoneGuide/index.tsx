import { motion } from 'framer-motion';

import type { ZoneInfo } from '@/types/market';
import { HIGH_LINE, LOW_LINE } from '@/utils/calculations';
import { formatRatio } from '@/utils/formatting';

export interface ZoneDistribution {
  /** 各档交易日数量 */
  low: number;
  mid: number;
  high: number;
  total: number;
}

export interface ZoneGuideProps {
  ratio: number;
  zone: ZoneInfo;
  distribution: ZoneDistribution;
}

interface ZoneDef {
  key: ZoneInfo['key'];
  title: string;
  range: string;
  desc: string;
  dot: string;
  text: string;
  bar: string;
}

const ZONES: ZoneDef[] = [
  {
    key: 'low',
    title: '低位参考区',
    range: `比值 ≤ ${LOW_LINE.toFixed(3)}`,
    desc: '成长风格相对红利明显偏弱的历史区间',
    dot: 'bg-zone-low',
    text: 'text-zone-low',
    bar: 'bg-zone-low',
  },
  {
    key: 'mid',
    title: '参考区间',
    range: `${LOW_LINE.toFixed(3)} – ${HIGH_LINE.toFixed(3)}`,
    desc: '多数时间所处的相对强弱中枢',
    dot: 'bg-[#9AA5B8]',
    text: 'text-[#5B6478]',
    bar: 'bg-[#B7C0CF]',
  },
  {
    key: 'high',
    title: '高位参考区',
    range: `比值 ≥ ${HIGH_LINE.toFixed(3)}`,
    desc: '成长风格相对红利明显偏强的历史区间',
    dot: 'bg-zone-high',
    text: 'text-zone-high',
    bar: 'bg-zone-high',
  },
];

function percent(count: number, total: number): number {
  if (total <= 0) return 0;
  return (count / total) * 100;
}

/**
 * 区间分布：把全历史交易日按三档归类，给出占比。
 * 这是纯事后统计，用来说明"当前位置在历史中属于哪一类"，不预测方向。
 */
export default function ZoneGuide({ ratio, zone, distribution }: ZoneGuideProps) {
  const { total } = distribution;
  const active = ZONES.find((item) => item.key === zone.key) ?? ZONES[1]!;

  return (
    <section className="card-surface p-4 sm:p-5" aria-labelledby="zone-guide-title">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="zone-guide-title" className="text-[13px] font-semibold text-ink">
            历史区间分布
          </h2>
          <p className="mt-0.5 text-[11.5px] text-muted">
            全历史 {total.toLocaleString('zh-CN')} 个交易日按比值落在哪一档统计
          </p>
        </div>
        <span className={`surface-chip pill ${active.text}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${active.dot}`} aria-hidden />
          当前：{active.title}
        </span>
      </div>

      {/* 占比条 */}
      <div className="surface-inset-sm mt-3.5 flex h-2.5 overflow-hidden rounded-full bg-well">
        {ZONES.map((item) => {
          const width = percent(distribution[item.key], total);
          return (
            <motion.span
              key={item.key}
              initial={{ width: 0 }}
              animate={{ width: `${width}%` }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className={`${item.bar} ${zone.key === item.key ? 'opacity-100' : 'opacity-55'}`}
              title={`${item.title} ${width.toFixed(1)}%`}
            />
          );
        })}
      </div>

      <ul className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-3 sm:gap-2">
        {ZONES.map((item) => {
          const count = distribution[item.key];
          const isActive = zone.key === item.key;
          return (
            <li
              key={item.key}
              className={[
                'surface-raise-sm rounded-xl px-3 py-2.5 transition-all',
                isActive ? 'ring-1 ring-gold/45' : '',
              ].join(' ')}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-[12px] font-medium text-ink">
                  <span className={`h-1.5 w-1.5 rounded-full ${item.dot}`} aria-hidden />
                  {item.title}
                </span>
                <span className={`text-[13px] font-semibold tnum ${item.text}`}>
                  {percent(count, total).toFixed(1)}%
                </span>
              </div>
              <p className="mt-1 text-[11px] text-muted tnum">{item.range}</p>
              <p className="mt-0.5 text-[11px] leading-snug text-muted/80">
                {count.toLocaleString('zh-CN')} 个交易日 · {item.desc}
              </p>
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-[11px] leading-relaxed text-muted">
        当前比值 <span className="font-medium text-ink tnum">{formatRatio(ratio)}</span>
        ，位于{active.title}。占比为历史统计结果，不代表未来停留在某一档的概率。
      </p>
    </section>
  );
}
