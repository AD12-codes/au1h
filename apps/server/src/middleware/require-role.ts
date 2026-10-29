import type { Context, Next } from "hono";
import type { AdminEnv, WorkspaceRole } from "./require-org-session";

function formatRoles(roles: WorkspaceRole[]): string {
  if (roles.length === 1) {
    return roles[0];
  }
  if (roles.length === 2) {
    return `${roles[0]} or ${roles[1]}`;
  }
  return `${roles.slice(0, -1).join(", ")}, or ${roles.at(-1)}`;
}

/**
 * Restricts an admin-API route to callers holding one of the allowed roles
 * in the active workspace. Must be mounted after `requireOrgSession`.
 */
export function requireRole(...allowedRoles: WorkspaceRole[]) {
  const errorMessage = `Requires the ${formatRoles(allowedRoles)} role`;
  return async function requireRoleMiddleware(
    c: Context<AdminEnv>,
    next: Next
  ) {
    const role = c.get("role");
    if (!(role && allowedRoles.includes(role))) {
      return c.json({ error: errorMessage }, 403);
    }
    await next();
  };
}
