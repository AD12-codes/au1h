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
import { applications, sessions, users } from "@/db/schema/auth";

export interface User {
  id: string;
  applicationId: string;
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
  applicationName: string;
  applicationSlug: string;
  sessionCount: number;
}

export interface Session {
  id: string;
  userId: string;
  applicationId: string;
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

export async function listUsers(
  params: ListUsersParams
): Promise<ListUsersResult> {
  const { applicationId, search, page = 1, limit = 20 } = params;
  const offset = (page - 1) * limit;

  // Build where conditions
  const conditions: SQL<unknown>[] = [];
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

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Get users with application info
  const userList = await db
    .select({
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
    })
    .from(users)
    .innerJoin(applications, eq(users.applicationId, applications.id))
    .where(whereClause)
    .orderBy(desc(users.createdAt))
    .limit(limit)
    .offset(offset);

  // Get session counts for each user
  const userIds = userList.map((u) => u.id);
  const sessionCounts =
    userIds.length > 0
      ? await db
          .select({
            userId: sessions.userId,
            count: count(),
          })
          .from(sessions)
          .where(inArray(sessions.userId, userIds))
          .groupBy(sessions.userId)
      : [];

  const sessionCountMap = new Map(
    sessionCounts.map((s) => [s.userId, s.count])
  );

  // Get total count
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

export async function getUser(id: string): Promise<UserWithDetails | null> {
  const [user] = await db
    .select({
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
    })
    .from(users)
    .innerJoin(applications, eq(users.applicationId, applications.id))
    .where(eq(users.id, id))
    .limit(1);

  if (!user) {
    return null;
  }

  const [sessionCount] = await db
    .select({ count: count() })
    .from(sessions)
    .where(eq(sessions.userId, id));

  return {
    ...user,
    sessionCount: sessionCount?.count || 0,
  };
}

export function getUserSessions(userId: string): Promise<Session[]> {
  return db
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
  id: string,
  reason?: string,
  expiresAt?: Date
): Promise<User | null> {
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

  return updated || null;
}

export async function unbanUser(id: string): Promise<User | null> {
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

export async function revokeSession(sessionId: string): Promise<boolean> {
  const [deleted] = await db
    .delete(sessions)
    .where(eq(sessions.id, sessionId))
    .returning({ id: sessions.id });

  return !!deleted;
}

export async function revokeAllUserSessions(userId: string): Promise<number> {
  const deleted = await db
    .delete(sessions)
    .where(eq(sessions.userId, userId))
    .returning({ id: sessions.id });

  return deleted.length;
}
