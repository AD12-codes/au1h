import type { Context } from "hono";
import { z } from "zod";
import type { AdminEnv } from "@/middleware/require-org-session";
import { logger } from "@/utils/logger";
import { validateBackendUrl } from "./backend-url";
import {
  createRoute,
  deleteRoute,
  getRoute,
  listRoutes,
  updateRoute,
} from "./service";

const HTTP_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
] as const;

const methodsSchema = z
  .array(z.string().min(1))
  .min(1, "methods must be a non-empty array")
  .transform((methods) => methods.map((m) => m.toUpperCase()))
  .refine(
    (methods) =>
      methods.every((m) => (HTTP_METHODS as readonly string[]).includes(m)),
    { message: `methods must be a subset of ${HTTP_METHODS.join(", ")}` }
  );

const backendUrlSchema = z.string().superRefine((url, ctx) => {
  const problem = validateBackendUrl(url);
  if (problem) {
    ctx.addIssue({ code: "custom", message: problem });
  }
});

const createSchema = z.object({
  applicationId: z.string().min(1),
  name: z.string().min(1).max(100),
  pathPattern: z.string().min(1).startsWith("/"),
  backendUrl: backendUrlSchema,
  methods: methodsSchema,
  stripPrefix: z.boolean().optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  pathPattern: z.string().min(1).startsWith("/").optional(),
  backendUrl: backendUrlSchema.optional(),
  methods: methodsSchema.optional(),
  stripPrefix: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

function invalid(c: Context, error: z.ZodError) {
  return c.json({ error: "Validation failed", details: error.flatten() }, 400);
}

export async function list(c: Context<AdminEnv>) {
  const routes = await listRoutes(
    c.get("organizationId"),
    c.req.query("applicationId")
  );
  return c.json({ routes });
}

export async function get(c: Context<AdminEnv>) {
  const route = await getRoute(c.get("organizationId"), c.req.param("id"));
  if (!route) {
    return c.json({ error: "Route not found" }, 404);
  }
  return c.json({ route });
}

export async function create(c: Context<AdminEnv>) {
  const parsed = createSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return invalid(c, parsed.error);
  }

  const organizationId = c.get("organizationId");
  const route = await createRoute(organizationId, parsed.data);
  if (!route) {
    // The application is not ours (or does not exist); do not leak which.
    return c.json({ error: "Application not found" }, 404);
  }

  logger.info(
    { routeId: route.id, applicationId: route.applicationId, organizationId },
    "Proxy route created"
  );
  return c.json({ route }, 201);
}

export async function update(c: Context<AdminEnv>) {
  const parsed = updateSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return invalid(c, parsed.error);
  }

  const route = await updateRoute(
    c.get("organizationId"),
    c.req.param("id"),
    parsed.data
  );
  if (!route) {
    return c.json({ error: "Route not found" }, 404);
  }
  return c.json({ route });
}

export async function remove(c: Context<AdminEnv>) {
  const deleted = await deleteRoute(c.get("organizationId"), c.req.param("id"));
  if (!deleted) {
    return c.json({ error: "Route not found" }, 404);
  }
  return c.json({ success: true });
}

export async function toggle(c: Context<AdminEnv>) {
  const body = await c.req.json().catch(() => ({}));
  const parsed = z.object({ isActive: z.boolean() }).safeParse(body);
  if (!parsed.success) {
    return invalid(c, parsed.error);
  }

  const route = await updateRoute(c.get("organizationId"), c.req.param("id"), {
    isActive: parsed.data.isActive,
  });
  if (!route) {
    return c.json({ error: "Route not found" }, 404);
  }
  return c.json({ route });
}
