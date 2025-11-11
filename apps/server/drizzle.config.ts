import { defineConfig } from "drizzle-kit";

let DB_URL = "";
if (process.env.APP_ENV === "production") {
  DB_URL = process.env.DATABASE_PROD_URL || "";
} else if (process.env.APP_ENV === "development") {
  DB_URL = process.env.DATABASE_DEV_URL || "";
} else {
  DB_URL = process.env.DATABASE_URL || "";
}

export default defineConfig({
  schema: "./src/db/schema",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: DB_URL,
  },
  migrations: {
    schema: "public",
  },
});
