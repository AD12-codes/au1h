import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "bun";

const ENTRY = new URL("../src/index.ts", import.meta.url).pathname;
const created: string[] = [];

/** A fresh scratch directory, removed by `removeTempDirs`. */
export function tempDir(label: string): string {
  const dir = mkdtempSync(join(tmpdir(), `au1h-cli-${label}-`));
  created.push(dir);
  return dir;
}

export function removeTempDirs(): void {
  for (const dir of created.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

export interface RunOptions {
  /** Working directory; defaults to an empty scratch directory. */
  cwd?: string;
  /** Where the CLI keeps its login. Defaults to an empty scratch directory. */
  configDir?: string;
  env?: Record<string, string>;
  /** Typed answers for prompts. Without it stdin is closed. */
  stdin?: string;
}

export interface RunResult {
  code: number;
  out: string;
}

/**
 * Run the CLI the way a user does: as a separate process, with its own config
 * directory and none of the developer's `AU1H_*` environment.
 */
export async function au1h(
  args: string[],
  options: RunOptions = {}
): Promise<RunResult> {
  const child = spawn(["bun", ENTRY, ...args], {
    cwd: options.cwd ?? tempDir("cwd"),
    env: {
      PATH: process.env.PATH ?? "",
      HOME: tempDir("home"),
      NO_COLOR: "1",
      AU1H_CONFIG_DIR: options.configDir ?? tempDir("config"),
      ...options.env,
    },
    stdin: options.stdin === undefined ? "ignore" : new Blob([options.stdin]),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { code, out: stdout + stderr };
}

/** Permission bits of a file, e.g. `0o600`. */
export function fileMode(path: string): number {
  return statSync(path).mode % 0o1000;
}
