import { createHash } from "node:crypto";
import { redisService } from "@/utils/redis";

/**
 * Better Auth's email-verification token is a signed JWT that names the email
 * address but not the application. Since the same address can be a user of
 * several applications, a link minted for app B would otherwise verify the
 * same address in app A. Each token is therefore bound to the application(s)
 * it was sent for, keyed by its hash, and the tenant hook rejects a mismatch.
 *
 * It is a set, not a single value: the JWT is deterministic, so two apps that
 * send a verification to the same address within the same second mint the
 * same token. Both links went to the same inbox, so both apps are legitimate.
 *
 * Magic-link and password-reset tokens need no binding: they are rows in the
 * `verifications` table, whose identifiers are already tenant-namespaced.
 */
const PREFIX = "au1h:email-token:";

function keyFor(token: string): string {
  return PREFIX + createHash("sha256").update(token).digest("hex");
}

export async function bindTokenToApp(
  token: string,
  slug: string,
  ttlSeconds: number
): Promise<void> {
  const key = keyFor(token);
  await redisService
    .getClient()
    .multi()
    .sadd(key, slug)
    .expire(key, ttlSeconds)
    .exec();
}

/** Was this token sent on behalf of `slug`? False when unknown or expired. */
export async function isTokenBoundToApp(
  token: string,
  slug: string
): Promise<boolean> {
  return (await redisService.getClient().sismember(keyFor(token), slug)) === 1;
}
