import { parseArgs } from "./args";
import {
  appsCreate,
  appsDelete,
  appsList,
  appsSecretRotate,
  appsShow,
  appsUpdate,
} from "./commands/apps";
import { login, logout, whoami } from "./commands/auth";
import { init } from "./commands/init";
import {
  routesAdd,
  routesList,
  routesRemove,
  routesToggle,
} from "./commands/routes";
import { CliError, c, log } from "./ui";

const HELP = `${c.bold("au1h")} — one auth server for all of your apps

${c.dim("Usage")}
  au1h <command> [options]

${c.dim("Account")}
  login [--url <server>] [--token <pat>]   Store a personal access token
  logout                                   Forget the stored token
  whoami                                   Show server, user and workspace

${c.dim("Applications")}
  apps list
  apps create [slug] [--name n] [--origins a,b] [--redirects a,b] [--organizations] [--init] [-y]
  apps show <slug>
  apps update <slug> [--name n] [--origins a,b] [--redirects a,b] [--organizations true|false] [--active true|false]
  apps delete <slug> [-y]
  apps secret rotate <slug> [-y]

${c.dim("Proxy routes")}
  routes list [slug]
  routes add <slug> <pattern> <backend-url> [--methods GET,POST] [--name n] [--keep-prefix]
  routes remove <route-id> [-y]
  routes enable|disable <route-id>

${c.dim("Project")}
  init [--app <slug>] [--url <server>] [--force] [-y]   Scaffold the SDK into the current project

${c.dim("Environment")}
  AU1H_URL + AU1H_TOKEN override the stored login (for CI). AU1H_CONFIG_DIR moves the config file.
`;

async function main(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv);
  const [cmd, sub, ...rest] = parsed.positional;
  const tail = { ...parsed, positional: rest };

  if (!cmd || parsed.flags.help || cmd === "help") {
    log(HELP);
    return;
  }

  switch (cmd) {
    case "login":
      return await login(parsed);
    case "logout":
      return await logout();
    case "whoami":
      return await whoami();
    case "init":
      return await init({ ...parsed, positional: parsed.positional.slice(1) });
    case "apps":
      switch (sub) {
        case "list":
        case undefined:
          return await appsList();
        case "create":
          return await appsCreate(tail);
        case "show":
          return await appsShow(tail);
        case "update":
          return await appsUpdate(tail);
        case "delete":
          return await appsDelete(tail);
        case "secret":
          if (rest[0] === "rotate") {
            return await appsSecretRotate({
              ...parsed,
              positional: rest.slice(1),
            });
          }
          throw new CliError("Usage: au1h apps secret rotate <slug>");
        default:
          throw new CliError(
            `Unknown apps command "${sub}".`,
            "Run `au1h help`."
          );
      }
    case "routes":
      switch (sub) {
        case "list":
        case undefined:
          return await routesList(tail);
        case "add":
          return await routesAdd(tail);
        case "remove":
          return await routesRemove(tail);
        case "enable":
          return await routesToggle(tail, true);
        case "disable":
          return await routesToggle(tail, false);
        default:
          throw new CliError(
            `Unknown routes command "${sub}".`,
            "Run `au1h help`."
          );
      }
    default:
      throw new CliError(`Unknown command "${cmd}".`, "Run `au1h help`.");
  }
}

main(process.argv.slice(2)).catch((err: unknown) => {
  if (err instanceof CliError) {
    log(`${c.red("error")} ${err.message}`);
    if (err.hint) {
      log(`  ${c.dim(err.hint)}`);
    }
  } else {
    log(`${c.red("error")} ${(err as Error).message ?? String(err)}`);
  }
  process.exit(1);
});
