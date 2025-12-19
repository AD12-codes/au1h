import { eq } from "drizzle-orm";
import type { Context, Next } from "hono";
import { cors } from "hono/cors";
import { db } from "@/db";
import { applications } from "@/db/schema/auth";

// Cache for allowed origins with TTL
interface OriginsCache {
  origins: Set<string>;
  lastFetched: number;
}

let originsCache: OriginsCache | null = null;
const CACHE_TTL = 60 * 1000; // 1 minute

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: <not important>
async function fetchAllowedOrigins(): Promise<Set<string>> {
  const now = Date.now();

  // Return cached origins if still valid
  if (originsCache && now - originsCache.lastFetched < CACHE_TTL) {
    return originsCache.origins;
  }

  // Fetch all active applications and their allowed origins
  const apps = await db
    .select({
      allowedOrigins: applications.allowedOrigins,
    })
    .from(applications)
    .where(eq(applications.isActive, true));

  const origins = new Set<string>();

  // Parse allowed origins from each application
  for (const app of apps) {
    if (app.allowedOrigins) {
      // allowedOrigins is stored as comma-separated string
      const appOrigins = app.allowedOrigins.split(",").map((o) => o.trim());
      for (const origin of appOrigins) {
        if (origin) {
          origins.add(origin);
        }
      }
    }
  }

  // Also add origins from env (for admin portal and fallback)
  const envOrigins =
    process.env.CORS_ORIGIN?.split(",").map((o) => o.trim()) || [];
  for (const origin of envOrigins) {
    if (origin) {
      origins.add(origin);
    }
  }

  // Update cache
  originsCache = { origins, lastFetched: now };

  return origins;
}

// Invalidate cache (call this when applications are updated)
export function invalidateOriginsCache(): void {
  originsCache = null;
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
