import { Hono } from "hono";
import { appsRoute } from "./apps/route";
import { handleAuthRequest } from "./lib/auth/index";
import { dynamicCorsMiddleware } from "./middleware/dynamic-cors";
import { envInt, rateLimit } from "./middleware/rate-limit";
import { createProxyMiddleware } from "./proxy/middleware";
import { routes } from "./routes";

/**
 * The HTTP application, without process wiring, so tests can call
 * `app.fetch` directly. `index.ts` connects the database and serves it.
 */
export const app = new Hono();

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
  // recover the tenant.
  //
  // This MUST be appended to the final response *after* the handler ran.
  // Hono's `c.header("Set-Cookie", ...)` before `next()` replaces every
  // Set-Cookie header on the handler's Response, which silently dropped
  // Better Auth's session cookie for any request carrying x-app-id.
  c.res.headers.append(
    "Set-Cookie",
    `au1h-app-id=${appId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`
  );
});

app.on(["POST", "GET"], "/api/auth/*", (c) => handleAuthRequest(c.req.raw));

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
