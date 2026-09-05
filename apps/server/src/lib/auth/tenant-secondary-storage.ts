import type { BetterAuthOptions } from "better-auth";

import { logger } from "@/utils/logger";
import { requireTenantScope } from "./tenant-context";

export type SecondaryStorage = NonNullable<
  BetterAuthOptions["secondaryStorage"]
>;

/**
 * Shape Better Auth writes to secondary storage under the raw session token:
 * `JSON.stringify({ session, user })`. Everything else it stores there
 * (`active-sessions-<userId>` token lists, rate-limit counters) is left alone.
 */
interface CachedSession {
  session: { applicationId?: string | null } & Record<string, unknown>;
  user: { applicationId?: string | null } & Record<string, unknown>;
}

function parseCachedSession(raw: string): CachedSession | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      "session" in parsed &&
      "user" in parsed &&
      typeof (parsed as CachedSession).session === "object" &&
      typeof (parsed as CachedSession).user === "object"
    ) {
      return parsed as CachedSession;
    }
  } catch {
    // not JSON — some other kind of value
  }
  return null;
}

/**
 * Tenant-scope Better Auth's secondary storage.
 *
 * `findSession` reads `secondaryStorage.get(token)` *before* the database, so
 * the tenant-scoped adapter alone cannot stop a session cookie issued for app A
 * from being accepted on a request for app B. Here a cached session whose
 * `applicationId` differs from the current tenant is reported as a miss; Better
 * Auth then falls through to the (scoped) database lookup, which also misses.
 */
export function withTenantScopedSessions(
  storage: SecondaryStorage
): SecondaryStorage {
  return {
    ...storage,
    async get(key) {
      const raw = await storage.get(key);
      // Better Auth types `get` as returning `unknown`; only strings can hold a
      // serialised session.
      if (typeof raw !== "string") {
        return raw as string | null;
      }
      const cached = parseCachedSession(raw);
      if (!cached) {
        return raw;
      }
      const { applicationId } = requireTenantScope();
      const sessionApp = cached.session.applicationId ?? null;
      if (sessionApp !== applicationId) {
        logger.warn(
          {
            sessionApplicationId: sessionApp,
            requestApplicationId: applicationId,
          },
          "Rejected cached session from another application"
        );
        return null;
      }
      return raw;
    },
  };
}
