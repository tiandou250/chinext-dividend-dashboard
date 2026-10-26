import { useEffect, useRef, useState } from 'react';

/**
 * 顶栏自动收起。
 *
 * 三条防抖规则，缺一条都会在触控板/惯性滚动下反复收起-展开（表现为"频繁卡动"）：
 *  1. 死区：位移小于 deadZone 直接忽略，惯性尾段的 ±3px 噪声不参与判断
 *  2. 迟滞：收起需要越过 threshold 且继续向下；展开只看方向，但同样要超过死区
 *  3. 冷却：一次切换后 cooldownMs 内不再响应 —— 顶栏高度变化会改变页面高度，
 *     浏览器可能补发一次 scroll 事件，不锁住就会形成"收起→展开→收起"的自激循环
 *
 * 另外用 setTimeout 而不是 rAF 节流：rAF 在后台标签页 / 无头环境会被降频甚至不触发。
 */
export function useScrollCollapse(threshold = 96, deadZone = 12, cooldownMs = 240): boolean {
  const [collapsed, setCollapsed] = useState(false);
  const collapsedRef = useRef(false);
  const lastY = useRef(0);
  const lastToggleAt = useRef(0);

  collapsedRef.current = collapsed;

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    lastY.current = window.scrollY;

    let timer: ReturnType<typeof setTimeout> | null = null;

    const evaluate = () => {
      timer = null;
      const y = Math.max(0, window.scrollY);
      const delta = y - lastY.current;

      // 1. 死区：噪声不参与判断，也不更新基准
      if (Math.abs(delta) < deadZone) return;
      lastY.current = y;

      // 3. 冷却：刚切换过就先不响应
      const now = Date.now();
      if (now - lastToggleAt.current < cooldownMs) return;

      // 回到顶部附近一律展开
      if (y <= 24) {
        if (collapsedRef.current) {
          setCollapsed(false);
          lastToggleAt.current = now;
        }
        return;
      }

      if (delta > 0) {
        if (!collapsedRef.current && y > threshold) {
          setCollapsed(true);
          lastToggleAt.current = now;
        }
      } else if (collapsedRef.current) {
        setCollapsed(false);
        lastToggleAt.current = now;
      }
    };

    const onScroll = () => {
      if (timer !== null) return;
      timer = setTimeout(evaluate, 60);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (timer !== null) clearTimeout(timer);
    };
  }, [threshold, deadZone, cooldownMs]);

  return collapsed;
}
