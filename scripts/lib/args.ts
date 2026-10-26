/** 极简命令行参数解析：支持 --key=value / --key value / --flag 以及位置参数 */

export interface ParsedArgs {
  flags: Record<string, string | boolean>;
  positional: string[];
}

export function parseArgs(argv: readonly string[]): ParsedArgs {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i] as string;
    if (token.startsWith('--')) {
      const body = token.slice(2);
      const eq = body.indexOf('=');
      if (eq >= 0) {
        flags[body.slice(0, eq)] = body.slice(eq + 1);
      } else {
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith('-')) {
          flags[body] = next;
          i += 1;
        } else {
          flags[body] = true;
        }
      }
    } else if (token.startsWith('-') && token.length > 1) {
      const key = token.slice(1);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('-')) {
        flags[key] = next;
        i += 1;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(token);
    }
  }

  return { flags, positional };
}

export function strFlag(args: ParsedArgs, ...names: string[]): string | undefined {
  for (const name of names) {
    const value = args.flags[name];
    if (typeof value === 'string') return value;
  }
  return undefined;
}

export function boolFlag(args: ParsedArgs, ...names: string[]): boolean {
  for (const name of names) {
    if (args.flags[name] === true || args.flags[name] === 'true') return true;
  }
  return false;
}

export function intFlag(args: ParsedArgs, names: string[], fallback: number): number {
  const raw = strFlag(args, ...names);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n)) throw new Error(`参数 --${names[0]} 需要整数，收到：${raw}`);
  return n;
}
