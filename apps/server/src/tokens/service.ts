import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { adminApiTokens, members, users } from "@/db/schema/auth";
import { logger } from "@/utils/logger";

export const TOKEN_PREFIX = "au1h_pat_";
const PREFIX_DISPLAY_CHARS = TOKEN_PREFIX.length + 6;

export interface AdminApiToken {
  id: string;
  name: string;
  prefix: string;
  organizationId: string;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
}

export function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return TOKEN_PREFIX + Buffer.from(bytes).toString("base64url");
}

/** Tokens are high-entropy, so a plain SHA-256 is enough and allows lookup by hash. */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token)
  );
  return Buffer.from(digest).toString("hex");
}

const columns = {
  id: adminApiTokens.id,
  name: adminApiTokens.name,
  prefix: adminApiTokens.prefix,
  organizationId: adminApiTokens.organizationId,
  expiresAt: adminApiTokens.expiresAt,
  lastUsedAt: adminApiTokens.lastUsedAt,
  createdAt: adminApiTokens.createdAt,
};

/** Active (not revoked) tokens the user holds for this workspace. */
export async function listTokens(
  userId: string,
  organizationId: string
): Promise<AdminApiToken[]> {
  return await db
    .select(columns)
    .from(adminApiTokens)
    .where(
      and(
        eq(adminApiTokens.userId, userId),
        eq(adminApiTokens.organizationId, organizationId),
        isNull(adminApiTokens.revokedAt)
      )
    )
    .orderBy(desc(adminApiTokens.createdAt));
}

export async function createToken(input: {
  userId: string;
  organizationId: string;
  name: string;
  expiresAt?: Date | null;
}): Promise<{ token: AdminApiToken; secret: string }> {
  const secret = generateToken();
  const [row] = await db
    .insert(adminApiTokens)
    .values({
      id: crypto.randomUUID(),
      userId: input.userId,
      organizationId: input.organizationId,
      name: input.name,
      tokenHash: await hashToken(secret),
      prefix: secret.slice(0, PREFIX_DISPLAY_CHARS),
      expiresAt: input.expiresAt ?? null,
    })
    .returning(columns);
  return { token: row, secret };
}

export async function revokeToken(
  userId: string,
  organizationId: string,
  id: string
): Promise<boolean> {
  const [row] = await db
    .update(adminApiTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(adminApiTokens.id, id),
        eq(adminApiTokens.userId, userId),
        eq(adminApiTokens.organizationId, organizationId),
        isNull(adminApiTokens.revokedAt)
      )
    )
    .returning({ id: adminApiTokens.id });
  return Boolean(row);
}

export interface ResolvedToken {
  organizationId: string;
  user: { id: string; email: string };
}

/**
 * Resolve a presented token to its admin user and workspace. Returns null
 * for unknown, revoked or expired tokens, and when the user is no longer a
 * member of the workspace or is not an admin-portal user.
 */
export async function resolveToken(
  presented: string
): Promise<ResolvedToken | null> {
  if (!presented.startsWith(TOKEN_PREFIX)) {
    return null;
  }
  const tokenHash = await hashToken(presented);
  const [row] = await db
    .select({
      id: adminApiTokens.id,
      organizationId: adminApiTokens.organizationId,
      expiresAt: adminApiTokens.expiresAt,
      revokedAt: adminApiTokens.revokedAt,
      userId: users.id,
      email: users.email,
      banned: users.banned,
      userApplicationId: users.applicationId,
    })
    .from(adminApiTokens)
    .innerJoin(users, eq(adminApiTokens.userId, users.id))
    .where(eq(adminApiTokens.tokenHash, tokenHash))
    .limit(1);

  if (
    !row ||
    row.revokedAt ||
    row.banned ||
    row.userApplicationId !== null ||
    (row.expiresAt && row.expiresAt < new Date())
  ) {
    return null;
  }

  const [membership] = await db
    .select({ id: members.id })
    .from(members)
    .where(
      and(
        eq(members.userId, row.userId),
        eq(members.organizationId, row.organizationId)
      )
    )
    .limit(1);
  if (!membership) {
    return null;
  }

  // Best-effort usage stamp; never block the request on it.
  db.update(adminApiTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(adminApiTokens.id, row.id))
    .catch((error) => logger.debug({ error }, "lastUsedAt update failed"));

  return {
    organizationId: row.organizationId,
    user: { id: row.userId, email: row.email },
  };
}
