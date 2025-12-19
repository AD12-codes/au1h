import type { Context, Next } from "hono";
import { auth } from "@/lib/auth";
import { logger } from "@/utils/logger";
import { buildTargetUrl, findMatchingRoute } from "./service";

/**
 * Headers that should not be forwarded to backend
 */
const STRIP_REQUEST_HEADERS = [
  "host",
  "connection",
  "keep-alive",
  "transfer-encoding",
  "te",
  "upgrade",
  "proxy-authorization",
  "proxy-connection",
  // Strip any client-sent context headers (we'll inject trusted ones)
  "x-user-id",
  "x-user-email",
  "x-app-id",
  "x-app-slug",
];

/**
 * Headers that should not be forwarded back to client
 */
const STRIP_RESPONSE_HEADERS = [
  "transfer-encoding",
  "connection",
  "keep-alive",
];

interface ProxyContext {
  userId?: string;
  userEmail?: string;
  appId: string;
  appSlug: string;
}

/**
 * Get user context from session
 */
async function getUserContext(
  c: Context
): Promise<{ userId?: string; userEmail?: string }> {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (session?.user) {
      return {
        userId: session.user.id,
        userEmail: session.user.email,
      };
    }
  } catch (error) {
    logger.debug({ error }, "Failed to get session for proxy context");
  }
  return {};
}

/**
 * Build headers for the proxied request
 */
function buildProxyHeaders(
  originalHeaders: Headers,
  context: ProxyContext,
  targetUrl: string
): Headers {
  const headers = new Headers();

  // Copy original headers (except stripped ones)
  for (const [key, value] of originalHeaders.entries()) {
    if (!STRIP_REQUEST_HEADERS.includes(key.toLowerCase())) {
      headers.set(key, value);
    }
  }

  // Inject trusted context headers
  headers.set("x-app-id", context.appId);
  headers.set("x-app-slug", context.appSlug);

  if (context.userId) {
    headers.set("x-user-id", context.userId);
  }
  if (context.userEmail) {
    headers.set("x-user-email", context.userEmail);
  }

  // Set forwarding headers
  const url = new URL(targetUrl);
  headers.set("host", url.host);
  headers.set("x-forwarded-host", originalHeaders.get("host") || "");
  headers.set("x-forwarded-proto", "https");

  const clientIp =
    originalHeaders.get("x-forwarded-for") ||
    originalHeaders.get("x-real-ip") ||
    "unknown";
  headers.set("x-forwarded-for", clientIp);

  return headers;
}

/**
 * Proxy middleware factory
 * Creates a middleware that proxies requests matching configured routes
 */
export function createProxyMiddleware(basePath: string) {
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: <fix later>
  return async (c: Context, next: Next) => {
    const appSlug = c.req.header("x-app-id");

    if (!appSlug) {
      // No app context, skip proxy
      return next();
    }

    // Get the path relative to the base path
    const fullPath = c.req.path;
    const relativePath = fullPath.startsWith(basePath)
      ? fullPath.slice(basePath.length) || "/"
      : fullPath;

    const method = c.req.method;

    // Find matching route
    const match = await findMatchingRoute(appSlug, method, relativePath);

    if (!match) {
      // No matching route, continue to next handler
      return next();
    }

    const { route, remainingPath } = match;

    logger.info(
      {
        appSlug,
        method,
        path: relativePath,
        routeName: route.name,
        backendUrl: route.backendUrl,
      },
      "Proxying request"
    );

    try {
      // Get user context from session
      const userContext = await getUserContext(c);

      // Build target URL
      const queryString = new URL(c.req.url).search.slice(1); // Remove leading ?
      const targetUrl = buildTargetUrl(
        route,
        relativePath,
        remainingPath,
        queryString
      );

      // Build proxy headers
      const proxyContext: ProxyContext = {
        ...userContext,
        appId: route.applicationId,
        appSlug: route.applicationSlug,
      };
      const headers = buildProxyHeaders(
        c.req.raw.headers,
        proxyContext,
        targetUrl
      );

      // Get request body if present
      let body: BodyInit | null = null;
      if (method !== "GET" && method !== "HEAD") {
        body = await c.req.raw.clone().arrayBuffer();
      }

      // Make the proxy request
      const startTime = Date.now();
      const response = await fetch(targetUrl, {
        method,
        headers,
        body,
      });
      const duration = Date.now() - startTime;

      logger.info(
        {
          targetUrl,
          status: response.status,
          duration,
        },
        "Proxy response received"
      );

      // Build response headers
      const responseHeaders = new Headers();
      for (const [key, value] of response.headers.entries()) {
        if (!STRIP_RESPONSE_HEADERS.includes(key.toLowerCase())) {
          responseHeaders.set(key, value);
        }
      }

      // Return proxied response
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    } catch (error) {
      logger.error(
        {
          error,
          appSlug,
          path: relativePath,
          backendUrl: route.backendUrl,
        },
        "Proxy request failed"
      );

      return c.json(
        {
          error: "Proxy error",
          message: "Failed to connect to backend service",
        },
        502
      );
    }
  };
}
