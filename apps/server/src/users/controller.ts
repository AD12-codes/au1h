import type { Context } from "hono";
import { z } from "zod";
import type { AdminEnv } from "@/middleware/require-org-session";
import { logger } from "@/utils/logger";
import {
  banUser,
  getUser,
  getUserSessions,
  listUsers,
  revokeAllUserSessions,
  revokeSession,
  unbanUser,
} from "./service";

const listQuerySchema = z.object({
  applicationId: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

const banSchema = z.object({
  reason: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
});

export async function list(c: Context<AdminEnv>) {
  try {
    const query = c.req.query();
    const parsed = listQuerySchema.safeParse(query);

    if (!parsed.success) {
      return c.json(
        { error: "Invalid query parameters", details: parsed.error.flatten() },
        400
      );
    }

    const result = await listUsers(c.get("organizationId"), parsed.data);
    return c.json(result);
  } catch (error) {
    logger.error({ error }, "Failed to list users");
    return c.json({ error: "Failed to list users" }, 500);
  }
}

export async function get(c: Context<AdminEnv>) {
  try {
    const id = c.req.param("id");
    const user = await getUser(c.get("organizationId"), id);

    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }

    return c.json({ user });
  } catch (error) {
    logger.error({ error }, "Failed to get user");
    return c.json({ error: "Failed to get user" }, 500);
  }
}

export async function getSessions(c: Context<AdminEnv>) {
  try {
    const id = c.req.param("id");
    const userSessions = await getUserSessions(c.get("organizationId"), id);
    if (!userSessions) {
      return c.json({ error: "User not found" }, 404);
    }
    return c.json({ sessions: userSessions });
  } catch (error) {
    logger.error({ error }, "Failed to get user sessions");
    return c.json({ error: "Failed to get user sessions" }, 500);
  }
}

export async function ban(c: Context<AdminEnv>) {
  try {
    const id = c.req.param("id");
    const body = await c.req.json().catch(() => ({}));
    const parsed = banSchema.safeParse(body);

    if (!parsed.success) {
      return c.json(
        { error: "Invalid request body", details: parsed.error.flatten() },
        400
      );
    }

    const expiresAt = parsed.data.expiresAt
      ? new Date(parsed.data.expiresAt)
      : undefined;

    const user = await banUser(
      c.get("organizationId"),
      id,
      parsed.data.reason,
      expiresAt
    );

    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }

    logger.info({ userId: id, reason: parsed.data.reason }, "User banned");

    return c.json({ user });
  } catch (error) {
    logger.error({ error }, "Failed to ban user");
    return c.json({ error: "Failed to ban user" }, 500);
  }
}

export async function unban(c: Context<AdminEnv>) {
  try {
    const id = c.req.param("id");
    const user = await unbanUser(c.get("organizationId"), id);

    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }

    logger.info({ userId: id }, "User unbanned");

    return c.json({ user });
  } catch (error) {
    logger.error({ error }, "Failed to unban user");
    return c.json({ error: "Failed to unban user" }, 500);
  }
}

export async function revokeUserSession(c: Context<AdminEnv>) {
  try {
    const sessionId = c.req.param("sessionId");
    const success = await revokeSession(c.get("organizationId"), sessionId);

    if (!success) {
      return c.json({ error: "Session not found" }, 404);
    }

    logger.info({ sessionId }, "Session revoked");

    return c.json({ success: true });
  } catch (error) {
    logger.error({ error }, "Failed to revoke session");
    return c.json({ error: "Failed to revoke session" }, 500);
  }
}

export async function revokeAllSessions(c: Context<AdminEnv>) {
  try {
    const id = c.req.param("id");
    const count = await revokeAllUserSessions(c.get("organizationId"), id);
    if (count === null) {
      return c.json({ error: "User not found" }, 404);
    }

    logger.info({ userId: id, count }, "All user sessions revoked");

    return c.json({ success: true, count });
  } catch (error) {
    logger.error({ error }, "Failed to revoke all sessions");
    return c.json({ error: "Failed to revoke all sessions" }, 500);
  }
}
