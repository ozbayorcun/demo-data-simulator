export interface ParsedArgs {
  command: string;
  flags: Record<string, string | boolean | string[]>;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const [command = "help", ...rest] = argv;
  const flags: Record<string, string | boolean | string[]> = {};

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = rest[index + 1];
    const value = next && !next.startsWith("--") ? next : true;
    if (value !== true) index += 1;

    if (flags[key] !== undefined) {
      const existing = flags[key];
      flags[key] = Array.isArray(existing) ? [...existing, String(value)] : [String(existing), String(value)];
    } else {
      flags[key] = value;
    }
  }

  return { command, flags };
}

export function getString(flags: ParsedArgs["flags"], key: string, fallback?: string): string | undefined {
  const value = flags[key];
  if (Array.isArray(value)) return value[value.length - 1];
  if (typeof value === "string") return value;
  return fallback;
}

export function getNumber(flags: ParsedArgs["flags"], key: string, fallback?: number): number | undefined {
  const value = getString(flags, key);
  return value === undefined ? fallback : Number(value);
}

export function getPositiveInteger(flags: ParsedArgs["flags"], key: string): number | undefined {
  const value = getString(flags, key);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`--${key} must be a positive integer.`);
  }
  return parsed;
}

export function getStringArray(flags: ParsedArgs["flags"], key: string): string[] {
  const value = flags[key];
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") return [value];
  return [];
}

export function getBoolean(flags: ParsedArgs["flags"], key: string): boolean {
  return flags[key] === true;
}
