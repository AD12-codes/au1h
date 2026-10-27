import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { bool, type Parsed, str } from "../args";
import { readConfig } from "../config";
import { ask, CliError, c, confirm, kv, log, ok, warn } from "../ui";

const TRAILING_SLASHES = /\/+$/;

type Kind =
  | "next"
  | "vite"
  | "react"
  | "hono"
  | "express"
  | "node"
  | "go"
  | "python"
  | "unknown";

interface Project {
  kind: Kind;
  hasSrc: boolean;
  pm: "bun" | "pnpm" | "yarn" | "npm";
  deps: Record<string, string>;
}

function detect(cwd: string): Project {
  const pkgPath = join(cwd, "package.json");
  const hasSrc = existsSync(join(cwd, "src"));
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const pm =
      existsSync(join(cwd, "bun.lock")) || existsSync(join(cwd, "bun.lockb"))
        ? "bun"
        : existsSync(join(cwd, "pnpm-lock.yaml"))
          ? "pnpm"
          : existsSync(join(cwd, "yarn.lock"))
            ? "yarn"
            : "npm";
    const kind: Kind = deps.next
      ? "next"
      : deps.hono
        ? "hono"
        : deps.express
          ? "express"
          : deps.vite
            ? "vite"
            : deps.react
              ? "react"
              : "node";
    return { kind, hasSrc, pm, deps };
  }
  if (existsSync(join(cwd, "go.mod"))) {
    return { kind: "go", hasSrc, pm: "npm", deps: {} };
  }
  if (
    existsSync(join(cwd, "pyproject.toml")) ||
    existsSync(join(cwd, "requirements.txt"))
  ) {
    return { kind: "python", hasSrc, pm: "npm", deps: {} };
  }
  return { kind: "unknown", hasSrc, pm: "npm", deps: {} };
}

function writeIfAbsent(
  path: string,
  content: string,
  force: boolean
): "written" | "exists" {
  if (existsSync(path) && !force) {
    return "exists";
  }
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content);
  return "written";
}

function appendEnv(path: string, lines: string[]): string[] {
  const current = existsSync(path) ? readFileSync(path, "utf8") : "";
  const added = lines.filter((l) => !current.includes(`${l.split("=")[0]}=`));
  if (added.length > 0) {
    writeFileSync(
      path,
      `${current}${current && !current.endsWith("\n") ? "\n" : ""}${added.join("\n")}\n`
    );
  }
  return added;
}

const clientFile = (
  react: boolean,
  urlVar: string,
  slugVar: string
) => `import { createAu1hClient } from "@au1h/client${react ? "/react" : ""}";

// Browser-side au1h client for this application. Every call carries x-app-id.
export const auth = createAu1hClient({
  baseURL: ${urlVar},
  appSlug: ${slugVar},
});

// await auth.signIn.email({ email, password });
// const token = await auth.getToken();              // JWT for your backend
// const res = await auth.authFetch("/api/me");       // adds Authorization: Bearer
`;

const serverFile = (
  framework: "hono" | "express"
) => `import { createVerifier } from "@au1h/server";
import { requireAu1hUser } from "@au1h/server/${framework}";

// Verifies au1h JWTs for this application: EdDSA signature via the JWKS,
// expiry, iss = au1h, aud = AU1H_APP_SLUG.
export const au1h = createVerifier({
  au1hUrl: process.env.AU1H_URL ?? "http://localhost:4444",
  appSlug: process.env.AU1H_APP_SLUG ?? "",
});

// Mount on the routes that need a signed-in user:
//   ${framework === "hono" ? 'app.use("/api/*", requireAu1h(au1h));\n//   app.get("/api/me", (c) => c.json(c.get("au1hUser")));' : 'app.use("/api", requireAu1h(au1h));\n//   app.get("/api/me", (req, res) => res.json(req.au1hUser));'}
export const requireAu1h = requireAu1hUser;
`;

const goFile = `package main

// au1h verification for this service. go get github.com/AD12-codes/au1h/packages/go
//
//	v, err := au1h.NewVerifier(ctx, au1h.Options{URL: os.Getenv("AU1H_URL"), AppSlug: os.Getenv("AU1H_APP_SLUG")})
//	mux.Handle("GET /api/me", v.RequireUser(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
//		user, _ := au1h.UserFromContext(r.Context())
//		json.NewEncoder(w).Encode(user)
//	})))
`;

const pyFile = `"""au1h verification for this service.  pip install "au1h[fastapi]"

from fastapi import Depends
from au1h import User, Verifier
from au1h.fastapi import require_user

au1h = Verifier(os.environ["AU1H_URL"], os.environ["AU1H_APP_SLUG"])
current_user = require_user(au1h)

@app.get("/api/me")
def me(user: User = Depends(current_user)):
    return user
"""
`;

export async function init(args: Parsed): Promise<void> {
  const cwd = process.cwd();
  const project = detect(cwd);
  const config = readConfig();
  const url = (
    str(args.flags, "url") ??
    config?.url ??
    (await ask("au1h server URL", "http://localhost:4444"))
  ).replace(TRAILING_SLASHES, "");
  const slug =
    str(args.flags, "app") ?? (await ask("Application slug (x-app-id)"));
  if (!slug) {
    throw new CliError(
      "An application slug is required.",
      "Pass --app <slug> or create one with `au1h apps create`."
    );
  }
  const force = bool(args.flags, "force");
  const yes = bool(args.flags, "yes");

  log(`Detected ${c.bold(project.kind)} project in ${c.dim(cwd)}`);
  if (
    project.kind === "unknown" &&
    !yes &&
    !(await confirm(
      "No package.json, go.mod or pyproject found. Write TypeScript files anyway?"
    ))
  ) {
    log("Aborted.");
    return;
  }

  const written: string[] = [];
  const skipped: string[] = [];
  const place = (rel: string, content: string) => {
    const p = join(cwd, rel);
    (writeIfAbsent(p, content, force) === "written" ? written : skipped).push(
      rel
    );
  };
  const base = project.hasSrc ? "src" : ".";
  let install = "";
  let envFile = ".env";
  let envLines: string[] = [];

  switch (project.kind) {
    case "next": {
      envFile = ".env.local";
      envLines = [
        `NEXT_PUBLIC_AU1H_URL=${url}`,
        `NEXT_PUBLIC_AU1H_APP_SLUG=${slug}`,
        `AU1H_URL=${url}`,
        `AU1H_APP_SLUG=${slug}`,
      ];
      place(
        join(base, "lib", "au1h.ts"),
        clientFile(
          true,
          "process.env.NEXT_PUBLIC_AU1H_URL!",
          "process.env.NEXT_PUBLIC_AU1H_APP_SLUG!"
        )
      );
      install = "@au1h/client better-auth";
      break;
    }
    case "vite":
    case "react": {
      envLines = [`VITE_AU1H_URL=${url}`, `VITE_AU1H_APP_SLUG=${slug}`];
      place(
        join(base, "lib", "au1h.ts"),
        clientFile(
          Boolean(project.deps.react),
          "import.meta.env.VITE_AU1H_URL",
          "import.meta.env.VITE_AU1H_APP_SLUG"
        )
      );
      install = "@au1h/client better-auth";
      break;
    }
    case "hono":
    case "express": {
      envLines = [`AU1H_URL=${url}`, `AU1H_APP_SLUG=${slug}`];
      place(join(base, "au1h.ts"), serverFile(project.kind));
      install = "@au1h/server";
      break;
    }
    case "go": {
      envLines = [`AU1H_URL=${url}`, `AU1H_APP_SLUG=${slug}`];
      place("au1h_example.go", goFile);
      install = "go get github.com/AD12-codes/au1h/packages/go";
      break;
    }
    case "python": {
      envLines = [`AU1H_URL=${url}`, `AU1H_APP_SLUG=${slug}`];
      place("au1h_example.py", pyFile);
      install = 'pip install "au1h[fastapi]"';
      break;
    }
    default: {
      envLines = [`AU1H_URL=${url}`, `AU1H_APP_SLUG=${slug}`];
      place(join(base, "au1h.ts"), serverFile("hono"));
      install = "@au1h/server";
      break;
    }
  }

  const added = appendEnv(join(cwd, envFile), envLines);
  for (const f of written) {
    ok(`wrote ${f}`);
  }
  for (const f of skipped) {
    warn(`${f} exists, left unchanged (use --force to overwrite)`);
  }
  if (added.length) {
    ok(`added ${added.map((l) => l.split("=")[0]).join(", ")} to ${envFile}`);
  }

  log();
  const installCmd = install.startsWith("@")
    ? `${project.pm} ${project.pm === "npm" ? "install" : "add"} ${install}`
    : install;
  kv([
    ["install", c.mono(installCmd)],
    ["app", slug],
    ["server", url],
    ["docs", "https://au1h.dev/docs/getting-started/quickstart"],
  ]);
}
