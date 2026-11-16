/**
 * Runs against a live au1h. Skipped unless the fixture is present; start it
 * with `bun run test:sdks -- ts` in apps/server.
 */
import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import {
  requireAu1hProxy as expressProxy,
  requireAu1hUser as expressUser,
} from "../src/express";
import {
  type Au1hEnv,
  type Au1hProxyEnv,
  requireAu1hProxy,
  requireAu1hUser,
} from "../src/hono";
import {
  Au1hAuthError,
  createServerClient,
  createVerifier,
} from "../src/index";

const env = (name: string) => process.env[`AU1H_TEST_${name}`] ?? "";
const LIVE = env("URL") !== "";
const live = LIVE ? describe : describe.skip;

const fx = {
  // describe.skip still evaluates its body, so the URL must always parse.
  url: env("URL") || "http://au1h.invalid",
  appId: env("APP_ID"),
  appSlug: env("APP_SLUG"),
  appSecret: env("APP_SECRET"),
  otherAppSlug: env("OTHER_APP_SLUG"),
  userId: env("USER_ID"),
  email: env("USER_EMAIL"),
  access: env("ACCESS_TOKEN"),
  otherApp: env("OTHER_APP_TOKEN"),
  expired: env("EXPIRED_TOKEN"),
  session: env("SESSION_TOKEN"),
  proxy: env("PROXY_TOKEN"),
};

function tamper(token: string): string {
  const [header, payload, signature] = token.split(".");
  const claims = JSON.parse(
    Buffer.from(payload as string, "base64url").toString()
  );
  const forged = Buffer.from(
    JSON.stringify({ ...claims, sub: "someone-else" })
  ).toString("base64url");
  return `${header}.${forged}.${signature}`;
}

async function rejection(promise: Promise<unknown>): Promise<Au1hAuthError> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof Au1hAuthError) {
      return err;
    }
    throw err;
  }
  throw new Error("expected the call to be rejected");
}

live("createVerifier", () => {
  // A trailing slash must not break issuer or JWKS resolution.
  const verifier = createVerifier({
    au1hUrl: `${fx.url}/`,
    appSlug: fx.appSlug,
  });

  test("accepts an access token for this application", async () => {
    const claims = await verifier.verify(fx.access);
    expect(claims.sub).toBe(fx.userId);
    expect(claims.email).toBe(fx.email);
    expect(claims.applicationId).toBe(fx.appId);
    expect(claims.aud).toBe(fx.appSlug);
  });

  test("another application's token is 403 WRONG_AUDIENCE", async () => {
    const err = await rejection(verifier.verify(fx.otherApp));
    expect([err.status, err.code]).toEqual([403, "WRONG_AUDIENCE"]);
  });

  test("an expired token is 401", async () => {
    const err = await rejection(verifier.verify(fx.expired));
    expect([err.status, err.code]).toEqual([401, "ERR_JWT_EXPIRED"]);
  });

  test("a tampered token is 401", async () => {
    const err = await rejection(verifier.verify(tamper(fx.access)));
    expect(err.status).toBe(401);
  });

  test("garbage is 401", async () => {
    const err = await rejection(verifier.verify("not-a-jwt"));
    expect(err.status).toBe(401);
  });

  test("a gateway proof token is not an access token", async () => {
    const err = await rejection(verifier.verify(fx.proxy));
    expect([err.status, err.code]).toEqual([401, "WRONG_TOKEN_TYPE"]);
  });

  test("verifyAuthorization needs a Bearer header", async () => {
    for (const header of [undefined, null, "", fx.access, "Basic abc"]) {
      const err = await rejection(verifier.verifyAuthorization(header));
      expect(err.code).toBe("MISSING_TOKEN");
    }
    const claims = await verifier.verifyAuthorization(`Bearer ${fx.access}`);
    expect(claims.sub).toBe(fx.userId);
  });

  test("verifyProxyToken accepts the proof token and checks it against the headers", async () => {
    const claims = await verifier.verifyProxyToken(fx.proxy, {
      userId: fx.userId,
      email: fx.email,
    });
    expect(claims.typ).toBe("au1h-proxy");

    const mismatch = await rejection(
      verifier.verifyProxyToken(fx.proxy, {
        userId: "someone-else",
        email: fx.email,
      })
    );
    expect(mismatch.code).toBe("PROXY_MISMATCH");

    const missing = await rejection(verifier.verifyProxyToken(null));
    expect(missing.code).toBe("MISSING_PROXY_TOKEN");
  });

  test("an access token is not a gateway proof token", async () => {
    const err = await rejection(verifier.verifyProxyToken(fx.access));
    expect([err.status, err.code]).toEqual([401, "WRONG_TOKEN_TYPE"]);
  });

  test("a verifier for another application rejects this application's tokens", async () => {
    const other = createVerifier({
      au1hUrl: fx.url,
      appSlug: fx.otherAppSlug,
    });
    const err = await rejection(other.verify(fx.access));
    expect(err.code).toBe("WRONG_AUDIENCE");
  });
});

live("Hono middleware", () => {
  const verifier = createVerifier({ au1hUrl: fx.url, appSlug: fx.appSlug });
  const app = new Hono<Au1hEnv>();
  app.use("/api/*", requireAu1hUser(verifier));
  app.get("/api/me", (c) => c.json(c.get("au1hUser")));

  const behindGateway = new Hono<Au1hProxyEnv>();
  behindGateway.use("/*", requireAu1hProxy(verifier));
  behindGateway.get("/me", (c) => c.json(c.get("au1hProxy").user));

  const gatewayHeaders = {
    "x-user-id": fx.userId,
    "x-user-email": fx.email,
    "x-app-id": fx.appId,
    "x-app-slug": fx.appSlug,
    "x-au1h-token": fx.proxy,
  };

  test("requireAu1hUser: 200 with the user, 401 without a token, 403 for another app", async () => {
    const ok = await app.request("/api/me", {
      headers: { authorization: `Bearer ${fx.access}` },
    });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ id: fx.userId, email: fx.email });

    const anonymous = await app.request("/api/me");
    expect(anonymous.status).toBe(401);
    expect(await anonymous.json()).toMatchObject({ code: "MISSING_TOKEN" });

    const otherApp = await app.request("/api/me", {
      headers: { authorization: `Bearer ${fx.otherApp}` },
    });
    expect(otherApp.status).toBe(403);
  });

  test("requireAu1hProxy: verified headers pass, forged or unproven ones do not", async () => {
    const ok = await behindGateway.request("/me", { headers: gatewayHeaders });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ id: fx.userId, email: fx.email });

    const direct = await behindGateway.request("/me");
    expect(await direct.json()).toMatchObject({ code: "NOT_PROXIED" });

    const forgedIdentity = await behindGateway.request("/me", {
      headers: { ...gatewayHeaders, "x-user-id": "victim" },
    });
    expect(forgedIdentity.status).toBe(401);
    expect(await forgedIdentity.json()).toMatchObject({
      code: "PROXY_MISMATCH",
    });

    const { "x-au1h-token": _dropped, ...noProof } = gatewayHeaders;
    const unproven = await behindGateway.request("/me", { headers: noProof });
    expect(await unproven.json()).toMatchObject({
      code: "MISSING_PROXY_TOKEN",
    });

    const accessAsProof = await behindGateway.request("/me", {
      headers: { ...gatewayHeaders, "x-au1h-token": fx.access },
    });
    expect(await accessAsProof.json()).toMatchObject({
      code: "WRONG_TOKEN_TYPE",
    });
  });
});

live("Express middleware", () => {
  const verifier = createVerifier({ au1hUrl: fx.url, appSlug: fx.appSlug });

  /** Just enough of Express's req/res for the middleware. */
  async function run(
    middleware: ReturnType<typeof expressUser>,
    headers: Record<string, string>
  ) {
    const result: { status?: number; body?: unknown; next: boolean } = {
      next: false,
    };
    const req = { headers } as Parameters<typeof middleware>[0];
    const res = {
      status(code: number) {
        result.status = code;
        return this;
      },
      json(body: unknown) {
        result.body = body;
        return this;
      },
    } as unknown as Parameters<typeof middleware>[1];
    await middleware(req, res, () => {
      result.next = true;
    });
    return { req, ...result };
  }

  test("requireAu1hUser sets req.au1hUser or answers 401/403", async () => {
    const ok = await run(expressUser(verifier), {
      authorization: `Bearer ${fx.access}`,
    });
    expect(ok.next).toBe(true);
    expect(ok.req.au1hUser?.id).toBe(fx.userId);

    const anonymous = await run(expressUser(verifier), {});
    expect([anonymous.next, anonymous.status]).toEqual([false, 401]);

    const otherApp = await run(expressUser(verifier), {
      authorization: `Bearer ${fx.otherApp}`,
    });
    expect([otherApp.next, otherApp.status]).toEqual([false, 403]);
  });

  test("requireAu1hProxy verifies the proof token against the headers", async () => {
    const headers = {
      "x-user-id": fx.userId,
      "x-user-email": fx.email,
      "x-app-id": fx.appId,
      "x-app-slug": fx.appSlug,
      "x-au1h-token": fx.proxy,
    };
    const ok = await run(expressProxy(verifier), headers);
    expect(ok.next).toBe(true);
    expect(ok.req.au1hProxy?.user.id).toBe(fx.userId);

    const forged = await run(expressProxy(verifier), {
      ...headers,
      "x-user-email": "victim@example.com",
    });
    expect([forged.next, forged.status]).toEqual([false, 401]);
  });
});

live("createServerClient", () => {
  const client = createServerClient({
    au1hUrl: fx.url,
    appSlug: fx.appSlug,
    appSecret: fx.appSecret,
  });

  test("me returns the application for a valid secret", async () => {
    expect(await client.me()).toEqual({
      application: { id: fx.appId, slug: fx.appSlug },
    });
  });

  test("a wrong secret is rejected", async () => {
    const bad = createServerClient({
      au1hUrl: fx.url,
      appSlug: fx.appSlug,
      appSecret: "au1h_sk_wrong",
    });
    const err = await rejection(bad.me());
    expect(err.code).toBe("SERVER_CLIENT");
  });

  test("introspect: this app's JWT and session token are active", async () => {
    const jwt = await client.introspect(fx.access);
    expect(jwt).toMatchObject({
      active: true,
      via: "jwt",
      user: { id: fx.userId, email: fx.email },
    });
    const session = await client.introspect(fx.session);
    expect(session).toMatchObject({
      active: true,
      via: "session",
      user: { id: fx.userId },
    });
  });

  test("introspect: another app's token, an expired token and garbage are inactive", async () => {
    for (const token of [fx.otherApp, fx.expired, fx.proxy, "garbage"]) {
      expect(await client.introspect(token)).toEqual({ active: false });
    }
  });
});
