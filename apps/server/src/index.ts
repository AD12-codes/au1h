import "dotenv/config";

import { Hono } from "hono";
import { closeDatabase, initializeDatabase } from "@/db";
import { logger } from "@/utils/logger";
import { auth } from "./lib/auth";
import { dynamicCorsMiddleware } from "./middleware/dynamic-cors";
import { createProxyMiddleware } from "./proxy/middleware";
import { routes } from "./routes";

const app = new Hono();

// Initialize database connection
await initializeDatabase();

// Dynamic CORS - fetches allowed origins from database (applications table)
app.use("/*", dynamicCorsMiddleware);

// Middleware to persist x-app-id in cookie for OAuth flow
// OAuth callbacks lose headers, so we store app context in a cookie
app.use("/api/auth/*", (c, next) => {
  const appId = c.req.header("x-app-id");

  if (appId) {
    // Store app-id in cookie for OAuth callback to read
    c.header(
      "Set-Cookie",
      `au1h-app-id=${appId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`
    );
  }

  return next();
});

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

// Proxy middleware for application routes
// Handles requests with x-app-id header and forwards to configured backends
// Mount at /proxy/* so client paths mirror backend paths:
//   Client: /proxy/api/todos → Backend: http://backend/api/todos
app.use("/proxy/*", createProxyMiddleware("/proxy"));

app.route("/api/v1", routes);

// Graceful shutdown
process.on("SIGINT", async () => {
  logger.info("Received SIGINT, shutting down gracefully");
  await closeDatabase();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  logger.info("Received SIGTERM, shutting down gracefully");
  await closeDatabase();
  process.exit(0);
});

// Unhandled errors
process.on("uncaughtException", (error) => {
  logger.fatal({ error }, "Uncaught exception");
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  logger.fatal({ reason, promise }, "Unhandled promise rejection");
  process.exit(1);
});

export default {
  port: process.env.PORT || 3000,
  fetch: app.fetch,
};
