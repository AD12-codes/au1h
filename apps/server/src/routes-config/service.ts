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

function parseRoute(row: {
  id: string;
  applicationId: string;
  name: string;
  pathPattern: string;
  backendUrl: string;
  methods: string;
  stripPrefix: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): AppRoute {
  return {
    ...row,
    methods: JSON.parse(row.methods) as string[],
  };
}

export async function listRoutesByApplication(
  applicationId: string
): Promise<AppRoute[]> {
  const routes = await db
    .select()
    .from(applicationRoutes)
    .where(eq(applicationRoutes.applicationId, applicationId))
    .orderBy(desc(applicationRoutes.createdAt));

  return routes.map(parseRoute);
}

export async function listAllRoutes(): Promise<AppRouteWithApp[]> {
  const routes = await db
    .select({
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
    })
    .from(applicationRoutes)
    .innerJoin(
      applications,
      eq(applicationRoutes.applicationId, applications.id)
    )
    .orderBy(desc(applicationRoutes.createdAt));

  return routes.map((row) => ({
    ...row,
    methods: JSON.parse(row.methods) as string[],
  }));
}

export async function getRoute(id: string): Promise<AppRoute | null> {
  const [route] = await db
    .select()
    .from(applicationRoutes)
    .where(eq(applicationRoutes.id, id));

  return route ? parseRoute(route) : null;
}

export async function getActiveRouteByPattern(
  applicationId: string,
  pathPattern: string
): Promise<AppRoute | null> {
  const [route] = await db
    .select()
    .from(applicationRoutes)
    .where(
      and(
        eq(applicationRoutes.applicationId, applicationId),
        eq(applicationRoutes.pathPattern, pathPattern),
        eq(applicationRoutes.isActive, true)
      )
    );

  return route ? parseRoute(route) : null;
}

export async function createRoute(input: CreateRouteInput): Promise<AppRoute> {
  const id = crypto.randomUUID();
  const now = new Date();

  const [route] = await db
    .insert(applicationRoutes)
    .values({
      id,
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
  id: string,
  input: UpdateRouteInput
): Promise<AppRoute | null> {
  const updates: Record<string, unknown> = {};

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
    return getRoute(id);
  }

  const [route] = await db
    .update(applicationRoutes)
    .set(updates)
    .where(eq(applicationRoutes.id, id))
    .returning();

  if (route) {
    invalidateRouteCache();
  }
  return route ? parseRoute(route) : null;
}

export async function deleteRoute(id: string): Promise<boolean> {
  const result = await db
    .delete(applicationRoutes)
    .where(eq(applicationRoutes.id, id))
    .returning({ id: applicationRoutes.id });

  if (result.length > 0) {
    invalidateRouteCache();
  }
  return result.length > 0;
}

export function toggleRouteActive(
  id: string,
  isActive: boolean
): Promise<AppRoute | null> {
  return updateRoute(id, { isActive });
}
