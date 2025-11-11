import "dotenv/config";

import { Hono } from "hono";
import { cors } from "hono/cors";
import { closeDatabase, db, initializeDatabase } from "@/db";
import { users } from "@/db/schema/auth";
import { logger } from "@/utils/logger";
import { auth } from "./lib/auth";

const app = new Hono();

// Initialize database connection
await initializeDatabase();

app.use(
  "/*",
  cors({
    origin: process.env.CORS_ORIGIN || "",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "Cookie"],
    credentials: true,
  })
);

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.get("/", (c) => c.text("OK"));

app.get("/api/health", async (c) => {
  try {
    // Test database connection
    const result = await db.select().from(users).limit(1);
    return c.json({
      status: "ok",
      database: "connected",
      userCount: result.length,
    });
  } catch (error) {
    return c.json(
      {
        status: "error",
        database: "disconnected",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

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
