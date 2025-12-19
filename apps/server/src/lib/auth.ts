import { type BetterAuthOptions, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { admin, jwt, openAPI, organization } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  accounts,
  applications,
  invitations,
  jwks,
  members,
  organizations,
  sessions,
  users,
  verifications,
} from "@/db/schema/auth";
import { logger } from "@/utils/logger";
import { redisService } from "@/utils/redis";

// Map of known origins to application slugs (for OAuth callback detection)
const ORIGIN_APP_MAP: Record<string, string> = {
  "http://localhost:4445": "admin-portal",
  "https://admin.au1h.com": "admin-portal",
};

/** Parse cookies from header string */
function parseCookies(cookieHeader: string): Record<string, string> {
  return Object.fromEntries(
    cookieHeader.split(";").map((c) => {
      const [key, ...val] = c.trim().split("=");
      return [key, val.join("=")];
    })
  );
}

/** Get app slug from OAuth state cookie (contains callback URL) */
function getAppSlugFromOAuthState(
  cookies: Record<string, string>
): string | null {
  const state = cookies["better-auth.state"];
  if (!state) {
    return null;
  }

  try {
    const decoded = decodeURIComponent(state);
    for (const [origin, slug] of Object.entries(ORIGIN_APP_MAP)) {
      if (decoded.includes(origin)) {
        return slug;
      }
    }
  } catch {
    // Decoding failed
  }
  return null;
}

/**
 * Get application slug from request context
 * Checks: header → origin → OAuth state cookie
 */
function getAppSlugFromRequest(ctx: { headers?: Headers }): string | null {
  // 1. Check x-app-id header (direct API calls)
  const headerSlug = ctx.headers?.get("x-app-id");
  if (headerSlug) {
    return headerSlug;
  }

  // 2. Check origin header (some OAuth callbacks)
  const origin = ctx.headers?.get("origin");
  if (origin && ORIGIN_APP_MAP[origin]) {
    return ORIGIN_APP_MAP[origin];
  }

  // 3. Check OAuth state cookie (OAuth callbacks)
  const cookieHeader = ctx.headers?.get("cookie") ?? "";
  const cookies = parseCookies(cookieHeader);
  const stateSlug = getAppSlugFromOAuthState(cookies);
  if (stateSlug) {
    return stateSlug;
  }

  logger.warn("No app context found");
  return null;
}

/**
 * Resolve application ID from slug, validating it exists and is active
 */
async function resolveApplicationFromSlug(
  appSlug: string
): Promise<{ id: string; isActive: boolean } | null> {
  const app = await db
    .select({ id: applications.id, isActive: applications.isActive })
    .from(applications)
    .where(eq(applications.slug, appSlug))
    .limit(1);

  if (!app.length) {
    logger.warn({ appSlug }, "Application not found");
    return null;
  }

  return app[0];
}

await redisService.connect();
const redis = redisService.getClient();

export const auth = betterAuth<BetterAuthOptions>({
  baseURL: process.env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      applications,
      users,
      sessions,
      accounts,
      verifications,
      jwks,
      organizations,
      members,
      invitations,
    },
  }),
  user: {
    modelName: "users",
    additionalFields: {
      applicationId: {
        type: "string",
        required: true,
        input: false, // Don't allow user to set this directly
      },
    },
  },
  session: {
    modelName: "sessions",
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
    storeSessionInDatabase: true, // Store sessions in DB even with secondary storage (Redis)
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 minutes
    },
    additionalFields: {
      applicationId: {
        type: "string",
        required: true,
        input: false,
      },
    },
  },
  account: {
    modelName: "accounts",
    additionalFields: {
      applicationId: {
        type: "string",
        required: true,
        input: false,
      },
    },
  },
  verification: {
    modelName: "verifications",
  },
  advanced: {
    defaultCookieAttributes: {
      sameSite: "none",
      secure: true,
      httpOnly: true,
    },
  },
  secondaryStorage: {
    get: async (key) => await redis.get(key),
    set: async (key, value, ttl) => {
      if (ttl) {
        await redis.set(key, value, "EX", ttl);
      } else {
        await redis.set(key, value);
      }
    },
    delete: async (key) => {
      await redis.del(key);
    },
  },
  trustedOrigins: [process.env.CORS_ORIGIN || ""],

  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID as string,
      clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
    },
  },
  plugins: [
    jwt({
      jwt: {
        definePayload: ({ user }) => {
          // Include application context in JWT for gateway validation
          return {
            sub: user.id,
            email: user.email,
            name: user.name,
            applicationId: (user as { applicationId?: string }).applicationId,
          };
        },
      },
    }),
    admin(),
    openAPI(),
    organization(),
  ],

  // ============================================================================
  // DATABASE HOOKS - Inject application_id into records
  // ============================================================================
  databaseHooks: {
    user: {
      create: {
        before: async (user, ctx) => {
          const appSlug = getAppSlugFromRequest({ headers: ctx?.headers });

          if (!appSlug) {
            logger.error(
              "User creation failed: No app context (header or cookie)"
            );
            throw new APIError("BAD_REQUEST", {
              message: "x-app-id header is required",
            });
          }

          const app = await resolveApplicationFromSlug(appSlug);
          if (!app) {
            logger.error(
              { appSlug },
              "User creation failed: Application not found"
            );
            throw new APIError("BAD_REQUEST", {
              message: "Invalid application",
            });
          }

          if (!app.isActive) {
            logger.error(
              { appSlug },
              "User creation failed: Application inactive"
            );
            throw new APIError("FORBIDDEN", {
              message: "Application is not active",
            });
          }

          logger.info(
            { applicationId: app.id, email: user.email },
            "Creating user"
          );
          return {
            data: {
              ...user,
              applicationId: app.id,
            },
          };
        },
      },
    },
    session: {
      create: {
        before: async (session, _ctx) => {
          // Get user to copy their applicationId to the session
          const userRecord = await db
            .select({ applicationId: users.applicationId })
            .from(users)
            .where(eq(users.id, session.userId))
            .limit(1);

          if (!(userRecord.length && userRecord[0].applicationId)) {
            logger.error(
              { userId: session.userId },
              "Session creation failed: No app context"
            );
            throw new APIError("INTERNAL_SERVER_ERROR", {
              message: "User application context not found",
            });
          }

          return {
            data: {
              ...session,
              applicationId: userRecord[0].applicationId,
            },
          };
        },
      },
    },
    account: {
      create: {
        before: async (account, _ctx) => {
          // Get user to copy their applicationId to the account
          const userRecord = await db
            .select({ applicationId: users.applicationId })
            .from(users)
            .where(eq(users.id, account.userId))
            .limit(1);

          if (!(userRecord.length && userRecord[0].applicationId)) {
            logger.error(
              { userId: account.userId },
              "Account creation failed: No app context"
            );
            throw new APIError("INTERNAL_SERVER_ERROR", {
              message: "User application context not found",
            });
          }

          return {
            data: {
              ...account,
              applicationId: userRecord[0].applicationId,
            },
          };
        },
      },
    },
  },
});
