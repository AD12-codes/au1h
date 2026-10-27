import type { Context, Next } from "hono";
import { cors } from "hono/cors";
import { AU1H_ADMIN_APP_SLUG } from "@/lib/auth/admin";
import { adminOrigins, originsForTenant } from "@/lib/auth/app-context";
import { getAppSlugFromRequest } from "@/lib/auth/hooks-middleware";
import { invalidateCache } from "@/utils/cache-bus";

/**
 * Invalidate the origins cache on every instance (call when applications change).
 */
export function invalidateOriginsCache(): void {
  invalidateCache("applications");
}

/**
 * Which origins may make a credentialed cross-site request *for this tenant*?
 *
 * - `/api/v1/*` is the admin API: only the admin portal's origin.
 * - Otherwise the tenant is resolved exactly as the auth layer resolves it
 *   (`x-app-id`, `?app=`, cookie, Origin) and only that application's own
 *   origins are allowed; the admin slug maps to the portal's origin.
 *
 * Pooling every application's origins into one allowlist would let any
 * workspace register an attacker origin and then drive another admin's
 * browser against the admin API with their cookie.
 */
async function allowedOriginsFor(c: Context): Promise<string[]> {
  if (c.req.path.startsWith("/api/v1")) {
    return adminOrigins();
  }
  const slug = await getAppSlugFromRequest(c.req.raw.headers, c.req.query());
  if (slug === null) {
    return [];
  }
  return await originsForTenant(slug === AU1H_ADMIN_APP_SLUG ? null : slug);
}

export async function dynamicCorsMiddleware(c: Context, next: Next) {
  const origin = c.req.header("Origin");

  // Same-origin or non-browser request: no CORS headers needed.
  if (!origin) {
    return next();
  }

  const allowed = await allowedOriginsFor(c);
  const isAllowed =
    allowed.includes(origin) ||
    // In development, allow all localhost origins
    (process.env.NODE_ENV !== "production" &&
      origin.startsWith("http://localhost"));

  if (!isAllowed) {
    // Origin not allowed, but still need to handle preflight
    if (c.req.method === "OPTIONS") {
      return new Response(null, { status: 204 });
    }
    return next();
  }

  const corsMiddleware = cors({
    origin,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowHeaders: ["Content-Type", "Authorization", "Cookie", "x-app-id"],
    credentials: true,
  });

  return corsMiddleware(c, next);
}
