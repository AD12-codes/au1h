import type { Context, Next } from "hono";
import { getAdminSession } from "@/lib/auth";
import { logger } from "@/utils/logger";

/**
 * Hono environment for the authenticated admin API (`/api/v1/*`).
 */
export type AdminEnv = {
  Variables: {
    /** Organization the caller is acting for (their active organization). */
    organizationId: string;
    adminUser: { id: string; email: string };
  };
};

/**
 * Require an au1h admin-portal session with an active organization.
 *
 * Every `/api/v1` router except `health` mounts this. Controllers read
 * `c.get("organizationId")` and services filter on it, so a caller can only
 * see and change applications, users, and proxy routes of their own
 * organization.
 */
export async function requireOrgSession(c: Context<AdminEnv>, next: Next) {
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
  await next();
}
