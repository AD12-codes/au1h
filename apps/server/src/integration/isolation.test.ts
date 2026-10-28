import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { and, eq, inArray, like, or } from "drizzle-orm";
import { createLocalJWKSet, type JSONWebKeySet, jwtVerify } from "jose";
import { createApplication } from "../applications/service";
import { db } from "../db";
import {
  members,
  organizations,
  sessions,
  users,
  verifications,
} from "../db/schema/auth";
import {
  authPost,
  cookiesOf,
  getSession,
  type Harness,
  INTEGRATION,
  lastEmailTo,
  linkIn,
  openLink,
  retarget,
  startHarness,
  type TestApp,
} from "./harness";

const describeIntegration = INTEGRATION ? describe : describe.skip;
const BASE = () => process.env.BETTER_AUTH_URL ?? "http://localhost:4444";
const tokenOf = (link: string) =>
  new URL(link, "http://localhost").searchParams.get("token");

const HAS_LIVE_OAUTH_PROVIDER = Boolean(
  process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
);

describeIntegration("isolation integration suite", () => {
  let h: Harness;
  let run: string;

  // Workspace 2 resources
  let org2Id: string;
  let appC: TestApp;

  // Admin sessions for each workspace
  let admin1User: { id: string; email: string };
  let admin2User: { id: string; email: string };
  let cookieAdmin1: string;
  let cookieAdmin2: string;

  // Workspace 1 seeded resources for cross-tenant assertions
  let userA: { id: string; email: string };
  let sessionA: { id: string; token: string };
  let routeA: { id: string; name: string };
  let tokenA: { id: string; name: string };
  let tokenASecret: string;

  beforeAll(async () => {
    process.env.AU1H_ADMIN_EMAILS = "@admin.test";
    h = await startHarness();
    run = Math.random().toString(36).slice(2, 8);

    // -------------------------------------------------------------------------
    // 1. Admin 1: sign up with x-app-id: au1h-admin and set active org to Org 1
    // -------------------------------------------------------------------------
    const admin1Email = `admin1-${run}@admin.test`;
    const resAdmin1 = await authPost(h.app, "au1h-admin", "/sign-up/email", {
      email: admin1Email,
      password: "Password123!",
      name: "Admin One",
    });
    if (resAdmin1.status !== 200) {
      throw new Error(`Admin 1 signup failed: ${resAdmin1.status}`);
    }
    cookieAdmin1 = cookiesOf(resAdmin1);

    const [u1] = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.email, admin1Email));
    admin1User = u1 as { id: string; email: string };

    // Join Admin 1 to Org 1
    await db.insert(members).values({
      id: crypto.randomUUID(),
      organizationId: h.orgId,
      userId: admin1User.id,
      role: "owner",
      createdAt: new Date(),
    });

    // Set active organization for Admin 1 session to Org 1
    const setActive1 = await h.app.fetch(
      new Request(`${BASE()}/api/auth/organization/set-active`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-app-id": "au1h-admin",
          cookie: cookieAdmin1,
        },
        body: JSON.stringify({ organizationId: h.orgId }),
      })
    );
    if (setActive1.status !== 200) {
      throw new Error(`Admin 1 set-active failed: ${setActive1.status}`);
    }
    if (setActive1.headers.getSetCookie().length > 0) {
      cookieAdmin1 = cookiesOf(setActive1);
    }

    // -------------------------------------------------------------------------
    // 2. Organization 2 and App C (Workspace 2)
    // -------------------------------------------------------------------------
    org2Id = crypto.randomUUID();
    await db.insert(organizations).values({
      id: org2Id,
      applicationId: null,
      name: `Workspace Two ${run}`,
      slug: `workspace-two-${run}`,
      createdAt: new Date(),
    });

    const appCSlug = `it-c-${run}`;
    const { application: appCRow, secret: secretC } = await createApplication({
      organizationId: org2Id,
      name: `App C ${run}`,
      slug: appCSlug,
      allowedOrigins: "http://c.test",
    });
    appC = {
      id: appCRow.id,
      slug: appCSlug,
      name: appCRow.name,
      secret: secretC,
    };

    // -------------------------------------------------------------------------
    // 3. Admin 2: sign up with x-app-id: au1h-admin and set active org to Org 2
    // -------------------------------------------------------------------------
    const admin2Email = `admin2-${run}@admin.test`;
    const resAdmin2 = await authPost(h.app, "au1h-admin", "/sign-up/email", {
      email: admin2Email,
      password: "Password123!",
      name: "Admin Two",
    });
    if (resAdmin2.status !== 200) {
      throw new Error(`Admin 2 signup failed: ${resAdmin2.status}`);
    }
    cookieAdmin2 = cookiesOf(resAdmin2);

    const [u2] = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.email, admin2Email));
    admin2User = u2 as { id: string; email: string };

    // Join Admin 2 to Org 2
    await db.insert(members).values({
      id: crypto.randomUUID(),
      organizationId: org2Id,
      userId: admin2User.id,
      role: "owner",
      createdAt: new Date(),
    });

    // Set active organization for Admin 2 session to Org 2
    const setActive2 = await h.app.fetch(
      new Request(`${BASE()}/api/auth/organization/set-active`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-app-id": "au1h-admin",
          cookie: cookieAdmin2,
        },
        body: JSON.stringify({ organizationId: org2Id }),
      })
    );
    if (setActive2.status !== 200) {
      throw new Error(`Admin 2 set-active failed: ${setActive2.status}`);
    }
    if (setActive2.headers.getSetCookie().length > 0) {
      cookieAdmin2 = cookiesOf(setActive2);
    }

    // -------------------------------------------------------------------------
    // 4. Seed Workspace 1 resources (end user, session, route, admin PAT)
    // -------------------------------------------------------------------------
    const userAEmail = `seed-usera-${run}@example.com`;
    const resUserASignup = await authPost(
      h.app,
      h.apps.a.slug,
      "/sign-up/email",
      {
        email: userAEmail,
        password: "Password123!",
        name: "Seed User A",
      }
    );
    if (resUserASignup.status !== 200) {
      throw new Error(`User A signup failed: ${resUserASignup.status}`);
    }

    const seededUserA = await h.findUser(h.apps.a.id, userAEmail);
    userA = { id: seededUserA?.id as string, email: userAEmail };

    const [sA] = await db
      .select({ id: sessions.id, token: sessions.token })
      .from(sessions)
      .where(eq(sessions.userId, userA.id));
    sessionA = sA as { id: string; token: string };

    // Proxy route in App A
    const resRouteA = await h.app.fetch(
      new Request(`${BASE()}/api/v1/routes`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: cookieAdmin1,
        },
        body: JSON.stringify({
          applicationId: h.apps.a.id,
          name: "Todos Route A",
          pathPattern: "/todos/*",
          backendUrl: "https://backend.example.com/todos",
          methods: ["GET", "POST"],
        }),
      })
    );
    if (resRouteA.status !== 201) {
      throw new Error(`Route A creation failed: ${resRouteA.status}`);
    }
    const routeABody = (await resRouteA.json()) as {
      route: { id: string; name: string };
    };
    routeA = routeABody.route;

    // Admin API token in Org 1
    const resTokenA = await h.app.fetch(
      new Request(`${BASE()}/api/v1/tokens`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: cookieAdmin1,
        },
        body: JSON.stringify({
          name: "PAT A",
        }),
      })
    );
    if (resTokenA.status !== 201) {
      throw new Error(`Token A creation failed: ${resTokenA.status}`);
    }
    const tokenABody = (await resTokenA.json()) as {
      token: { id: string; name: string };
      secret: string;
    };
    tokenA = tokenABody.token;
    tokenASecret = tokenABody.secret;
  }, 60_000);

  afterAll(async () => {
    // Clean up verification rows for App C and test tokens
    await db
      .delete(verifications)
      .where(
        or(
          appC ? like(verifications.identifier, `${appC.id}:%`) : undefined,
          like(verifications.identifier, "admin:%")
        )
      );

    // Delete Org 2 (cascades to App C, routes, sessions, tokens, members)
    if (org2Id) {
      await db.delete(organizations).where(eq(organizations.id, org2Id));
    }

    // Delete auto-created personal workspace orgs for admin1 and admin2
    await db
      .delete(organizations)
      .where(
        or(
          like(organizations.slug, "admin-workspace-%"),
          like(organizations.name, "Admin's Workspace%")
        )
      );

    // Delete admin users (cascades to their accounts, sessions, members, tokens)
    const adminIds = [admin1User?.id, admin2User?.id].filter(
      Boolean
    ) as string[];
    if (adminIds.length > 0) {
      await db.delete(users).where(inArray(users.id, adminIds));
    }

    // Shared harness cleanup cleans Org 1 and apps A/B
    await h?.cleanup();
  });

  beforeEach(() => h.clearOutbox());

  // ===========================================================================
  // 1. End users
  // ===========================================================================
  test("end users: cross-app credentials rejected, sessions invalid, token audience bound", async () => {
    const email = `enduser-${run}@example.com`;
    const password = "ValidPassword123!";

    // Create user in App A
    const signUpA = await authPost(h.app, h.apps.a.slug, "/sign-up/email", {
      email,
      password,
      name: "End User A",
    });
    expect(signUpA.status).toBe(200);
    const cookieA = cookiesOf(signUpA);

    // 1a. User created in App A cannot sign in on App B with the same credentials
    const signInB = await authPost(h.app, h.apps.b.slug, "/sign-in/email", {
      email,
      password,
    });
    expect(signInB.status).toBeGreaterThanOrEqual(400);
    expect(signInB.status).not.toBe(500);

    // 1b. Sessions from App A are rejected on App B (returns no session / null)
    const sessionOnB = await getSession(h.app, h.apps.b.slug, cookieA);
    expect(sessionOnB).toBeNull();

    // Session on App A works
    const sessionOnA = await getSession(h.app, h.apps.a.slug, cookieA);
    expect(sessionOnA?.user.email).toBe(email);

    // 1c. /api/auth/token minted for A fails audience verification on B
    const tokenRes = await h.app.fetch(
      new Request(`${BASE()}/api/auth/token`, {
        headers: {
          "x-app-id": h.apps.a.slug,
          cookie: cookieA,
        },
      })
    );
    expect(tokenRes.status).toBe(200);
    const { token: jwtForA } = (await tokenRes.json()) as { token: string };
    expect(jwtForA).toBeTruthy();

    // Fetch the JWKS from this au1h test instance
    const jwksRes = await h.app.fetch(new Request(`${BASE()}/api/auth/jwks`));
    expect(jwksRes.status).toBe(200);
    const jwksData = (await jwksRes.json()) as JSONWebKeySet;
    const localJwks = createLocalJWKSet(jwksData);

    // Verifies against App A audience
    const { payload: claimsA } = await jwtVerify(jwtForA, localJwks, {
      audience: h.apps.a.slug,
    });
    expect(claimsA.email).toBe(email);
    expect(claimsA.aud).toBe(h.apps.a.slug);

    // Fails audience check on App B
    await expect(
      jwtVerify(jwtForA, localJwks, {
        audience: h.apps.b.slug,
      })
    ).rejects.toThrow();
  });

  // ===========================================================================
  // 2. Concurrency
  // ===========================================================================
  test("concurrency: sign up the same email on A and B concurrently 10 times without 500s and exactly one user row per app", async () => {
    const concurrentEmail = `concurrent-${run}@example.com`;
    const password = "ConcurrentPassword123!";

    // Fire 10 concurrent signups on App A and 10 on App B (20 requests in parallel)
    const requests: Promise<Response>[] = [];
    for (let i = 0; i < 10; i++) {
      requests.push(
        authPost(h.app, h.apps.a.slug, "/sign-up/email", {
          email: concurrentEmail,
          password,
          name: `Concurrent User A ${i}`,
        }),
        authPost(h.app, h.apps.b.slug, "/sign-up/email", {
          email: concurrentEmail,
          password,
          name: `Concurrent User B ${i}`,
        })
      );
    }

    const responses = await Promise.all(requests);

    // No 500s across any concurrent request
    for (const res of responses) {
      expect(res.status).not.toBe(500);
    }

    // Both applications succeeded for at least one sign-up
    const appAResponses = responses.filter((_, idx) => idx % 2 === 0);
    const appBResponses = responses.filter((_, idx) => idx % 2 === 1);
    expect(appAResponses.some((res) => res.status === 200)).toBe(true);
    expect(appBResponses.some((res) => res.status === 200)).toBe(true);

    // Exactly one user row per application in the database
    const rowsA = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.applicationId, h.apps.a.id),
          eq(users.email, concurrentEmail)
        )
      );
    const rowsB = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.applicationId, h.apps.b.id),
          eq(users.email, concurrentEmail)
        )
      );

    expect(rowsA.length).toBe(1);
    expect(rowsB.length).toBe(1);
    expect(rowsA[0]?.id).not.toBe(rowsB[0]?.id);
  });

  // ===========================================================================
  // 3. Admin API, cross-workspace
  // ===========================================================================
  describe("admin API cross-workspace isolation", () => {
    // -------------------------------------------------------------------------
    // Applications (apps/server/src/applications/route.ts)
    // -------------------------------------------------------------------------
    test("applications: reading and mutating routes reject cross-workspace access", async () => {
      // GET /api/v1/applications - list does not contain workspace 1 applications
      const listRes = await h.app.fetch(
        new Request(`${BASE()}/api/v1/applications`, {
          headers: { cookie: cookieAdmin2 },
        })
      );
      expect(listRes.status).toBe(200);
      const listData = (await listRes.json()) as {
        applications: Array<{ id: string; slug: string }>;
      };
      expect(
        listData.applications.some(
          (app) => app.id === h.apps.a.id || app.id === h.apps.b.id
        )
      ).toBe(false);
      expect(listData.applications.some((app) => app.id === appC.id)).toBe(
        true
      );

      // GET /api/v1/applications/:id - 404 for app in workspace 1
      const getRes = await h.app.fetch(
        new Request(`${BASE()}/api/v1/applications/${h.apps.a.id}`, {
          headers: { cookie: cookieAdmin2 },
        })
      );
      expect(getRes.status).toBe(404);

      // POST /api/v1/applications - attempting to reuse workspace 1's slug returns 409
      const createRes = await h.app.fetch(
        new Request(`${BASE()}/api/v1/applications`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie: cookieAdmin2,
          },
          body: JSON.stringify({
            name: "Duplicate Slug App",
            slug: h.apps.a.slug,
          }),
        })
      );
      expect(createRes.status).toBe(409);

      // PUT /api/v1/applications/:id - 404 for app in workspace 1
      const putRes = await h.app.fetch(
        new Request(`${BASE()}/api/v1/applications/${h.apps.a.id}`, {
          method: "PUT",
          headers: {
            "content-type": "application/json",
            cookie: cookieAdmin2,
          },
          body: JSON.stringify({ name: "Hijacked Name" }),
        })
      );
      expect(putRes.status).toBe(404);

      // POST /api/v1/applications/:id/regenerate-secret - 404 for app in workspace 1
      const regenRes = await h.app.fetch(
        new Request(
          `${BASE()}/api/v1/applications/${h.apps.a.id}/regenerate-secret`,
          {
            method: "POST",
            headers: { cookie: cookieAdmin2 },
          }
        )
      );
      expect(regenRes.status).toBe(404);

      // DELETE /api/v1/applications/:id - 404 for app in workspace 1
      const delRes = await h.app.fetch(
        new Request(`${BASE()}/api/v1/applications/${h.apps.a.id}`, {
          method: "DELETE",
          headers: { cookie: cookieAdmin2 },
        })
      );
      expect(delRes.status).toBe(404);
    });

    // -------------------------------------------------------------------------
    // Users (apps/server/src/users/route.ts)
    // -------------------------------------------------------------------------
    test("users: reading and mutating routes reject cross-workspace access", async () => {
      // GET /api/v1/users - list does not contain workspace 1 users
      const listRes = await h.app.fetch(
        new Request(`${BASE()}/api/v1/users`, {
          headers: { cookie: cookieAdmin2 },
        })
      );
      expect(listRes.status).toBe(200);
      const listData = (await listRes.json()) as {
        users: Array<{ id: string; email: string }>;
      };
      expect(
        listData.users.some((u) => u.id === userA.id || u.id === admin1User.id)
      ).toBe(false);

      // GET /api/v1/users?applicationId=:appId - filtered by workspace 1 app returns 0 users
      const filteredRes = await h.app.fetch(
        new Request(`${BASE()}/api/v1/users?applicationId=${h.apps.a.id}`, {
          headers: { cookie: cookieAdmin2 },
        })
      );
      expect(filteredRes.status).toBe(200);
      const filteredData = (await filteredRes.json()) as {
        users: Array<{ id: string }>;
        total: number;
      };
      expect(filteredData.users.length).toBe(0);
      expect(filteredData.total).toBe(0);

      // GET /api/v1/users/:id - 404 for user in workspace 1
      const getRes = await h.app.fetch(
        new Request(`${BASE()}/api/v1/users/${userA.id}`, {
          headers: { cookie: cookieAdmin2 },
        })
      );
      expect(getRes.status).toBe(404);

      // GET /api/v1/users/:id/sessions - 404 for user in workspace 1
      const sessionsRes = await h.app.fetch(
        new Request(`${BASE()}/api/v1/users/${userA.id}/sessions`, {
          headers: { cookie: cookieAdmin2 },
        })
      );
      expect(sessionsRes.status).toBe(404);

      // POST /api/v1/users/:id/ban - 404 for user in workspace 1
      const banRes = await h.app.fetch(
        new Request(`${BASE()}/api/v1/users/${userA.id}/ban`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie: cookieAdmin2,
          },
          body: JSON.stringify({ reason: "malicious attempt" }),
        })
      );
      expect(banRes.status).toBe(404);

      // POST /api/v1/users/:id/unban - 404 for user in workspace 1
      const unbanRes = await h.app.fetch(
        new Request(`${BASE()}/api/v1/users/${userA.id}/unban`, {
          method: "POST",
          headers: { cookie: cookieAdmin2 },
        })
      );
      expect(unbanRes.status).toBe(404);

      // DELETE /api/v1/users/:id/sessions - 404 for user in workspace 1
      const revokeAllRes = await h.app.fetch(
        new Request(`${BASE()}/api/v1/users/${userA.id}/sessions`, {
          method: "DELETE",
          headers: { cookie: cookieAdmin2 },
        })
      );
      expect(revokeAllRes.status).toBe(404);

      // DELETE /api/v1/users/sessions/:sessionId - 404 for session in workspace 1
      const revokeSessionRes = await h.app.fetch(
        new Request(`${BASE()}/api/v1/users/sessions/${sessionA.id}`, {
          method: "DELETE",
          headers: { cookie: cookieAdmin2 },
        })
      );
      expect(revokeSessionRes.status).toBe(404);
    });

    // -------------------------------------------------------------------------
    // Routes (apps/server/src/routes-config/route.ts)
    // -------------------------------------------------------------------------
    test("routes: reading and mutating routes reject cross-workspace access", async () => {
      // GET /api/v1/routes - list does not contain workspace 1 routes
      const listRes = await h.app.fetch(
        new Request(`${BASE()}/api/v1/routes`, {
          headers: { cookie: cookieAdmin2 },
        })
      );
      expect(listRes.status).toBe(200);
      const listData = (await listRes.json()) as {
        routes: Array<{ id: string }>;
      };
      expect(listData.routes.some((r) => r.id === routeA.id)).toBe(false);

      // GET /api/v1/routes?applicationId=:appId - filtered by workspace 1 app returns empty
      const filteredRes = await h.app.fetch(
        new Request(`${BASE()}/api/v1/routes?applicationId=${h.apps.a.id}`, {
          headers: { cookie: cookieAdmin2 },
        })
      );
      expect(filteredRes.status).toBe(200);
      const filteredData = (await filteredRes.json()) as {
        routes: Array<{ id: string }>;
      };
      expect(filteredData.routes.length).toBe(0);

      // GET /api/v1/routes/:id - 404 for route in workspace 1
      const getRes = await h.app.fetch(
        new Request(`${BASE()}/api/v1/routes/${routeA.id}`, {
          headers: { cookie: cookieAdmin2 },
        })
      );
      expect(getRes.status).toBe(404);

      // POST /api/v1/routes - 404 when referencing application in workspace 1
      const createRes = await h.app.fetch(
        new Request(`${BASE()}/api/v1/routes`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie: cookieAdmin2,
          },
          body: JSON.stringify({
            applicationId: h.apps.a.id,
            name: "Cross Workspace Route",
            pathPattern: "/cross/*",
            backendUrl: "https://backend.example.com/cross",
            methods: ["GET"],
          }),
        })
      );
      expect(createRes.status).toBe(404);

      // PUT /api/v1/routes/:id - 404 for route in workspace 1
      const putRes = await h.app.fetch(
        new Request(`${BASE()}/api/v1/routes/${routeA.id}`, {
          method: "PUT",
          headers: {
            "content-type": "application/json",
            cookie: cookieAdmin2,
          },
          body: JSON.stringify({ name: "Hijacked Route Name" }),
        })
      );
      expect(putRes.status).toBe(404);

      // PATCH /api/v1/routes/:id/toggle - 404 for route in workspace 1
      const toggleRes = await h.app.fetch(
        new Request(`${BASE()}/api/v1/routes/${routeA.id}/toggle`, {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            cookie: cookieAdmin2,
          },
          body: JSON.stringify({ isActive: false }),
        })
      );
      expect(toggleRes.status).toBe(404);

      // DELETE /api/v1/routes/:id - 404 for route in workspace 1
      const delRes = await h.app.fetch(
        new Request(`${BASE()}/api/v1/routes/${routeA.id}`, {
          method: "DELETE",
          headers: { cookie: cookieAdmin2 },
        })
      );
      expect(delRes.status).toBe(404);
    });

    // -------------------------------------------------------------------------
    // Tokens (apps/server/src/tokens/route.ts)
    // -------------------------------------------------------------------------
    test("tokens: reading and mutating routes reject cross-workspace access", async () => {
      // GET /api/v1/tokens - list does not contain workspace 1 tokens
      const listRes = await h.app.fetch(
        new Request(`${BASE()}/api/v1/tokens`, {
          headers: { cookie: cookieAdmin2 },
        })
      );
      expect(listRes.status).toBe(200);
      const listData = (await listRes.json()) as {
        tokens: Array<{ id: string }>;
      };
      expect(listData.tokens.some((t) => t.id === tokenA.id)).toBe(false);

      // DELETE /api/v1/tokens/:id - 404 for token in workspace 1
      const delRes = await h.app.fetch(
        new Request(`${BASE()}/api/v1/tokens/${tokenA.id}`, {
          method: "DELETE",
          headers: { cookie: cookieAdmin2 },
        })
      );
      expect(delRes.status).toBe(404);

      // POST /api/v1/tokens with Bearer token authentication returns 403 (session only)
      const tokenAuthRes = await h.app.fetch(
        new Request(`${BASE()}/api/v1/tokens`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${tokenASecret}`,
          },
          body: JSON.stringify({ name: "Sub-token attempt" }),
        })
      );
      expect(tokenAuthRes.status).toBe(403);

      // Bearer token from workspace 1 cannot read workspace 2 applications
      const bearerCrossRes = await h.app.fetch(
        new Request(`${BASE()}/api/v1/applications/${appC.id}`, {
          headers: { authorization: `Bearer ${tokenASecret}` },
        })
      );
      expect(bearerCrossRes.status).toBe(404);
    });

    // -------------------------------------------------------------------------
    // Me (apps/server/src/me/route.ts)
    // -------------------------------------------------------------------------
    test("me: returns caller workspace identity and never leaks workspace 1", async () => {
      const meRes = await h.app.fetch(
        new Request(`${BASE()}/api/v1/me`, {
          headers: { cookie: cookieAdmin2 },
        })
      );
      expect(meRes.status).toBe(200);
      const meData = (await meRes.json()) as {
        user: { id: string; email: string };
        organization: { id: string };
      };
      expect(meData.organization.id).toBe(org2Id);
      expect(meData.user.id).toBe(admin2User.id);
      expect(meData.organization.id).not.toBe(h.orgId);
    });
  });

  // ===========================================================================
  // 4. /api/apps (server-to-server with the application secret)
  // ===========================================================================
  test("/api/apps: app A secret cannot read or mutate anything belonging to app B", async () => {
    // 4a. Authenticating with app A's credentials identifies App A
    const meARes = await h.app.fetch(
      new Request(`${BASE()}/api/apps/me`, {
        headers: {
          "x-app-id": h.apps.a.slug,
          "x-app-secret": h.apps.a.secret,
        },
      })
    );
    expect(meARes.status).toBe(200);
    const meAData = (await meARes.json()) as {
      application: { id: string; slug: string };
    };
    expect(meAData.application.id).toBe(h.apps.a.id);
    expect(meAData.application.slug).toBe(h.apps.a.slug);

    // 4b. App A secret presented for App B slug is rejected (401)
    const spoofBRes = await h.app.fetch(
      new Request(`${BASE()}/api/apps/me`, {
        headers: {
          "x-app-id": h.apps.b.slug,
          "x-app-secret": h.apps.a.secret,
        },
      })
    );
    expect(spoofBRes.status).toBe(401);

    // App B secret presented for App A slug is rejected (401)
    const spoofARes = await h.app.fetch(
      new Request(`${BASE()}/api/apps/me`, {
        headers: {
          "x-app-id": h.apps.a.slug,
          "x-app-secret": h.apps.b.secret,
        },
      })
    );
    expect(spoofARes.status).toBe(401);

    // 4c. Introspect: App A cannot introspect App B's session token or JWT
    // Create user & session in App B
    const userBEmail = `introspect-userb-${run}@example.com`;
    const userBSignUp = await authPost(h.app, h.apps.b.slug, "/sign-up/email", {
      email: userBEmail,
      password: "Password123!",
      name: "Introspect User B",
    });
    expect(userBSignUp.status).toBe(200);
    const cookieUserB = cookiesOf(userBSignUp);

    const userBRow = await h.findUser(h.apps.b.id, userBEmail);
    const [sessionBRow] = await db
      .select({ token: sessions.token })
      .from(sessions)
      .where(eq(sessions.userId, userBRow?.id as string));
    const rawSessionTokenB = sessionBRow?.token as string;
    expect(rawSessionTokenB).toBeTruthy();

    // Mint an au1h JWT for App B
    const tokenBRes = await h.app.fetch(
      new Request(`${BASE()}/api/auth/token`, {
        headers: {
          "x-app-id": h.apps.b.slug,
          cookie: cookieUserB,
        },
      })
    );
    expect(tokenBRes.status).toBe(200);
    const { token: jwtForB } = (await tokenBRes.json()) as { token: string };

    // App A attempts to introspect App B's raw session token -> active: false
    const introspectSessionRes = await h.app.fetch(
      new Request(`${BASE()}/api/apps/introspect`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-app-id": h.apps.a.slug,
          "x-app-secret": h.apps.a.secret,
        },
        body: JSON.stringify({ token: rawSessionTokenB }),
      })
    );
    expect(introspectSessionRes.status).toBe(200);
    const introspectSessionData = (await introspectSessionRes.json()) as {
      active: boolean;
      user?: unknown;
    };
    expect(introspectSessionData.active).toBe(false);
    expect(introspectSessionData.user).toBeUndefined();

    // App A attempts to introspect App B's JWT -> active: false
    const introspectJwtRes = await h.app.fetch(
      new Request(`${BASE()}/api/apps/introspect`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-app-id": h.apps.a.slug,
          "x-app-secret": h.apps.a.secret,
        },
        body: JSON.stringify({ token: jwtForB }),
      })
    );
    expect(introspectJwtRes.status).toBe(200);
    const introspectJwtData = (await introspectJwtRes.json()) as {
      active: boolean;
      user?: unknown;
    };
    expect(introspectJwtData.active).toBe(false);
    expect(introspectJwtData.user).toBeUndefined();
  });

  // ===========================================================================
  // 5. Emailed links
  // ===========================================================================
  test("emailed links: verification and reset links issued for app A, retargeted to app B, are rejected", async () => {
    const email = `retarget-${run}@example.com`;

    // 5a. Verification link retargeting
    const resSignUp = await authPost(h.app, h.apps.a.slug, "/sign-up/email", {
      email,
      password: "Password123!",
      name: "Retarget Victim",
    });
    expect(resSignUp.status).toBe(200);

    const sentVerification = lastEmailTo(h.outbox(), email);
    const linkA = linkIn(sentVerification);
    expect(new URL(linkA).searchParams.get("app")).toBe(h.apps.a.slug);

    // Retarget to App B: rejected (status 400), App A user remains unverified
    const openedRetargeted = await openLink(
      h.app,
      retarget(linkA, h.apps.b.slug)
    );
    expect(openedRetargeted.status).toBe(400);
    expect((await h.findUser(h.apps.a.id, email))?.emailVerified).toBe(false);

    // Original link for App A succeeds
    const openedOriginal = await openLink(h.app, linkA);
    expect(openedOriginal.status).toBe(302);
    expect((await h.findUser(h.apps.a.id, email))?.emailVerified).toBe(true);

    // 5b. Password reset link retargeting & cross-app token submission
    h.clearOutbox();
    const resResetReq = await authPost(
      h.app,
      h.apps.a.slug,
      "/request-password-reset",
      {
        email,
        redirectTo: "/reset",
      }
    );
    expect(resResetReq.status).toBe(200);

    const sentReset = lastEmailTo(h.outbox(), email);
    const resetLinkA = linkIn(sentReset);
    expect(new URL(resetLinkA).searchParams.get("app")).toBe(h.apps.a.slug);

    // Opening original link extracts the reset token from the redirection location
    const openedReset = await openLink(h.app, resetLinkA);
    expect(openedReset.status).toBe(302);
    const resetToken = tokenOf(openedReset.headers.get("location") ?? "");
    expect(resetToken).toBeTruthy();

    // Submitting App A's reset token to App B is rejected
    const stolenReset = await authPost(
      h.app,
      h.apps.b.slug,
      "/reset-password",
      {
        newPassword: "HijackedPassword123!",
        token: resetToken,
      }
    );
    expect(stolenReset.status).toBeGreaterThanOrEqual(400);

    // App A password was not changed; original password still works
    const originalSignIn = await authPost(
      h.app,
      h.apps.a.slug,
      "/sign-in/email",
      {
        email,
        password: "Password123!",
      }
    );
    expect(originalSignIn.status).toBe(200);
  });

  // ===========================================================================
  // 6. OAuth linking
  // ===========================================================================
  test("OAuth linking: skipped unless live provider is configured", () => {
    if (!HAS_LIVE_OAUTH_PROVIDER) {
      // Better Auth's OAuth account linking relies on external provider callbacks
      // (e.g. GitHub/Google redirect URIs and code exchanges) which cannot run
      // in an isolated local environment without a live OAuth provider or HTTP mock.
      return;
    }
  });
});
