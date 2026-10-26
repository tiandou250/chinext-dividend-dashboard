/**
 * 统一错误类型与退出码。
 * CLI 通过 exitCode 让 CI 区分"用错了命令"和"输入数据有问题"。
 */

export type ErrorCode =
  | 'E_USAGE'
  | 'E_INPUT'
  | 'E_NOT_FOUND'
  | 'E_IO'
  | 'E_LOCK'
  | 'E_INTERNAL';

const EXIT_CODES: Record<ErrorCode, number> = {
  E_USAGE: 2,
  E_INPUT: 3,
  E_NOT_FOUND: 4,
  E_IO: 5,
  E_LOCK: 6,
  E_INTERNAL: 1,
};

export interface AppErrorOptions {
  /** 附加上下文，会打印在日志里，便于定位是哪一行/哪个文件 */
  context?: Record<string, unknown>;
  cause?: unknown;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly exitCode: number;
  readonly context?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.exitCode = EXIT_CODES[code];
    if (options.context !== undefined) this.context = options.context;
    if (options.cause !== undefined) this.cause = options.cause;
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      ...(this.context ? { context: this.context } : {}),
    };
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

/** 把任意 unknown 异常整形成可读信息 */
export function describeError(err: unknown): { code: ErrorCode; message: string } {
  if (isAppError(err)) return { code: err.code, message: err.message };
  if (err instanceof Error) return { code: 'E_INTERNAL', message: err.message };
  return { code: 'E_INTERNAL', message: String(err) };
}

/** Node 系统错误码 → AppError */
export function fromNodeError(err: unknown, fallbackCode: ErrorCode = 'E_IO'): AppError {
  if (isAppError(err)) return err;
  const e = err as NodeJS.ErrnoException;
  if (e?.code === 'ENOENT') {
    return new AppError('E_NOT_FOUND', `文件不存在：${e.path ?? ''}`, {
      context: { path: e.path },
      cause: err,
    });
  }
  if (e?.code === 'EACCES' || e?.code === 'EPERM') {
    return new AppError('E_IO', `没有权限访问：${e.path ?? ''}`, {
      context: { path: e.path, syscall: e.syscall },
      cause: err,
    });
  }
  return new AppError(fallbackCode, e?.message ?? String(err), {
    context: { errno: e?.code, syscall: e?.syscall, path: e?.path },
    cause: err,
  });
}
