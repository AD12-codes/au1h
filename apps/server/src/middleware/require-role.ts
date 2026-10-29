import type { Context, Next } from "hono";
import type { AdminEnv, WorkspaceRole } from "./require-org-session";

/**
 * Restricts an admin-API route to callers holding one of the allowed roles
 * in the active workspace. Must be mounted after `requireOrgSession`.
 */
export function requireRole(...allowedRoles: WorkspaceRole[]) {
  const allowed = allowedRoles.length > 0 ? allowedRoles : ["owner", "admin"];
  return async function requireRoleMiddleware(
    c: Context<AdminEnv>,
    next: Next
  ) {
    const role = c.get("role");
    if (!(role && allowed.includes(role))) {
      return c.json({ error: "Requires the owner or admin role" }, 403);
    }
    await next();
  };
}
