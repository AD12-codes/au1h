import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { generateKeyPair, SignJWT } from "jose";
import {
  authPost,
  baseUrl,
  cookiesOf,
  type Harness,
  INTEGRATION,
  startHarness,
} from "./harness";

const describeIntegration = INTEGRATION ? describe : describe.skip;

type Sign = (payload: Record<string, unknown>) => Promise<string>;

/**
 * `verifyAu1hJwt` decides whether a bearer token is a user access token of
 * this au1h for one application. Tokens are minted by the real server and
 * verified against its real JWKS over HTTP.
 */
describeIntegration("verifyAu1hJwt", () => {
  let h: Harness;
  let mod: typeof import("../lib/auth/verify-jwt");
  let sign: Sign;
  let user: { id: string; email: string };
  let tokenA: string;
  let tokenB: string;

  /** Claims of a well-formed access token for app A. */
  const claims = (over: Record<string, unknown> = {}) => {
    const now = Math.floor(Date.now() / 1000);
    return {
      sub: user.id,
      email: user.email,
      applicationId: h.apps.a.id,
      aud: h.apps.a.slug,
      iat: now,
      exp: now + 300,
      ...over,
    };
  };

  async function rejection(token: string, audience = h.apps.a.slug) {
    try {
      await mod.verifyAu1hJwt(token, audience);
    } catch (error) {
      return error as Error;
    }
    throw new Error("token was accepted");
  }

  beforeAll(async () => {
    h = await startHarness();
    mod = await import("../lib/auth/verify-jwt");
    const { auth } = await import("../lib/auth");
    const { runWithTenantStore } = await import("../lib/auth/tenant-context");
    const api = auth.api as unknown as {
      signJWT: (input: {
        headers: Headers;
        body: { payload: Record<string, unknown> };
      }) => Promise<{ token: string }>;
    };
    sign = async (payload) => {
      const { token } = await runWithTenantStore(() =>
        api.signJWT({
          headers: new Headers({ "x-app-id": h.apps.a.slug }),
          body: { payload },
        })
      );
      return token;
    };

    const email = `jwt-${h.apps.a.slug}@example.com`;
    async function accessToken(slug: string): Promise<string> {
      const signUp = await authPost(h.app, slug, "/sign-up/email", {
        email,
        password: "ValidPassword123!",
        name: "JWT User",
      });
      if (signUp.status !== 200) {
        throw new Error(`sign-up in ${slug} failed: ${signUp.status}`);
      }
      const res = await h.app.fetch(
        new Request(`${baseUrl()}/api/auth/token`, {
          headers: { "x-app-id": slug, cookie: cookiesOf(signUp) },
        })
      );
      if (res.status !== 200) {
        throw new Error(`token mint in ${slug} failed: ${res.status}`);
      }
      return ((await res.json()) as { token: string }).token;
    }
    tokenA = await accessToken(h.apps.a.slug);
    tokenB = await accessToken(h.apps.b.slug);
    const row = await h.findUser(h.apps.a.id, email);
    if (!row) {
      throw new Error("user missing");
    }
    user = { id: row.id, email };
  }, 60_000);

  afterAll(async () => {
    await h?.cleanup();
  });

  test("an access token from /api/auth/token verifies for its application", async () => {
    const payload = await mod.verifyAu1hJwt(tokenA, h.apps.a.slug);
    expect(payload.sub).toBe(user.id);
    expect(payload.email).toBe(user.email);
    expect(payload.applicationId).toBe(h.apps.a.id);
    expect(payload.aud).toBe(h.apps.a.slug);
    expect(payload.iss).toBe(baseUrl());
    expect(payload.typ).toBeUndefined();
  });

  test("the same token is rejected for another application's audience", async () => {
    const error = await rejection(tokenA, h.apps.b.slug);
    expect(error).toBeInstanceOf(mod.InvalidTokenError);
    expect(error.message).toBe("ERR_JWT_CLAIM_VALIDATION_FAILED");
  });

  test("another application's token is rejected", async () => {
    const error = await rejection(tokenB);
    expect(error).toBeInstanceOf(mod.InvalidTokenError);
    expect(error.message).toBe("ERR_JWT_CLAIM_VALIDATION_FAILED");
  });

  test("an expired token is rejected", async () => {
    const now = Math.floor(Date.now() / 1000);
    const error = await rejection(
      await sign(claims({ iat: now - 120, exp: now - 60 }))
    );
    expect(error).toBeInstanceOf(mod.InvalidTokenError);
    expect(error.message).toBe("ERR_JWT_EXPIRED");
  });

  test("a token whose payload was altered is rejected", async () => {
    const [header, , signature] = tokenA.split(".");
    const forged = Buffer.from(
      JSON.stringify(claims({ sub: "someone-else" }))
    ).toString("base64url");
    const error = await rejection(`${header}.${forged}.${signature}`);
    expect(error).toBeInstanceOf(mod.InvalidTokenError);
    expect(error.message).toBe("ERR_JWS_SIGNATURE_VERIFICATION_FAILED");
  });

  test("an unsigned 'alg: none' token is rejected", async () => {
    const part = (value: unknown) =>
      Buffer.from(JSON.stringify(value)).toString("base64url");
    const token = `${part({ alg: "none", typ: "JWT" })}.${part(
      claims({ iss: baseUrl() })
    )}.`;
    expect(await rejection(token)).toBeInstanceOf(mod.InvalidTokenError);
  });

  test("a token signed by someone else's key is rejected, even with our kid", async () => {
    const { privateKey } = await generateKeyPair("EdDSA");
    const ourKid = JSON.parse(
      Buffer.from(tokenA.split(".")[0] as string, "base64url").toString()
    ).kid as string;
    for (const kid of ["attacker-key", ourKid]) {
      const token = await new SignJWT(claims())
        .setProtectedHeader({ alg: "EdDSA", kid })
        .setIssuer(baseUrl())
        .sign(privateKey);
      expect(await rejection(token)).toBeInstanceOf(mod.InvalidTokenError);
    }
  });

  test("garbage is rejected", async () => {
    for (const token of ["", "not-a-jwt", "a.b.c"]) {
      expect(await rejection(token)).toBeInstanceOf(mod.InvalidTokenError);
    }
  });

  test("a token without an email is rejected", async () => {
    const error = await rejection(await sign(claims({ email: undefined })));
    expect(error).toBeInstanceOf(mod.InvalidTokenError);
    expect(error.message).toBe("token is missing sub or email");
  });

  test("the gateway's proof token is not an access token", async () => {
    const error = await rejection(
      await sign(claims({ typ: mod.PROXY_TOKEN_TYPE }))
    );
    expect(error).toBeInstanceOf(mod.InvalidTokenError);
    expect(error.message).toBe("a gateway proof token is not an access token");
  });

  test("rejections never echo the token", async () => {
    const error = await rejection(`${tokenA}x`);
    expect(error.message).not.toContain(tokenA.slice(0, 20));
  });
});
