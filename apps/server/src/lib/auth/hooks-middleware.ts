import { APIError, createAuthMiddleware } from "better-auth/api";
import { logger } from "@/utils/logger";
import { AU1H_ADMIN_APP_SLUG } from "./admin";
import {
  fetchAppOrigins,
  parseCookies,
  resolveApplicationFromSlug,
} from "./app-context";
import { setTenantScope } from "./tenant-context";

/** Endpoints that are tenant-independent and public (backends fetch the JWKS). */
const PUBLIC_PATHS = new Set(["/jwks", "/ok"]);

/**
 * Resolve the application slug a request is acting for.
 *
 * Order: `x-app-id` header → `au1h-app-id` cookie (set from the header by the
 * Hono layer so OAuth callbacks, which arrive without our headers, keep their
 * context) → the request `Origin` mapped through registered allowed origins.
 *
 * The admin portal is not special here: it sends `x-app-id: au1h-admin` like
 * any other client. Origin/Referer are never used to grant the admin scope.
 */
async function getAppSlugFromRequest(
  headers: Headers | undefined
): Promise<string | null> {
  if (!headers) {
    return null;
  }

  const headerSlug = headers.get("x-app-id");
  if (headerSlug) {
    return headerSlug;
  }

  const cookies = parseCookies(headers.get("cookie") ?? "");
  const cookieSlug = cookies["au1h-app-id"];
  if (cookieSlug) {
    return cookieSlug;
  }

  const origin = headers.get("origin");
  if (origin) {
    const cache = await fetchAppOrigins();
    const slug = cache.originToSlug.get(origin);
    if (slug) {
      logger.debug({ origin, slug }, "Resolved app slug from origin header");
      return slug;
    }
  }

  return null;
}

/**
 * Slug → tenant. `null` is the admin-portal scope.
 */
async function resolveApplicationId(
  slug: string | null,
  path: string | undefined
): Promise<string | null> {
  if (slug === AU1H_ADMIN_APP_SLUG) {
    return null;
  }

  if (slug) {
    const app = await resolveApplicationFromSlug(slug);
    if (!app) {
      throw new APIError("UNAUTHORIZED", {
        message: "App not registered. Please contact your organization owner.",
      });
    }
    if (!app.isActive) {
      throw new APIError("UNAUTHORIZED", {
        message: "App is inactive. Please contact your organization owner.",
      });
    }
    return app.id;
  }

  if (path && PUBLIC_PATHS.has(path)) {
    // No tenant needed; run in the admin scope so any incidental
    // tenant-scoped access still has a defined tenant.
    return null;
  }

  throw new APIError("UNAUTHORIZED", {
    message:
      "Unauthorized: Missing application context. Ensure x-app-id header is set.",
  });
}

/**
 * Better Auth `hooks.before`:
 * 1. resolve which application (or the admin portal) the request is for,
 * 2. record it in the request-scoped tenant store, where the tenant-scoped
 *    adapter and session cache read it.
 */
export const authBeforeHook = createAuthMiddleware(async (ctx) => {
  const slug = await getAppSlugFromRequest(ctx.headers);
  const applicationId = await resolveApplicationId(slug, ctx.path);

  logger.debug(
    { path: ctx.path, method: ctx.method, slug, applicationId },
    "Resolved tenant for auth request"
  );

  setTenantScope({ applicationId });
});
