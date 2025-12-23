/** biome-ignore-all lint/suspicious/noExplicitAny: <not important> */
import {
  type BetterAuthOptions,
  type BetterAuthPlugin,
  betterAuth,
} from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { admin, jwt, openAPI, organization } from "better-auth/plugins";
import { and, eq, isNull } from "drizzle-orm";

/**
 * Plugin to skip OAuth state cookie check in development.
 * Cross-origin localhost setups cause state_mismatch errors because
 * cookies aren't shared between different localhost ports.
 * SECURITY: Only use in development!
 */
function skipStateMismatch(): BetterAuthPlugin {
  return {
    id: "skip-state-mismatch",
    init(ctx) {
      return {
        context: {
          ...ctx,
          oauthConfig: {
            skipStateCookieCheck: true,
            ...ctx?.oauthConfig,
          },
        },
      };
    },
  };
}

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

// Cache for application origins (refreshed periodically)
interface AppOriginsCache {
  originToSlug: Map<string, string>;
  allOrigins: string[];
  lastFetched: number;
}

let appOriginsCache: AppOriginsCache | null = null;
const APP_ORIGINS_CACHE_TTL = 60 * 1000; // 1 minute

async function fetchAppOrigins(): Promise<AppOriginsCache> {
  const now = Date.now();

  if (
    appOriginsCache &&
    now - appOriginsCache.lastFetched < APP_ORIGINS_CACHE_TTL
  ) {
    return appOriginsCache;
  }

  const apps = await db
    .select({
      slug: applications.slug,
      allowedOrigins: applications.allowedOrigins,
    })
    .from(applications)
    .where(eq(applications.isActive, true));

  const originToSlug = new Map<string, string>();
  const allOrigins: string[] = [];

  for (const app of apps) {
    if (app.allowedOrigins) {
      const origins = app.allowedOrigins.split(",").map((o) => o.trim());
      for (const origin of origins) {
        if (origin) {
          originToSlug.set(origin, app.slug);
          allOrigins.push(origin);
        }
      }
    }
  }

  // Add env origins as fallback
  const envOrigin = process.env.CORS_ORIGIN;
  if (envOrigin) {
    allOrigins.push(envOrigin);
  }

  appOriginsCache = { originToSlug, allOrigins, lastFetched: now };
  return appOriginsCache;
}

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
  cookies: Record<string, string>,
  originToSlug: Map<string, string>
): string | null {
  const state = cookies["better-auth.state"];
  if (!state) {
    return null;
  }

  try {
    const decoded = decodeURIComponent(state);
    for (const [origin, slug] of originToSlug.entries()) {
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
 * Get application slug from request context (async version)
 * Checks: header → au1h-app-id cookie → origin → OAuth state cookie
 *
 * IMPORTANT: Returns null immediately for au1h admin origin requests.
 * This prevents au1h-app-id cookies from other apps interfering with admin portal.
 */
async function getAppSlugFromRequestAsync(ctx: {
  headers?: Headers;
  path?: string;
}): Promise<string | null> {
  // Check if request is from au1h admin - if so, return null immediately
  // This prevents au1h-app-id cookies from other apps interfering
  const reqOrigin = ctx.headers?.get("origin");
  const reqReferer = ctx.headers?.get("referer");
  const isAdminOrigin = AU1H_ADMIN_ORIGINS.some(
    (adminUrl) =>
      reqOrigin?.startsWith(adminUrl) || reqReferer?.startsWith(adminUrl)
  );
  if (isAdminOrigin) {
    logger.debug(
      { origin: reqOrigin, referer: reqReferer },
      "Admin origin detected, returning null appSlug"
    );
    return null;
  }

  // Check if this is an OAuth callback (no origin/referer from GitHub redirect)
  const isOAuthCallback = ctx.path?.startsWith("/callback/");
  const hasNoOrigin = !(reqOrigin || reqReferer);

  // 1. Check x-app-id header (direct API calls)
  const headerSlug = ctx.headers?.get("x-app-id");
  if (headerSlug) {
    logger.debug({ headerSlug }, "Found app slug from x-app-id header");
    return headerSlug;
  }

  const cookieHeader = ctx.headers?.get("cookie") ?? "";
  const cookies = parseCookies(cookieHeader);

  // 2. Check au1h-app-id cookie - BUT skip for OAuth callbacks without origin
  // This prevents stale cookies from other apps interfering with admin OAuth
  if (isOAuthCallback && hasNoOrigin) {
    logger.debug(
      "Skipping au1h-app-id cookie check for OAuth callback without origin"
    );
  } else {
    const cookieSlug = cookies["au1h-app-id"];
    if (cookieSlug) {
      logger.debug({ cookieSlug }, "Found app slug from au1h-app-id cookie");
      return cookieSlug;
    }
  }

  // Get cached origins
  const cache = await fetchAppOrigins();

  // 3. Check origin header
  const origin = ctx.headers?.get("origin");
  if (origin) {
    const slug = cache.originToSlug.get(origin);
    if (slug) {
      logger.debug({ origin, slug }, "Found app slug from origin");
      return slug;
    }
  }

  // 4. Check OAuth state cookie (OAuth callbacks)
  const stateSlug = getAppSlugFromOAuthState(cookies, cache.originToSlug);
  if (stateSlug) {
    logger.debug({ stateSlug }, "Found app slug from OAuth state");
    return stateSlug;
  }

  logger.warn("No app context found in header, cookie, or origin");
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

// ============================================================================
// AU1H ADMIN ORIGIN DETECTION
// Only requests from au1h admin UI can create organizations
// ============================================================================
const AU1H_ADMIN_ORIGINS = [
  "http://localhost:4445",
  process.env.AU1H_ADMIN_URL,
].filter(Boolean) as string[];

/**
 * Check if request originates from au1h admin UI
 * This is used to determine if we should create an organization on signup
 *
 * For direct requests: checks origin/referer
 * For OAuth callbacks: checks the OAuth state (from cookie or URL param)
 */
function isAu1hAdminRequest(headers?: Headers, url?: string): boolean {
  if (!headers) {
    return false;
  }

  const origin = headers.get("origin");
  const referer = headers.get("referer");
  const cookieHeader = headers.get("cookie") ?? "";
  const cookies = parseCookies(cookieHeader);

  // Log for debugging
  logger.info(
    { origin, referer, url, AU1H_ADMIN_ORIGINS },
    "🔍 Checking if au1h admin request"
  );

  // Check 1: Direct request from admin origin
  const isDirectAdmin = AU1H_ADMIN_ORIGINS.some(
    (adminUrl) => origin?.startsWith(adminUrl) || referer?.startsWith(adminUrl)
  );

  if (isDirectAdmin) {
    logger.info(
      { isAdmin: true, reason: "direct" },
      "🔍 isAu1hAdminRequest result"
    );
    return true;
  }

  // Check 2: OAuth callback - check cookie state
  const oauthStateCookie = cookies["better-auth.state"];
  if (oauthStateCookie) {
    try {
      const decoded = decodeURIComponent(oauthStateCookie);
      const isOAuthFromAdmin = AU1H_ADMIN_ORIGINS.some((adminUrl) =>
        decoded.includes(adminUrl)
      );
      if (isOAuthFromAdmin) {
        logger.info(
          { isAdmin: true, reason: "oauth-cookie" },
          "🔍 isAu1hAdminRequest result"
        );
        return true;
      }
    } catch {
      // Decoding failed, continue
    }
  }

  // Check 3: OAuth callback - check URL state parameter (cookies don't cross ports)
  if (url) {
    try {
      const urlObj = new URL(url, "http://localhost");
      const stateParam = urlObj.searchParams.get("state");
      if (stateParam) {
        // State is base64 encoded JSON, try to decode
        try {
          const decoded = atob(stateParam);
          const isOAuthFromAdmin = AU1H_ADMIN_ORIGINS.some((adminUrl) =>
            decoded.includes(adminUrl)
          );
          if (isOAuthFromAdmin) {
            logger.info(
              { isAdmin: true, reason: "oauth-url-state" },
              "🔍 isAu1hAdminRequest result"
            );
            return true;
          }
        } catch {
          // Not base64, try URL decode
          const decoded = decodeURIComponent(stateParam);
          const isOAuthFromAdmin = AU1H_ADMIN_ORIGINS.some((adminUrl) =>
            decoded.includes(adminUrl)
          );
          if (isOAuthFromAdmin) {
            logger.info(
              { isAdmin: true, reason: "oauth-url-state-decoded" },
              "🔍 isAu1hAdminRequest result"
            );
            return true;
          }
        }
      }
    } catch {
      // URL parsing failed, continue
    }
  }

  logger.info({ isAdmin: false }, "🔍 isAu1hAdminRequest result");
  return false;
}

export const auth = betterAuth<BetterAuthOptions>({
  baseURL: process.env.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
  },
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
        required: false, // NULL for admin portal, set for client apps
        input: false,
      },
    },
  },
  session: {
    modelName: "sessions",
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
    // With DB + Redis, don't use cookie cache - it causes logout issues
    // Cookie cache stores session in cookie itself (stateless), which doesn't
    // get invalidated properly on logout
    storeSessionInDatabase: true,
    additionalFields: {
      applicationId: {
        type: "string",
        required: false, // NULL for admin portal sessions
        input: false,
      },
    },
  },
  account: {
    modelName: "accounts",
    additionalFields: {
      applicationId: {
        type: "string",
        required: false, // NULL for admin portal accounts
        input: false,
      },
    },
  },
  verification: {
    modelName: "verifications",
  },
  advanced: {
    // Only use secure cookies in production (HTTPS)
    // localhost (HTTP) cannot set/clear secure cookies
    useSecureCookies: process.env.NODE_ENV === "production",
    defaultCookieAttributes: {
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      secure: process.env.NODE_ENV === "production",
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
  trustedOrigins: async () => {
    const cache = await fetchAppOrigins();
    // In development, also allow localhost
    if (process.env.NODE_ENV !== "production") {
      return [...cache.allOrigins, "http://localhost:*"];
    }
    return cache.allOrigins;
  },

  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID as string,
      clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
    },
  },
  plugins: [
    // Skip state check in development (cross-origin localhost issue)
    ...(process.env.NODE_ENV !== "production" ? [skipStateMismatch()] : []),
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
    organization({
      // Auto-create organization for new users
    }),
  ],

  // ============================================================================
  // HOOKS - Override internal adapter for multi-tenant user lookup
  // This is critical: Better Auth looks up users by email only, but we need
  // (email + applicationId) to support same email across different apps
  // ============================================================================
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      logger.info(
        { path: ctx.path, method: ctx.method },
        "🔥 hooks.before triggered"
      );

      // Check if request is from au1h admin UI (direct origin check)
      const origin = ctx.headers?.get("origin");
      const referer = ctx.headers?.get("referer");
      const isDirectAdminRequest = AU1H_ADMIN_ORIGINS.some(
        (adminUrl) =>
          origin?.startsWith(adminUrl) || referer?.startsWith(adminUrl)
      );

      // Get client IP for Redis key (used to track admin OAuth flows)
      const clientIp =
        ctx.headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        ctx.headers?.get("x-real-ip") ||
        "unknown";
      const adminOAuthKey = `oauth-admin:${clientIp}`;

      // Check Redis for admin OAuth marker (set during signin, checked on callback)
      const isOAuthCallback = ctx.path?.startsWith("/callback/");
      let hasAdminOAuthMarker = false;
      if (isOAuthCallback) {
        const marker = await redis.get(adminOAuthKey);
        hasAdminOAuthMarker = marker === "true";
        if (hasAdminOAuthMarker) {
          logger.info({ clientIp }, "🔥 Found admin OAuth marker in Redis");
          // Clear it after use
          await redis.del(adminOAuthKey);
        }
      }

      // Admin request = direct from admin UI OR has admin OAuth marker (for callbacks)
      const isAdminRequest = isDirectAdminRequest || hasAdminOAuthMarker;

      logger.info(
        {
          isDirectAdminRequest,
          hasAdminOAuthMarker,
          isAdminRequest,
          origin,
          referer,
          clientIp,
        },
        "🔍 Admin request check"
      );

      // If OAuth signin from admin UI, store marker in Redis for the callback
      const isOAuthSignin =
        ctx.path?.startsWith("/signin/") && ctx.method === "GET";

      logger.info(
        {
          path: ctx.path,
          method: ctx.method,
          isOAuthSignin,
          isDirectAdminRequest,
        },
        "🔍 OAuth signin check"
      );

      if (isOAuthSignin && isDirectAdminRequest) {
        logger.info(
          { clientIp, adminOAuthKey },
          "🔥 Setting admin OAuth marker in Redis"
        );
        await redis.set(adminOAuthKey, "true", "EX", 300); // 5 min TTL
      }

      // For admin requests, skip app slug resolution entirely
      // Admin portal doesn't need applicationId
      let appSlug: string | null = null;
      let applicationId: string | null = null;

      if (!isAdminRequest) {
        // Get applicationId from header or cookie (for OAuth callbacks)
        appSlug = await getAppSlugFromRequestAsync({
          headers: ctx.headers,
          path: ctx.path,
        });

        logger.info(
          { appSlug, isAdminRequest },
          "🔥 Resolved appSlug from request"
        );

        if (appSlug) {
          const app = await resolveApplicationFromSlug(appSlug);

          // If app slug provided but app doesn't exist or is inactive → 401
          if (!app) {
            throw new APIError("UNAUTHORIZED", {
              message:
                "App not registered. Please contact your organization owner.",
            });
          }
          if (!app.isActive) {
            throw new APIError("UNAUTHORIZED", {
              message:
                "App is inactive. Please contact your organization owner.",
            });
          }

          applicationId = app.id;
        } else {
          // Skip 401 for OAuth paths - they need to flow through, auth handled in user creation
          const isOAuthPath =
            ctx.path?.startsWith("/signin/") ||
            ctx.path?.startsWith("/callback/");
          if (!isOAuthPath) {
            // No app slug AND not from au1h admin UI AND not OAuth → 401
            throw new APIError("UNAUTHORIZED", {
              message:
                "Unauthorized: Missing application context. Ensure x-app-id header is set.",
            });
          }
          // For OAuth paths without admin context, we'll handle this in createOAuthUser
          logger.info(
            { path: ctx.path },
            "🔥 Allowing OAuth path through without app context"
          );
        }
      }

      logger.info(
        { applicationId, isAdminRequest },
        "🔥 Resolved applicationId"
      );

      // Store in context for later use (org creation check)
      (ctx.context as Record<string, unknown>).applicationId = applicationId;
      (ctx.context as Record<string, unknown>).isAdminRequest = isAdminRequest;

      // Override findUserByEmail to filter by applicationId
      ctx.context.internalAdapter.findUserByEmail = async (
        email: string,
        options?: { includeAccounts: boolean }
      ) => {
        logger.info(
          { email, applicationId, includeAccounts: options?.includeAccounts },
          "🔥 findUserByEmail override called"
        );

        // Build where clause based on applicationId
        const whereClause = applicationId
          ? and(eq(users.email, email), eq(users.applicationId, applicationId))
          : and(eq(users.email, email), isNull(users.applicationId));

        const userRecord = await db
          .select()
          .from(users)
          .where(whereClause)
          .limit(1);

        if (!userRecord.length) {
          return null;
        }

        const user = userRecord[0];

        // If accounts requested, fetch them too
        if (options?.includeAccounts) {
          const accountRecords = await db
            .select()
            .from(accounts)
            .where(eq(accounts.userId, user.id));

          return {
            user: user as any,
            accounts: accountRecords as any[],
          };
        }

        return {
          user: user as any,
          accounts: [],
        };
      };

      // Override createUser to include applicationId
      // Type assertion needed: Better Auth expects generic <T> return, but we return concrete type
      // Our implementation is compatible, just not provably so to TypeScript
      (ctx.context.internalAdapter as any).createUser = async (userData: {
        name: string;
        email: string;
        emailVerified?: boolean;
        image?: string | null;
        role?: string | null;
      }) => {
        logger.info(
          { email: userData.email, applicationId },
          "🔥 createUser override called"
        );

        const userId = crypto.randomUUID();
        const now = new Date();

        const newUser = {
          id: userId,
          applicationId, // null for admin portal, UUID for client apps
          name: userData.name,
          email: userData.email,
          emailVerified: userData.emailVerified ?? false,
          image: userData.image ?? null,
          createdAt: now,
          updatedAt: now,
          role: userData.role ?? null,
          banned: false,
          banReason: null,
          banExpires: null,
        };

        await db.insert(users).values(newUser);

        logger.info(
          { userId, email: userData.email, applicationId },
          "Created user via internalAdapter override"
        );

        // Auto-create organization for admin portal users (applicationId = null)
        if (!applicationId) {
          const firstName = userData.name.split(" ")[0];
          const orgName = `${firstName}'s Workspace`;
          const orgSlug = `${firstName.toLowerCase()}-workspace-${userId.slice(0, 8)}`;

          try {
            const orgId = crypto.randomUUID();
            const memberId = crypto.randomUUID();

            await db.insert(organizations).values({
              id: orgId,
              name: orgName,
              slug: orgSlug,
              createdAt: now,
            });

            await db.insert(members).values({
              id: memberId,
              organizationId: orgId,
              userId,
              role: "owner",
              createdAt: now,
            });

            logger.info(
              { userId, organizationId: orgId, orgName },
              "🔥 Auto-created organization for admin portal user"
            );
          } catch (error) {
            logger.error(
              { userId, error },
              "Failed to auto-create organization"
            );
          }
        }

        return newUser as typeof users.$inferSelect;
      };

      // Log available internalAdapter methods for debugging
      logger.info(
        { methods: Object.keys(ctx.context.internalAdapter) },
        "🔥 Available internalAdapter methods"
      );

      // Cast adapter once for all overrides
      const adapter = ctx.context.internalAdapter as any;

      // Override createOAuthUser - THIS is what OAuth uses to create new users!
      if (adapter.createOAuthUser) {
        adapter.createOAuthUser = async (
          userData: {
            email: string;
            name: string;
            image?: string | null;
            emailVerified?: boolean;
          },
          accountData: {
            providerId: string;
            accountId: string;
            accessToken?: string;
            refreshToken?: string;
            accessTokenExpiresAt?: Date;
            refreshTokenExpiresAt?: Date;
            scope?: string;
            idToken?: string;
          }
        ) => {
          logger.info(
            {
              email: userData.email,
              providerId: accountData.providerId,
              applicationId,
            },
            "🔥 createOAuthUser override called"
          );

          const userId = crypto.randomUUID();
          const accountId = crypto.randomUUID();
          const now = new Date();

          // Create user with applicationId
          const newUser = {
            id: userId,
            applicationId, // null for admin portal, UUID for client apps
            name: userData.name,
            email: userData.email,
            emailVerified: userData.emailVerified ?? true,
            image: userData.image ?? null,
            createdAt: now,
            updatedAt: now,
            role: "user",
            banned: false,
            banReason: null,
            banExpires: null,
          };

          // Create account with applicationId
          const newAccount = {
            id: accountId,
            userId,
            applicationId, // null for admin portal, UUID for client apps
            providerId: accountData.providerId,
            accountId: accountData.accountId,
            accessToken: accountData.accessToken ?? null,
            refreshToken: accountData.refreshToken ?? null,
            accessTokenExpiresAt: accountData.accessTokenExpiresAt ?? null,
            refreshTokenExpiresAt: accountData.refreshTokenExpiresAt ?? null,
            scope: accountData.scope ?? null,
            idToken: accountData.idToken ?? null,
            createdAt: now,
            updatedAt: now,
            password: null,
          };

          await db.insert(users).values(newUser);
          await db.insert(accounts).values(newAccount);

          logger.info(
            { userId, email: userData.email, applicationId },
            "🔥 Created OAuth user with applicationId"
          );

          // Auto-create organization for admin portal users (applicationId = null)
          if (!applicationId) {
            const firstName = userData.name.split(" ")[0];
            const orgName = `${firstName}'s Workspace`;
            const orgSlug = `${firstName.toLowerCase()}-workspace-${userId.slice(0, 8)}`;

            try {
              const orgId = crypto.randomUUID();
              const memberId = crypto.randomUUID();

              await db.insert(organizations).values({
                id: orgId,
                name: orgName,
                slug: orgSlug,
                createdAt: now,
              });

              await db.insert(members).values({
                id: memberId,
                organizationId: orgId,
                userId,
                role: "owner",
                createdAt: now,
              });

              logger.info(
                { userId, organizationId: orgId, orgName },
                "🔥 Auto-created organization for OAuth admin portal user"
              );
            } catch (error) {
              logger.error(
                { userId, error },
                "Failed to auto-create organization for OAuth user"
              );
            }
          }

          return {
            user: newUser as any,
            account: newAccount as any,
          };
        };
      }

      // Override findOAuthUser - THIS is what OAuth callback uses!
      if (adapter.findOAuthUser) {
        adapter.findOAuthUser = async (params: {
          email: string;
          providerId: string;
          accountId: string;
        }) => {
          logger.info(
            { ...params, applicationId },
            "🔥 findOAuthUser override called"
          );

          // Look for account scoped by applicationId
          const accountRecord = await db
            .select()
            .from(accounts)
            .where(
              applicationId
                ? and(
                    eq(accounts.providerId, params.providerId),
                    eq(accounts.accountId, params.accountId),
                    eq(accounts.applicationId, applicationId)
                  )
                : and(
                    eq(accounts.providerId, params.providerId),
                    eq(accounts.accountId, params.accountId),
                    isNull(accounts.applicationId)
                  )
            )
            .limit(1);

          if (accountRecord.length) {
            // Found account for this app, get the user
            const userRecord = await db
              .select()
              .from(users)
              .where(eq(users.id, accountRecord[0].userId))
              .limit(1);

            if (userRecord.length) {
              logger.info(
                { userId: userRecord[0].id, applicationId },
                "🔥 Found existing OAuth user for this app"
              );
              return {
                user: userRecord[0] as any,
                account: accountRecord[0] as any,
              };
            }
          }

          // No account found for this app - return null to trigger new user creation
          logger.info(
            { email: params.email, applicationId },
            "🔥 No OAuth user found for this app - will create new"
          );
          return null;
        };
      }

      // Override findAccounts to filter by applicationId
      // This is critical for OAuth: BA looks up account by (providerId, accountId) first
      const originalFindAccounts = ctx.context.internalAdapter.findAccounts;
      if (originalFindAccounts) {
        ctx.context.internalAdapter.findAccounts = async (userId: string) => {
          logger.info(
            { userId, applicationId },
            "🔥 findAccounts override called"
          );
          // Filter accounts by applicationId
          const accountRecords = await db
            .select()
            .from(accounts)
            .where(
              applicationId
                ? and(
                    eq(accounts.userId, userId),
                    eq(accounts.applicationId, applicationId)
                  )
                : and(
                    eq(accounts.userId, userId),
                    isNull(accounts.applicationId)
                  )
            );
          return accountRecords as any[];
        };
      }

      // Try to override account lookup by provider - this is what OAuth uses
      if (adapter.findAccountByProviderId) {
        adapter.findAccountByProviderId = async (
          providerId: string,
          accountId: string
        ) => {
          logger.info(
            { providerId, accountId, applicationId },
            "🔥 findAccountByProviderId override called"
          );
          // Filter by applicationId
          const accountRecord = await db
            .select()
            .from(accounts)
            .where(
              applicationId
                ? and(
                    eq(accounts.providerId, providerId),
                    eq(accounts.accountId, accountId),
                    eq(accounts.applicationId, applicationId)
                  )
                : and(
                    eq(accounts.providerId, providerId),
                    eq(accounts.accountId, accountId),
                    isNull(accounts.applicationId)
                  )
            )
            .limit(1);

          if (!accountRecord.length) {
            logger.info(
              { providerId, accountId, applicationId },
              "🔥 No account found for this app - will create new user"
            );
            return null;
          }
          return accountRecord[0] as any;
        };
      }

      // Override linkAccount to include applicationId - critical for email/password signup!
      if (adapter.linkAccount) {
        adapter.linkAccount = async (accountData: {
          userId: string;
          providerId: string;
          accountId: string;
          accessToken?: string | null;
          refreshToken?: string | null;
          accessTokenExpiresAt?: Date | null;
          refreshTokenExpiresAt?: Date | null;
          scope?: string | null;
          idToken?: string | null;
          password?: string | null;
        }) => {
          logger.info(
            {
              userId: accountData.userId,
              providerId: accountData.providerId,
              applicationId,
            },
            "🔥 linkAccount override called"
          );

          const newAccountId = crypto.randomUUID();
          const now = new Date();

          const newAccount = {
            id: newAccountId,
            userId: accountData.userId,
            applicationId, // null for admin portal, UUID for client apps
            providerId: accountData.providerId,
            accountId: accountData.accountId,
            accessToken: accountData.accessToken ?? null,
            refreshToken: accountData.refreshToken ?? null,
            accessTokenExpiresAt: accountData.accessTokenExpiresAt ?? null,
            refreshTokenExpiresAt: accountData.refreshTokenExpiresAt ?? null,
            scope: accountData.scope ?? null,
            idToken: accountData.idToken ?? null,
            password: accountData.password ?? null,
            createdAt: now,
            updatedAt: now,
          };

          await db.insert(accounts).values(newAccount);

          logger.info(
            {
              accountId: newAccountId,
              userId: accountData.userId,
              applicationId,
            },
            "🔥 Created account with applicationId via linkAccount override"
          );

          return newAccount as any;
        };
      }
    }),
  },

  // ============================================================================
  // DATABASE HOOKS - Post-creation hooks (user creation now handled by internalAdapter override above)
  // ============================================================================
  databaseHooks: {
    user: {
      create: {
        // Note: applicationId injection is handled by hooks.before internalAdapter.createUser override
        after: async (user) => {
          // Only create organization for au1h admin portal users (applicationId = NULL/undefined)
          // Client app users have applicationId set and should NOT get an org
          logger.info(
            { userId: user.id, applicationId: user.applicationId },
            "🔥 user.create.after hook - checking if org should be created"
          );

          // If applicationId has a value (truthy), skip org creation - this is a client app user
          if (user.applicationId) {
            logger.info(
              { userId: user.id, applicationId: user.applicationId },
              "Skipping org creation - client app user"
            );
            return;
          }

          // Auto-create organization for new admin-portal users
          // Organization name: "Anshul's Workspace" (using user's first name)
          const firstName = user.name.split(" ")[0];
          const orgName = `${firstName}'s Workspace`;
          const orgSlug = `${firstName.toLowerCase()}-workspace-${user.id.slice(0, 8)}`;

          try {
            // Create organization using Better Auth's API
            const orgId = crypto.randomUUID();
            const memberId = crypto.randomUUID();
            const now = new Date();

            // Insert organization
            await db.insert(organizations).values({
              id: orgId,
              name: orgName,
              slug: orgSlug,
              createdAt: now,
            });

            // Insert member (user as owner)
            await db.insert(members).values({
              id: memberId,
              organizationId: orgId,
              userId: user.id,
              role: "owner",
              createdAt: now,
            });

            logger.info(
              { userId: user.id, organizationId: orgId, orgName },
              "Auto-created organization for new user"
            );
          } catch (error) {
            logger.error(
              { userId: user.id, error },
              "Failed to auto-create organization for user"
            );
            // Don't throw - user is already created, org can be created manually
          }
        },
      },
    },
    session: {
      create: {
        before: async (session, _ctx) => {
          // Get user's applicationId (NULL for admin portal, set for client apps)
          const userRecord = await db
            .select({ applicationId: users.applicationId })
            .from(users)
            .where(eq(users.id, session.userId))
            .limit(1);

          if (!userRecord.length) {
            logger.error(
              { userId: session.userId },
              "Session creation failed: User not found"
            );
            throw new APIError("INTERNAL_SERVER_ERROR", {
              message: "User not found",
            });
          }

          // Get user's first organization to auto-set as active
          const memberRecord = await db
            .select({ organizationId: members.organizationId })
            .from(members)
            .where(eq(members.userId, session.userId))
            .limit(1);

          const activeOrgId = memberRecord[0]?.organizationId ?? null;
          const appId = userRecord[0].applicationId ?? null;

          logger.info(
            {
              userId: session.userId,
              applicationId: appId,
              activeOrganizationId: activeOrgId,
            },
            "Creating session"
          );

          return {
            data: {
              ...session,
              applicationId: appId, // NULL for admin portal
              activeOrganizationId: activeOrgId,
            },
          };
        },
      },
    },
    account: {
      create: {
        before: async (account, _ctx) => {
          // Get user to copy their applicationId to the account (NULL for admin portal)
          const userRecord = await db
            .select({ applicationId: users.applicationId })
            .from(users)
            .where(eq(users.id, account.userId))
            .limit(1);

          if (!userRecord.length) {
            logger.error(
              { userId: account.userId },
              "Account creation failed: User not found"
            );
            throw new APIError("INTERNAL_SERVER_ERROR", {
              message: "User not found",
            });
          }

          const appId = userRecord[0].applicationId ?? null;

          return {
            data: {
              ...account,
              applicationId: appId, // NULL for admin portal accounts
            },
          };
        },
      },
    },
  },
});
