export interface Parsed {
  positional: string[];
  flags: Record<string, string | boolean>;
}

/** Minimal argv parser: `--key value`, `--key=value`, `--flag`, `-h`. */
export function parseArgs(argv: string[]): Parsed {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") {
      positional.push(...argv.slice(i + 1));
      break;
    }
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq > 0) {
        flags[a.slice(2, eq)] = a.slice(eq + 1);
      } else {
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith("-")) {
          flags[a.slice(2)] = next;
          i++;
        } else {
          flags[a.slice(2)] = true;
        }
      }
    } else if (a === "-h") {
      flags.help = true;
    } else if (a === "-y") {
      flags.yes = true;
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

export function str(flags: Parsed["flags"], key: string): string | undefined {
  const v = flags[key];
  return typeof v === "string" ? v : undefined;
}

export function bool(flags: Parsed["flags"], key: string): boolean {
  return flags[key] === true || flags[key] === "true";
}
