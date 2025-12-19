import type { Context } from "hono";
import {
  createRoute,
  deleteRoute,
  getRoute,
  listAllRoutes,
  listRoutesByApplication,
  toggleRouteActive,
  updateRoute,
} from "./service";

export async function list(c: Context) {
  const applicationId = c.req.query("applicationId");

  if (applicationId) {
    const routes = await listRoutesByApplication(applicationId);
    return c.json({ routes });
  }

  const routes = await listAllRoutes();
  return c.json({ routes });
}

export async function get(c: Context) {
  const id = c.req.param("id");
  const route = await getRoute(id);

  if (!route) {
    return c.json({ error: "Route not found" }, 404);
  }

  return c.json({ route });
}

export async function create(c: Context) {
  const body = await c.req.json();

  const { applicationId, name, pathPattern, backendUrl, methods, stripPrefix } =
    body;

  if (!(applicationId && name && pathPattern && backendUrl && methods)) {
    return c.json(
      {
        error:
          "Missing required fields: applicationId, name, pathPattern, backendUrl, methods",
      },
      400
    );
  }

  if (!Array.isArray(methods) || methods.length === 0) {
    return c.json({ error: "methods must be a non-empty array" }, 400);
  }

  const validMethods = [
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "HEAD",
    "OPTIONS",
  ];
  const invalidMethods = methods.filter(
    (m: string) => !validMethods.includes(m.toUpperCase())
  );
  if (invalidMethods.length > 0) {
    return c.json(
      { error: `Invalid methods: ${invalidMethods.join(", ")}` },
      400
    );
  }

  const route = await createRoute({
    applicationId,
    name,
    pathPattern,
    backendUrl,
    methods: methods.map((m: string) => m.toUpperCase()),
    stripPrefix,
  });

  return c.json({ route }, 201);
}

export async function update(c: Context) {
  const id = c.req.param("id");
  const body = await c.req.json();

  const existing = await getRoute(id);
  if (!existing) {
    return c.json({ error: "Route not found" }, 404);
  }

  const { name, pathPattern, backendUrl, methods, stripPrefix, isActive } =
    body;

  if (methods !== undefined) {
    if (!Array.isArray(methods) || methods.length === 0) {
      return c.json({ error: "methods must be a non-empty array" }, 400);
    }

    const validMethods = [
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "HEAD",
      "OPTIONS",
    ];
    const invalidMethods = methods.filter(
      (m: string) => !validMethods.includes(m.toUpperCase())
    );
    if (invalidMethods.length > 0) {
      return c.json(
        { error: `Invalid methods: ${invalidMethods.join(", ")}` },
        400
      );
    }
  }

  const route = await updateRoute(id, {
    name,
    pathPattern,
    backendUrl,
    methods: methods?.map((m: string) => m.toUpperCase()),
    stripPrefix,
    isActive,
  });

  return c.json({ route });
}

export async function remove(c: Context) {
  const id = c.req.param("id");

  const existing = await getRoute(id);
  if (!existing) {
    return c.json({ error: "Route not found" }, 404);
  }

  await deleteRoute(id);
  return c.json({ success: true });
}

export async function toggle(c: Context) {
  const id = c.req.param("id");
  const body = await c.req.json();

  const existing = await getRoute(id);
  if (!existing) {
    return c.json({ error: "Route not found" }, 404);
  }

  const { isActive } = body;
  if (typeof isActive !== "boolean") {
    return c.json({ error: "isActive must be a boolean" }, 400);
  }

  const route = await toggleRouteActive(id, isActive);
  return c.json({ route });
}
