import { eq } from "drizzle-orm";
import { db } from "@/db";
import { applications } from "@/db/schema/auth";
import { logger } from "@/utils/logger";
import { AU1H_ADMIN_APP_SLUG } from "../auth/admin";
import { getTenantScope } from "../auth/tenant-context";
import { providerFromEnv } from "./providers";
import { type AppBranding, type EmailKind, render } from "./templates";
import { bindTokenToApp } from "./token-binding";
import type { EmailProvider } from "./types";

/** Must match `emailVerification.expiresIn` in the auth config. */
export const VERIFY_EMAIL_TOKEN_TTL_SECONDS = 60 * 60 * 24;

let provider: EmailProvider | null = null;
export function emailProvider(): EmailProvider {
  provider ??= providerFromEnv();
  return provider;
}

/** The current request's application, for branding and for the `app` link param. */
async function currentApp(): Promise<{ slug: string; branding: AppBranding }> {
  const scope = getTenantScope();
  if (!scope || scope.applicationId === null) {
    return {
      slug: AU1H_ADMIN_APP_SLUG,
      branding: {
        name: process.env.AU1H_ADMIN_NAME ?? "au1h admin",
        origin: process.env.CORS_ORIGIN?.split(",")[0] ?? null,
      },
    };
  }
  const [app] = await db
    .select({
      slug: applications.slug,
      name: applications.name,
      logo: applications.logo,
      origins: applications.allowedOrigins,
    })
    .from(applications)
    .where(eq(applications.id, scope.applicationId))
    .limit(1);
  if (!app) {
    throw new Error("application for the current request no longer exists");
  }
  return {
    slug: app.slug,
    branding: {
      name: app.name,
      logo: app.logo,
      origin: app.origins?.split(",")[0]?.trim() ?? null,
    },
  };
}

/**
 * Better Auth builds links to its own endpoints (`/verify-email?token=…`,
 * `/reset-password/<token>`, `/magic-link/verify?token=…`). Those are opened
 * from an email, in a fresh browser, with no `x-app-id` header or cookie, so
 * the tenant is carried in the URL instead and read back in hooks.before.
 */
export function withTenant(url: string, slug: string): string {
  const u = new URL(url);
  u.searchParams.set("app", slug);
  return u.toString();
}

/** Send a transactional email for the application of the current request. */
export async function sendAppEmail(
  to: string,
  email: EmailKind
): Promise<void> {
  const { slug, branding } = await currentApp();
  const tenantEmail: EmailKind =
    "url" in email ? { ...email, url: withTenant(email.url, slug) } : email;
  if (tenantEmail.kind === "verify-email") {
    const token = new URL(tenantEmail.url).searchParams.get("token");
    if (token) {
      await bindTokenToApp(token, slug, VERIFY_EMAIL_TOKEN_TTL_SECONDS);
    }
  }
  const message = render(branding, to, tenantEmail);
  try {
    await emailProvider().send(message);
    logger.info(
      { to, kind: email.kind, app: slug, provider: emailProvider().name },
      "Email sent"
    );
  } catch (error) {
    logger.error(
      { error, to, kind: email.kind, app: slug },
      "Email delivery failed"
    );
    throw error;
  }
}
