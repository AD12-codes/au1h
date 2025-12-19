import "dotenv/config";

import { Hono } from "hono";
import { cors } from "hono/cors";
import { closeDatabase, initializeDatabase } from "@/db";
import { logger } from "@/utils/logger";
import { auth } from "./lib/auth";
import { createProxyMiddleware } from "./proxy/middleware";
import { routes } from "./routes";

const app = new Hono();

// Initialize database connection
await initializeDatabase();

app.use(
  "/*",
  cors({
    origin: process.env.CORS_ORIGIN || "",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "Cookie", "x-app-id"],
    credentials: true,
  })
);

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

// Proxy middleware for application routes
// Handles requests with x-app-id header and forwards to configured backends
app.use("/api/proxy/*", createProxyMiddleware("/api/proxy"));

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
