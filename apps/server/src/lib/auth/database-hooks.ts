import { APIError } from "better-auth/api";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { members, users } from "@/db/schema/auth";
import { logger } from "@/utils/logger";

/**
 * Session creation hook - adds applicationId and activeOrganizationId
 */
export const sessionCreateBefore = async (
  session: {
    userId: string;
    expiresAt: Date;
    ipAddress?: string | null;
    userAgent?: string | null;
  },
  _ctx: unknown
) => {
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
      applicationId: appId,
      activeOrganizationId: activeOrgId,
    },
  };
};

/**
 * Account creation hook - copies applicationId from user
 */
export const accountCreateBefore = async (
  account: {
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
  },
  _ctx: unknown
) => {
  // Get user to copy their applicationId to the account
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
      applicationId: appId,
    },
  };
};
