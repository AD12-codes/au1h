/**
 * Integration-test harness: a real Postgres + Redis, the HTTP app called
 * through `app.fetch`, and the in-memory email provider as the outbox.
 *
 * Enabled only with `AU1H_INTEGRATION_TESTS=1` (see `bun run test:integration`)
 * so the plain unit-test run never needs a database. Everything is imported
 * lazily because loading the auth module connects to Redis.
 */
import type { Hono } from "hono";
import type { EmailMessage } from "../lib/email/types";

export const INTEGRATION = process.env.AU1H_INTEGRATION_TESTS === "1";

export interface TestApp {
  id: string;
  slug: string;
  name: string;
}

export interface Harness {
  app: Hono;
  /** Two applications in one workspace; the same email is a different user in each. */
  apps: { a: TestApp; b: TestApp };
  outbox: () => EmailMessage[];
  clearOutbox: () => void;
  /** Read a user row the way the admin would, bypassing tenant scoping. */
  findUser: (
    appId: string,
    email: string
  ) => Promise<{ id: string; emailVerified: boolean } | undefined>;
  cleanup: () => Promise<void>;
}

export async function startHarness(): Promise<Harness> {
  if (process.env.AU1H_TEST_DATABASE_URL) {
    process.env.DATABASE_URL = process.env.AU1H_TEST_DATABASE_URL;
  }
  process.env.EMAIL_PROVIDER = "memory";
  process.env.NODE_ENV ??= "test";
  process.env.BETTER_AUTH_URL ??= "http://localhost:4444";
  process.env.BETTER_AUTH_SECRET ??= "integration-test-secret-not-for-prod";

  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  const { db, initializeDatabase } = await import("../db");
  await initializeDatabase();
  await migrate(db, {
    migrationsFolder: new URL("../db/migrations", import.meta.url).pathname,
  });

  const { and, eq, like, or } = await import("drizzle-orm");
  const { applications, organizations, users, verifications } = await import(
    "../db/schema/auth"
  );
  const { createApplication } = await import("../applications/service");
  const { clearOutbox, getOutbox } = await import("../lib/email/providers");
  const { app } = await import("../app");

  const run = Math.random().toString(36).slice(2, 8);
  const orgId = crypto.randomUUID();
  await db.insert(organizations).values({
    id: orgId,
    applicationId: null,
    name: `Integration ${run}`,
    slug: `integration-${run}`,
    createdAt: new Date(),
  });

  async function makeApp(letter: "a" | "b"): Promise<TestApp> {
    const slug = `it-${letter}-${run}`;
    const { application } = await createApplication({
      organizationId: orgId,
      name: `App ${letter.toUpperCase()} ${run}`,
      slug,
      allowedOrigins: `http://${letter}.test`,
    });
    return { id: application.id, slug, name: application.name };
  }
  const apps = { a: await makeApp("a"), b: await makeApp("b") };

  return {
    app,
    apps,
    outbox: getOutbox,
    clearOutbox,
    findUser: async (appId, email) => {
      const [row] = await db
        .select({ id: users.id, emailVerified: users.emailVerified })
        .from(users)
        .where(and(eq(users.applicationId, appId), eq(users.email, email)))
        .limit(1);
      return row;
    },
    cleanup: async () => {
      // Verification rows carry the tenant in the identifier, not a FK.
      await db
        .delete(verifications)
        .where(
          or(
            like(verifications.identifier, `${apps.a.id}:%`),
            like(verifications.identifier, `${apps.b.id}:%`)
          )
        );
      // Cascades to applications, users, sessions and accounts.
      await db.delete(organizations).where(eq(organizations.id, orgId));
      await db
        .delete(applications)
        .where(eq(applications.organizationId, orgId));
      // The pool and the Redis client are process-wide singletons shared by
      // every test file in this run, so they stay open; bun exits regardless.
    },
  };
}

const BASE = () => process.env.BETTER_AUTH_URL ?? "http://localhost:4444";

/** Call a Better Auth endpoint as an app's frontend would: JSON + `x-app-id`. */
export async function authPost(
  app: Hono,
  slug: string,
  path: string,
  body: unknown
): Promise<Response> {
  return await app.fetch(
    new Request(`${BASE()}/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-app-id": slug },
      body: JSON.stringify(body),
    })
  );
}

/** Open a link from an email: a fresh browser, so no headers at all. */
export async function openLink(app: Hono, url: string): Promise<Response> {
  return await app.fetch(new Request(url, { redirect: "manual" }));
}

export async function getSession(
  app: Hono,
  slug: string,
  cookie: string
): Promise<{ user: { id: string; email: string } } | null> {
  const res = await app.fetch(
    new Request(`${BASE()}/api/auth/get-session`, {
      headers: { "x-app-id": slug, cookie },
    })
  );
  return (await res.json()) as { user: { id: string; email: string } } | null;
}

/** Collapse Set-Cookie headers into a Cookie header for the next request. */
export function cookiesOf(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

const LINK = /https?:\/\/[^\s"<>]+/;
const CODE = /\b(\d{6})\b/;

/** The most recent email sent to `to`, or throw. */
export function lastEmailTo(outbox: EmailMessage[], to: string): EmailMessage {
  const email = [...outbox].reverse().find((m) => m.to === to);
  if (!email) {
    throw new Error(`no email in outbox for ${to}`);
  }
  return email;
}

export function linkIn(email: EmailMessage): string {
  const match = email.text.match(LINK);
  if (!match) {
    throw new Error(`no link in email "${email.subject}"`);
  }
  return match[0];
}

export function codeIn(email: EmailMessage): string {
  const match = email.subject.match(CODE);
  if (!match) {
    throw new Error(`no code in email "${email.subject}"`);
  }
  return match[1] as string;
}

/** Re-point an emailed link at another application (what an attacker would try). */
export function retarget(url: string, slug: string): string {
  const u = new URL(url);
  u.searchParams.set("app", slug);
  return u.toString();
}
