import "dotenv/config";

import { closeDatabase, initializeDatabase } from "@/db";
import { logger } from "@/utils/logger";
import { app } from "./app";

await initializeDatabase();

if (
  process.env.NODE_ENV !== "production" &&
  process.env.BETTER_AUTH_URL?.startsWith("https://")
) {
  logger.warn(
    "BETTER_AUTH_URL is https but NODE_ENV is not production: secure cookies, the auth rate limiter and the private-backend policy are OFF"
  );
}

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
