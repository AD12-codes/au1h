import { type BetterAuthOptions, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, jwt, openAPI, organization } from "better-auth/plugins";

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
import { redisService } from "@/utils/redis";
import { AU1H_ADMIN_APP_SLUG } from "./admin";
import { fetchAppOrigins, resolveApplicationSlugById } from "./app-context";
import {
  sessionCreateBefore,
  userCreateAfter,
  userCreateBefore,
} from "./database-hooks";
import { authBeforeHook } from "./hooks-middleware";
import { skipStateMismatch } from "./plugins";
import { withTenantScoping } from "./tenant-adapter";
import { runWithTenantStore } from "./tenant-context";
import { withTenantScopedSessions } from "./tenant-secondary-storage";

// Initialize Redis connection
await redisService.connect();
const redis = redisService.getClient();

export const auth = betterAuth<BetterAuthOptions>({
  baseURL: process.env.BETTER_AUTH_URL,

  emailAndPassword: {
    enabled: true,
  },

  // Every user/session/account query is confined to the tenant recorded in
  // request-scoped storage by hooks.before (see tenant-adapter.ts).
  database: (options) =>
    withTenantScoping(
      drizzleAdapter(db, {
        provider: "pg",
        schema: {
          applications,
          users,
          sessions,
          accounts,
          verifications,
          jwks,
          // Better Auth organization plugin expects singular names
          organization: organizations,
          member: members,
          invitation: invitations,
        },
      })(options)
    ),

  user: {
    modelName: "users",
    additionalFields: {
      applicationId: {
        type: "string",
        required: false,
        input: false,
      },
    },
  },

  session: {
    modelName: "sessions",
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
    storeSessionInDatabase: true,
    additionalFields: {
      applicationId: {
        type: "string",
        required: false,
        input: false,
      },
    },
  },

  account: {
    modelName: "accounts",
    additionalFields: {
      applicationId: {
        type: "string",
        required: false,
        input: false,
      },
    },
  },

  verification: {
    modelName: "verifications",
  },

  advanced: {
    useSecureCookies: process.env.NODE_ENV === "production",
    defaultCookieAttributes: {
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
    },
  },

  // Cached sessions are tenant-checked before Better Auth trusts them
  // (see tenant-secondary-storage.ts).
  secondaryStorage: withTenantScopedSessions({
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
  }),

  trustedOrigins: async () => {
    const cache = await fetchAppOrigins();
    if (process.env.NODE_ENV !== "production") {
      return [...cache.allOrigins, "http://localhost:*"];
    }
    return cache.allOrigins;
  },

  // Better Auth's own limiter on /api/auth/* (its defaults are strict, e.g.
  // 3 email sign-ins per 10 s per IP). On in production, off in dev unless
  // AU1H_AUTH_RATE_LIMIT says otherwise. Shared across instances via Redis.
  rateLimit: {
    enabled: process.env.AU1H_AUTH_RATE_LIMIT
      ? process.env.AU1H_AUTH_RATE_LIMIT === "true"
      : process.env.NODE_ENV === "production",
    storage: "secondary-storage",
  },

  socialProviders: {
    ...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
      ? {
          github: {
            clientId: process.env.GITHUB_CLIENT_ID,
            clientSecret: process.env.GITHUB_CLIENT_SECRET,
          },
        }
      : {}),
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          },
        }
      : {}),
  },

  plugins: [
    // Dev-only escape hatch for cross-port localhost OAuth; must be opted into.
    ...(process.env.NODE_ENV !== "production" &&
    process.env.AU1H_SKIP_OAUTH_STATE_CHECK === "true"
      ? [skipStateMismatch()]
      : []),
    jwt({
      jwt: {
        // `aud` is the application slug (or the reserved admin slug), so a token
        // minted for one application does not verify at another's backend.
        definePayload: async ({ user }) => {
          const applicationId =
            (user as { applicationId?: string | null }).applicationId ?? null;
          const aud = applicationId
            ? ((await resolveApplicationSlugById(applicationId)) ??
              applicationId)
            : AU1H_ADMIN_APP_SLUG;
          return {
            sub: user.id,
            email: user.email,
            name: user.name,
            applicationId,
            aud,
          };
        },
      },
    }),
    admin(),
    openAPI(),
    organization(),
  ],

  hooks: {
    before: authBeforeHook,
  },

  databaseHooks: {
    user: {
      create: {
        before: userCreateBefore,
        after: userCreateAfter,
      },
    },
    session: {
      create: {
        before: sessionCreateBefore,
      },
    },
  },
});

/**
 * Handle a raw `/api/auth/*` request inside a fresh tenant store.
 */
export function handleAuthRequest(request: Request): Promise<Response> {
  return runWithTenantStore(() => auth.handler(request));
}

/**
 * Resolve the session for an incoming request's headers.
 *
 * Wraps `auth.api.getSession` in a tenant store so that hooks.before can
 * record the tenant and the scoped adapter can enforce it. Calling
 * `auth.api.*` directly, outside `runWithTenantStore`, throws.
 */
export function getSessionForRequest(headers: Headers) {
  return runWithTenantStore(() => auth.api.getSession({ headers }));
}

/**
 * Resolve the session for an admin-API request (`/api/v1/*`).
 *
 * The admin API is only ever used by the au1h admin portal, so the tenant is
 * forced to the admin scope regardless of what the caller sent in `x-app-id`.
 * A client-application session therefore never resolves here.
 */
export function getAdminSession(headers: Headers) {
  const adminHeaders = new Headers(headers);
  adminHeaders.set("x-app-id", AU1H_ADMIN_APP_SLUG);
  return getSessionForRequest(adminHeaders);
}

/**
 * Mint a short-lived, au1h-signed token for the gateway→backend hop.
 *
 * Backends behind the proxy can verify `x-au1h-token` against our JWKS
 * (`iss` = au1h, `aud` = their slug) to be sure the request actually came
 * through au1h and not straight from the internet — without any shared secret.
 */
export async function mintProxyToken(input: {
  applicationId: string;
  applicationSlug: string;
  user: { id: string; email: string };
  method: string;
  path: string;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const headers = new Headers({ "x-app-id": input.applicationSlug });
  const { token } = await runWithTenantStore(() =>
    serverOnlyApi.signJWT({
      headers,
      body: {
        payload: {
          sub: input.user.id,
          email: input.user.email,
          applicationId: input.applicationId,
          aud: input.applicationSlug,
          iat: now,
          exp: now + 60,
          req: `${input.method.toUpperCase()} ${input.path}`,
        },
      },
    })
  );
  return token;
}

/**
 * The jwt plugin's `signJWT` endpoint is marked SERVER_ONLY, which removes it
 * from the inferred `auth.api` type although it exists at runtime.
 */
const serverOnlyApi = auth.api as unknown as {
  signJWT: (input: {
    headers: Headers;
    body: { payload: Record<string, unknown> };
  }) => Promise<{ token: string }>;
};
