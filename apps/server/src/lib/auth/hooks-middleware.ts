/** biome-ignore-all lint/suspicious/noExplicitAny: Better Auth internal types */
import { APIError, createAuthMiddleware } from "better-auth/api";
import type Redis from "ioredis";
import { logger } from "@/utils/logger";
import { redisService } from "@/utils/redis";
import {
  fetchAppOrigins,
  getClientIp,
  isDirectAdminOrigin,
  parseCookies,
  resolveApplicationFromSlug,
} from "./app-context";
import {
  createCreateOAuthUser,
  createCreateUser,
  createFindAccountByProviderId,
  createFindAccounts,
  createFindOAuthUser,
  createFindUserByEmail,
  createLinkAccount,
} from "./internal-adapters";

/**
 * Check and clear admin OAuth marker from Redis (for callbacks)
 */
async function checkAdminOAuthMarker(
  redis: Redis,
  adminOAuthKey: string,
  isOAuthCallback: boolean,
  clientIp: string
): Promise<boolean> {
  if (!isOAuthCallback) {
    return false;
  }

  const marker = await redis.get(adminOAuthKey);
  const hasMarker = marker === "true";

  if (hasMarker) {
    logger.info({ clientIp }, "🔥 Found admin OAuth marker in Redis");
    await redis.del(adminOAuthKey);
  }

  return hasMarker;
}

/**
 * Set admin OAuth marker in Redis (for signin from admin UI)
 */
async function setAdminOAuthMarker(
  redis: Redis,
  opts: {
    adminOAuthKey: string;
    isOAuthSignin: boolean;
    isDirectAdmin: boolean;
    clientIp: string;
  }
): Promise<void> {
  if (opts.isOAuthSignin && opts.isDirectAdmin) {
    logger.info(
      { clientIp: opts.clientIp, adminOAuthKey: opts.adminOAuthKey },
      "🔥 Setting admin OAuth marker in Redis"
    );
    await redis.set(opts.adminOAuthKey, "true", "EX", 300);
  }
}

/**
 * Get app slug from request
 * Checks: x-app-id header → cookies (based on admin/client markers)
 */
async function getAppSlugFromRequest(
  headers: Headers | undefined,
  isOAuthCallback: boolean
): Promise<string | null> {
  if (!headers) {
    return null;
  }

  const cookieHeader = headers.get("cookie") ?? "";
  const cookies = parseCookies(cookieHeader);

  // 1. Check x-app-id header (direct API calls)
  const headerSlug = headers.get("x-app-id");
  if (headerSlug) {
    return headerSlug;
  }

  // 2. For OAuth callbacks, check cookies to determine flow
  if (isOAuthCallback) {
    // If au1h-is-admin=true cookie is set, this is admin flow
    const isAdminCookie = cookies["au1h-is-admin"] === "true";
    if (isAdminCookie) {
      logger.debug("OAuth callback: au1h-is-admin=true, treating as admin");
      return null;
    }

    // If au1h-is-client-app=true cookie is set, use au1h-app-id
    const isClientApp = cookies["au1h-is-client-app"] === "true";
    if (isClientApp) {
      const cookieSlug = cookies["au1h-app-id"];
      if (cookieSlug) {
        logger.debug(
          { cookieSlug },
          "OAuth callback: using au1h-app-id (client app)"
        );
        return cookieSlug;
      }
    }

    // No marker cookies = treat as admin (safe default)
    logger.debug("OAuth callback: no marker cookies, treating as admin");
    return null;
  }

  // 3. Check au1h-app-id cookie (for non-OAuth requests)
  const cookieSlug = cookies["au1h-app-id"];
  if (cookieSlug) {
    return cookieSlug;
  }

  // 4. Check origin header (maps origin URL to app slug)
  const origin = headers.get("origin");
  if (origin) {
    const cache = await fetchAppOrigins();
    const slug = cache.originToSlug.get(origin);
    if (slug) {
      logger.debug({ origin, slug }, "Found app slug from origin header");
      return slug;
    }
  }

  return null;
}

/**
 * Resolve applicationId from request context
 */
async function resolveApplicationId(opts: {
  headers: Headers | undefined;
  path: string | undefined;
  isAdminRequest: boolean;
  isOAuthCallback: boolean;
}): Promise<string | null> {
  const { headers, path, isAdminRequest, isOAuthCallback } = opts;
  if (isAdminRequest) {
    return null;
  }

  const appSlug = await getAppSlugFromRequest(headers, isOAuthCallback);
  logger.info({ appSlug, isOAuthCallback }, "🔥 Resolved appSlug");

  if (appSlug) {
    const app = await resolveApplicationFromSlug(appSlug);

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

  // Skip 401 for OAuth paths - they need to flow through
  const isOAuthPath =
    path?.startsWith("/signin/") || path?.startsWith("/callback/");

  if (!isOAuthPath) {
    throw new APIError("UNAUTHORIZED", {
      message:
        "Unauthorized: Missing application context. Ensure x-app-id header is set.",
    });
  }

  logger.info({ path }, "🔥 Allowing OAuth path through without app context");
  return null;
}

/**
 * Override internal adapters for multi-tenancy
 */
function overrideInternalAdapters(
  internalAdapter: any,
  applicationId: string | null
): void {
  // Log available methods for debugging
  logger.info(
    { methods: Object.keys(internalAdapter) },
    "🔥 Available internalAdapter methods"
  );

  internalAdapter.findUserByEmail = createFindUserByEmail(applicationId);
  internalAdapter.createUser = createCreateUser(applicationId);

  // Always override these - they may be added dynamically
  internalAdapter.createOAuthUser = createCreateOAuthUser(applicationId);
  internalAdapter.findOAuthUser = createFindOAuthUser(applicationId);
  internalAdapter.findAccounts = createFindAccounts(applicationId);
  internalAdapter.findAccountByProviderId =
    createFindAccountByProviderId(applicationId);
  internalAdapter.linkAccount = createLinkAccount(applicationId);

  logger.info(
    { applicationId },
    "🔥 All internal adapters overridden for multi-tenancy"
  );
}

/**
 * Auth middleware that handles:
 * 1. Admin request detection (origin + Redis marker for OAuth callbacks)
 * 2. Application context resolution (appSlug → applicationId)
 * 3. Internal adapter overrides for multi-tenancy
 */
export const authBeforeHook = createAuthMiddleware(async (ctx) => {
  logger.info(
    { path: ctx.path, method: ctx.method },
    "🔥 hooks.before triggered"
  );

  const redis = redisService.getClient();
  const isDirectAdmin = isDirectAdminOrigin(ctx.headers);
  const clientIp = getClientIp(ctx.headers);
  const adminOAuthKey = `oauth-admin:${clientIp}`;
  const isOAuthCallback = ctx.path?.startsWith("/callback/") ?? false;
  const isOAuthSignin =
    (ctx.path?.startsWith("/signin/") ?? false) && ctx.method === "GET";

  // Check Redis for admin OAuth marker
  const hasAdminOAuthMarker = await checkAdminOAuthMarker(
    redis,
    adminOAuthKey,
    isOAuthCallback,
    clientIp
  );

  const isAdminRequest = isDirectAdmin || hasAdminOAuthMarker;

  logger.info(
    { isDirectAdmin, hasAdminOAuthMarker, isAdminRequest, clientIp },
    "🔍 Admin request check"
  );

  // Set admin OAuth marker for signin from admin UI
  await setAdminOAuthMarker(redis, {
    adminOAuthKey,
    isOAuthSignin,
    isDirectAdmin,
    clientIp,
  });

  // For admin OAuth signin, set au1h-is-admin=true cookie
  // This tells the callback that this is an admin OAuth flow
  if (isOAuthSignin && isDirectAdmin) {
    logger.info("🔥 Admin OAuth signin: setting au1h-is-admin=true cookie");
    ctx.setHeader(
      "Set-Cookie",
      "au1h-is-admin=true; Path=/; HttpOnly; SameSite=Lax; Max-Age=300"
    );
  }

  // Resolve application context
  const applicationId = await resolveApplicationId({
    headers: ctx.headers,
    path: ctx.path,
    isAdminRequest,
    isOAuthCallback,
  });

  logger.info({ applicationId, isAdminRequest }, "🔥 Resolved applicationId");

  // Store in context for later use
  (ctx.context as Record<string, unknown>).applicationId = applicationId;
  (ctx.context as Record<string, unknown>).isAdminRequest = isAdminRequest;

  // Override internal adapters for multi-tenancy
  overrideInternalAdapters(ctx.context.internalAdapter, applicationId);
});
