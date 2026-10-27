import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";

const tty = stdout.isTTY && !process.env.NO_COLOR;
const paint = (code: string) => (s: string) =>
  tty ? `\u001b[${code}m${s}\u001b[0m` : s;

export const c = {
  bold: paint("1"),
  dim: paint("2"),
  blue: paint("38;2;47;128;255"),
  green: paint("32"),
  red: paint("31"),
  yellow: paint("33"),
  mono: paint("36"),
};

export class CliError extends Error {
  constructor(
    message: string,
    public readonly hint?: string
  ) {
    super(message);
    this.name = "CliError";
  }
}

export function log(line = ""): void {
  stdout.write(`${line}\n`);
}

export function ok(line: string): void {
  log(`${c.green("✓")} ${line}`);
}

export function warn(line: string): void {
  log(`${c.yellow("!")} ${line}`);
}

export function kv(rows: [string, string][]): void {
  const w = Math.max(...rows.map(([k]) => k.length));
  for (const [k, v] of rows) {
    log(`  ${c.dim(k.padEnd(w))}  ${v}`);
  }
}

export function table(headers: string[], rows: string[][]): void {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length))
  );
  const line = (cells: string[]) =>
    cells.map((cell, i) => cell.padEnd(widths[i])).join("  ");
  log(c.dim(line(headers)));
  for (const r of rows) {
    log(line(r));
  }
}

export async function ask(
  question: string,
  fallback?: string
): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const suffix = fallback ? ` ${c.dim(`(${fallback})`)}` : "";
    const answer = (await rl.question(`${question}${suffix}: `)).trim();
    return answer || fallback || "";
  } finally {
    rl.close();
  }
}

export async function askSecret(question: string): Promise<string> {
  // readline echoes input; mute output while the secret is typed.
  const rl = createInterface({ input: stdin, output: stdout, terminal: true });
  const anyRl = rl as unknown as { _writeToOutput: (s: string) => void };
  const original = anyRl._writeToOutput;
  stdout.write(`${question}: `);
  // Mute echo while the secret is typed.
  anyRl._writeToOutput = () => stdout.write("");
  try {
    const answer = (await rl.question("")).trim();
    stdout.write("\n");
    return answer;
  } finally {
    anyRl._writeToOutput = original;
    rl.close();
  }
}

export async function confirm(
  question: string,
  fallback = false
): Promise<boolean> {
  const a = (
    await ask(`${question} ${c.dim(fallback ? "[Y/n]" : "[y/N]")}`)
  ).toLowerCase();
  if (!a) {
    return fallback;
  }
  return a === "y" || a === "yes";
}
