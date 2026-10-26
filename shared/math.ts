/**
 * 数值工具。
 *
 * 这里刻意不用 `toFixed`：它在半值处按二进制实际值决定进位，
 * 会出现 `(1.005).toFixed(2) === '1.00'` 这种反直觉结果。
 * 本模块的 `round` 以数字的**最短十进制表示**为输入做四舍五入（远离零），
 * 与人类阅读该数字时的预期一致。
 */

import { AppError } from './errors.js';

const NON_FINITE_MSG = '数值必须是有限数';

/** 把值限制在 [min, max] 区间内 */
export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) throw new AppError('E_INPUT', NON_FINITE_MSG, { context: { value } });
  if (min > max) throw new AppError('E_USAGE', 'min 不能大于 max', { context: { min, max } });
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function incrementDigits(digits: string): string {
  const chars = digits.split('');
  let i = chars.length - 1;
  while (i >= 0) {
    const ch = chars[i] as string;
    if (ch === '9') {
      chars[i] = '0';
      i -= 1;
    } else {
      chars[i] = String(Number(ch) + 1);
      return chars.join('');
    }
  }
  return `1${chars.join('')}`;
}

/**
 * 四舍五入到指定小数位（半值远离零）。
 * @param value 数�
 * @param digits 小数位，0 ~ 15
 */
export function round(value: number, digits = 0): number {
  if (!Number.isInteger(digits) || digits < 0 || digits > 15) {
    throw new AppError('E_USAGE', 'digits 必须是 0~15 的整数', { context: { digits } });
  }
  if (!Number.isFinite(value)) return value;

  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  const raw = abs.toString();

  // 指数形式（极大或极小值）退回乘法路径，精度足够
  if (raw.includes('e') || raw.includes('E')) {
    const factor = 10 ** digits;
    return (sign * Math.round(abs * factor)) / factor;
  }

  const [intPart = '0', fracRaw = ''] = raw.split('.');
  const nextDigit = fracRaw.charAt(digits);
  const frac = fracRaw.padEnd(digits, '0');
  const keptFrac = digits === 0 ? '' : frac.slice(0, digits);

  let body = intPart + keptFrac;
  if (nextDigit !== '' && nextDigit >= '5') {
    body = incrementDigits(body);
  }

  const padded = digits === 0 ? body : body.padStart(digits + 1, '0');
  const text = digits === 0 ? padded : `${padded.slice(0, -digits)}.${padded.slice(-digits)}`;
  return sign * Number(text);
}

/** 求和。忽略 NaN / Infinity，便于对"已过滤过无效值"的数组做聚合 */
export function sum(values: readonly number[]): number {
  let total = 0;
  for (const v of values) {
    if (Number.isFinite(v)) total += v;
  }
  return total;
}

function finite(values: readonly number[]): number[] {
  return values.filter((v) => Number.isFinite(v));
}

/** 算术平均。空数组返回 null（没有"平均值"这回事） */
export function mean(values: readonly number[]): number | null {
  const items = finite(values);
  if (items.length === 0) return null;
  return sum(items) / items.length;
}

/** 线性插值分位数，p ∈ [0, 100]。空数组返回 null */
export function percentile(values: readonly number[], p: number): number | null {
  if (!Number.isFinite(p) || p < 0 || p > 100) {
    throw new AppError('E_USAGE', 'p 必须在 0~100 之间', { context: { p } });
  }
  const items = finite(values).sort((a, b) => a - b);
  if (items.length === 0) return null;
  if (items.length === 1) return items[0] as number;

  const pos = ((items.length - 1) * p) / 100;
  const lower = Math.floor(pos);
  const upper = Math.ceil(pos);
  const lo = items[lower] as number;
  const hi = items[upper] as number;
  if (lower === upper) return lo;
  return lo + (hi - lo) * (pos - lower);
}

/** 中位数 */
export function median(values: readonly number[]): number | null {
  return percentile(values, 50);
}

export function min(values: readonly number[]): number | null {
  const items = finite(values);
  return items.length === 0 ? null : Math.min(...items);
}

export function max(values: readonly number[]): number | null {
  const items = finite(values);
  return items.length === 0 ? null : Math.max(...items);
}

/** 总体标准差 */
export function stdDev(values: readonly number[]): number | null {
  const items = finite(values);
  if (items.length === 0) return null;
  const avg = sum(items) / items.length;
  const variance = sum(items.map((v) => (v - avg) ** 2)) / items.length;
  return Math.sqrt(variance);
}

/** 浮点近似相等，默认相对误差 1e-9 */
export function nearlyEqual(a: number, b: number, relTol = 1e-9): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  if (a === b) return true;
  const scale = Math.max(Math.abs(a), Math.abs(b), 1);
  return Math.abs(a - b) <= relTol * scale;
}
