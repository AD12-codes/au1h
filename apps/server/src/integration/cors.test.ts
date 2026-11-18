import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { baseUrl, type Harness, INTEGRATION, startHarness } from "./harness";

const describeIntegration = INTEGRATION ? describe : describe.skip;

const PORTAL = "https://portal.test";
const SIGN_IN = "/api/auth/sign-in/email";

/**
 * Credentialed CORS is granted per application: only the application's own
 * origins, never another application's, and never for the admin API.
 */
describeIntegration("CORS is scoped to the requesting application", () => {
  let h: Harness;
  const saved: Record<string, string | undefined> = {};

  beforeAll(async () => {
    h = await startHarness();
    saved.CORS_ORIGIN = process.env.CORS_ORIGIN;
    saved.NODE_ENV = process.env.NODE_ENV;
    process.env.CORS_ORIGIN = `${PORTAL}, https://portal-2.test`;
  }, 60_000);
  afterAll(async () => {
    process.env.CORS_ORIGIN = saved.CORS_ORIGIN ?? "";
    process.env.NODE_ENV = saved.NODE_ENV ?? "test";
    await h?.cleanup();
  });

  function preflight(
    path: string,
    origin: string,
    headers: Record<string, string> = {}
  ): Promise<Response> {
    return Promise.resolve(
      h.app.fetch(
        new Request(`${baseUrl()}${path}`, {
          method: "OPTIONS",
          headers: {
            origin,
            "access-control-request-method": "POST",
            "access-control-request-headers": "content-type,x-app-id",
            ...headers,
          },
        })
      )
    );
  }

  async function allowedOrigin(
    path: string,
    origin: string,
    headers: Record<string, string> = {}
  ): Promise<string | null> {
    const res = await preflight(path, origin, headers);
    return res.headers.get("access-control-allow-origin");
  }

  const forApp = (slug: string) => ({ "x-app-id": slug });

  // ---------------------------------------------------------------------------
  // Per-application allowlist
  // ---------------------------------------------------------------------------

  test("an application's own origin is allowed, with credentials", async () => {
    const res = await preflight(
      SIGN_IN,
      "http://a.test",
      forApp(h.apps.a.slug)
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(
      "http://a.test"
    );
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
    expect(
      res.headers.get("access-control-allow-headers")?.toLowerCase()
    ).toContain("x-app-id");
    expect(res.headers.get("access-control-allow-methods")).toContain("POST");
  });

  test("the origin is echoed, never a wildcard", async () => {
    expect(
      await allowedOrigin(SIGN_IN, "http://a.test", forApp(h.apps.a.slug))
    ).not.toBe("*");
  });

  test("another application's origin is not, even though it is registered", async () => {
    const res = await preflight(
      SIGN_IN,
      "http://b.test",
      forApp(h.apps.a.slug)
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
    expect(res.headers.get("access-control-allow-credentials")).toBeNull();
  });

  test("an unregistered origin is not allowed", async () => {
    expect(
      await allowedOrigin(
        SIGN_IN,
        "https://evil.example",
        forApp(h.apps.a.slug)
      )
    ).toBeNull();
  });

  test("origins match exactly: no prefix, suffix, scheme or port variants", async () => {
    for (const origin of [
      "https://a.test",
      "http://a.test:8080",
      "http://a.test.evil.example",
      "http://evil-a.test",
      "http://A.TEST",
    ]) {
      expect(
        await allowedOrigin(SIGN_IN, origin, forApp(h.apps.a.slug))
      ).toBeNull();
    }
  });

  test("an unknown application has no allowed origins", async () => {
    expect(
      await allowedOrigin(SIGN_IN, "http://a.test", forApp("no-such-app"))
    ).toBeNull();
  });

  test("a real (non-preflight) request from a foreign origin gets no CORS headers", async () => {
    const res = await h.app.fetch(
      new Request(`${baseUrl()}/api/auth/ok`, {
        headers: { origin: "https://evil.example", "x-app-id": h.apps.a.slug },
      })
    );
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
    expect(res.headers.get("access-control-allow-credentials")).toBeNull();
  });

  test("a real request from the application's origin gets them", async () => {
    const res = await h.app.fetch(
      new Request(`${baseUrl()}/api/auth/ok`, {
        headers: { origin: "http://a.test", "x-app-id": h.apps.a.slug },
      })
    );
    expect(res.headers.get("access-control-allow-origin")).toBe(
      "http://a.test"
    );
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
  });

  test("a request without an Origin header gets no CORS headers", async () => {
    const res = await h.app.fetch(
      new Request(`${baseUrl()}/api/auth/ok`, {
        headers: { "x-app-id": h.apps.a.slug },
      })
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // How the tenant is chosen
  // ---------------------------------------------------------------------------

  test("?app= selects the application when there is no header", async () => {
    expect(
      await allowedOrigin(`${SIGN_IN}?app=${h.apps.a.slug}`, "http://a.test")
    ).toBe("http://a.test");
    expect(
      await allowedOrigin(`${SIGN_IN}?app=${h.apps.a.slug}`, "http://b.test")
    ).toBeNull();
  });

  test("the au1h-app-id cookie selects the application", async () => {
    const cookie = { cookie: `au1h-app-id=${h.apps.b.slug}` };
    expect(await allowedOrigin(SIGN_IN, "http://b.test", cookie)).toBe(
      "http://b.test"
    );
    expect(await allowedOrigin(SIGN_IN, "http://a.test", cookie)).toBeNull();
  });

  test("x-app-id wins over ?app= and the cookie", async () => {
    const path = `${SIGN_IN}?app=${h.apps.b.slug}`;
    const headers = {
      "x-app-id": h.apps.a.slug,
      cookie: `au1h-app-id=${h.apps.b.slug}`,
    };
    expect(await allowedOrigin(path, "http://a.test", headers)).toBe(
      "http://a.test"
    );
    expect(await allowedOrigin(path, "http://b.test", headers)).toBeNull();
  });

  test("with no other hint, a registered origin maps to its own application", async () => {
    expect(await allowedOrigin(SIGN_IN, "http://a.test")).toBe("http://a.test");
    expect(await allowedOrigin(SIGN_IN, "https://evil.example")).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Admin scope
  // ---------------------------------------------------------------------------

  test("the admin API accepts only the admin portal's origins", async () => {
    expect(await allowedOrigin("/api/v1/applications", PORTAL)).toBe(PORTAL);
    expect(
      await allowedOrigin("/api/v1/applications", "https://portal-2.test")
    ).toBe("https://portal-2.test");
    expect(
      await allowedOrigin("/api/v1/applications", "http://a.test")
    ).toBeNull();
  });

  test("naming an application does not open the admin API to its origin", async () => {
    expect(
      await allowedOrigin(
        "/api/v1/applications",
        "http://a.test",
        forApp(h.apps.a.slug)
      )
    ).toBeNull();
  });

  test("the admin slug maps to the portal's origin, not to any application's", async () => {
    expect(await allowedOrigin(SIGN_IN, PORTAL, forApp("au1h-admin"))).toBe(
      PORTAL
    );
    expect(
      await allowedOrigin(SIGN_IN, "http://a.test", forApp("au1h-admin"))
    ).toBeNull();
  });

  test("the portal's origin is not allowed for an application", async () => {
    expect(
      await allowedOrigin(SIGN_IN, PORTAL, forApp(h.apps.a.slug))
    ).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Development convenience
  // ---------------------------------------------------------------------------

  test("outside production, http://localhost on any port is allowed", async () => {
    for (const origin of ["http://localhost:5173", "http://localhost"]) {
      expect(await allowedOrigin(SIGN_IN, origin, forApp(h.apps.a.slug))).toBe(
        origin
      );
    }
  });

  test("hosts that merely start with 'localhost' are not", async () => {
    for (const origin of [
      "http://localhost.evil.example",
      "http://localhost.evil.example:5173",
      "http://localhostevil.example",
      "https://localhost:5173",
    ]) {
      expect(
        await allowedOrigin(SIGN_IN, origin, forApp(h.apps.a.slug))
      ).toBeNull();
    }
  });

  test("in production, localhost is not allowed", async () => {
    process.env.NODE_ENV = "production";
    try {
      expect(
        await allowedOrigin(
          SIGN_IN,
          "http://localhost:5173",
          forApp(h.apps.a.slug)
        )
      ).toBeNull();
      expect(
        await allowedOrigin(SIGN_IN, "http://a.test", forApp(h.apps.a.slug))
      ).toBe("http://a.test");
    } finally {
      process.env.NODE_ENV = saved.NODE_ENV ?? "test";
    }
  });
});
