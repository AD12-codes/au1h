import type { Context, Next } from "hono";
import { cors } from "hono/cors";
import { fetchAppOrigins } from "@/lib/auth/app-context";
import { invalidateCache } from "@/utils/cache-bus";

/**
 * Allowed CORS origins: every active application's `allowed_origins` plus the
 * admin portal origin(s) from `CORS_ORIGIN`. Shares the cache (and its
 * cross-instance invalidation) with the auth layer's trusted origins.
 */
async function fetchAllowedOrigins(): Promise<Set<string>> {
  const cache = await fetchAppOrigins();
  return new Set(cache.allOrigins);
}

/**
 * Invalidate the origins cache on every instance (call when applications change).
 */
export function invalidateOriginsCache(): void {
  invalidateCache("applications");
}

export async function dynamicCorsMiddleware(c: Context, next: Next) {
  const origin = c.req.header("Origin");

  // If no origin, proceed without CORS headers
  if (!origin) {
    return next();
  }

  const allowedOrigins = await fetchAllowedOrigins();

  // Check if origin is allowed
  const isAllowed =
    allowedOrigins.has(origin) ||
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

  // Use Hono's cors middleware with the validated origin
  const corsMiddleware = cors({
    origin,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowHeaders: ["Content-Type", "Authorization", "Cookie", "x-app-id"],
    credentials: true,
  });

  return corsMiddleware(c, next);
}
