import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface Config {
  /** au1h server URL, e.g. https://auth.example.com */
  url: string;
  /** Personal access token (au1h_pat_…) */
  token: string;
  /** Admin portal URL, for hints. Optional. */
  portalUrl?: string;
}

const TRAILING_SLASHES = /\/+$/;

function dir(): string {
  // `||`, not `??`: a variable that is set but empty must not turn the path
  // into a relative one (the token would land in the current directory).
  if (process.env.AU1H_CONFIG_DIR) {
    return process.env.AU1H_CONFIG_DIR;
  }
  return join(
    process.env.XDG_CONFIG_HOME || join(homedir(), ".config"),
    "au1h"
  );
}

export function configPath(): string {
  return join(dir(), "config.json");
}

export function readConfig(): Config | null {
  // Environment wins, for CI.
  if (process.env.AU1H_URL && process.env.AU1H_TOKEN) {
    return {
      url: process.env.AU1H_URL.replace(TRAILING_SLASHES, ""),
      token: process.env.AU1H_TOKEN,
    };
  }
  const p = configPath();
  if (!existsSync(p)) {
    return null;
  }
  try {
    const parsed = JSON.parse(readFileSync(p, "utf8")) as Config;
    return parsed.url && parsed.token ? parsed : null;
  } catch {
    return null;
  }
}

export function writeConfig(config: Config): string {
  mkdirSync(dir(), { recursive: true, mode: 0o700 });
  const p = configPath();
  writeFileSync(p, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  chmodSync(p, 0o600);
  return p;
}

export function clearConfig(): boolean {
  const p = configPath();
  if (!existsSync(p)) {
    return false;
  }
  unlinkSync(p);
  return true;
}
