/**
 * Runs against a live au1h. Skipped unless the fixture is present; start it
 * with `bun run test:sdks -- cli` in apps/server. Every command is the real
 * CLI process talking to the real admin API with a real access token.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { au1h, fileMode, type RunResult, removeTempDirs, tempDir } from "./run";

const env = (name: string) => process.env[`AU1H_TEST_${name}`] ?? "";
const LIVE = env("URL") !== "";
const live = LIVE ? describe : describe.skip;

const fx = {
  url: env("URL"),
  pat: env("PAT"),
  adminEmail: env("ADMIN_EMAIL"),
  orgId: env("ORG_ID"),
  appSlug: env("APP_SLUG"),
};

const SECRET = /au1h_sk_[A-Za-z0-9_-]+|[A-Za-z0-9_-]{32,}/;
const ROUTE_ID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;

live("au1h CLI against a live server", () => {
  const configDir = tempDir("login");
  const run = Math.random().toString(36).slice(2, 8);
  const slug = `cli-${run}`;
  /** Run as the logged-in user (the stored login from the first test). */
  const cli = (args: string[], stdin?: string): Promise<RunResult> =>
    au1h(args, { configDir, stdin });
  /** The row of a table that starts with `first`. */
  const row = (out: string, first: string) =>
    out.split("\n").find((line) => line.trimStart().startsWith(first)) ?? "";

  afterAll(async () => {
    // In case a test failed before the delete test ran.
    await cli(["apps", "delete", slug, "-y"]);
    removeTempDirs();
  });

  // ---------------------------------------------------------------- account

  test("login verifies the token with the server before storing it", async () => {
    const { code, out } = await cli([
      "login",
      "--url",
      `${fx.url}/`,
      "--token",
      fx.pat,
    ]);
    expect(code).toBe(0);
    expect(out).toContain(`Logged in to ${fx.url} as ${fx.adminEmail}`);
    expect(out).not.toContain(fx.pat);

    const file = join(configDir, "config.json");
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({
      url: fx.url,
      token: fx.pat,
    });
    expect(fileMode(file)).toBe(0o600);
  });

  test("a token the server does not know is rejected and not stored", async () => {
    const dir = tempDir("bad-login");
    const { code, out } = await au1h(
      ["login", "--url", fx.url, "--token", "au1h_pat_notarealtoken"],
      { configDir: dir }
    );
    expect(code).toBe(1);
    expect(out).toContain("The server rejected the token (401).");
    expect(out).not.toContain("au1h_pat_notarealtoken");
    expect(existsSync(join(dir, "config.json"))).toBe(false);
  });

  test("whoami shows the server, user, workspace and that a token is in use", async () => {
    const { code, out } = await cli(["whoami"]);
    expect(code).toBe(0);
    expect(row(out, "server")).toContain(fx.url);
    expect(row(out, "user")).toContain(fx.adminEmail);
    expect(row(out, "workspace")).toContain(fx.orgId);
    expect(row(out, "auth")).toContain("token");
    expect(out).not.toContain(fx.pat);
  });

  test("AU1H_URL and AU1H_TOKEN work without a stored login, trailing slash included", async () => {
    const { code, out } = await au1h(["whoami"], {
      env: { AU1H_URL: `${fx.url}/`, AU1H_TOKEN: fx.pat },
    });
    expect(code).toBe(0);
    expect(row(out, "user")).toContain(fx.adminEmail);
  });

  // ----------------------------------------------------------- applications

  test("apps list shows the workspace's applications", async () => {
    const { code, out } = await cli(["apps", "list"]);
    expect(code).toBe(0);
    expect(out).toContain("SLUG");
    expect(row(out, fx.appSlug)).toContain("active");
  });

  test("apps create prints the slug, origins and a one-time secret", async () => {
    const { code, out } = await cli([
      "apps",
      "create",
      slug,
      "--name",
      "CLI Test App",
      "--origins",
      "http://cli.test",
      "--organizations",
    ]);
    expect(code).toBe(0);
    expect(out).toContain(`Created application ${slug}`);
    expect(row(out, "x-app-id")).toContain(slug);
    expect(row(out, "origins")).toContain("http://cli.test");
    expect(row(out, "secret")).toMatch(SECRET);
    expect(out).toContain("The secret is shown once.");
    expect(out).toContain(`au1h init --app ${slug}`);
  });

  test("creating the same slug again fails with the server's reason", async () => {
    const { code, out } = await cli(["apps", "create", slug, "-y"]);
    expect(code).toBe(1);
    expect(out).toContain("error");
    expect(out).not.toContain("Created application");
  });

  test("apps show reports what was created", async () => {
    const { code, out } = await cli(["apps", "show", slug]);
    expect(code).toBe(0);
    expect(row(out, "name")).toContain("CLI Test App");
    expect(row(out, "status")).toContain("active");
    expect(row(out, "organizations")).toContain("on");
    expect(row(out, "origins")).toContain("http://cli.test");
    expect(row(out, "routes")).toContain("0");
    expect(row(out, "JWKS")).toContain(`${fx.url}/api/auth/jwks`);
  });

  test("apps show for an unknown slug says so", async () => {
    const { code, out } = await cli(["apps", "show", "no-such-app"]);
    expect(code).toBe(1);
    expect(out).toContain('No application with slug "no-such-app"');
  });

  test("apps update changes exactly the named fields", async () => {
    const update = await cli([
      "apps",
      "update",
      slug,
      "--name",
      "Renamed",
      "--origins",
      "http://cli.test,http://cli2.test",
      "--organizations",
      "false",
      "--active",
      "false",
    ]);
    expect(update.code).toBe(0);
    expect(update.out).toContain(`Updated ${slug}`);

    const { out } = await cli(["apps", "show", slug]);
    expect(row(out, "name")).toContain("Renamed");
    expect(row(out, "origins")).toContain("http://cli2.test");
    expect(row(out, "organizations")).toContain("off");
    expect(row(out, "status")).toContain("inactive");

    await cli(["apps", "update", slug, "--active", "true"]);
    const after = await cli(["apps", "show", slug]);
    expect(row(after.out, "status")).toContain("active");
    expect(row(after.out, "name")).toContain("Renamed");
  });

  test("apps update with no flags changes nothing and says how to use it", async () => {
    const { code, out } = await cli(["apps", "update", slug]);
    expect(code).toBe(1);
    expect(out).toContain("Nothing to update.");
  });

  test("apps secret rotate asks first, and only rotates on yes", async () => {
    const declined = await cli(["apps", "secret", "rotate", slug], "n\n");
    expect(declined.code).toBe(0);
    expect(declined.out).toContain("Aborted.");
    expect(declined.out).not.toContain("New secret");

    const rotated = await cli(["apps", "secret", "rotate", slug, "-y"]);
    expect(rotated.code).toBe(0);
    expect(rotated.out).toContain(`New secret for ${slug} (shown once):`);
    expect(rotated.out.split("\n").at(-2)?.trim()).toMatch(SECRET);
  });

  // ----------------------------------------------------------------- routes

  let routeId = "";

  test("routes add creates a route with the requested methods", async () => {
    const { code, out } = await cli([
      "routes",
      "add",
      slug,
      "/todos/*",
      "https://backend.example.com",
      "--methods",
      "get, post",
      "--name",
      "todos",
    ]);
    expect(code).toBe(0);
    expect(out).toContain(
      "Route /todos/* → https://backend.example.com (GET, POST)"
    );
    expect(out).toContain(`${fx.url}/proxy/todos/`);
    expect(out).toContain(`x-app-id: ${slug}`);
  });

  test("routes list shows it, for one application and for the workspace", async () => {
    for (const args of [
      ["routes", "list", slug],
      ["routes", "list"],
    ]) {
      const { code, out } = await cli(args);
      expect(code).toBe(0);
      const line = row(out, slug);
      expect(line).toContain("/todos/*");
      expect(line).toContain("https://backend.example.com");
      expect(line).toContain("GET,POST");
      expect(line).toContain("strip");
      expect(line).toContain("active");
      routeId = ROUTE_ID.exec(line)?.[0] ?? "";
    }
    expect(routeId).not.toBe("");
  });

  test("--keep-prefix is honoured", async () => {
    await cli([
      "routes",
      "add",
      slug,
      "/api/*",
      "https://backend.example.com",
      "--keep-prefix",
    ]);
    const { out } = await cli(["routes", "list", slug]);
    const line = out.split("\n").find((l) => l.includes("/api/*")) ?? "";
    expect(line).toContain("keep");
    expect(line).toContain("GET,POST,PUT,PATCH,DELETE");
  });

  test("an invalid backend URL is refused with the server's message", async () => {
    const { code, out } = await cli([
      "routes",
      "add",
      slug,
      "/bad/*",
      "ftp://backend.example.com",
    ]);
    expect(code).toBe(1);
    expect(out).toContain("400");
    const list = await cli(["routes", "list", slug]);
    expect(list.out).not.toContain("/bad/*");
  });

  test("routes disable and enable flip the status", async () => {
    const off = await cli(["routes", "disable", routeId]);
    expect(off.out).toContain("Route disabled");
    expect(
      (await cli(["routes", "list", slug])).out
        .split("\n")
        .find((l) => l.includes(routeId))
    ).toContain("off");

    const on = await cli(["routes", "enable", routeId]);
    expect(on.out).toContain("Route enabled");
    expect(
      (await cli(["routes", "list", slug])).out
        .split("\n")
        .find((l) => l.includes(routeId))
    ).toContain("active");
  });

  test("routes remove asks first, and only removes on yes", async () => {
    const declined = await cli(["routes", "remove", routeId], "n\n");
    expect(declined.out).toContain("Aborted.");
    expect((await cli(["routes", "list", slug])).out).toContain(routeId);

    const removed = await cli(["routes", "remove", routeId, "-y"]);
    expect(removed.code).toBe(0);
    expect(removed.out).toContain("Route removed");
    expect((await cli(["routes", "list", slug])).out).not.toContain(routeId);
  });

  test("removing a route that does not exist fails", async () => {
    const { code } = await cli(["routes", "remove", routeId, "-y"]);
    expect(code).toBe(1);
  });

  // ------------------------------------------------------- create with init

  test("apps create --init scaffolds the project against the logged-in server", async () => {
    const initSlug = `cli-init-${run}`;
    const res = await au1h(["apps", "create", initSlug, "-y", "--init"], {
      configDir,
    });
    expect(res.code).toBe(0);
    expect(res.out).toContain(`Created application ${initSlug}`);
    expect(res.out).toContain("wrote");
    expect(res.out).toContain(fx.url);
    await cli(["apps", "delete", initSlug, "-y"]);
  });

  // ---------------------------------------------------------------- cleanup

  test("apps delete asks first, and only deletes on yes", async () => {
    const declined = await cli(["apps", "delete", slug], "n\n");
    expect(declined.out).toContain("Aborted.");
    expect((await cli(["apps", "show", slug])).code).toBe(0);

    const deleted = await cli(["apps", "delete", slug, "-y"]);
    expect(deleted.code).toBe(0);
    expect(deleted.out).toContain(`Deleted ${slug}`);
    expect((await cli(["apps", "show", slug])).code).toBe(1);
  });

  test("logout forgets the token; commands then need a login again", async () => {
    const out = await cli(["logout"]);
    expect(out.code).toBe(0);
    expect(out.out).toContain("Logged out.");
    expect(existsSync(join(configDir, "config.json"))).toBe(false);
    const after = await cli(["whoami"]);
    expect(after.code).toBe(1);
    expect(after.out).toContain("Not logged in.");
  });
});
