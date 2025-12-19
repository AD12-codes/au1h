import type { Context } from "hono";
import { z } from "zod";
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

const createAppSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  allowedOrigins: z.string().optional(),
  redirectUris: z.string().optional(),
  logo: z.string().url().optional().nullable(),
  metadata: z.string().optional(),
});

const updateAppSchema = createAppSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export async function list(c: Context) {
  try {
    const apps = await listApplications();
    return c.json({ applications: apps });
  } catch (error) {
    logger.error({ error }, "Failed to list applications");
    return c.json({ error: "Failed to list applications" }, 500);
  }
}

export async function get(c: Context) {
  try {
    const id = c.req.param("id");
    const app = await getApplication(id);

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

export async function create(c: Context) {
  try {
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

    const { application, secret } = await createApplication(parsed.data);

    logger.info(
      { applicationId: application.id, slug: application.slug },
      "Application created"
    );

    return c.json({ application, secret }, 201);
  } catch (error) {
    logger.error({ error }, "Failed to create application");
    return c.json({ error: "Failed to create application" }, 500);
  }
}

export async function update(c: Context) {
  try {
    const id = c.req.param("id");
    const body = await c.req.json();
    const parsed = updateAppSchema.safeParse(body);

    if (!parsed.success) {
      return c.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        400
      );
    }

    const existing = await getApplication(id);
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

    const updated = await updateApplication(id, parsed.data);

    logger.info({ applicationId: id }, "Application updated");

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

export async function remove(c: Context) {
  try {
    const id = c.req.param("id");

    if (id === "admin-portal") {
      return c.json({ error: "Cannot delete system application" }, 403);
    }

    const deleted = await deleteApplication(id);

    if (!deleted) {
      return c.json({ error: "Application not found" }, 404);
    }

    logger.info({ applicationId: id }, "Application deleted");

    return c.json({ success: true });
  } catch (error) {
    logger.error({ error }, "Failed to delete application");
    return c.json({ error: "Failed to delete application" }, 500);
  }
}

export async function regenerate(c: Context) {
  try {
    const id = c.req.param("id");

    const result = await regenerateSecret(id);

    if (!result) {
      return c.json({ error: "Application not found" }, 404);
    }

    logger.info({ applicationId: id }, "Application secret regenerated");

    return c.json(result);
  } catch (error) {
    logger.error({ error }, "Failed to regenerate secret");
    return c.json({ error: "Failed to regenerate secret" }, 500);
  }
}
