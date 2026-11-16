import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { type Server, serve, sleep } from "bun";
import { createLocalJWKSet, type JSONWebKeySet, jwtVerify } from "jose";
import {
  authPost,
  baseUrl,
  cookiesOf,
  type Harness,
  INTEGRATION,
  startHarness,
} from "./harness";

const describeIntegration = INTEGRATION ? describe : describe.skip;

/** One request as the fake backend saw it. */
interface SeenRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: string;
}

/**
 * The gateway (`/proxy/*`) is a security boundary: it decides who may reach a
 * backend, which identity the backend is told about, and which client
 * headers are trusted. Each test here pins one promise the gateway docs make
 * (docs/concepts/gateway, docs/reference/headers), against a real backend
 * listening on loopback, through au1h's real HTTP listener.
 */
describeIntegration("gateway", () => {
  let h: Harness;
  let backend: Server<undefined>;
  let backendUrl: string;
  const seen: SeenRequest[] = [];

  let userA: { id: string; email: string; cookie: string; jwt: string };
  let cookieB: string;
  let gwRouteId: string;
  let savedEnv: Record<string, string | undefined>;

  const au1hHost = () => new URL(baseUrl()).host;
  const lastSeen = () => {
    const req = seen.at(-1);
    if (!req) {
      throw new Error("backend saw no request");
    }
    return req;
  };

  /** Make one proxied request and return the `x-au1h-token` the backend saw. */
  async function captureProxyToken(): Promise<string> {
    const res = await viaGateway("/gw/echo", {
      headers: { cookie: userA.cookie },
    });
    if (res.status !== 200) {
      throw new Error(`proxied request failed: ${res.status}`);
    }
    const token = lastSeen().headers["x-au1h-token"];
    if (!token) {
      throw new Error("backend saw no x-au1h-token");
    }
    return token;
  }

  /** Call the gateway over HTTP, as a browser or SDK would. */
  async function viaGateway(
    path: string,
    init: RequestInit & { slug?: string | null } = {}
  ): Promise<Response> {
    const { slug, ...rest } = init;
    const headers = new Headers(rest.headers);
    if (slug !== null) {
      headers.set("x-app-id", slug ?? h.apps.a.slug);
    }
    return await fetch(`${baseUrl()}/proxy${path}`, {
      ...rest,
      headers,
      redirect: "manual",
    });
  }

  beforeAll(async () => {
    savedEnv = {
      AU1H_TRUST_PROXY: process.env.AU1H_TRUST_PROXY,
      AU1H_PROXY_TIMEOUT_MS: process.env.AU1H_PROXY_TIMEOUT_MS,
      AU1H_PROXY_ALLOW_PRIVATE_BACKENDS:
        process.env.AU1H_PROXY_ALLOW_PRIVATE_BACKENDS,
    };
    // The socket address must be what the backend is told, not a client header.
    process.env.AU1H_TRUST_PROXY = "";
    process.env.AU1H_PROXY_TIMEOUT_MS = "1000";
    // Backends in this file live on loopback.
    process.env.AU1H_PROXY_ALLOW_PRIVATE_BACKENDS = "true";

    h = await startHarness();

    backend = serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch: async (req) => {
        const url = new URL(req.url);
        seen.push({
          method: req.method,
          path: url.pathname + url.search,
          headers: Object.fromEntries(req.headers.entries()),
          body: await req.text(),
        });
        switch (url.pathname) {
          case "/gw/slow":
            await sleep(2500);
            return new Response("late");
          case "/gw/redirect":
            return new Response(null, {
              status: 302,
              headers: { location: `${backendUrl}/gw/secret` },
            });
          case "/gw/set-cookie":
            return new Response("ok", {
              headers: {
                "set-cookie": "backend_session=abc; Path=/; HttpOnly",
              },
            });
          default:
            return Response.json(
              { echoed: url.pathname + url.search },
              {
                status: req.method === "POST" ? 201 : 200,
                headers: { "x-backend": "yes" },
              }
            );
        }
      },
    });
    backendUrl = `http://127.0.0.1:${backend.port}`;

    const { createRoute } = await import("../routes-config/service");
    const add = async (input: {
      app: { id: string };
      name: string;
      pathPattern: string;
      methods: string[];
      stripPrefix: boolean;
      url?: string;
    }) => {
      const route = await createRoute(h.orgId, {
        applicationId: input.app.id,
        name: input.name,
        pathPattern: input.pathPattern,
        backendUrl: input.url ?? backendUrl,
        methods: input.methods,
        stripPrefix: input.stripPrefix,
      });
      if (!route) {
        throw new Error(`could not create route ${input.name}`);
      }
      return route;
    };
    await add({
      app: h.apps.a,
      name: "todos",
      pathPattern: "/todos/*",
      methods: ["GET", "POST"],
      stripPrefix: true,
    });
    const gw = await add({
      app: h.apps.a,
      name: "gw",
      pathPattern: "/gw/*",
      methods: ["GET"],
      stripPrefix: false,
    });
    gwRouteId = gw.id;
    await add({
      app: h.apps.a,
      name: "orders",
      pathPattern: "/orders/:id",
      methods: ["GET"],
      stripPrefix: false,
    });
    // Nothing listens on port 1.
    await add({
      app: h.apps.a,
      name: "dead",
      pathPattern: "/dead/*",
      methods: ["GET"],
      stripPrefix: false,
      url: "http://127.0.0.1:1",
    });
    await add({
      app: h.apps.b,
      name: "todos-b",
      pathPattern: "/todos/*",
      methods: ["GET"],
      stripPrefix: true,
    });

    // One end user in app A, one in app B, same address.
    const email = `gw-${h.apps.a.slug}@example.com`;
    const password = "ValidPassword123!";
    const signUpA = await authPost(h.app, h.apps.a.slug, "/sign-up/email", {
      email,
      password,
      name: "Gateway User",
    });
    if (signUpA.status !== 200) {
      throw new Error(`sign-up A failed: ${signUpA.status}`);
    }
    const cookieA = cookiesOf(signUpA);
    const signUpB = await authPost(h.app, h.apps.b.slug, "/sign-up/email", {
      email,
      password,
      name: "Gateway User B",
    });
    if (signUpB.status !== 200) {
      throw new Error(`sign-up B failed: ${signUpB.status}`);
    }
    cookieB = cookiesOf(signUpB);

    const tokenRes = await h.app.fetch(
      new Request(`${baseUrl()}/api/auth/token`, {
        headers: { "x-app-id": h.apps.a.slug, cookie: cookieA },
      })
    );
    if (tokenRes.status !== 200) {
      throw new Error(`token mint failed: ${tokenRes.status}`);
    }
    const { token } = (await tokenRes.json()) as { token: string };
    const row = await h.findUser(h.apps.a.id, email);
    if (!row) {
      throw new Error("user A missing");
    }
    userA = { id: row.id, email, cookie: cookieA, jwt: token };
  }, 60_000);

  afterAll(async () => {
    backend?.stop(true);
    for (const [key, value] of Object.entries(savedEnv)) {
      process.env[key] = value ?? "";
    }
    await h?.cleanup();
  });

  beforeEach(() => {
    seen.length = 0;
  });

  // ---------------------------------------------------------------------------
  // Happy path
  // ---------------------------------------------------------------------------

  test("session cookie: the backend receives the user's identity and a verifiable proof token", async () => {
    const res = await viaGateway("/todos/1?x=1", {
      headers: { cookie: userA.cookie },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ echoed: "/1?x=1" });
    // Backend response headers are relayed.
    expect(res.headers.get("x-backend")).toBe("yes");

    const req = lastSeen();
    expect(req.method).toBe("GET");
    expect(req.headers["x-user-id"]).toBe(userA.id);
    expect(req.headers["x-user-email"]).toBe(userA.email);
    expect(req.headers["x-app-id"]).toBe(h.apps.a.id);
    expect(req.headers["x-app-slug"]).toBe(h.apps.a.slug);
    expect(req.headers.host).toBe(new URL(backendUrl).host);
    expect(req.headers["x-forwarded-host"]).toBe(au1hHost());
    expect(req.headers["x-forwarded-proto"]).toBe("http");
    expect(req.headers["x-forwarded-for"]).toBe("127.0.0.1");

    // x-au1h-token: signed by this au1h, audience = slug, marked as gateway proof.
    const proxyToken = req.headers["x-au1h-token"] as string;
    expect(proxyToken).toBeTruthy();
    const jwksRes = await fetch(`${baseUrl()}/api/auth/jwks`);
    const jwks = createLocalJWKSet((await jwksRes.json()) as JSONWebKeySet);
    const { payload } = await jwtVerify(proxyToken, jwks, {
      issuer: baseUrl(),
      audience: h.apps.a.slug,
    });
    expect(payload.sub).toBe(userA.id);
    expect(payload.email).toBe(userA.email);
    expect(payload.applicationId).toBe(h.apps.a.id);
    expect(payload.typ).toBe("au1h-proxy");
    expect(payload.req).toBe("GET /todos/1");
    expect((payload.exp ?? 0) - (payload.iat ?? 0)).toBe(60);
  });

  test("bearer JWT from /api/auth/token is accepted instead of a cookie", async () => {
    const res = await viaGateway("/todos/2", {
      headers: { authorization: `Bearer ${userA.jwt}` },
    });
    expect(res.status).toBe(200);
    expect(lastSeen().headers["x-user-id"]).toBe(userA.id);
  });

  test("request body, content-type and query string reach the backend; status and body come back", async () => {
    const res = await viaGateway("/todos?draft=1", {
      method: "POST",
      headers: { cookie: userA.cookie, "content-type": "application/json" },
      body: JSON.stringify({ title: "milk" }),
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ echoed: "/?draft=1" });
    const req = lastSeen();
    expect(req.method).toBe("POST");
    expect(req.headers["content-type"]).toBe("application/json");
    expect(JSON.parse(req.body)).toEqual({ title: "milk" });
  });

  test("backend Set-Cookie headers pass through to the client", async () => {
    const res = await viaGateway("/gw/set-cookie", {
      headers: { cookie: userA.cookie },
    });
    expect(res.status).toBe(200);
    expect(res.headers.getSetCookie()).toEqual([
      "backend_session=abc; Path=/; HttpOnly",
    ]);
  });

  // ---------------------------------------------------------------------------
  // Denials: nothing reaches a backend unauthenticated or from another app
  // ---------------------------------------------------------------------------

  test("no credentials: 401 and the backend is never called", async () => {
    const res = await viaGateway("/todos/1");
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: "Unauthorized" });
    expect(seen).toHaveLength(0);
  });

  test("another application's session is not recognised: 401", async () => {
    const res = await viaGateway("/todos/1", {
      headers: { cookie: cookieB },
    });
    expect(res.status).toBe(401);
    expect(seen).toHaveLength(0);
  });

  test("another application's JWT fails the audience check: 401", async () => {
    const res = await viaGateway("/todos/1", {
      slug: h.apps.b.slug,
      headers: { authorization: `Bearer ${userA.jwt}` },
    });
    expect(res.status).toBe(401);
    expect(seen).toHaveLength(0);
  });

  test("a tampered JWT is rejected: 401", async () => {
    const [header, payload, signature] = userA.jwt.split(".");
    const forged = Buffer.from(
      JSON.stringify({
        ...JSON.parse(Buffer.from(payload as string, "base64url").toString()),
        sub: "someone-else",
      })
    ).toString("base64url");
    const res = await viaGateway("/todos/1", {
      headers: { authorization: `Bearer ${header}.${forged}.${signature}` },
    });
    expect(res.status).toBe(401);
    expect(seen).toHaveLength(0);
  });

  test("the gateway's own x-au1h-token is not an access token: 401 as a bearer", async () => {
    const proxyToken = await captureProxyToken();
    seen.length = 0;
    const res = await viaGateway("/todos/1", {
      headers: { authorization: `Bearer ${proxyToken}` },
    });
    expect(res.status).toBe(401);
    expect(seen).toHaveLength(0);
  });

  test("unknown application, unmatched path or method, no x-app-id: 404 before any auth", async () => {
    const cases: [string, RequestInit & { slug?: string | null }][] = [
      ["/todos/1", { slug: "no-such-app", headers: { cookie: userA.cookie } }],
      ["/nowhere", { headers: { cookie: userA.cookie } }],
      ["/todosx/1", { headers: { cookie: userA.cookie } }],
      ["/orders/42/extra", { headers: { cookie: userA.cookie } }],
      ["/todos/1", { method: "DELETE", headers: { cookie: userA.cookie } }],
      ["/todos/1", { slug: null, headers: { cookie: userA.cookie } }],
    ];
    for (const [path, init] of cases) {
      const res = await viaGateway(path, init);
      expect(res.status).toBe(404);
    }
    expect(seen).toHaveLength(0);
  });

  test("a disabled route stops matching at once (cache invalidated)", async () => {
    const { updateRoute } = await import("../routes-config/service");
    await updateRoute(h.orgId, gwRouteId, { isActive: false });
    const off = await viaGateway("/gw/echo", {
      headers: { cookie: userA.cookie },
    });
    expect(off.status).toBe(404);
    await updateRoute(h.orgId, gwRouteId, { isActive: true });
    const on = await viaGateway("/gw/echo", {
      headers: { cookie: userA.cookie },
    });
    expect(on.status).toBe(200);
  });

  // ---------------------------------------------------------------------------
  // Header hygiene: clients cannot impersonate, the backend sees only au1h's view
  // ---------------------------------------------------------------------------

  test("client-sent identity, app and address headers are replaced, not forwarded", async () => {
    const res = await viaGateway("/gw/echo", {
      headers: {
        cookie: userA.cookie,
        "x-user-id": "victim",
        "x-user-email": "victim@example.com",
        "x-app-slug": "other-app",
        "x-forwarded-for": "203.0.113.9",
        "x-forwarded-host": "evil.example",
        "x-real-ip": "203.0.113.9",
        "proxy-authorization": "Basic Zm9vOmJhcg==",
        "x-custom-header": "kept",
      },
    });
    expect(res.status).toBe(200);
    const req = lastSeen();
    expect(req.headers["x-user-id"]).toBe(userA.id);
    expect(req.headers["x-user-email"]).toBe(userA.email);
    expect(req.headers["x-app-id"]).toBe(h.apps.a.id);
    expect(req.headers["x-app-slug"]).toBe(h.apps.a.slug);
    expect(req.headers["x-forwarded-for"]).toBe("127.0.0.1");
    expect(req.headers["x-forwarded-host"]).toBe(au1hHost());
    expect(req.headers["x-real-ip"]).toBeUndefined();
    expect(req.headers["proxy-authorization"]).toBeUndefined();
    expect(req.headers["x-custom-header"]).toBe("kept");
  });

  test("behind a trusted proxy the last x-forwarded-for hop is used", async () => {
    process.env.AU1H_TRUST_PROXY = "true";
    try {
      const res = await viaGateway("/gw/echo", {
        headers: {
          cookie: userA.cookie,
          "x-forwarded-for": "198.51.100.7, 203.0.113.9",
        },
      });
      expect(res.status).toBe(200);
      expect(lastSeen().headers["x-forwarded-for"]).toBe("203.0.113.9");
    } finally {
      process.env.AU1H_TRUST_PROXY = "";
    }
  });

  // ---------------------------------------------------------------------------
  // Path matching and strip prefix
  // ---------------------------------------------------------------------------

  test("strip prefix on: `/todos/*` forwards the remainder, including the bare prefix", async () => {
    const expectations: [string, string][] = [
      ["/todos", "/"],
      ["/todos/", "/"],
      ["/todos/7", "/7"],
      ["/todos/7/comments?page=2", "/7/comments?page=2"],
    ];
    for (const [path, forwarded] of expectations) {
      const res = await viaGateway(path, { headers: { cookie: userA.cookie } });
      expect(res.status).toBe(200);
      expect(lastSeen().path).toBe(forwarded);
    }
  });

  test("strip prefix off: the full path is forwarded; `:param` routes match one segment", async () => {
    const gw = await viaGateway("/gw/echo?a=1", {
      headers: { cookie: userA.cookie },
    });
    expect(gw.status).toBe(200);
    expect(lastSeen().path).toBe("/gw/echo?a=1");

    const order = await viaGateway("/orders/42", {
      headers: { cookie: userA.cookie },
    });
    expect(order.status).toBe(200);
    expect(lastSeen().path).toBe("/orders/42");
  });

  // ---------------------------------------------------------------------------
  // Backend failures: relayed redirects, timeouts, unreachable
  // ---------------------------------------------------------------------------

  test("backend redirects are relayed to the client, never followed by au1h", async () => {
    const res = await viaGateway("/gw/redirect", {
      headers: { cookie: userA.cookie },
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`${backendUrl}/gw/secret`);
    expect(seen.map((r) => r.path)).toEqual(["/gw/redirect"]);
  });

  test("a backend slower than AU1H_PROXY_TIMEOUT_MS gets a 504", async () => {
    const res = await viaGateway("/gw/slow", {
      headers: { cookie: userA.cookie },
    });
    expect(res.status).toBe(504);
    expect(await res.json()).toMatchObject({ error: "Gateway Timeout" });
  });

  test("an unreachable backend gets a 502", async () => {
    const res = await viaGateway("/dead/ping", {
      headers: { cookie: userA.cookie },
    });
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ error: "Proxy error" });
  });

  // ---------------------------------------------------------------------------
  // Admin API: private backends are refused by policy
  // ---------------------------------------------------------------------------

  test("the admin API refuses a private backend URL unless AU1H_PROXY_ALLOW_PRIVATE_BACKENDS=true", async () => {
    const { db } = await import("../db");
    const { members, users } = await import("../db/schema/auth");
    const { createToken } = await import("../tokens/service");
    const { eq } = await import("drizzle-orm");

    const adminId = crypto.randomUUID();
    await db.insert(users).values({
      id: adminId,
      applicationId: null,
      name: "Gateway Admin",
      email: `gw-admin-${h.apps.a.slug}@admin.test`,
      emailVerified: true,
    });
    await db.insert(members).values({
      id: crypto.randomUUID(),
      organizationId: h.orgId,
      userId: adminId,
      role: "owner",
      createdAt: new Date(),
    });
    const { secret } = await createToken({
      userId: adminId,
      organizationId: h.orgId,
      name: "gateway test",
    });

    const create = (url: string) =>
      h.app.fetch(
        new Request(`${baseUrl()}/api/v1/routes`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${secret}`,
          },
          body: JSON.stringify({
            applicationId: h.apps.a.id,
            name: "policy",
            pathPattern: "/policy/*",
            backendUrl: url,
            methods: ["GET"],
          }),
        })
      );

    try {
      process.env.AU1H_PROXY_ALLOW_PRIVATE_BACKENDS = "false";
      for (const url of [
        backendUrl,
        "http://localhost:8080",
        "http://169.254.169.254/latest/meta-data",
        "http://[::1]:8080",
        "http://api.internal",
      ]) {
        const res = await create(url);
        expect(res.status).toBe(400);
      }
      // Scheme and credential rules apply regardless of policy.
      expect((await create("ftp://backend.example.com")).status).toBe(400);
      expect((await create("http://user:pw@backend.example.com")).status).toBe(
        400
      );
      expect((await create("https://backend.example.com")).status).toBe(201);

      process.env.AU1H_PROXY_ALLOW_PRIVATE_BACKENDS = "true";
      expect((await create(backendUrl)).status).toBe(201);
    } finally {
      process.env.AU1H_PROXY_ALLOW_PRIVATE_BACKENDS = "true";
      await db.delete(users).where(eq(users.id, adminId));
    }
  });
});
