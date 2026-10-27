import { Api } from "../api";
import { bool, type Parsed, str } from "../args";
import { CliError, c, confirm, log, ok, table } from "../ui";

const TRAILING_STAR = /\*$/;

export async function routesList(args: Parsed): Promise<void> {
  const api = Api.fromConfig();
  const slug = args.positional[0] ?? str(args.flags, "app");
  const routes = slug
    ? await api.routes((await api.appBySlug(slug)).id)
    : await api.routes();
  if (routes.length === 0) {
    log(
      "No proxy routes. Add one with `au1h routes add <slug> <pattern> <backend-url>`."
    );
    return;
  }
  table(
    ["APP", "PATTERN", "BACKEND", "METHODS", "PREFIX", "STATUS", "ID"],
    routes.map((r) => [
      r.applicationSlug ?? slug ?? "",
      r.pathPattern,
      r.backendUrl,
      r.methods.join(","),
      r.stripPrefix ? "strip" : "keep",
      r.isActive ? "active" : "off",
      r.id,
    ])
  );
}

export async function routesAdd(args: Parsed): Promise<void> {
  const api = Api.fromConfig();
  const [slug, pattern, backendUrl] = args.positional;
  if (!(slug && pattern && backendUrl)) {
    throw new CliError(
      "Usage: au1h routes add <slug> <pattern> <backend-url> [--methods GET,POST] [--name n] [--keep-prefix]"
    );
  }
  const app = await api.appBySlug(slug);
  const methods = (str(args.flags, "methods") ?? "GET,POST,PUT,PATCH,DELETE")
    .split(",")
    .map((m) => m.trim().toUpperCase());
  const { route } = await api.createRoute({
    applicationId: app.id,
    name: str(args.flags, "name") ?? pattern,
    pathPattern: pattern,
    backendUrl,
    methods,
    stripPrefix: !bool(args.flags, "keep-prefix"),
  });
  ok(
    `Route ${c.bold(route.pathPattern)} → ${route.backendUrl} (${route.methods.join(", ")})`
  );
  log(
    `  Clients call ${c.mono(`${api.url}/proxy${route.pathPattern.replace(TRAILING_STAR, "")}…`)} with x-app-id: ${slug}`
  );
}

export async function routesRemove(args: Parsed): Promise<void> {
  const api = Api.fromConfig();
  const id = args.positional[0];
  if (!id) {
    throw new CliError("Usage: au1h routes remove <route-id>");
  }
  if (!(bool(args.flags, "yes") || (await confirm(`Remove route ${id}?`)))) {
    log("Aborted.");
    return;
  }
  await api.deleteRoute(id);
  ok("Route removed");
}

export async function routesToggle(
  args: Parsed,
  isActive: boolean
): Promise<void> {
  const api = Api.fromConfig();
  const id = args.positional[0];
  if (!id) {
    throw new CliError(
      `Usage: au1h routes ${isActive ? "enable" : "disable"} <route-id>`
    );
  }
  await api.toggleRoute(id, isActive);
  ok(`Route ${isActive ? "enabled" : "disabled"}`);
}
