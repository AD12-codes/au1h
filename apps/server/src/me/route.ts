import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "@/db";
import { organizations } from "@/db/schema/auth";
import {
  type AdminEnv,
  requireOrgSession,
} from "@/middleware/require-org-session";

/**
 * `GET /api/v1/me`: who is calling the admin API and for which workspace.
 * Used by the CLI's `whoami` and to verify a token after `au1h login`.
 */
export const meRoute = new Hono<AdminEnv>();

meRoute.use("*", requireOrgSession);

meRoute.get("/", async (c) => {
  const organizationId = c.get("organizationId");
  const [org] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
    })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  return c.json({
    user: c.get("adminUser"),
    organization: org ?? { id: organizationId, name: null, slug: null },
    role: c.get("role"),
    authVia: c.get("authVia"),
  });
});
