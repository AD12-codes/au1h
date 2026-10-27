import type { Context, Next } from "hono";
import { logger } from "@/utils/logger";
import { redisService } from "@/utils/redis";
import { clientIp } from "./client-ip";

export interface RateLimitOptions {
  /** Namespace for the Redis keys, e.g. "admin-api". */
  name: string;
  /** Requests allowed per window. */
  limit: number;
  windowSeconds: number;
  /** Extra key material beyond the client IP (e.g. the app slug). */
  keyFor?: (c: Context) => string;
}

/**
 * Fixed-window rate limiter backed by Redis (shared across instances).
 * Fails open if Redis is unavailable: availability over strictness.
 */
export function rateLimit(options: RateLimitOptions) {
  const { name, limit, windowSeconds, keyFor } = options;

  return async (c: Context, next: Next) => {
    if (!redisService.isReady()) {
      return next();
    }

    const window = Math.floor(Date.now() / 1000 / windowSeconds);
    const subject = `${clientIp(c)}${keyFor ? `:${keyFor(c)}` : ""}`;
    const key = `ratelimit:${name}:${subject}:${window}`;

    let count: number;
    try {
      const redis = redisService.getClient();
      count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, windowSeconds);
      }
    } catch (error) {
      logger.warn({ error }, "Rate limiter unavailable; allowing request");
      return next();
    }

    const remaining = Math.max(0, limit - count);
    c.header("X-RateLimit-Limit", String(limit));
    c.header("X-RateLimit-Remaining", String(remaining));

    if (count > limit) {
      const resetIn =
        windowSeconds - (Math.floor(Date.now() / 1000) % windowSeconds);
      c.header("Retry-After", String(resetIn));
      logger.warn({ name, subject }, "Rate limit exceeded");
      return c.json({ error: "Too Many Requests" }, 429);
    }

    return next();
  };
}

/** Read `<ENV>` as a positive integer, else the default. */
export function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
