import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { applicationRoutes, applications } from "@/db/schema/auth";
import { invalidateRouteCache } from "@/proxy/service";

export interface AppRoute {
  id: string;
  applicationId: string;
  name: string;
  pathPattern: string;
  backendUrl: string;
  methods: string[];
  stripPrefix: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AppRouteWithApp extends AppRoute {
  applicationName: string;
  applicationSlug: string;
}

export interface CreateRouteInput {
  applicationId: string;
  name: string;
  pathPattern: string;
  backendUrl: string;
  methods: string[];
  stripPrefix?: boolean;
}

export interface UpdateRouteInput {
  name?: string;
  pathPattern?: string;
  backendUrl?: string;
  methods?: string[];
  stripPrefix?: boolean;
  isActive?: boolean;
}

const routeColumns = {
  id: applicationRoutes.id,
  applicationId: applicationRoutes.applicationId,
  name: applicationRoutes.name,
  pathPattern: applicationRoutes.pathPattern,
  backendUrl: applicationRoutes.backendUrl,
  methods: applicationRoutes.methods,
  stripPrefix: applicationRoutes.stripPrefix,
  isActive: applicationRoutes.isActive,
  createdAt: applicationRoutes.createdAt,
  updatedAt: applicationRoutes.updatedAt,
  applicationName: applications.name,
  applicationSlug: applications.slug,
};

function parseRoute<T extends { methods: string }>(
  row: T
): Omit<T, "methods"> & { methods: string[] } {
  return { ...row, methods: JSON.parse(row.methods) as string[] };
}

/**
 * Does `applicationId` belong to `organizationId`?
 * SECURITY: every write goes through this so an organization can only
 * configure proxy routes for its own applications.
 */
export async function applicationBelongsToOrganization(
  applicationId: string,
  organizationId: string
): Promise<boolean> {
  const [app] = await db
    .select({ id: applications.id })
    .from(applications)
    .where(
      and(
        eq(applications.id, applicationId),
        eq(applications.organizationId, organizationId)
      )
    )
    .limit(1);
  return Boolean(app);
}

export async function listRoutes(
  organizationId: string,
  applicationId?: string
): Promise<AppRouteWithApp[]> {
  const conditions = [eq(applications.organizationId, organizationId)];
  if (applicationId) {
    conditions.push(eq(applicationRoutes.applicationId, applicationId));
  }
  const rows = await db
    .select(routeColumns)
    .from(applicationRoutes)
    .innerJoin(
      applications,
      eq(applicationRoutes.applicationId, applications.id)
    )
    .where(and(...conditions))
    .orderBy(desc(applicationRoutes.createdAt));

  return rows.map(parseRoute);
}

export async function getRoute(
  organizationId: string,
  id: string
): Promise<AppRouteWithApp | null> {
  const [row] = await db
    .select(routeColumns)
    .from(applicationRoutes)
    .innerJoin(
      applications,
      eq(applicationRoutes.applicationId, applications.id)
    )
    .where(
      and(
        eq(applicationRoutes.id, id),
        eq(applications.organizationId, organizationId)
      )
    )
    .limit(1);

  return row ? parseRoute(row) : null;
}

export async function createRoute(
  organizationId: string,
  input: CreateRouteInput
): Promise<AppRoute | null> {
  if (
    !(await applicationBelongsToOrganization(
      input.applicationId,
      organizationId
    ))
  ) {
    return null;
  }

  const now = new Date();
  const [route] = await db
    .insert(applicationRoutes)
    .values({
      id: crypto.randomUUID(),
      applicationId: input.applicationId,
      name: input.name,
      pathPattern: input.pathPattern,
      backendUrl: input.backendUrl,
      methods: JSON.stringify(input.methods),
      stripPrefix: input.stripPrefix ?? true,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  invalidateRouteCache();
  return parseRoute(route);
}

export async function updateRoute(
  organizationId: string,
  id: string,
  input: UpdateRouteInput
): Promise<AppRouteWithApp | null> {
  const existing = await getRoute(organizationId, id);
  if (!existing) {
    return null;
  }

  const updates: Partial<typeof applicationRoutes.$inferInsert> = {};
  if (input.name !== undefined) {
    updates.name = input.name;
  }
  if (input.pathPattern !== undefined) {
    updates.pathPattern = input.pathPattern;
  }
  if (input.backendUrl !== undefined) {
    updates.backendUrl = input.backendUrl;
  }
  if (input.methods !== undefined) {
    updates.methods = JSON.stringify(input.methods);
  }
  if (input.stripPrefix !== undefined) {
    updates.stripPrefix = input.stripPrefix;
  }
  if (input.isActive !== undefined) {
    updates.isActive = input.isActive;
  }

  if (Object.keys(updates).length === 0) {
    return existing;
  }

  await db
    .update(applicationRoutes)
    .set(updates)
    .where(eq(applicationRoutes.id, id));

  invalidateRouteCache();
  return getRoute(organizationId, id);
}

export async function deleteRoute(
  organizationId: string,
  id: string
): Promise<boolean> {
  const existing = await getRoute(organizationId, id);
  if (!existing) {
    return false;
  }
  await db.delete(applicationRoutes).where(eq(applicationRoutes.id, id));
  invalidateRouteCache();
  return true;
}
