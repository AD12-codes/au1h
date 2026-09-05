/** biome-ignore-all lint/suspicious/noExplicitAny: Better Auth internal types */

import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { accounts, members, organizations, users } from "@/db/schema/auth";
import { logger } from "@/utils/logger";

/**
 * Creates a findUserByEmail override that filters by applicationId
 * This is critical for multi-tenancy: same email can exist in different apps
 */
export function createFindUserByEmail(applicationId: string | null) {
  return async (email: string, options?: { includeAccounts: boolean }) => {
    logger.info(
      { email, applicationId, includeAccounts: options?.includeAccounts },
      "🔥 findUserByEmail override called"
    );

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
}

/**
 * Creates a createUser override that includes applicationId and auto-creates org for admin users
 */
export function createCreateUser(applicationId: string | null) {
  return async (userData: {
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
      applicationId: applicationId || null, // Ensure null, not empty string
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
      await createOrganizationForUser(userId, userData.name, now);
    }

    return newUser as typeof users.$inferSelect;
  };
}

/**
 * Creates a createOAuthUser override for OAuth signups with applicationId
 */
export function createCreateOAuthUser(applicationId: string | null) {
  return async (
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

    const newUser = {
      id: userId,
      applicationId: applicationId || null, // Ensure null, not empty string
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

    const newAccount = {
      id: accountId,
      userId,
      applicationId: applicationId || null, // Ensure null, not empty string
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

    logger.info({ accountToInsert: newAccount }, "🔥 About to insert account");

    try {
      await db.insert(accounts).values(newAccount);
      logger.info(
        {
          accountId: newAccount.id,
          ghAccountId: newAccount.accountId,
          providerId: newAccount.providerId,
        },
        "🔥 Account inserted successfully"
      );
    } catch (error) {
      logger.error(
        { error, accountId: newAccount.id },
        "❌ Failed to insert account!"
      );
      throw error;
    }

    logger.info(
      { userId, email: userData.email, applicationId },
      "🔥 Created OAuth user with applicationId"
    );

    // Auto-create organization for admin portal users
    if (!applicationId) {
      await createOrganizationForUser(userId, userData.name, now);
    }

    return {
      user: newUser as any,
      account: newAccount as any,
    };
  };
}

/**
 * Creates a findOAuthUser override that filters by applicationId
 */
export function createFindOAuthUser(applicationId: string | null) {
  // Better Auth passes 3 separate arguments: (email, accountId, providerId)
  return async (email: string, ghAccountId: string, providerId: string) => {
    logger.info(
      { email, providerId, ghAccountId, applicationId },
      "🔥 findOAuthUser override called"
    );

    // Debug: First check ALL accounts with this provider/accountId (ignore applicationId)
    const allMatchingAccounts = await db
      .select({
        id: accounts.id,
        applicationId: accounts.applicationId,
        providerId: accounts.providerId,
        accountId: accounts.accountId,
        userId: accounts.userId,
      })
      .from(accounts)
      .where(
        and(
          eq(accounts.providerId, providerId),
          eq(accounts.accountId, ghAccountId)
        )
      );

    logger.info(
      {
        searchingFor: { providerId, ghAccountId, applicationId },
        foundAccounts: allMatchingAccounts.map((a) => ({
          id: a.id,
          applicationId: a.applicationId,
          applicationIdType: typeof a.applicationId,
          applicationIdIsNull: a.applicationId === null,
        })),
      },
      "🔍 DEBUG: All matching accounts (before applicationId filter)"
    );

    const accountRecord = await db
      .select()
      .from(accounts)
      .where(
        applicationId
          ? and(
              eq(accounts.providerId, providerId),
              eq(accounts.accountId, ghAccountId),
              eq(accounts.applicationId, applicationId)
            )
          : and(
              eq(accounts.providerId, providerId),
              eq(accounts.accountId, ghAccountId),
              isNull(accounts.applicationId)
            )
      )
      .limit(1);

    if (accountRecord.length) {
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
        // Better Auth expects { user, accounts: [] } - accounts is PLURAL array
        return {
          user: userRecord[0] as any,
          accounts: [accountRecord[0] as any],
        };
      }
    }

    logger.info(
      { email, applicationId },
      "🔥 No OAuth user found for this app - will create new"
    );
    return null;
  };
}

/**
 * Creates a findAccounts override that filters by applicationId
 */
export function createFindAccounts(applicationId: string | null) {
  return async (userId: string) => {
    logger.info({ userId, applicationId }, "🔥 findAccounts override called");

    const accountRecords = await db
      .select()
      .from(accounts)
      .where(
        applicationId
          ? and(
              eq(accounts.userId, userId),
              eq(accounts.applicationId, applicationId)
            )
          : and(eq(accounts.userId, userId), isNull(accounts.applicationId))
      );

    return accountRecords as any[];
  };
}

/**
 * Creates a findAccountByProviderId override that filters by applicationId
 */
export function createFindAccountByProviderId(applicationId: string | null) {
  return async (providerId: string, accountId: string) => {
    logger.info(
      { providerId, accountId, applicationId },
      "🔥 findAccountByProviderId override called"
    );

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

/**
 * Creates a linkAccount override that includes applicationId
 */
export function createLinkAccount(applicationId: string | null) {
  return async (accountData: {
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
      applicationId: applicationId || null, // Ensure null, not empty string
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

/**
 * Helper: Create organization for a new admin portal user
 */
async function createOrganizationForUser(
  userId: string,
  userName: string,
  now: Date
) {
  const firstName = userName.split(" ")[0];
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
    logger.error({ userId, error }, "Failed to auto-create organization");
  }
}
