/**
 * Runs the SDK and CLI test suites (TypeScript server SDK, browser client, CLI,
 * Go, Python) against a live au1h.
 *
 * The SDKs are what a stranger installs first, so they are tested against the
 * real thing rather than recorded tokens: this script boots the integration
 * harness (real Postgres + Redis, the app on a loopback port), creates two
 * applications with one user each, mints real tokens, and runs each suite
 * with the fixture in `AU1H_TEST_*` environment variables.
 *
 *   bun run test:sdks              # all suites
 *   bun run test:sdks -- go py     # a subset
 *
 * Tokens are minted right before each suite because the gateway proof token
 * lives for 60 seconds; slow one-time work (compiling, creating a virtualenv)
 * happens in a `prepare` step first.
 */
import { spawn } from "bun";
import { authPost, baseUrl, cookiesOf, startHarness } from "./harness";

interface Suite {
  cwd: string;
  prepare?: string[];
  run: string[];
}

const REPO = new URL("../../../../", import.meta.url).pathname;

const SUITES: Record<string, Suite> = {
  ts: { cwd: `${REPO}packages/server`, run: ["bun", "test"] },
  client: { cwd: `${REPO}packages/client`, run: ["bun", "test"] },
  cli: { cwd: `${REPO}packages/cli`, run: ["bun", "test"] },
  go: {
    cwd: `${REPO}packages/go`,
    // Compiles the package and its tests without running any.
    prepare: ["go", "test", "-run", "^$", "./..."],
    run: ["go", "test", "-count=1", "./..."],
  },
  py: {
    cwd: `${REPO}packages/python`,
    prepare: ["uv", "sync", "--quiet"],
    run: ["uv", "run", "--quiet", "pytest", "-q"],
  },
};

async function exec(
  cmd: string[],
  cwd: string,
  env: Record<string, string>
): Promise<number> {
  const child = spawn(cmd, {
    cwd,
    env: { ...process.env, ...env },
    stdout: "inherit",
    stderr: "inherit",
  });
  return await child.exited;
}

const requested = process.argv.slice(2).filter((a) => a !== "--");
const names = requested.length > 0 ? requested : Object.keys(SUITES);
for (const name of names) {
  if (!SUITES[name]) {
    throw new Error(
      `unknown suite "${name}" (have: ${Object.keys(SUITES).join(", ")})`
    );
  }
}

const h = await startHarness();
const { eq } = await import("drizzle-orm");
const { db } = await import("../db");
const { members, sessions, users } = await import("../db/schema/auth");
const { createToken } = await import("../tokens/service");
const { auth, mintProxyToken } = await import("../lib/auth");
const { runWithTenantStore } = await import("../lib/auth/tenant-context");

const password = "ValidPassword123!";
const email = `sdk-${h.apps.a.slug}@example.com`;

async function signUp(slug: string): Promise<string> {
  const res = await authPost(h.app, slug, "/sign-up/email", {
    email,
    password,
    name: "SDK User",
  });
  if (res.status !== 200) {
    throw new Error(`sign-up in ${slug} failed: ${res.status}`);
  }
  return cookiesOf(res);
}

async function accessToken(slug: string, cookie: string): Promise<string> {
  const res = await h.app.fetch(
    new Request(`${baseUrl()}/api/auth/token`, {
      headers: { "x-app-id": slug, cookie },
    })
  );
  if (res.status !== 200) {
    throw new Error(`token mint for ${slug} failed: ${res.status}`);
  }
  return ((await res.json()) as { token: string }).token;
}

/** A correctly signed access token for app A that expired a minute ago. */
async function expiredToken(userId: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const api = auth.api as unknown as {
    signJWT: (input: {
      headers: Headers;
      body: { payload: Record<string, unknown> };
    }) => Promise<{ token: string }>;
  };
  const { token } = await runWithTenantStore(() =>
    api.signJWT({
      headers: new Headers({ "x-app-id": h.apps.a.slug }),
      body: {
        payload: {
          sub: userId,
          email,
          applicationId: h.apps.a.id,
          aud: h.apps.a.slug,
          iat: now - 120,
          exp: now - 60,
        },
      },
    })
  );
  return token;
}

/**
 * A workspace owner with a personal access token, for the CLI. Admin users
 * live outside every application, so the harness cleanup does not reach them.
 */
const adminEmail = `sdk-admin-${h.apps.a.slug}@admin.test`;
async function adminToken(): Promise<{ userId: string; secret: string }> {
  const userId = crypto.randomUUID();
  await db.insert(users).values({
    id: userId,
    applicationId: null,
    name: "SDK Admin",
    email: adminEmail,
    emailVerified: true,
  });
  await db.insert(members).values({
    id: crypto.randomUUID(),
    organizationId: h.orgId,
    userId,
    role: "owner",
    createdAt: new Date(),
  });
  const { secret } = await createToken({
    userId,
    organizationId: h.orgId,
    name: "sdk runner",
  });
  return { userId, secret };
}

let failed = false;
let adminId: string | null = null;
try {
  const admin = await adminToken();
  adminId = admin.userId;
  const cookieA = await signUp(h.apps.a.slug);
  const cookieB = await signUp(h.apps.b.slug);
  const user = await h.findUser(h.apps.a.id, email);
  if (!user) {
    throw new Error("fixture user missing");
  }
  const [session] = await db
    .select({ token: sessions.token })
    .from(sessions)
    .where(eq(sessions.userId, user.id))
    .limit(1);
  if (!session) {
    throw new Error("fixture session missing");
  }

  for (const name of names) {
    const suite = SUITES[name] as Suite;
    console.log(`\n=== SDK suite: ${name} ===`);
    if (suite.prepare && (await exec(suite.prepare, suite.cwd, {})) !== 0) {
      console.error(`SDK suite ${name}: prepare step failed`);
      failed = true;
      continue;
    }
    const env = {
      AU1H_TEST_URL: baseUrl(),
      AU1H_TEST_APP_ID: h.apps.a.id,
      AU1H_TEST_APP_SLUG: h.apps.a.slug,
      AU1H_TEST_APP_SECRET: h.apps.a.secret,
      AU1H_TEST_OTHER_APP_SLUG: h.apps.b.slug,
      AU1H_TEST_USER_ID: user.id,
      AU1H_TEST_USER_EMAIL: email,
      AU1H_TEST_PAT: admin.secret,
      AU1H_TEST_ADMIN_EMAIL: adminEmail,
      AU1H_TEST_ORG_ID: h.orgId,
      AU1H_TEST_ACCESS_TOKEN: await accessToken(h.apps.a.slug, cookieA),
      AU1H_TEST_OTHER_APP_TOKEN: await accessToken(h.apps.b.slug, cookieB),
      AU1H_TEST_EXPIRED_TOKEN: await expiredToken(user.id),
      AU1H_TEST_SESSION_TOKEN: session.token,
      AU1H_TEST_PROXY_TOKEN: await mintProxyToken({
        applicationId: h.apps.a.id,
        applicationSlug: h.apps.a.slug,
        user: { id: user.id, email },
        method: "GET",
        path: "/todos/1",
      }),
    };
    const code = await exec(suite.run, suite.cwd, env);
    if (code !== 0) {
      console.error(`SDK suite ${name}: exited with ${code}`);
      failed = true;
    }
  }
} finally {
  if (adminId) {
    await db.delete(users).where(eq(users.id, adminId));
  }
  await h.cleanup();
}

process.exit(failed ? 1 : 0);
