import { and, count, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { invitations, users } from "@/db/schema/auth";
import { logger } from "@/utils/logger";

/**
 * The au1h admin portal is a first-class, explicitly named tenant. Requests
 * that carry this value in `x-app-id` (or in the `au1h-app-id` cookie during
 * OAuth callbacks) run in the admin scope (`application_id IS NULL`).
 *
 * The slug is reserved: no client application may register it.
 *
 * Selecting the admin scope grants nothing by itself. Admin *sign-in* is open
 * like any login form; admin *sign-up* is gated by `isAdminSignupAllowed`.
 */
export const AU1H_ADMIN_APP_SLUG =
  process.env.AU1H_ADMIN_APP_SLUG || "au1h-admin";

/**
 * Parse `AU1H_ADMIN_EMAILS`: a comma-separated list of exact addresses
 * (`alice@example.com`) and/or domains (`@example.com`).
 */
export function parseAdminAllowlist(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function emailMatchesAllowlist(
  email: string,
  allowlist: readonly string[]
): boolean {
  const normalised = email.trim().toLowerCase();
  const at = normalised.lastIndexOf("@");
  const domain = at >= 0 ? normalised.slice(at) : "";
  return allowlist.some((entry) =>
    entry.startsWith("@") ? entry === domain : entry === normalised
  );
}

async function hasPendingInvitation(email: string): Promise<boolean> {
  const [row] = await db
    .select({ n: count() })
    .from(invitations)
    .where(
      and(
        sql`lower(${invitations.email}) = ${email.toLowerCase()}`,
        eq(invitations.status, "pending"),
        gt(invitations.expiresAt, new Date())
      )
    );
  return (row?.n ?? 0) > 0;
}

async function noAdminExistsYet(): Promise<boolean> {
  const [row] = await db
    .select({ n: count() })
    .from(users)
    .where(isNull(users.applicationId));
  return (row?.n ?? 0) === 0;
}

export type AdminSignupDecision =
  | { allowed: true; reason: "allowlist" | "invitation" | "bootstrap" }
  | { allowed: false };

/**
 * May `email` create an au1h admin-portal account?
 *
 * 1. It matches `AU1H_ADMIN_EMAILS`, or
 * 2. it has a pending, unexpired organization invitation, or
 * 3. there is no admin user yet (first-run bootstrap).
 */
export async function isAdminSignupAllowed(
  email: string
): Promise<AdminSignupDecision> {
  if (
    emailMatchesAllowlist(
      email,
      parseAdminAllowlist(process.env.AU1H_ADMIN_EMAILS)
    )
  ) {
    return { allowed: true, reason: "allowlist" };
  }
  if (await hasPendingInvitation(email)) {
    return { allowed: true, reason: "invitation" };
  }
  if (await noAdminExistsYet()) {
    logger.warn({ email }, "Bootstrapping the first au1h admin user");
    return { allowed: true, reason: "bootstrap" };
  }
  return { allowed: false };
}
