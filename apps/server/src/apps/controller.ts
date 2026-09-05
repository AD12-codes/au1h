import { and, eq, gt } from "drizzle-orm";
import type { Context } from "hono";
import { z } from "zod";
import { db } from "@/db";
import { sessions, users } from "@/db/schema/auth";
import { verifyAu1hJwt } from "@/lib/auth/verify-jwt";
import type { AppEnv } from "@/middleware/require-app-secret";
import { logger } from "@/utils/logger";

const introspectSchema = z.object({
  token: z.string().min(1),
});

/** Looks like a compact JWS (three base64url segments)? Otherwise a session token. */
const JWT_SHAPE = /^[\w-]+\.[\w-]+\.[\w-]+$/;

async function findSessionByToken(applicationId: string, token: string) {
  const [row] = await db
    .select({
      userId: users.id,
      email: users.email,
      name: users.name,
      banned: users.banned,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(
      and(
        eq(sessions.token, token),
        eq(sessions.applicationId, applicationId),
        eq(users.applicationId, applicationId),
        gt(sessions.expiresAt, new Date())
      )
    )
    .limit(1);
  if (!row || row.banned) {
    return null;
  }
  return row;
}

/**
 * `GET /api/apps/me` — sanity check for backend credentials.
 */
export function me(c: Context<AppEnv>) {
  const app = c.get("app");
  return c.json({ application: { id: app.id, slug: app.slug } });
}

/**
 * `POST /api/apps/introspect` — server-to-server token check.
 *
 * Accepts either an au1h JWT (verified offline against our keys and bound to
 * this application) or a raw session token (looked up in this application's
 * tenant, so revocation and bans take effect immediately). Always returns
 * 200 with `active: false` for anything that does not verify, so the endpoint
 * does not leak which of the two failed.
 */
export async function introspect(c: Context<AppEnv>) {
  const app = c.get("app");
  const parsed = introspectSchema.safeParse(
    await c.req.json().catch(() => ({}))
  );
  if (!parsed.success) {
    return c.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      400
    );
  }
  const { token } = parsed.data;

  if (JWT_SHAPE.test(token)) {
    try {
      const claims = await verifyAu1hJwt(token, app.slug);
      if ((claims.applicationId ?? null) !== app.id) {
        return c.json({ active: false });
      }
      return c.json({
        active: true,
        via: "jwt",
        user: {
          id: claims.sub,
          email: claims.email,
          name: claims.name ?? null,
        },
        expiresAt: claims.exp ?? null,
      });
    } catch (error) {
      logger.debug({ error }, "Introspect: JWT rejected");
      return c.json({ active: false });
    }
  }

  // Session token: the raw token (the cookie carries `token.signature`, so it
  // cannot simply be replayed as a cookie). Look it up directly, confined to
  // this application; a revoked session has no row and a banned user is
  // reported inactive.
  const session = await findSessionByToken(app.id, token);
  if (!session) {
    return c.json({ active: false });
  }
  return c.json({
    active: true,
    via: "session",
    user: { id: session.userId, email: session.email, name: session.name },
    expiresAt: Math.floor(session.expiresAt.getTime() / 1000),
  });
}
