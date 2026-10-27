import { migrate } from "drizzle-orm/node-postgres/migrator";
import { closeDatabase, db } from "@/db";
import { logger } from "@/utils/logger";

/**
 * Apply pending SQL migrations from src/db/migrations. Run on container start
 * (`bun run start`) so a fresh database is schema-complete before the server
 * accepts traffic. Idempotent: already-applied migrations are skipped.
 */
const migrationsFolder = new URL("./migrations", import.meta.url).pathname;

if (!process.env.DATABASE_URL) {
  logger.fatal("DATABASE_URL is not set");
  process.exit(1);
}

try {
  logger.info({ migrationsFolder }, "Applying database migrations");
  await migrate(db, { migrationsFolder });
  logger.info("Database migrations applied");
} catch (error) {
  logger.fatal({ error }, "Database migration failed");
  await closeDatabase().catch((closeError) =>
    logger.debug({ closeError }, "Could not close the pool")
  );
  process.exit(1);
}
await closeDatabase();
