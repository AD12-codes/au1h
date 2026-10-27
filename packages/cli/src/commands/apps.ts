import { Api } from "../api";
import { bool, type Parsed, str } from "../args";
import { ask, CliError, c, confirm, kv, log, ok, table, warn } from "../ui";
import { init } from "./init";

const SLUG = /^[a-z0-9-]+$/;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function appsList(): Promise<void> {
  const apps = await Api.fromConfig().apps();
  if (apps.length === 0) {
    log("No applications yet. Create one with `au1h apps create <slug>`.");
    return;
  }
  table(
    ["SLUG", "NAME", "STATUS", "USERS", "SESSIONS", "ORGS"],
    apps.map((a) => [
      a.slug,
      a.name,
      a.isActive ? "active" : "inactive",
      String(a.userCount ?? 0),
      String(a.sessionCount ?? 0),
      a.organizationsEnabled ? "on" : "off",
    ])
  );
}

export async function appsCreate(args: Parsed): Promise<void> {
  const api = Api.fromConfig();
  let slug = args.positional[0];
  const name =
    str(args.flags, "name") ??
    (slug ? undefined : await ask("Application name"));
  slug = slug ?? (await ask("Slug (lowercase, hyphens)", slugify(name ?? "")));
  if (!SLUG.test(slug)) {
    throw new CliError(
      `Invalid slug "${slug}": lowercase letters, digits and hyphens only.`
    );
  }
  const origins =
    str(args.flags, "origins") ??
    (bool(args.flags, "yes")
      ? ""
      : await ask(
          "Allowed origins (comma-separated)",
          "http://localhost:3000"
        ));
  const redirects = str(args.flags, "redirects");

  const { application, secret } = await api.createApp({
    name: name ?? slug,
    slug,
    allowedOrigins: origins || undefined,
    redirectUris: redirects || undefined,
  });

  if (bool(args.flags, "organizations")) {
    await api.updateApp(application.id, { organizationsEnabled: true });
  }

  ok(`Created application ${c.bold(application.slug)}`);
  kv([
    ["id", application.id],
    ["x-app-id", application.slug],
    ["origins", application.allowedOrigins ?? c.dim("none")],
    ["secret", c.mono(secret)],
  ]);
  warn(
    "The secret is shown once. Store it server-side; it is for the server-to-server API only."
  );

  if (bool(args.flags, "init")) {
    log();
    await init({
      positional: [],
      flags: { ...args.flags, app: application.slug, url: api.url },
    });
  } else {
    log();
    log(
      `Next: ${c.mono(`au1h init --app ${application.slug}`)} in your project to scaffold the SDK.`
    );
  }
}

export async function appsShow(args: Parsed): Promise<void> {
  const api = Api.fromConfig();
  const app = await api.appBySlug(requireSlug(args));
  const routes = await api.routes(app.id);
  kv([
    ["name", app.name],
    ["slug", app.slug],
    ["id", app.id],
    ["status", app.isActive ? "active" : "inactive"],
    ["organizations", app.organizationsEnabled ? "on" : "off"],
    ["origins", app.allowedOrigins ?? c.dim("none")],
    ["redirect URIs", app.redirectUris ?? c.dim("none")],
    ["users / sessions", `${app.userCount ?? 0} / ${app.sessionCount ?? 0}`],
    ["routes", String(routes.length)],
    ["JWKS", `${api.url}/api/auth/jwks`],
  ]);
}

export async function appsUpdate(args: Parsed): Promise<void> {
  const api = Api.fromConfig();
  const app = await api.appBySlug(requireSlug(args));
  const patch: Parameters<Api["updateApp"]>[1] = {};
  const name = str(args.flags, "name");
  const origins = str(args.flags, "origins");
  const redirects = str(args.flags, "redirects");
  if (name) {
    patch.name = name;
  }
  if (origins !== undefined) {
    patch.allowedOrigins = origins;
  }
  if (redirects !== undefined) {
    patch.redirectUris = redirects;
  }
  if (args.flags.organizations !== undefined) {
    patch.organizationsEnabled = bool(args.flags, "organizations");
  }
  if (args.flags.active !== undefined) {
    patch.isActive = bool(args.flags, "active");
  }
  if (Object.keys(patch).length === 0) {
    throw new CliError(
      "Nothing to update.",
      "Flags: --name, --origins, --redirects, --organizations true|false, --active true|false"
    );
  }
  await api.updateApp(app.id, patch);
  ok(`Updated ${app.slug}`);
}

export async function appsDelete(args: Parsed): Promise<void> {
  const api = Api.fromConfig();
  const app = await api.appBySlug(requireSlug(args));
  if (
    !(
      bool(args.flags, "yes") ||
      (await confirm(
        `Delete ${app.slug} and ALL of its users, sessions and routes?`
      ))
    )
  ) {
    log("Aborted.");
    return;
  }
  await api.deleteApp(app.id);
  ok(`Deleted ${app.slug}`);
}

export async function appsSecretRotate(args: Parsed): Promise<void> {
  const api = Api.fromConfig();
  const app = await api.appBySlug(requireSlug(args));
  if (
    !(
      bool(args.flags, "yes") ||
      (await confirm(
        `Rotate the secret for ${app.slug}? The old one stops working immediately.`
      ))
    )
  ) {
    log("Aborted.");
    return;
  }
  const { secret } = await api.rotateSecret(app.id);
  ok(`New secret for ${app.slug} (shown once):`);
  log(`  ${c.mono(secret)}`);
}

export function requireSlug(args: Parsed): string {
  const slug = args.positional[0] ?? str(args.flags, "app");
  if (!slug) {
    throw new CliError(
      "Missing application slug.",
      "Usage: au1h apps <command> <slug>"
    );
  }
  return slug;
}
