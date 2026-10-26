/**
 * 北京时间工具。
 * GitHub Actions 运行在 UTC，但 A 股业务日期必须按 Asia/Shanghai 判定，
 * 所以这里统一通过 Intl 时区换算，不依赖运行机器的本地时区。
 */

const DATE_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const TIME_FMT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Shanghai',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** 当前北京时间的日期，格式 YYYY-MM-DD */
export function beijingToday(now: Date = new Date()): string {
  return DATE_FMT.format(now);
}

/** 当前北京时间的 HH:mm */
export function beijingClock(now: Date = new Date()): string {
  return TIME_FMT.format(now);
}

/** 当前北京时间 ISO8601 字符串（带 +08:00 偏移） */
export function beijingISO(now: Date = new Date()): string {
  return `${beijingToday(now)}T${beijingClock(now)}:00+08:00`;
}

/**
 * A 股日线收盘数据的可用时间。
 * 15:00 收盘，行情商通常需要一段时间完成日线落库，这里保守取 16:00。
 * 在该时间点之前，当日的数据视为"未完成"，不予采纳。
 */
export const DAILY_BAR_READY_CLOCK_MINUTES = 16 * 60;

export function beijingClockMinutes(now: Date = new Date()): number {
  const [h, m] = beijingClock(now).split(':').map((v) => Number(v));
  return h * 60 + m;
}

/**
 * 判断某个交易日的日线是否已经"完成"。
 * - 晚于今天的日期一律不采纳（数据源异常）
 * - 今天的数据在 16:00 前不采纳
 */
export function isDailyBarFinal(date: string, now: Date = new Date()): boolean {
  const today = beijingToday(now);
  if (date > today) return false;
  if (date === today && beijingClockMinutes(now) < DAILY_BAR_READY_CLOCK_MINUTES) {
    return false;
  }
  return true;
}

/** 两个 YYYY-MM-DD 之间相差的自然日天数 */
export function calendarDaysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** YYYY-MM-DD 减去 n 个自然日 */
export function shiftDate(date: string, days: number): string {
  const t = Date.parse(`${date}T00:00:00Z`) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}
