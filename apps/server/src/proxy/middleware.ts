import type { Context, Next } from "hono";
import { getSessionForRequest, mintProxyToken } from "@/lib/auth";
import { verifyAu1hJwt } from "@/lib/auth/verify-jwt";
import { logger } from "@/utils/logger";
import {
  buildTargetUrl,
  findMatchingRoute,
  type MatchedRoute,
} from "./service";

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
  userId: string;
  userEmail: string;
  appId: string;
  appSlug: string;
  /** Scheme the client used to reach au1h. */
  proto: string;
  /** Short-lived au1h-signed token proving the hop came through the gateway. */
  proxyToken: string;
}

const PROXY_TIMEOUT_MS = Number.parseInt(
  process.env.AU1H_PROXY_TIMEOUT_MS ?? "30000",
  10
);

type AuthResult =
  | { ok: true; userId: string; userEmail: string; via: "jwt" | "session" }
  | { ok: false; status: 401 | 403; message: string };

/**
 * Authenticate the caller and make sure they belong to the matched route's
 * application.
 *
 * Accepted credentials, in order:
 * 1. `Authorization: Bearer <jwt>` minted by this au1h (`/api/auth/token`):
 *    signature, expiry, iss/aud are verified and the `applicationId` claim
 *    must equal the route's application.
 * 2. The Better Auth session cookie. The session is resolved in the tenant
 *    named by `x-app-id`, so a session from another application does not
 *    resolve at all; the application is asserted again against the route.
 *
 * Anything else is a 401. Nothing is forwarded to a backend unauthenticated.
 */
async function authenticate(
  c: Context,
  route: MatchedRoute
): Promise<AuthResult> {
  const authorization = c.req.header("authorization") ?? "";
  if (authorization.startsWith("Bearer ")) {
    try {
      const claims = await verifyAu1hJwt(
        authorization.slice("Bearer ".length),
        route.applicationSlug
      );
      if ((claims.applicationId ?? null) !== route.applicationId) {
        return {
          ok: false,
          status: 403,
          message: "Token was issued for a different application",
        };
      }
      return {
        ok: true,
        userId: claims.sub,
        userEmail: claims.email,
        via: "jwt",
      };
    } catch (error) {
      logger.debug({ error }, "Proxy: bearer token rejected");
      return { ok: false, status: 401, message: "Invalid or expired token" };
    }
  }

  let session: Awaited<ReturnType<typeof getSessionForRequest>>;
  try {
    session = await getSessionForRequest(c.req.raw.headers);
  } catch (error) {
    logger.debug({ error }, "Proxy: session lookup failed");
    return { ok: false, status: 401, message: "Authentication required" };
  }
  if (!session?.user) {
    return { ok: false, status: 401, message: "Authentication required" };
  }

  const sessionAppId =
    (session.session as { applicationId?: string | null }).applicationId ??
    null;
  if (sessionAppId !== route.applicationId) {
    return {
      ok: false,
      status: 403,
      message: "Session belongs to a different application",
    };
  }

  return {
    ok: true,
    userId: session.user.id,
    userEmail: session.user.email,
    via: "session",
  };
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
  headers.set("x-user-id", context.userId);
  headers.set("x-user-email", context.userEmail);

  // Set forwarding headers
  const url = new URL(targetUrl);
  headers.set("host", url.host);
  headers.set("x-forwarded-host", originalHeaders.get("host") || "");
  headers.set("x-forwarded-proto", context.proto);
  headers.set("x-au1h-token", context.proxyToken);

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
    logger.debug(
      { appSlug, method, relativePath },
      "Looking for matching proxy route"
    );

    const match = await findMatchingRoute(appSlug, method, relativePath);

    if (!match) {
      logger.warn(
        { appSlug, method, relativePath },
        "No matching proxy route found"
      );
      return c.json(
        {
          error: "Not Found",
          message: `No proxy route configured for ${method} ${relativePath} in app ${appSlug}`,
        },
        404
      );
    }

    const { route, remainingPath } = match;

    logger.debug(
      {
        appSlug,
        method,
        path: relativePath,
        routeName: route.name,
        backendUrl: route.backendUrl,
      },
      "Proxying request"
    );

    // Authenticate before touching the backend.
    const authResult = await authenticate(c, route);
    if (!authResult.ok) {
      logger.warn(
        { appSlug, method, path: relativePath, reason: authResult.message },
        "Proxy request rejected"
      );
      return c.json(
        {
          error: authResult.status === 401 ? "Unauthorized" : "Forbidden",
          message: authResult.message,
        },
        authResult.status
      );
    }

    try {
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
        userId: authResult.userId,
        userEmail: authResult.userEmail,
        appId: route.applicationId,
        appSlug: route.applicationSlug,
        proto: new URL(c.req.url).protocol.replace(":", ""),
        proxyToken: await mintProxyToken({
          applicationId: route.applicationId,
          applicationSlug: route.applicationSlug,
          user: { id: authResult.userId, email: authResult.userEmail },
          method,
          path: relativePath,
        }),
      };
      const headers = buildProxyHeaders(
        c.req.raw.headers,
        proxyContext,
        targetUrl
      );

      // Stream the request body through instead of buffering it in memory.
      const body =
        method === "GET" || method === "HEAD" ? null : c.req.raw.body;

      // Make the proxy request (bounded by a timeout so a hung backend cannot
      // pin au1h's connections).
      const startTime = Date.now();
      const response = await fetch(targetUrl, {
        method,
        headers,
        body,
        signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
        // Required by the fetch spec when sending a streaming body.
        ...(body ? { duplex: "half" as const } : {}),
      } as RequestInit);
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

      if (error instanceof Error && error.name === "TimeoutError") {
        return c.json(
          {
            error: "Gateway Timeout",
            message: "Backend did not respond in time",
          },
          504
        );
      }

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
