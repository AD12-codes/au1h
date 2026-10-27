import type { Context } from "hono";
import { getConnInfo } from "hono/bun";

/**
 * Header the Hono layer sets to the client IP it determined, so Better Auth's
 * rate limiter and session records use the same value. Any copy sent by the
 * client is discarded first.
 */
export const CLIENT_IP_HEADER = "x-au1h-client-ip";

/**
 * Client IP. `x-forwarded-for` is only honoured when au1h is told it sits
 * behind a trusted proxy (`AU1H_TRUST_PROXY=true`), and then the *last* entry
 * is used: that is the one the trusted proxy appended, while earlier entries
 * are whatever the client sent. Otherwise the socket address is used.
 */
export function clientIp(c: Context): string {
  if (process.env.AU1H_TRUST_PROXY === "true") {
    const forwarded = c.req.header("x-forwarded-for");
    if (forwarded) {
      const hops = forwarded.split(",").map((h) => h.trim());
      const last = hops.at(-1);
      if (last) {
        return last;
      }
    }
  }
  try {
    return getConnInfo(c).remote.address ?? "unknown";
  } catch {
    return "unknown";
  }
}
