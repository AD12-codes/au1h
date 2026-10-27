import type { Context } from "hono";
import { z } from "zod";
import { AU1H_ADMIN_APP_SLUG } from "@/lib/auth/admin";
import type { AdminEnv } from "@/middleware/require-org-session";
import { logger } from "@/utils/logger";
import {
  checkSlugExists,
  createApplication,
  deleteApplication,
  getApplication,
  listApplications,
  regenerateSecret,
  updateApplication,
} from "./service";

/**
 * Each item must be exactly an origin (`scheme://host[:port]`). These feed
 * CORS and Better Auth's trusted-origin check, where a path, a wildcard or a
 * stray character would widen what is trusted.
 */
function splitList(raw: string): string[] {
  return raw
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

function asOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    const bare = url.origin;
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    // Exactly the origin, with or without a trailing slash.
    return value === bare || value === `${bare}/` ? bare : null;
  } catch {
    return null;
  }
}

function isOriginList(raw: string | undefined): boolean {
  return raw === undefined || splitList(raw).every((o) => asOrigin(o) !== null);
}

/** `https://a.example/, https://b.example` → `https://a.example,https://b.example` */
function normalizeOriginList(raw: string | undefined): string | undefined {
  return raw === undefined
    ? undefined
    : splitList(raw)
        .map((o) => asOrigin(o) ?? o)
        .join(",");
}

const createAppSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens")
    .refine((slug) => slug !== AU1H_ADMIN_APP_SLUG, {
      message: `"${AU1H_ADMIN_APP_SLUG}" is reserved for the au1h admin portal`,
    }),
  allowedOrigins: z
    .string()
    .optional()
    .refine(isOriginList, {
      message:
        "allowedOrigins must be comma-separated origins like https://app.example.com (no paths, no wildcards)",
    })
    .transform(normalizeOriginList),
  redirectUris: z.string().optional(),
  logo: z
    .string()
    .url()
    .refine((u) => u.startsWith("https://"), { message: "logo must be https" })
    .optional()
    .nullable(),
  metadata: z.string().optional(),
});

const updateAppSchema = createAppSchema.partial().extend({
  isActive: z.boolean().optional(),
  organizationsEnabled: z.boolean().optional(),
});

export async function list(c: Context<AdminEnv>) {
  try {
    const organizationId = c.get("organizationId");

    const apps = await listApplications(organizationId);
    return c.json({ applications: apps });
  } catch (error) {
    logger.error({ error }, "Failed to list applications");
    return c.json({ error: "Failed to list applications" }, 500);
  }
}

export async function get(c: Context<AdminEnv>) {
  try {
    const organizationId = c.get("organizationId");

    const id = c.req.param("id");
    const app = await getApplication(id, organizationId);

    if (!app) {
      return c.json({ error: "Application not found" }, 404);
    }

    return c.json({
      application: {
        ...app,
        secret: undefined,
      },
    });
  } catch (error) {
    logger.error({ error }, "Failed to get application");
    return c.json({ error: "Failed to get application" }, 500);
  }
}

export async function create(c: Context<AdminEnv>) {
  try {
    const organizationId = c.get("organizationId");

    const body = await c.req.json();
    const parsed = createAppSchema.safeParse(body);

    if (!parsed.success) {
      return c.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        400
      );
    }

    const slugExists = await checkSlugExists(parsed.data.slug);
    if (slugExists) {
      return c.json(
        { error: "Application with this slug already exists" },
        409
      );
    }

    const { application, secret } = await createApplication({
      ...parsed.data,
      organizationId,
    });

    logger.info(
      { applicationId: application.id, slug: application.slug, organizationId },
      "Application created"
    );

    return c.json({ application, secret }, 201);
  } catch (error) {
    logger.error({ error }, "Failed to create application");
    return c.json({ error: "Failed to create application" }, 500);
  }
}

export async function update(c: Context<AdminEnv>) {
  try {
    const organizationId = c.get("organizationId");

    const id = c.req.param("id");
    const body = await c.req.json();
    const parsed = updateAppSchema.safeParse(body);

    if (!parsed.success) {
      return c.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        400
      );
    }

    const existing = await getApplication(id, organizationId);
    if (!existing) {
      return c.json({ error: "Application not found" }, 404);
    }

    if (parsed.data.slug && parsed.data.slug !== existing.slug) {
      const slugExists = await checkSlugExists(parsed.data.slug, id);
      if (slugExists) {
        return c.json(
          { error: "Application with this slug already exists" },
          409
        );
      }
    }

    const updated = await updateApplication(id, organizationId, parsed.data);

    logger.info({ applicationId: id, organizationId }, "Application updated");

    return c.json({
      application: {
        ...updated,
        secret: undefined,
      },
    });
  } catch (error) {
    logger.error({ error }, "Failed to update application");
    return c.json({ error: "Failed to update application" }, 500);
  }
}

export async function remove(c: Context<AdminEnv>) {
  try {
    const organizationId = c.get("organizationId");

    const id = c.req.param("id");
    const deleted = await deleteApplication(id, organizationId);

    if (!deleted) {
      return c.json({ error: "Application not found" }, 404);
    }

    logger.info({ applicationId: id, organizationId }, "Application deleted");

    return c.json({ success: true });
  } catch (error) {
    logger.error({ error }, "Failed to delete application");
    return c.json({ error: "Failed to delete application" }, 500);
  }
}

export async function regenerate(c: Context<AdminEnv>) {
  try {
    const organizationId = c.get("organizationId");

    const id = c.req.param("id");
    const result = await regenerateSecret(id, organizationId);

    if (!result) {
      return c.json({ error: "Application not found" }, 404);
    }

    logger.info(
      { applicationId: id, organizationId },
      "Application secret regenerated"
    );

    return c.json(result);
  } catch (error) {
    logger.error({ error }, "Failed to regenerate secret");
    return c.json({ error: "Failed to regenerate secret" }, 500);
  }
}
