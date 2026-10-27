import { eq } from "drizzle-orm";
import { db } from "@/db";
import { applications } from "@/db/schema/auth";
import { onCacheInvalidate } from "@/utils/cache-bus";
import { logger } from "@/utils/logger";

// ============================================================================
// APPLICATION ORIGINS CACHE
// Caches app origins for trustedOrigins and app slug resolution
// ============================================================================
interface AppOriginsCache {
  originToSlug: Map<string, string>;
  originsBySlug: Map<string, string[]>;
  lastFetched: number;
}

let appOriginsCache: AppOriginsCache | null = null;
const APP_ORIGINS_CACHE_TTL = 60 * 1000; // 1 minute

// id → slug, for the JWT `aud` claim. Same TTL; cleared with the origins cache.
const slugById = new Map<string, { slug: string; fetchedAt: number }>();

onCacheInvalidate("applications", () => {
  appOriginsCache = null;
  slugById.clear();
});

/** Comma-separated origins → trimmed, non-empty list. */
function splitOrigins(raw: string | null | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

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
  const originsBySlug = new Map<string, string[]>();

  for (const app of apps) {
    const origins = splitOrigins(app.allowedOrigins);
    originsBySlug.set(app.slug, origins);
    for (const origin of origins) {
      originToSlug.set(origin, app.slug);
    }
  }

  appOriginsCache = { originToSlug, originsBySlug, lastFetched: now };
  return appOriginsCache;
}

/** The admin portal's origin(s), from `CORS_ORIGIN`. Never mapped to a tenant. */
export function adminOrigins(): string[] {
  return splitOrigins(process.env.CORS_ORIGIN);
}

/**
 * Origins that may make credentialed requests on behalf of a tenant: the
 * application's own `allowed_origins`, or the admin portal's for the admin
 * scope (`slug === null`). Origins are deliberately not pooled across
 * applications: a workspace that registers `https://evil.example` as one of
 * its origins must not be able to make credentialed cross-site requests
 * against other workspaces or applications.
 */
export async function originsForTenant(slug: string | null): Promise<string[]> {
  if (slug === null) {
    return adminOrigins();
  }
  const cache = await fetchAppOrigins();
  return cache.originsBySlug.get(slug) ?? [];
}

/** Parse cookies from header string */
export function parseCookies(cookieHeader: string): Record<string, string> {
  return Object.fromEntries(
    cookieHeader.split(";").map((c) => {
      const [key, ...val] = c.trim().split("=");
      return [key, val.join("=")];
    })
  );
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
 * Application slug for an id (cached). Used to stamp `aud` on JWTs.
 */
export async function resolveApplicationSlugById(
  applicationId: string
): Promise<string | null> {
  const cached = slugById.get(applicationId);
  if (cached && Date.now() - cached.fetchedAt < APP_ORIGINS_CACHE_TTL) {
    return cached.slug;
  }
  const [app] = await db
    .select({ slug: applications.slug })
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);
  if (!app) {
    return null;
  }
  slugById.set(applicationId, { slug: app.slug, fetchedAt: Date.now() });
  return app.slug;
}

/**
 * Does the application allow its users to create organizations? Cached with
 * the other per-application lookups and cleared on the same bus topic.
 */
const orgsEnabledById = new Map<
  string,
  { value: boolean; fetchedAt: number }
>();
onCacheInvalidate("applications", () => orgsEnabledById.clear());

export async function isOrganizationsEnabled(
  applicationId: string
): Promise<boolean> {
  const cached = orgsEnabledById.get(applicationId);
  if (cached && Date.now() - cached.fetchedAt < APP_ORIGINS_CACHE_TTL) {
    return cached.value;
  }
  const [app] = await db
    .select({ enabled: applications.organizationsEnabled })
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);
  const value = app?.enabled ?? false;
  orgsEnabledById.set(applicationId, { value, fetchedAt: Date.now() });
  return value;
}
