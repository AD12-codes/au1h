import type { Context } from "hono";
import { z } from "zod";
import type { AdminEnv } from "@/middleware/require-org-session";
import { logger } from "@/utils/logger";
import { createToken, listTokens, revokeToken } from "./service";

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  /** Days until expiry; omit for a non-expiring token. */
  expiresInDays: z.number().int().min(1).max(3650).optional(),
});

export async function list(c: Context<AdminEnv>) {
  const tokens = await listTokens(
    c.get("adminUser").id,
    c.get("organizationId")
  );
  return c.json({ tokens });
}

export async function create(c: Context<AdminEnv>) {
  if (c.get("authVia") !== "session") {
    // Tokens can only mint tokens from a browser session, so a leaked token
    // cannot be used to create longer-lived replacements.
    return c.json(
      { error: "Create tokens from the admin portal, not with a token" },
      403
    );
  }
  const parsed = createSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      400
    );
  }
  const expiresAt = parsed.data.expiresInDays
    ? new Date(Date.now() + parsed.data.expiresInDays * 86_400_000)
    : null;
  const { token, secret } = await createToken({
    userId: c.get("adminUser").id,
    organizationId: c.get("organizationId"),
    name: parsed.data.name,
    expiresAt,
  });
  logger.info(
    { tokenId: token.id, organizationId: token.organizationId },
    "Admin API token created"
  );
  return c.json({ token, secret }, 201);
}

export async function revoke(c: Context<AdminEnv>) {
  const ok = await revokeToken(
    c.get("adminUser").id,
    c.get("organizationId"),
    c.req.param("id")
  );
  if (!ok) {
    return c.json({ error: "Token not found" }, 404);
  }
  return c.json({ success: true });
}
