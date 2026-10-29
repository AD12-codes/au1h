import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import type { AdminEnv, WorkspaceRole } from "./require-org-session";
import { requireRole } from "./require-role";

describe("requireRole middleware", () => {
  function createApp(role?: WorkspaceRole) {
    const app = new Hono<AdminEnv>();
    app.use("*", async (c, next) => {
      if (role) {
        c.set("role", role);
      }
      await next();
    });
    app.post("/default", requireRole("owner", "admin"), (c) =>
      c.json({ ok: true })
    );
    app.post("/owner-only", requireRole("owner"), (c) => c.json({ ok: true }));
    return app;
  }

  test("allows owner", async () => {
    const app = createApp("owner");
    const res = await app.request("/default", { method: "POST" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  test("allows admin", async () => {
    const app = createApp("admin");
    const res = await app.request("/default", { method: "POST" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  test("rejects member with 403 and error message", async () => {
    const app = createApp("member");
    const res = await app.request("/default", { method: "POST" });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "Requires the owner or admin role",
    });
  });

  test("rejects when no role is set", async () => {
    const app = createApp(undefined);
    const res = await app.request("/default", { method: "POST" });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "Requires the owner or admin role",
    });
  });

  test("rejects admin on owner-only route", async () => {
    const app = createApp("admin");
    const res = await app.request("/owner-only", { method: "POST" });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "Requires the owner role",
    });
  });
});
