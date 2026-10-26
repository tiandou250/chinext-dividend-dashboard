/**
 * HTTP 工具：带超时、重试（指数退避 + 抖动）的 JSON 抓取。
 *
 * 实测两类失败都出现过，且都必须重试：
 *  1) 网络层被中断（Node: `fetch failed / other side closed`；curl: schannel 中断）
 *  2) 行情接口限流，返回 501 / 502 / 429 等
 * 因此这里既对异常重试，也对非 2xx 状态码重试，且限流码使用更长的等待。
 */

import { AppError } from '../../shared/errors.ts';

/** 命中这些状态码时按"限流 / 临时故障"处理，等待时间显著加长 */
const THROTTLE_STATUS = new Set([403, 429, 500, 501, 502, 503, 504]);

export interface FetchJsonOptions {
  /** 单次请求超时，默认 20s */
  timeoutMs?: number;
  /** 总尝试次数，默认 6 */
  attempts?: number;
  headers?: Record<string, string>;
  /** 日志里显示的用途标签 */
  label?: string;
  /** 每次失败后的基础等待，默认 700ms */
  baseDelayMs?: number;
  /** 单次等待上限，默认 15s */
  maxDelayMs?: number;
  /** 限流时的最小等待，默认 3.5s */
  throttleDelayMs?: number;
}

const DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'application/json,text/plain,*/*',
};

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** 指数退避 + 随机抖动，避免多个请求撞在同一时间窗 */
function backoffDelay(attempt: number, base: number, max: number): number {
  const exp = Math.min(base * 2 ** (attempt - 1), max);
  return Math.round(exp * (0.7 + Math.random() * 0.6));
}

function throttledStatus(err: unknown): number | null {
  if (!(err instanceof AppError)) return null;
  const status = err.context?.status;
  return typeof status === 'number' && THROTTLE_STATUS.has(status) ? status : null;
}

export async function fetchJson<T>(url: string, options: FetchJsonOptions = {}): Promise<T> {
  const {
    timeoutMs = 20_000,
    attempts = 6,
    headers = {},
    label = 'request',
    baseDelayMs = 700,
    maxDelayMs = 15_000,
    throttleDelayMs = 3_500,
  } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { ...DEFAULT_HEADERS, ...headers },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'follow',
      });

      if (!response.ok) {
        const retryAfter = Number(response.headers.get('retry-after') ?? Number.NaN);
        throw new AppError('E_IO', `HTTP ${response.status}`, {
          context: {
            label,
            status: response.status,
            attempt,
            ...(Number.isFinite(retryAfter) ? { retryAfter } : {}),
          },
        });
      }

      const text = await response.text();
      if (text.trim() === '') {
        throw new AppError('E_IO', '响应体为空', { context: { label, attempt } });
      }

      try {
        return JSON.parse(text) as T;
      } catch (err) {
        throw new AppError('E_IO', '响应不是合法 JSON', {
          context: { label, attempt, head: text.slice(0, 120) },
          cause: err,
        });
      }
    } catch (err) {
      lastError = err;
      if (attempt === attempts) break;

      const status = throttledStatus(err);
      const retryAfterSec = Number((err as AppError).context?.retryAfter ?? Number.NaN);
      let delay = backoffDelay(attempt, baseDelayMs, maxDelayMs);
      if (status !== null) {
        delay = Math.max(delay, backoffDelay(attempt, throttleDelayMs, maxDelayMs * 2));
      }
      if (Number.isFinite(retryAfterSec) && retryAfterSec > 0) {
        delay = Math.max(delay, retryAfterSec * 1000);
      }

      console.warn(
        `  ! ${label} 第 ${attempt}/${attempts} 次失败（${errorText(err)}${status ? '，疑似限流' : ''}），${delay}ms 后重试`,
      );
      await sleep(delay);
    }
  }

  throw new AppError('E_IO', `${label} 请求失败（已重试 ${attempts} 次）：${errorText(lastError)}`, {
    cause: lastError,
  });
}

function errorText(err: unknown): string {
  if (err instanceof AppError) return err.message;
  if (err instanceof Error) {
    const cause = (err as { cause?: unknown }).cause;
    const causeText = cause instanceof Error ? ` / ${cause.message}` : '';
    return `${err.message}${causeText}`;
  }
  return String(err);
}
