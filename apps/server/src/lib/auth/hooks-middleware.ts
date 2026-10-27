import { APIError, createAuthMiddleware } from "better-auth/api";
import { logger } from "@/utils/logger";
import { isTokenBoundToApp } from "../email/token-binding";
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
 * Order: `x-app-id` header → `?app=` query (links sent by email) →
 * `au1h-app-id` cookie (set from the header by the Hono layer so OAuth
 * callbacks, which arrive without our headers, keep their context) → the
 * request `Origin` mapped through registered allowed origins.
 *
 * The admin portal is not special here: it sends `x-app-id: au1h-admin` like
 * any other client. Origin/Referer are never used to grant the admin scope.
 */
export async function getAppSlugFromRequest(
  headers: Headers | undefined,
  query: Record<string, unknown> | undefined
): Promise<string | null> {
  const headerSlug = headers?.get("x-app-id");
  if (headerSlug) {
    return headerSlug;
  }

  // Links sent by email (verify, reset, magic link) carry the tenant as a
  // query parameter, since they open in a fresh browser without our headers.
  const querySlug = query?.app;
  if (typeof querySlug === "string" && querySlug) {
    return querySlug;
  }

  if (!headers) {
    return null;
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
 * The email-verification token is a JWT naming only the email address, so a
 * link minted for one application must not verify the same address in
 * another. The sender bound the token to a slug; the link must agree.
 */
async function assertVerificationTokenBelongsTo(
  slug: string | null,
  query: Record<string, unknown> | undefined
): Promise<void> {
  const token = query?.token;
  if (typeof token !== "string" || !token) {
    return; // Better Auth rejects the missing token itself.
  }
  const presentedFor = slug ?? AU1H_ADMIN_APP_SLUG;
  if (!(await isTokenBoundToApp(token, presentedFor))) {
    logger.warn(
      { presentedFor },
      "Verification link presented for an application it was not sent for"
    );
    throw new APIError("BAD_REQUEST", {
      message:
        "This verification link is not valid for this application. Request a new one.",
    });
  }
}

/**
 * Better Auth `hooks.before`:
 * 1. resolve which application (or the admin portal) the request is for,
 * 2. record it in the request-scoped tenant store, where the tenant-scoped
 *    adapter and session cache read it.
 */
export const authBeforeHook = createAuthMiddleware(async (ctx) => {
  const slug = await getAppSlugFromRequest(
    ctx.headers,
    ctx.query as Record<string, unknown> | undefined
  );
  const applicationId = await resolveApplicationId(slug, ctx.path);

  if (ctx.path === "/verify-email") {
    await assertVerificationTokenBelongsTo(slug, ctx.query);
  }

  logger.debug(
    { path: ctx.path, method: ctx.method, slug, applicationId },
    "Resolved tenant for auth request"
  );

  setTenantScope({ applicationId });
});
