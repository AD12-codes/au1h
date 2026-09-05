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

import { fetchAppOrigins } from "./app-context";
import { accountCreateBefore, sessionCreateBefore } from "./database-hooks";
import { authBeforeHook } from "./hooks-middleware";
import { skipStateMismatch } from "./plugins";

// Initialize Redis connection
await redisService.connect();
const redis = redisService.getClient();

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
      // Better Auth organization plugin expects singular names
      organization: organizations,
      member: members,
      invitation: invitations,
    },
  }),

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
    ...(process.env.NODE_ENV !== "production" ? [skipStateMismatch()] : []),
    jwt({
      jwt: {
        definePayload: ({ user }) => ({
          sub: user.id,
          email: user.email,
          name: user.name,
          applicationId: (user as { applicationId?: string }).applicationId,
        }),
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
    session: {
      create: {
        before: sessionCreateBefore,
      },
    },
    account: {
      create: {
        before: accountCreateBefore,
      },
    },
  },
});
