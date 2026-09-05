import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { applicationRoutes, applications } from "@/db/schema/auth";
import { invalidateCache, onCacheInvalidate } from "@/utils/cache-bus";
import { logger } from "@/utils/logger";

export interface MatchedRoute {
  id: string;
  applicationId: string;
  applicationSlug: string;
  name: string;
  pathPattern: string;
  backendUrl: string;
  methods: string[];
  stripPrefix: boolean;
}

interface RouteCache {
  routes: MatchedRoute[];
  lastUpdated: number;
}

const CACHE_TTL_MS = 30_000; // 30 seconds cache
let routeCache: RouteCache | null = null;

onCacheInvalidate("routes", () => {
  routeCache = null;
});

// Regex patterns (defined at module level for performance)
const WILDCARD_SUFFIX_REGEX = /\*.*$/;
const TRAILING_SLASH_REGEX = /\/$/;

/**
 * Load all active routes with their application info
 */
async function loadActiveRoutes(): Promise<MatchedRoute[]> {
  const routes = await db
    .select({
      id: applicationRoutes.id,
      applicationId: applicationRoutes.applicationId,
      applicationSlug: applications.slug,
      name: applicationRoutes.name,
      pathPattern: applicationRoutes.pathPattern,
      backendUrl: applicationRoutes.backendUrl,
      methods: applicationRoutes.methods,
      stripPrefix: applicationRoutes.stripPrefix,
    })
    .from(applicationRoutes)
    .innerJoin(
      applications,
      eq(applicationRoutes.applicationId, applications.id)
    )
    .where(
      and(eq(applicationRoutes.isActive, true), eq(applications.isActive, true))
    );

  return routes.map((r) => ({
    ...r,
    methods: JSON.parse(r.methods) as string[],
  }));
}

/**
 * Get active routes with caching
 */
export async function getActiveRoutes(): Promise<MatchedRoute[]> {
  const now = Date.now();

  if (routeCache && now - routeCache.lastUpdated < CACHE_TTL_MS) {
    return routeCache.routes;
  }

  const routes = await loadActiveRoutes();
  routeCache = { routes, lastUpdated: now };

  logger.debug({ count: routes.length }, "Loaded proxy routes into cache");
  return routes;
}

/**
 * Invalidate the route cache (call when routes are modified)
 */
export function invalidateRouteCache(): void {
  invalidateCache("routes");
  logger.debug("Proxy route cache invalidated");
}

/**
 * Convert path pattern to regex for matching
 * Supports: /todos/* (wildcard), /todos/:id (params)
 */
function patternToRegex(pattern: string): RegExp {
  let regexStr = pattern
    // Escape special regex chars except * and :
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    // Convert :param to named capture group
    .replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, "(?<$1>[^/]+)")
    // Convert /* wildcard to match anything
    .replace(/\*/g, ".*");

  // Ensure pattern matches from start
  if (!regexStr.startsWith("^")) {
    regexStr = `^${regexStr}`;
  }

  // Allow trailing slash optionally
  if (!regexStr.endsWith("$")) {
    regexStr += "/?$";
  }

  return new RegExp(regexStr);
}

export interface RouteMatch {
  route: MatchedRoute;
  params: Record<string, string>;
  remainingPath: string;
}

/**
 * Find a matching route for the given application and request path
 */
export async function findMatchingRoute(
  appSlug: string,
  method: string,
  path: string
): Promise<RouteMatch | null> {
  const routes = await getActiveRoutes();

  logger.debug(
    { totalRoutes: routes.length, slugs: routes.map((r) => r.applicationSlug) },
    "All cached routes"
  );

  // Filter routes for this application
  const appRoutes = routes.filter((r) => r.applicationSlug === appSlug);

  logger.debug(
    {
      appSlug,
      matchingRoutes: appRoutes.length,
      patterns: appRoutes.map((r) => r.pathPattern),
    },
    "Routes for app"
  );

  for (const route of appRoutes) {
    // Check if method is allowed
    if (!route.methods.includes(method.toUpperCase())) {
      continue;
    }

    const regex = patternToRegex(route.pathPattern);
    const match = path.match(regex);

    if (match) {
      // Extract named params
      const params = match.groups || {};

      // Calculate remaining path for wildcard routes
      let remainingPath = "";
      if (route.pathPattern.includes("*")) {
        const prefixPattern = route.pathPattern.replace(
          WILDCARD_SUFFIX_REGEX,
          ""
        );
        remainingPath = path.slice(prefixPattern.length);
      }

      return { route, params, remainingPath };
    }
  }

  return null;
}

/**
 * Build the target URL for proxying
 */
export function buildTargetUrl(
  route: MatchedRoute,
  originalPath: string,
  remainingPath: string,
  queryString: string
): string {
  let targetPath: string;

  if (route.stripPrefix) {
    // Use only the remaining path after the matched pattern
    targetPath = remainingPath || "/";
  } else {
    // Keep the full original path
    targetPath = originalPath;
  }

  // Ensure path starts with /
  if (!targetPath.startsWith("/")) {
    targetPath = `/${targetPath}`;
  }

  // Build full URL
  let url = `${route.backendUrl.replace(TRAILING_SLASH_REGEX, "")}${targetPath}`;

  // Add query string if present
  if (queryString) {
    url += `?${queryString}`;
  }

  return url;
}
