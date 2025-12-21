import { and, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { applications, sessions, users } from "@/db/schema/auth";
import { invalidateOriginsCache } from "@/middleware/dynamic-cors";

export interface ApplicationWithStats {
  id: string;
  organizationId: string;
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
  organizationId: string;
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

/**
 * List applications scoped to an organization
 * SECURITY: Always requires organizationId to prevent data leakage
 */
export async function listApplications(
  organizationId: string
): Promise<ApplicationWithStats[]> {
  const apps = await db
    .select({
      id: applications.id,
      organizationId: applications.organizationId,
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
    .where(eq(applications.organizationId, organizationId))
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

/**
 * Get application by ID, scoped to organization
 * SECURITY: Validates organization ownership to prevent unauthorized access
 */
export async function getApplication(
  id: string,
  organizationId: string
): Promise<ApplicationWithStats | null> {
  const [appRecord] = await db
    .select()
    .from(applications)
    .where(
      and(
        eq(applications.id, id),
        eq(applications.organizationId, organizationId)
      )
    )
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

/**
 * Create application within an organization
 * SECURITY: organizationId is required and validated upstream
 */
export async function createApplication(input: CreateApplicationInput) {
  const id = crypto.randomUUID();
  const secret = crypto.randomUUID();

  const [created] = await db
    .insert(applications)
    .values({
      id,
      organizationId: input.organizationId,
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

  // Invalidate CORS cache so new origins take effect
  invalidateOriginsCache();

  return { application: created, secret };
}

/**
 * Update application, scoped to organization
 * SECURITY: Validates organization ownership before update
 */
export async function updateApplication(
  id: string,
  organizationId: string,
  input: UpdateApplicationInput
) {
  const [updated] = await db
    .update(applications)
    .set({
      ...input,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(applications.id, id),
        eq(applications.organizationId, organizationId)
      )
    )
    .returning();

  // Invalidate CORS cache if origins or active status changed
  if (input.allowedOrigins !== undefined || input.isActive !== undefined) {
    invalidateOriginsCache();
  }

  return updated;
}

/**
 * Delete application, scoped to organization
 * SECURITY: Validates organization ownership before deletion
 */
export async function deleteApplication(id: string, organizationId: string) {
  const [deleted] = await db
    .delete(applications)
    .where(
      and(
        eq(applications.id, id),
        eq(applications.organizationId, organizationId)
      )
    )
    .returning({ id: applications.id });

  // Invalidate CORS cache
  invalidateOriginsCache();

  return deleted;
}

/**
 * Regenerate application secret, scoped to organization
 * SECURITY: Validates organization ownership before regenerating
 */
export async function regenerateSecret(id: string, organizationId: string) {
  const newSecret = crypto.randomUUID();

  const [updated] = await db
    .update(applications)
    .set({
      secret: newSecret,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(applications.id, id),
        eq(applications.organizationId, organizationId)
      )
    )
    .returning({ id: applications.id });

  return updated ? { secret: newSecret } : null;
}
