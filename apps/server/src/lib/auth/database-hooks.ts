import { APIError } from "better-auth/api";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { members, organizations } from "@/db/schema/auth";
import { logger } from "@/utils/logger";
import { redisService } from "@/utils/redis";
import { isAdminSignupAllowed } from "./admin";
import { getTenantScope } from "./tenant-context";

/**
 * Session creation hook: pick the user's first organization as the active one.
 * (`applicationId` is stamped by the tenant-scoped adapter, not here.)
 */
export const sessionCreateBefore = async (
  session: {
    userId: string;
    expiresAt: Date;
    ipAddress?: string | null;
    userAgent?: string | null;
  },
  _ctx: unknown
) => {
  const memberRecord = await db
    .select({ organizationId: members.organizationId })
    .from(members)
    .where(eq(members.userId, session.userId))
    .limit(1);

  const activeOrganizationId = memberRecord[0]?.organizationId ?? null;

  logger.debug(
    { userId: session.userId, activeOrganizationId },
    "Creating session"
  );

  return {
    data: {
      ...session,
      activeOrganizationId,
    },
  };
};

/**
 * User creation hook (before): admin-portal sign-up is by allowlist,
 * invitation, or first-run bootstrap only. Covers email/password and OAuth
 * sign-ups alike, since both create the user through this path.
 */
export const userCreateBefore = async (
  user: { email: string } & Record<string, unknown>,
  _ctx: unknown
) => {
  if (getTenantScope()?.applicationId !== null) {
    return;
  }
  const decision = await isAdminSignupAllowed(user.email);
  if (!decision.allowed) {
    logger.warn({ email: user.email }, "Rejected admin-portal sign-up");
    throw new APIError("FORBIDDEN", {
      message:
        "Admin portal sign-up is by invitation only. Ask an existing administrator to invite you.",
    });
  }
  logger.info(
    { email: user.email, reason: decision.reason },
    "Admin-portal sign-up allowed"
  );
};

/**
 * User creation hook: admin-portal users (`application_id IS NULL`) get a
 * personal workspace organization so they can start registering applications.
 * Client-application users are not organization members.
 */
export const userCreateAfter = async (
  user: { id: string; name: string } & Record<string, unknown>,
  _ctx: unknown
) => {
  if (user.applicationId != null) {
    return;
  }
  await createOrganizationForUser(user.id, user.name);
};

async function createOrganizationForUser(userId: string, userName: string) {
  const firstName = userName.split(" ")[0] || "My";
  const orgName = `${firstName}'s Workspace`;
  const orgSlug = `${firstName.toLowerCase()}-workspace-${userId.slice(0, 8)}`;
  const now = new Date();

  try {
    const orgId = crypto.randomUUID();

    await db.insert(organizations).values({
      id: orgId,
      name: orgName,
      slug: orgSlug,
      createdAt: now,
    });

    await db.insert(members).values({
      id: crypto.randomUUID(),
      organizationId: orgId,
      userId,
      role: "owner",
      createdAt: now,
    });

    logger.info(
      { userId, organizationId: orgId, orgName },
      "Auto-created organization for admin portal user"
    );
  } catch (error) {
    logger.error({ userId, error }, "Failed to auto-create organization");
  }
}

/**
 * Session update hook (after): keep the Redis session cache in sync.
 *
 * With `secondaryStorage` configured, Better Auth serves `get-session` from the
 * cache but `updateSession` only writes the database row; the cache is
 * refreshed solely by endpoints that happen to re-set the session cookie.
 * `organization/create` (which sets the new org as active) does not, so the
 * session would report a stale `activeOrganizationId` until it expires.
 * Patch the cached copy whenever a session row changes.
 */
export const sessionUpdateAfter = async (
  session: { token?: string; expiresAt?: Date | string } & Record<
    string,
    unknown
  >,
  _ctx: unknown
) => {
  if (!(session?.token && redisService.isReady())) {
    return;
  }
  const redis = redisService.getClient();
  const raw = await redis.get(session.token);
  if (!raw) {
    return;
  }
  let cached: { session: Record<string, unknown>; user: unknown };
  try {
    cached = JSON.parse(raw);
  } catch {
    return;
  }
  const expiresAt = new Date(
    session.expiresAt ?? (cached.session.expiresAt as string)
  ).getTime();
  const ttl = Math.max(Math.floor((expiresAt - Date.now()) / 1000), 1);
  await redis.set(
    session.token,
    JSON.stringify({
      session: { ...cached.session, ...session },
      user: cached.user,
    }),
    "EX",
    ttl
  );
};
