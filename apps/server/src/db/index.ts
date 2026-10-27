import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { logger } from "@/utils/logger";

// Validated in initializeDatabase(), not at import time, so modules that
// import `db` can be unit-tested without a database.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // The schema uses `timestamp` (without time zone). Better Auth and Drizzle
  // write UTC wall-clock values, so `DEFAULT now()` must produce UTC too;
  // otherwise rows created by the database default drift by the server's
  // local offset.
  options: "-c timezone=UTC",
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30_000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
});

export const db = drizzle(pool);

/**
 * Initialize database connection and verify connectivity
 */
export async function initializeDatabase() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }
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
