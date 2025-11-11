import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { logger } from "@/utils/logger";

const getDatabaseUrl = () => {
  if (process.env.APP_ENV === "production") {
    return process.env.DATABASE_PROD_URL || "";
  }
  if (process.env.APP_ENV === "development") {
    return process.env.DATABASE_DEV_URL || "";
  }
  return process.env.DATABASE_URL || "";
};

const pool = new Pool({
  connectionString: getDatabaseUrl(),
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30_000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
});

export const db = drizzle(pool);

/**
 * Initialize database connection and verify connectivity
 */
export async function initializeDatabase() {
  try {
    logger.info("Initializing database connection...");

    // Test the connection
    const client = await pool.connect();
    await client.query("SELECT 1");
    client.release();

    logger.info("Database connection established successfully");
    return true;
  } catch (error) {
    logger.error({ error }, "Failed to initialize database connection");
    throw error;
  }
}

/**
 * Gracefully close database connections
 */
export async function closeDatabase() {
  try {
    logger.info("Closing database connections...");
    await pool.end();
    logger.info("Database connections closed");
  } catch (error) {
    logger.error({ error }, "Error closing database connections");
    throw error;
  }
}
