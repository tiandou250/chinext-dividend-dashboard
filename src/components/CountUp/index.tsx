import { useEffect, useRef, useState } from 'react';

import { usePrefersReducedMotion } from '@/hooks/useMediaQuery';

export interface CountUpProps {
  /** 目标数值 */
  value: number;
  /** 动画时长（毫秒），默认 2000 */
  duration?: number;
  /** 小数位，默认 0 */
  decimals?: number;
  className?: string;
  /** 千分位分隔，默认开启 */
  grouping?: boolean;
  /** 前缀 / 后缀（单位、符号） */
  prefix?: string;
  suffix?: string;
}

const formatterCache = new Map<string, Intl.NumberFormat>();

function getFormatter(decimals: number, grouping: boolean): Intl.NumberFormat {
  const key = `${decimals}-${grouping ? 'g' : 'n'}`;
  const cached = formatterCache.get(key);
  if (cached) return cached;
  const instance = new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: grouping,
  });
  formatterCache.set(key, instance);
  return instance;
}

/**
 * 数字滚动：进入视口时从 0 增长到目标值，默认 2 秒。
 *
 * - 用 IntersectionObserver 触发，只触发一次（后续数值变化直接从当前值补间）
 * - easeOutCubic：前段快、后段收窄，读起来像"落定"
 * - 系统开启"减少动效"时直接显示终值
 * - 用 tabular-nums 由调用方通过 className 传入，避免滚动时数字抖动
 */
export default function CountUp({
  value,
  duration = 2000,
  decimals = 0,
  className,
  grouping = true,
  prefix = '',
  suffix = '',
}: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = usePrefersReducedMotion();
  const [entered, setEntered] = useState(false);
  const [display, setDisplay] = useState(0);

  const fromRef = useRef(0);
  const displayRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  // 进入视口才开始，只触发一次
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      setEntered(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setEntered(true);
          observer.disconnect();
        }
      },
      { threshold: 0.35, rootMargin: '0px 0px -8% 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!entered) return undefined;

    if (reduced || !Number.isFinite(value)) {
      fromRef.current = value;
      displayRef.current = value;
      setDisplay(value);
      return undefined;
    }

    const from = fromRef.current;
    const delta = value - from;
    if (Math.abs(delta) < Number.EPSILON) {
      setDisplay(value);
      return undefined;
    }

    // 首次从 0 起跳用完整时长；之后的数据刷新用较短的补间
    const ms = from === 0 ? duration : Math.min(duration, 900);
    const start = performance.now();

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / ms);
      const eased = 1 - (1 - progress) ** 3;
      const next = from + delta * eased;
      displayRef.current = next;
      setDisplay(next);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = value;
        displayRef.current = value;
        setDisplay(value);
      }
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      // 动画被打断时，从当前显示值继续，避免回跳
      fromRef.current = displayRef.current;
    };
  }, [entered, value, duration, reduced]);

  const text = Number.isFinite(display)
    ? getFormatter(decimals, grouping).format(display)
    : '—';

  return (
    <span ref={ref} className={className}>
      {prefix}
      {text}
      {suffix}
    </span>
  );
}
