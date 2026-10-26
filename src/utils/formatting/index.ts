/**
 * 展示层格式化。
 * 原则：计算用原始值，展示才做舍入；比值展示 3 位，点位展示 2 位。
 */

const POINT_FORMATTER = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 指数点位：2,684.10 */
export function formatPoints(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return POINT_FORMATTER.format(value);
}

/** 比值：0.497（固定 3 位小数） */
export function formatRatio(value: number, digits = 3): string {
  if (!Number.isFinite(value)) return '—';
  return value.toFixed(digits);
}

/** 带符号差值：+0.332 / -0.068 */
export function formatSignedDiff(value: number, digits = 3): string {
  if (!Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '±';
  return `${sign}${Math.abs(value).toFixed(digits)}`;
}

/** 涨跌幅：+1.23% / -0.45% */
export function formatChange(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${Math.abs(value).toFixed(2)}%`;
}

/** 2026-10-23 → 2026/10/23 */
export function formatDateSlash(date: string): string {
  return date.replace(/-/g, '/');
}

/** 2026-10-23 → 10/23（图表轴用） */
export function formatMonthDay(date: string): string {
  return date.slice(5).replace('-', '/');
}

/** 长日期：2026 年 10 月 23 日 */
export function formatDateLong(date: string): string {
  const [y, m, d] = date.split('-');
  if (!y || !m || !d) return date;
  return `${y} 年 ${Number(m)} 月 ${Number(d)} 日`;
}

/** 将 ISO 时间戳转成 HH:mm（北京时间显示由数据源已带偏移保证） */
export function formatClock(iso: string): string {
  const match = /T(\d{2}:\d{2})/.exec(iso);
  return match?.[1] ?? '';
}

export function formatSignedNumber(value: number, digits = 3): string {
  if (!Number.isFinite(value)) return '—';
  return value.toFixed(digits);
}
