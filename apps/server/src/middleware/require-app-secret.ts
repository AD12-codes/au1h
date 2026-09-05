import type { Context, Next } from "hono";
import { verifySecret } from "@/applications/secret";
import { getApplicationCredentialsBySlug } from "@/applications/service";
import { logger } from "@/utils/logger";

export type AppEnv = {
  Variables: {
    app: { id: string; slug: string; organizationId: string };
  };
};

/**
 * Server-to-server authentication for `/api/apps/*`.
 *
 * The caller (a product backend) presents `x-app-id: <slug>` and
 * `x-app-secret: <secret>`. Secrets are stored hashed; a legacy plaintext row
 * never verifies, so owners of pre-hashing applications must regenerate.
 */
export async function requireAppSecret(c: Context<AppEnv>, next: Next) {
  const slug = c.req.header("x-app-id");
  const secret = c.req.header("x-app-secret");
  if (!(slug && secret)) {
    return c.json(
      {
        error: "Unauthorized",
        message: "x-app-id and x-app-secret are required",
      },
      401
    );
  }

  const app = await getApplicationCredentialsBySlug(slug);
  if (!(app?.isActive && (await verifySecret(secret, app.secretHash)))) {
    logger.warn({ slug }, "Rejected app-secret authentication");
    return c.json(
      { error: "Unauthorized", message: "Invalid application credentials" },
      401
    );
  }

  c.set("app", {
    id: app.id,
    slug: app.slug,
    organizationId: app.organizationId,
  });
  await next();
}
