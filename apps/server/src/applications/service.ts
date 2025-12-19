import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import { applications, sessions, users } from "@/db/schema/auth";

export interface ApplicationWithStats {
  id: string;
  name: string;
  slug: string;
  allowedOrigins: string | null;
  redirectUris: string | null;
  logo: string | null;
  metadata: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  userCount: number;
  sessionCount: number;
}

export interface CreateApplicationInput {
  name: string;
  slug: string;
  allowedOrigins?: string;
  redirectUris?: string;
  logo?: string | null;
  metadata?: string;
}

export interface UpdateApplicationInput {
  name?: string;
  slug?: string;
  allowedOrigins?: string;
  redirectUris?: string;
  logo?: string | null;
  metadata?: string;
  isActive?: boolean;
}

export async function listApplications(): Promise<ApplicationWithStats[]> {
  const apps = await db
    .select({
      id: applications.id,
      name: applications.name,
      slug: applications.slug,
      allowedOrigins: applications.allowedOrigins,
      redirectUris: applications.redirectUris,
      logo: applications.logo,
      metadata: applications.metadata,
      isActive: applications.isActive,
      createdAt: applications.createdAt,
      updatedAt: applications.updatedAt,
    })
    .from(applications)
    .orderBy(applications.createdAt);

  const userCounts = await db
    .select({
      applicationId: users.applicationId,
      count: count(),
    })
    .from(users)
    .groupBy(users.applicationId);

  const sessionCounts = await db
    .select({
      applicationId: sessions.applicationId,
      count: count(),
    })
    .from(sessions)
    .groupBy(sessions.applicationId);

  const userCountMap = new Map(
    userCounts.map((u) => [u.applicationId, u.count])
  );
  const sessionCountMap = new Map(
    sessionCounts.map((s) => [s.applicationId, s.count])
  );

  return apps.map((a) => ({
    ...a,
    userCount: userCountMap.get(a.id) || 0,
    sessionCount: sessionCountMap.get(a.id) || 0,
  }));
}

export async function getApplication(
  id: string
): Promise<ApplicationWithStats | null> {
  const [appRecord] = await db
    .select()
    .from(applications)
    .where(eq(applications.id, id))
    .limit(1);

  if (!appRecord) {
    return null;
  }

  const [userCount] = await db
    .select({ count: count() })
    .from(users)
    .where(eq(users.applicationId, id));

  const [sessionCount] = await db
    .select({ count: count() })
    .from(sessions)
    .where(eq(sessions.applicationId, id));

  return {
    ...appRecord,
    userCount: userCount?.count || 0,
    sessionCount: sessionCount?.count || 0,
  };
}

export async function checkSlugExists(
  slug: string,
  excludeId?: string
): Promise<boolean> {
  const query = db
    .select({ id: applications.id })
    .from(applications)
    .where(eq(applications.slug, slug))
    .limit(1);

  const [existing] = await query;

  if (!existing) {
    return false;
  }

  return excludeId ? existing.id !== excludeId : true;
}

export async function createApplication(input: CreateApplicationInput) {
  const id = crypto.randomUUID();
  const secret = crypto.randomUUID();

  const [created] = await db
    .insert(applications)
    .values({
      id,
      name: input.name,
      slug: input.slug,
      secret,
      allowedOrigins: input.allowedOrigins || null,
      redirectUris: input.redirectUris || null,
      logo: input.logo || null,
      metadata: input.metadata || null,
      isActive: true,
    })
    .returning();

  return { application: created, secret };
}

export async function updateApplication(
  id: string,
  input: UpdateApplicationInput
) {
  const [updated] = await db
    .update(applications)
    .set({
      ...input,
      updatedAt: new Date(),
    })
    .where(eq(applications.id, id))
    .returning();

  return updated;
}

export async function deleteApplication(id: string) {
  const [deleted] = await db
    .delete(applications)
    .where(eq(applications.id, id))
    .returning({ id: applications.id });

  return deleted;
}

export async function regenerateSecret(id: string) {
  const newSecret = crypto.randomUUID();

  const [updated] = await db
    .update(applications)
    .set({
      secret: newSecret,
      updatedAt: new Date(),
    })
    .where(eq(applications.id, id))
    .returning({ id: applications.id });

  return updated ? { secret: newSecret } : null;
}
