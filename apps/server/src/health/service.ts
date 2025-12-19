import { db } from "@/db";
import { users } from "@/db/schema/auth";

export interface HealthStatus {
  status: "ok" | "error";
  database: "connected" | "disconnected";
  userCount?: number;
  error?: string;
}

export async function checkHealth(): Promise<HealthStatus> {
  try {
    const result = await db.select().from(users).limit(1);
    return {
      status: "ok",
      database: "connected",
      userCount: result.length,
    };
  } catch (error) {
    return {
      status: "error",
      database: "disconnected",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
