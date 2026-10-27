import { Hono } from "hono";
import { appsRoute } from "./apps/route";
import { handleAuthRequest } from "./lib/auth/index";
import { CLIENT_IP_HEADER, clientIp } from "./middleware/client-ip";
import { dynamicCorsMiddleware } from "./middleware/dynamic-cors";
import { envInt, rateLimit } from "./middleware/rate-limit";
import { createProxyMiddleware } from "./proxy/middleware";
import { routes } from "./routes";

/**
 * The HTTP application, without process wiring, so tests can call
 * `app.fetch` directly. `index.ts` connects the database and serves it.
 */
export const app = new Hono();

const SLUG = /^[a-z0-9-]{1,64}$/;

// Dynamic CORS - fetches allowed origins from database (applications table)
app.use("/*", dynamicCorsMiddleware);

// Middleware to persist x-app-id in cookie for OAuth flow
// OAuth callbacks lose headers, so we store app context in a cookie
app.use("/api/auth/*", async (c, next) => {
  await next();

  const appId = c.req.header("x-app-id");
  if (!appId) {
    return;
  }

  // Store the app slug (including the reserved admin slug) in a cookie so the
  // OAuth callback, which arrives from the provider without our headers, can
  // recover the tenant. Appended after the handler ran: setting it earlier
  // would replace the handler's own Set-Cookie headers (the session cookie).
  // Only the slug grammar is accepted, so a client cannot inject attributes.
  if (!SLUG.test(appId)) {
    return;
  }
  c.res.headers.append(
    "Set-Cookie",
    `au1h-app-id=${appId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`
  );
});

// Better Auth reads the client IP from CLIENT_IP_HEADER (rate limiter, session
// records). Set it here from what au1h itself determined and drop any copy the
// client sent, so x-forwarded-for spoofing cannot buy fresh rate-limit buckets.
app.on(["POST", "GET"], "/api/auth/*", (c) => {
  const headers = new Headers(c.req.raw.headers);
  headers.set(CLIENT_IP_HEADER, clientIp(c));
  return handleAuthRequest(
    new Request(c.req.raw, {
      headers,
      ...(c.req.raw.body ? { duplex: "half" as const } : {}),
    } as RequestInit)
  );
});

// Rate limits (Redis-backed, shared across instances). Better Auth applies
// its own limiter to /api/auth/*.
app.use(
  "/proxy/*",
  rateLimit({
    name: "proxy",
    limit: envInt("AU1H_RATE_LIMIT_PROXY", 600),
    windowSeconds: 60,
    keyFor: (c) => c.req.header("x-app-id") ?? "-",
  })
);
app.use(
  "/api/v1/*",
  rateLimit({
    name: "admin-api",
    limit: envInt("AU1H_RATE_LIMIT_ADMIN", 300),
    windowSeconds: 60,
  })
);
app.use(
  "/api/apps/*",
  rateLimit({
    name: "apps-api",
    limit: envInt("AU1H_RATE_LIMIT_APPS", 600),
    windowSeconds: 60,
    keyFor: (c) => c.req.header("x-app-id") ?? "-",
  })
);

// Proxy middleware for application routes
// Handles requests with x-app-id header and forwards to configured backends
// Mount at /proxy/* so client paths mirror backend paths:
//   Client: /proxy/api/todos → Backend: http://backend/api/todos
app.use("/proxy/*", createProxyMiddleware("/proxy"));

// Admin API (admin-portal session) and server-to-server API (app secret)
app.route("/api/v1", routes);
app.route("/api/apps", appsRoute);
