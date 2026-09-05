import {
  and,
  count,
  desc,
  eq,
  ilike,
  inArray,
  or,
  type SQL,
} from "drizzle-orm";
import { db } from "@/db";
import { applications, members, sessions, users } from "@/db/schema/auth";
import { redisService } from "@/utils/redis";

export interface User {
  id: string;
  applicationId: string | null;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  role: string | null;
  banned: boolean | null;
  banReason: string | null;
  banExpires: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserWithDetails extends User {
  applicationName: string | null;
  applicationSlug: string | null;
  sessionCount: number;
}

export interface Session {
  id: string;
  userId: string;
  applicationId: string | null;
  expiresAt: Date;
  createdAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface ListUsersParams {
  applicationId?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface ListUsersResult {
  users: UserWithDetails[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Users visible to an organization:
 * - end users of any application owned by the organization, and
 * - the organization's own members (admin-portal users, `application_id IS NULL`).
 */
function visibleToOrganization(organizationId: string): SQL {
  const orgApplications = db
    .select({ id: applications.id })
    .from(applications)
    .where(eq(applications.organizationId, organizationId));
  const orgMembers = db
    .select({ userId: members.userId })
    .from(members)
    .where(eq(members.organizationId, organizationId));

  return or(
    inArray(users.applicationId, orgApplications),
    inArray(users.id, orgMembers)
  ) as SQL;
}

const userColumns = {
  id: users.id,
  applicationId: users.applicationId,
  name: users.name,
  email: users.email,
  emailVerified: users.emailVerified,
  image: users.image,
  role: users.role,
  banned: users.banned,
  banReason: users.banReason,
  banExpires: users.banExpires,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
  applicationName: applications.name,
  applicationSlug: applications.slug,
};

export async function listUsers(
  organizationId: string,
  params: ListUsersParams
): Promise<ListUsersResult> {
  const { applicationId, search, page = 1, limit = 20 } = params;
  const offset = (page - 1) * limit;

  const conditions: SQL[] = [visibleToOrganization(organizationId)];
  if (applicationId) {
    conditions.push(eq(users.applicationId, applicationId));
  }
  if (search) {
    const searchCondition = or(
      ilike(users.email, `%${search}%`),
      ilike(users.name, `%${search}%`)
    );
    if (searchCondition) {
      conditions.push(searchCondition);
    }
  }
  const whereClause = and(...conditions);

  const userList = await db
    .select(userColumns)
    .from(users)
    .leftJoin(applications, eq(users.applicationId, applications.id))
    .where(whereClause)
    .orderBy(desc(users.createdAt))
    .limit(limit)
    .offset(offset);

  const userIds = userList.map((u) => u.id);
  const sessionCounts =
    userIds.length > 0
      ? await db
          .select({ userId: sessions.userId, count: count() })
          .from(sessions)
          .where(inArray(sessions.userId, userIds))
          .groupBy(sessions.userId)
      : [];
  const sessionCountMap = new Map(
    sessionCounts.map((s) => [s.userId, s.count])
  );

  const [totalResult] = await db
    .select({ count: count() })
    .from(users)
    .where(whereClause);
  const total = totalResult?.count || 0;

  return {
    users: userList.map((u) => ({
      ...u,
      sessionCount: sessionCountMap.get(u.id) || 0,
    })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getUser(
  organizationId: string,
  id: string
): Promise<UserWithDetails | null> {
  const [user] = await db
    .select(userColumns)
    .from(users)
    .leftJoin(applications, eq(users.applicationId, applications.id))
    .where(and(eq(users.id, id), visibleToOrganization(organizationId)))
    .limit(1);

  if (!user) {
    return null;
  }

  const [sessionCount] = await db
    .select({ count: count() })
    .from(sessions)
    .where(eq(sessions.userId, id));

  return { ...user, sessionCount: sessionCount?.count || 0 };
}

export async function getUserSessions(
  organizationId: string,
  userId: string
): Promise<Session[] | null> {
  const user = await getUser(organizationId, userId);
  if (!user) {
    return null;
  }
  return await db
    .select({
      id: sessions.id,
      userId: sessions.userId,
      applicationId: sessions.applicationId,
      expiresAt: sessions.expiresAt,
      createdAt: sessions.createdAt,
      ipAddress: sessions.ipAddress,
      userAgent: sessions.userAgent,
    })
    .from(sessions)
    .where(eq(sessions.userId, userId))
    .orderBy(desc(sessions.createdAt));
}

export async function banUser(
  organizationId: string,
  id: string,
  reason?: string,
  expiresAt?: Date
): Promise<User | null> {
  if (!(await getUser(organizationId, id))) {
    return null;
  }
  const [updated] = await db
    .update(users)
    .set({
      banned: true,
      banReason: reason || null,
      banExpires: expiresAt || null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, id))
    .returning();

  if (updated) {
    // A banned user must not keep using existing sessions.
    await revokeAllUserSessions(organizationId, id);
  }
  return updated || null;
}

export async function unbanUser(
  organizationId: string,
  id: string
): Promise<User | null> {
  if (!(await getUser(organizationId, id))) {
    return null;
  }
  const [updated] = await db
    .update(users)
    .set({
      banned: false,
      banReason: null,
      banExpires: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, id))
    .returning();

  return updated || null;
}

/**
 * Better Auth caches sessions in Redis under the raw token and keeps a per-user
 * token list; deleting only the Postgres row would leave the session usable
 * until its TTL. Clear both.
 */
async function purgeCachedSessions(userId: string, tokens: string[]) {
  const redis = redisService.getClient();
  const keys = [...tokens, `active-sessions-${userId}`];
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}

export async function revokeSession(
  organizationId: string,
  sessionId: string
): Promise<boolean> {
  const [session] = await db
    .select({ id: sessions.id, userId: sessions.userId, token: sessions.token })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);

  if (!(session && (await getUser(organizationId, session.userId)))) {
    return false;
  }

  await db.delete(sessions).where(eq(sessions.id, sessionId));
  await purgeCachedSessions(session.userId, [session.token]);
  return true;
}

export async function revokeAllUserSessions(
  organizationId: string,
  userId: string
): Promise<number | null> {
  if (!(await getUser(organizationId, userId))) {
    return null;
  }
  const deleted = await db
    .delete(sessions)
    .where(eq(sessions.userId, userId))
    .returning({ token: sessions.token });

  await purgeCachedSessions(
    userId,
    deleted.map((s) => s.token)
  );
  return deleted.length;
}
