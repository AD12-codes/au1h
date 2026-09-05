import { eq } from "drizzle-orm";
import { db } from "@/db";
import { applications } from "@/db/schema/auth";
import { logger } from "@/utils/logger";

// ============================================================================
// AU1H ADMIN ORIGIN DETECTION
// Only requests from au1h admin UI can create organizations
// ============================================================================
export const AU1H_ADMIN_ORIGINS = [
  "http://localhost:4445",
  process.env.AU1H_ADMIN_URL,
].filter(Boolean) as string[];

// ============================================================================
// APPLICATION ORIGINS CACHE
// Caches app origins for trustedOrigins and app slug resolution
// ============================================================================
interface AppOriginsCache {
  originToSlug: Map<string, string>;
  allOrigins: string[];
  lastFetched: number;
}

let appOriginsCache: AppOriginsCache | null = null;
const APP_ORIGINS_CACHE_TTL = 60 * 1000; // 1 minute

export async function fetchAppOrigins(): Promise<AppOriginsCache> {
  const now = Date.now();

  if (
    appOriginsCache &&
    now - appOriginsCache.lastFetched < APP_ORIGINS_CACHE_TTL
  ) {
    return appOriginsCache;
  }

  const apps = await db
    .select({
      slug: applications.slug,
      allowedOrigins: applications.allowedOrigins,
    })
    .from(applications)
    .where(eq(applications.isActive, true));

  const originToSlug = new Map<string, string>();
  const allOrigins: string[] = [];

  for (const app of apps) {
    if (app.allowedOrigins) {
      const origins = app.allowedOrigins.split(",").map((o) => o.trim());
      for (const origin of origins) {
        if (origin) {
          originToSlug.set(origin, app.slug);
          allOrigins.push(origin);
        }
      }
    }
  }

  // Add env origins as fallback
  const envOrigin = process.env.CORS_ORIGIN;
  if (envOrigin) {
    allOrigins.push(envOrigin);
  }

  appOriginsCache = { originToSlug, allOrigins, lastFetched: now };
  return appOriginsCache;
}

// ============================================================================
// COOKIE & APP SLUG HELPERS
// ============================================================================

/** Parse cookies from header string */
export function parseCookies(cookieHeader: string): Record<string, string> {
  return Object.fromEntries(
    cookieHeader.split(";").map((c) => {
      const [key, ...val] = c.trim().split("=");
      return [key, val.join("=")];
    })
  );
}

/** Get app slug from OAuth state cookie (contains callback URL) */
function getAppSlugFromOAuthState(
  cookies: Record<string, string>,
  originToSlug: Map<string, string>
): string | null {
  const state = cookies["better-auth.state"];
  if (!state) {
    return null;
  }

  try {
    const decoded = decodeURIComponent(state);
    for (const [origin, slug] of originToSlug.entries()) {
      if (decoded.includes(origin)) {
        return slug;
      }
    }
  } catch {
    // Decoding failed
  }
  return null;
}

/**
 * Get application slug from request context (async version)
 * Checks: header → au1h-app-id cookie → origin → OAuth state cookie
 *
 * IMPORTANT: Returns null immediately for au1h admin origin requests.
 * This prevents au1h-app-id cookies from other apps interfering with admin portal.
 */
export async function getAppSlugFromRequest(ctx: {
  headers?: Headers;
  path?: string;
}): Promise<string | null> {
  // Check if request is from au1h admin - if so, return null immediately
  const reqOrigin = ctx.headers?.get("origin");
  const reqReferer = ctx.headers?.get("referer");
  const isAdminOrigin = AU1H_ADMIN_ORIGINS.some(
    (adminUrl) =>
      reqOrigin?.startsWith(adminUrl) || reqReferer?.startsWith(adminUrl)
  );
  if (isAdminOrigin) {
    logger.debug(
      { origin: reqOrigin, referer: reqReferer },
      "Admin origin detected, returning null appSlug"
    );
    return null;
  }

  // Check if this is an OAuth callback (no origin/referer from GitHub redirect)
  const isOAuthCallback = ctx.path?.startsWith("/callback/");

  // 1. Check x-app-id header (direct API calls)
  const headerSlug = ctx.headers?.get("x-app-id");
  if (headerSlug) {
    logger.debug({ headerSlug }, "Found app slug from x-app-id header");
    return headerSlug;
  }

  const cookieHeader = ctx.headers?.get("cookie") ?? "";
  const cookies = parseCookies(cookieHeader);

  // Get cached origins (needed for OAuth state check)
  const cache = await fetchAppOrigins();

  // 2. For OAuth callbacks, skip au1h-app-id cookie entirely (it can be stale)
  // Instead, use OAuth state cookie to determine app context
  if (isOAuthCallback) {
    const stateSlug = getAppSlugFromOAuthState(cookies, cache.originToSlug);
    if (stateSlug) {
      logger.debug(
        { stateSlug },
        "OAuth callback: Found app slug from state cookie"
      );
      return stateSlug;
    }
    // No client app in state = admin OAuth flow
    logger.debug(
      "OAuth callback: No client app in state, treating as admin flow"
    );
    return null;
  }

  // 3. Check au1h-app-id cookie (for non-OAuth requests only)
  const cookieSlug = cookies["au1h-app-id"];
  if (cookieSlug) {
    logger.debug({ cookieSlug }, "Found app slug from au1h-app-id cookie");
    return cookieSlug;
  }

  // 4. Check origin header
  const origin = ctx.headers?.get("origin");
  if (origin) {
    const slug = cache.originToSlug.get(origin);
    if (slug) {
      logger.debug({ origin, slug }, "Found app slug from origin");
      return slug;
    }
  }

  // 4. Check OAuth state cookie (OAuth callbacks)
  const stateSlug = getAppSlugFromOAuthState(cookies, cache.originToSlug);
  if (stateSlug) {
    logger.debug({ stateSlug }, "Found app slug from OAuth state");
    return stateSlug;
  }

  logger.warn("No app context found in header, cookie, or origin");
  return null;
}

/**
 * Resolve application ID from slug, validating it exists and is active
 */
export async function resolveApplicationFromSlug(
  appSlug: string
): Promise<{ id: string; isActive: boolean } | null> {
  const app = await db
    .select({ id: applications.id, isActive: applications.isActive })
    .from(applications)
    .where(eq(applications.slug, appSlug))
    .limit(1);

  if (!app.length) {
    logger.warn({ appSlug }, "Application not found");
    return null;
  }

  return app[0];
}

/**
 * Check if request is from admin origin (direct check)
 */
export function isDirectAdminOrigin(headers?: Headers): boolean {
  if (!headers) {
    return false;
  }

  const origin = headers.get("origin");
  const referer = headers.get("referer");

  return AU1H_ADMIN_ORIGINS.some(
    (adminUrl) => origin?.startsWith(adminUrl) || referer?.startsWith(adminUrl)
  );
}

/**
 * Get client IP from headers (for Redis key)
 */
export function getClientIp(headers?: Headers): string {
  return (
    headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers?.get("x-real-ip") ||
    "unknown"
  );
}
