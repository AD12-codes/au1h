import type { Context } from "hono";
import { checkHealth } from "./service";

export async function getHealth(c: Context) {
  const health = await checkHealth();

  if (health.status === "error") {
    return c.json(health, 500);
  }

  return c.json(health);
}
