import { Api } from "../api";
import { type Parsed, str } from "../args";
import {
  type Config,
  clearConfig,
  configPath,
  readConfig,
  writeConfig,
} from "../config";
import { ask, askSecret, CliError, c, kv, log, ok } from "../ui";

const TRAILING = /\/+$/;

export async function login(args: Parsed): Promise<void> {
  const existing = readConfig();
  const url = (
    str(args.flags, "url") ??
    (await ask("au1h server URL", existing?.url ?? "http://localhost:4444"))
  ).replace(TRAILING, "");
  let token = str(args.flags, "token");
  if (!token) {
    log();
    log(
      `Create a personal access token in the admin portal (${c.bold("API tokens → New token")}),`
    );
    log(`then paste it below. It is stored in ${c.dim(configPath())}.`);
    log();
    token = await askSecret("Token (au1h_pat_…)");
  }
  if (!token.startsWith("au1h_pat_")) {
    throw new CliError(
      "That does not look like an au1h personal access token (expected au1h_pat_…)."
    );
  }
  const config: Config = { url, token };
  const me = await new Api(config).me();
  writeConfig(config);
  ok(`Logged in to ${c.bold(url)} as ${me.user.email}`);
  kv([["workspace", me.organization.name ?? me.organization.id]]);
}

export function logout(): void {
  if (clearConfig()) {
    ok(
      "Logged out. The token on the server is still valid; revoke it in the portal if it leaked."
    );
  } else {
    log("Not logged in.");
  }
}

export async function whoami(): Promise<void> {
  const api = Api.fromConfig();
  const me = await api.me();
  kv([
    ["server", api.url],
    ["user", me.user.email],
    [
      "workspace",
      `${me.organization.name ?? "?"} ${c.dim(`(${me.organization.id})`)}`,
    ],
    ["auth", me.authVia],
  ]);
}
