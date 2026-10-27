import type { Context, Next } from "hono";
import { getAdminSession } from "@/lib/auth";
import { resolveToken, TOKEN_PREFIX } from "@/tokens/service";
import { logger } from "@/utils/logger";

/**
 * Hono environment for the authenticated admin API (`/api/v1/*`).
 */
export type AdminEnv = {
  Variables: {
    /** Organization the caller is acting for. */
    organizationId: string;
    adminUser: { id: string; email: string };
    /** How the caller authenticated. */
    authVia: "session" | "token";
  };
};

/**
 * Require an admin-portal identity with a workspace, either
 *
 * - `Authorization: Bearer au1h_pat_…` — a personal access token, which is
 *   bound to the workspace it was created in; or
 * - the admin-portal session cookie, using the session's active workspace.
 *
 * Every `/api/v1` router except `health` mounts this. Controllers read
 * `c.get("organizationId")` and services filter on it, so a caller can only
 * see and change applications, users, routes and tokens of that workspace.
 */
export async function requireOrgSession(c: Context<AdminEnv>, next: Next) {
  const authorization = c.req.header("authorization") ?? "";
  if (authorization.startsWith("Bearer ")) {
    const presented = authorization.slice("Bearer ".length).trim();
    if (!presented.startsWith(TOKEN_PREFIX)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const resolved = await resolveToken(presented);
    if (!resolved) {
      logger.warn("Rejected admin API token");
      return c.json({ error: "Unauthorized" }, 401);
    }
    c.set("organizationId", resolved.organizationId);
    c.set("adminUser", resolved.user);
    c.set("authVia", "token");
    await next();
    return;
  }

  let session: Awaited<ReturnType<typeof getAdminSession>>;
  try {
    session = await getAdminSession(c.req.raw.headers);
  } catch (error) {
    logger.warn({ error }, "Admin session lookup failed");
    return c.json({ error: "Unauthorized" }, 401);
  }

  if (!session?.user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // activeOrganizationId is added by the organization plugin.
  const activeOrganizationId = (
    session.session as { activeOrganizationId?: string | null }
  ).activeOrganizationId;

  if (!activeOrganizationId) {
    return c.json(
      { error: "No active organization. Please select an organization." },
      403
    );
  }

  c.set("organizationId", activeOrganizationId);
  c.set("adminUser", { id: session.user.id, email: session.user.email });
  c.set("authVia", "session");
  await next();
}
