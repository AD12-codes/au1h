/**
 * The CLI as a user runs it: a separate process, read through its output and
 * exit code. Nothing here needs a server.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { au1h, removeTempDirs, tempDir } from "./run";

afterAll(removeTempDirs);

/** A project directory with the given files. */
function project(files: Record<string, string>): string {
  const dir = tempDir("project");
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(join(dir, name, ".."), { recursive: true });
    writeFileSync(join(dir, name), content);
  }
  return dir;
}
const pkg = (deps: Record<string, string>) =>
  JSON.stringify({ name: "demo", dependencies: deps });
const read = (dir: string, file: string) =>
  readFileSync(join(dir, file), "utf8");
const INIT = ["init", "--app", "todo", "--url", "https://auth.example.com"];

describe("help and unknown commands", () => {
  test("no arguments, help and -h all print usage and exit 0", async () => {
    for (const args of [[], ["help"], ["-h"], ["apps", "--help"]]) {
      const { code, out } = await au1h(args);
      expect(code).toBe(0);
      expect(out).toContain("Usage");
      expect(out).toContain("apps create");
      expect(out).toContain("routes add");
    }
  });

  test("an unknown command exits 1 and points at help", async () => {
    const { code, out } = await au1h(["frobnicate"]);
    expect(code).toBe(1);
    expect(out).toContain('Unknown command "frobnicate"');
    expect(out).toContain("au1h help");
  });

  test("an unknown subcommand exits 1", async () => {
    for (const args of [
      ["apps", "explode"],
      ["routes", "explode"],
    ]) {
      const { code, out } = await au1h(args);
      expect(code).toBe(1);
      expect(out).toContain('command "explode"');
    }
  });

  test("apps secret without rotate shows its usage", async () => {
    const { code, out } = await au1h(["apps", "secret", "todo"]);
    expect(code).toBe(1);
    expect(out).toContain("Usage: au1h apps secret rotate <slug>");
  });

  test("output has no colour codes when NO_COLOR is set or stdout is a pipe", async () => {
    const { out } = await au1h(["help"]);
    expect(out).not.toContain("\u001b[");
  });
});

describe("commands that need a login", () => {
  test("without one they say so and exit 1", async () => {
    for (const args of [
      ["whoami"],
      ["apps", "list"],
      ["apps", "show", "todo"],
      ["routes", "list"],
    ]) {
      const { code, out } = await au1h(args);
      expect(code).toBe(1);
      expect(out).toContain("Not logged in.");
      expect(out).toContain("au1h login");
    }
  });

  test("logout when not logged in is not an error", async () => {
    const { code, out } = await au1h(["logout"]);
    expect(code).toBe(0);
    expect(out).toContain("Not logged in.");
  });

  test("login refuses something that is not a personal access token, and stores nothing", async () => {
    const configDir = tempDir("config");
    const { code, out } = await au1h(
      ["login", "--url", "http://127.0.0.1:1", "--token", "sk_live_nope"],
      { configDir }
    );
    expect(code).toBe(1);
    expect(out).toContain("expected au1h_pat_");
    expect(out).not.toContain("sk_live_nope");
    expect(existsSync(join(configDir, "config.json"))).toBe(false);
  });

  test("an unreachable server is named, the token is not printed, nothing is stored", async () => {
    const configDir = tempDir("config");
    const { code, out } = await au1h(
      [
        "login",
        "--url",
        "http://127.0.0.1:1",
        "--token",
        "au1h_pat_secretvalue",
      ],
      { configDir }
    );
    expect(code).toBe(1);
    expect(out).toContain("Cannot reach http://127.0.0.1:1");
    expect(out).not.toContain("au1h_pat_secretvalue");
    expect(existsSync(join(configDir, "config.json"))).toBe(false);
  });

  test("argument errors are reported before any request is made", async () => {
    const env = { AU1H_URL: "http://127.0.0.1:1", AU1H_TOKEN: "au1h_pat_x" };
    const cases: [string[], string][] = [
      [["apps", "show"], "Missing application slug."],
      [["apps", "create", "Not A Slug", "-y"], 'Invalid slug "Not A Slug"'],
      [["routes", "add", "todo"], "Usage: au1h routes add"],
      [["routes", "remove"], "Usage: au1h routes remove <route-id>"],
      [["routes", "enable"], "Usage: au1h routes enable <route-id>"],
      [["routes", "disable"], "Usage: au1h routes disable <route-id>"],
    ];
    for (const [args, message] of cases) {
      const { code, out } = await au1h(args, { env });
      expect(code).toBe(1);
      expect(out).toContain(message);
      expect(out).not.toContain("Cannot reach");
    }
  });
});

describe("init", () => {
  test("Next.js: React client in lib/, public and server variables in .env.local", async () => {
    const dir = project({ "package.json": pkg({ next: "15", react: "19" }) });
    const { code, out } = await au1h(INIT, { cwd: dir });
    expect(code).toBe(0);
    expect(out).toContain("Detected next project");
    expect(read(dir, "lib/au1h.ts")).toContain('from "@au1h/client/react"');
    expect(read(dir, "lib/au1h.ts")).toContain(
      "process.env.NEXT_PUBLIC_AU1H_URL"
    );
    expect(read(dir, ".env.local").trim().split("\n")).toEqual([
      "NEXT_PUBLIC_AU1H_URL=https://auth.example.com",
      "NEXT_PUBLIC_AU1H_APP_SLUG=todo",
      "AU1H_URL=https://auth.example.com",
      "AU1H_APP_SLUG=todo",
    ]);
    expect(out).toContain("npm install @au1h/client better-auth");
  });

  test("Vite + React: client under src/ when there is one, VITE_ variables", async () => {
    const dir = project({
      "package.json": pkg({ vite: "7", react: "19" }),
      "src/main.tsx": "",
      "bun.lock": "",
    });
    const { code, out } = await au1h(INIT, { cwd: dir });
    expect(code).toBe(0);
    expect(read(dir, "src/lib/au1h.ts")).toContain('"@au1h/client/react"');
    expect(read(dir, "src/lib/au1h.ts")).toContain(
      "import.meta.env.VITE_AU1H_URL"
    );
    expect(read(dir, ".env")).toBe(
      "VITE_AU1H_URL=https://auth.example.com\nVITE_AU1H_APP_SLUG=todo\n"
    );
    expect(out).toContain("bun add @au1h/client better-auth");
  });

  test("Vite without React uses the framework-agnostic client", async () => {
    const dir = project({ "package.json": pkg({ vite: "7" }) });
    await au1h(INIT, { cwd: dir });
    expect(read(dir, "lib/au1h.ts")).toContain('from "@au1h/client"');
  });

  test("Hono and Express get the matching server middleware", async () => {
    for (const framework of ["hono", "express"]) {
      const dir = project({
        "package.json": pkg({ [framework]: "4" }),
        "pnpm-lock.yaml": "",
      });
      const { code, out } = await au1h(INIT, { cwd: dir });
      expect(code).toBe(0);
      expect(read(dir, "au1h.ts")).toContain(`"@au1h/server/${framework}"`);
      expect(read(dir, ".env")).toBe(
        "AU1H_URL=https://auth.example.com\nAU1H_APP_SLUG=todo\n"
      );
      expect(out).toContain("pnpm add @au1h/server");
    }
  });

  test("Go and Python get an example file and their own install command", async () => {
    const go = project({ "go.mod": "module demo\n" });
    const goRun = await au1h(INIT, { cwd: go });
    expect(goRun.out).toContain("Detected go project");
    expect(read(go, "au1h_example.go")).toContain("au1h.NewVerifier");
    expect(goRun.out).toContain(
      "go get github.com/AD12-codes/au1h/packages/go"
    );

    const py = project({ "pyproject.toml": "[project]\nname='demo'\n" });
    const pyRun = await au1h(INIT, { cwd: py });
    expect(pyRun.out).toContain("Detected python project");
    expect(read(py, "au1h_example.py")).toContain("require_user");
    expect(pyRun.out).toContain('pip install "au1h[fastapi]"');
  });

  test("an empty directory needs -y, and without it nothing is written", async () => {
    const dir = project({});
    const refused = await au1h(INIT, { cwd: dir, stdin: "n\n" });
    expect(refused.code).toBe(0);
    expect(refused.out).toContain("Aborted.");
    expect(existsSync(join(dir, "au1h.ts"))).toBe(false);
    expect(existsSync(join(dir, ".env"))).toBe(false);

    const accepted = await au1h([...INIT, "-y"], { cwd: dir });
    expect(accepted.code).toBe(0);
    expect(existsSync(join(dir, "au1h.ts"))).toBe(true);
  });

  test("a second run changes nothing; --force rewrites the file", async () => {
    const dir = project({ "package.json": pkg({ hono: "4" }) });
    await au1h(INIT, { cwd: dir });
    writeFileSync(join(dir, "au1h.ts"), "// mine\n");

    const again = await au1h(INIT, { cwd: dir });
    expect(again.out).toContain("au1h.ts exists, left unchanged");
    expect(read(dir, "au1h.ts")).toBe("// mine\n");
    expect(read(dir, ".env")).toBe(
      "AU1H_URL=https://auth.example.com\nAU1H_APP_SLUG=todo\n"
    );

    await au1h([...INIT, "--force"], { cwd: dir });
    expect(read(dir, "au1h.ts")).toContain("createVerifier");
  });

  test("existing .env content is kept, and existing au1h values are not overwritten", async () => {
    const dir = project({
      "package.json": pkg({ hono: "4" }),
      ".env": "DATABASE_URL=postgres://x\nAU1H_URL=https://mine.example.com",
    });
    await au1h(INIT, { cwd: dir });
    expect(read(dir, ".env")).toBe(
      "DATABASE_URL=postgres://x\nAU1H_URL=https://mine.example.com\nAU1H_APP_SLUG=todo\n"
    );
  });

  test("a variable whose name merely ends with ours does not count as present", async () => {
    const dir = project({
      "package.json": pkg({ hono: "4" }),
      ".env":
        "NEXT_PUBLIC_AU1H_URL=https://old.example.com\n# AU1H_APP_SLUG=old\n",
    });
    await au1h(INIT, { cwd: dir });
    const env = read(dir, ".env");
    expect(env).toContain("\nAU1H_URL=https://auth.example.com\n");
    expect(env).toContain("\nAU1H_APP_SLUG=todo\n");
  });

  test("a trailing slash on --url is dropped", async () => {
    const dir = project({ "package.json": pkg({ hono: "4" }) });
    await au1h(
      ["init", "--app", "todo", "--url", "https://auth.example.com/"],
      {
        cwd: dir,
      }
    );
    expect(read(dir, ".env")).toContain("AU1H_URL=https://auth.example.com\n");
  });

  test("the slug is required", async () => {
    const dir = project({ "package.json": pkg({ hono: "4" }) });
    const { code, out } = await au1h(
      ["init", "--url", "https://auth.example.com"],
      { cwd: dir, stdin: "\n" }
    );
    expect(code).toBe(1);
    expect(out).toContain("An application slug is required.");
  });
});
