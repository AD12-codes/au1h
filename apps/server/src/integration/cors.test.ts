import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { type Harness, INTEGRATION, startHarness } from "./harness";

const describeIntegration = INTEGRATION ? describe : describe.skip;

/**
 * Credentialed CORS is granted per application: only the application's own
 * origins, never another application's, and never for the admin API.
 */
describeIntegration("CORS is scoped to the requesting application", () => {
  let h: Harness;
  const base = () => process.env.BETTER_AUTH_URL ?? "http://localhost:4444";

  beforeAll(async () => {
    h = await startHarness();
  }, 60_000);
  afterAll(async () => {
    await h?.cleanup();
  });

  async function allowedOrigin(
    path: string,
    origin: string,
    appSlug?: string
  ): Promise<string | null> {
    const res = await h.app.fetch(
      new Request(`${base()}${path}`, {
        method: "OPTIONS",
        headers: {
          origin,
          "access-control-request-method": "POST",
          "access-control-request-headers": "content-type,x-app-id",
          ...(appSlug ? { "x-app-id": appSlug } : {}),
        },
      })
    );
    return res.headers.get("access-control-allow-origin");
  }

  test("an application's own origin is allowed", async () => {
    expect(
      await allowedOrigin(
        "/api/auth/sign-in/email",
        "http://a.test",
        h.apps.a.slug
      )
    ).toBe("http://a.test");
  });

  test("another application's origin is not, even though it is registered", async () => {
    expect(
      await allowedOrigin(
        "/api/auth/sign-in/email",
        "http://b.test",
        h.apps.a.slug
      )
    ).toBeNull();
  });

  test("the admin API accepts only the admin portal's origin", async () => {
    expect(
      await allowedOrigin("/api/v1/applications", "http://a.test")
    ).toBeNull();
    const admin = process.env.CORS_ORIGIN?.split(",")[0]?.trim();
    if (admin) {
      expect(await allowedOrigin("/api/v1/applications", admin)).toBe(admin);
    }
  });
});
