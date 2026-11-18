/**
 * Runs against a live au1h. Skipped unless the fixture is present; start it
 * with `bun run test:sdks -- client` in apps/server.
 *
 * The client is written for browsers, which keep cookies. Bun's `fetch` does
 * not, so this file wraps `fetch` with a small cookie jar scoped to the au1h
 * origin. Everything else is the real client against the real server.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { Au1hError, createAu1hClient, memoryStorage } from "../src/index";
import { createAu1hClient as createReactClient } from "../src/react";

const env = (name: string) => process.env[`AU1H_TEST_${name}`] ?? "";
const LIVE = env("URL") !== "";
const live = LIVE ? describe : describe.skip;

const fx = {
  // describe.skip still evaluates its body, so the URL must always parse.
  url: env("URL") || "http://au1h.invalid",
  appId: env("APP_ID"),
  appSlug: env("APP_SLUG") || "app",
  otherAppSlug: env("OTHER_APP_SLUG") || "other",
};

const EXPIRED_COOKIE = /max-age=0/i;
const realFetch = globalThis.fetch;
const jar = new Map<string, string>();

function installCookieJar(): void {
  const withJar = async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const request = new Request(input, init);
    if (!request.url.startsWith(fx.url)) {
      return realFetch(request);
    }
    if (jar.size > 0) {
      request.headers.set(
        "cookie",
        [...jar].map(([name, value]) => `${name}=${value}`).join("; ")
      );
    }
    const response = await realFetch(request);
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";")[0] ?? "";
      const eq = pair.indexOf("=");
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1);
      if (value === "" || EXPIRED_COOKIE.test(cookie)) {
        jar.delete(name);
      } else {
        jar.set(name, value);
      }
    }
    return response;
  };
  globalThis.fetch = withJar as typeof fetch;
}

// Installed before any client exists: Better Auth captures `fetch` when the
// client is created.
if (LIVE) {
  installCookieJar();
}

live("@au1h/client against a live au1h", () => {
  const email = `client-${fx.appSlug}@example.com`;
  const password = "ValidPassword123!";
  const auth = createAu1hClient({
    baseURL: fx.url,
    appSlug: fx.appSlug,
    tokenStorage: memoryStorage(),
  });

  afterAll(() => {
    globalThis.fetch = realFetch;
  });

  test("before sign-in there is no session and no token", async () => {
    const session = await auth.getSession();
    expect(session.data).toBeNull();
    const error = await auth.getToken().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Au1hError);
    expect((error as Au1hError).status).toBe(401);
  });

  test("sign-up through the client creates a session in this application", async () => {
    const res = await auth.signUp.email({
      email,
      password,
      name: "Zoë Client",
    });
    expect(res.error).toBeNull();
    const session = await auth.getSession();
    expect(session.data?.user.email).toBe(email);
  });

  test("getToken returns a JWT for this user and this application", async () => {
    const token = await auth.getToken();
    expect(token.split(".")).toHaveLength(3);
    const claims = auth.getClaims();
    expect(claims?.email).toBe(email);
    expect(claims?.name).toBe("Zoë Client");
    expect(claims?.aud).toBe(fx.appSlug);
    expect(claims?.applicationId).toBe(fx.appId);
    expect(claims?.iss).toBe(fx.url);
    expect(claims?.exp).toBeGreaterThan(Date.now() / 1000);
    // Cached: the second call is the same token.
    expect(await auth.getToken()).toBe(token);
  });

  test("the same browser session is not a session in another application", async () => {
    const other = createAu1hClient({
      baseURL: fx.url,
      appSlug: fx.otherAppSlug,
      tokenStorage: memoryStorage(),
    });
    const session = await other.getSession();
    expect(session.data).toBeNull();
    const error = await other.getToken().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Au1hError);
    expect((error as Au1hError).status).toBe(401);
  });

  test("proxyFetch reaches the gateway as this application", async () => {
    // No route is configured, so the gateway answers 404 and names what it
    // was asked for: proof that the path and x-app-id arrived.
    const res = await auth.proxyFetch("/client-live/ping");
    expect(res.status).toBe(404);
    const body = (await res.json()) as { message: string };
    expect(body.message).toContain("GET /client-live/ping");
    expect(body.message).toContain(fx.appSlug);
  });

  test("a wrong password is reported, not thrown", async () => {
    jar.clear();
    const res = await auth.signIn.email({ email, password: "wrong-password" });
    expect(res.data).toBeNull();
    expect(res.error?.status).toBe(401);
  });

  test("sign-in, then sign-out drops the cached JWT and the session", async () => {
    const signIn = await auth.signIn.email({ email, password });
    expect(signIn.error).toBeNull();
    await auth.getToken();
    expect(auth.getClaims()).not.toBeNull();

    const signOut = await auth.signOut();
    expect(signOut.error).toBeNull();
    expect(auth.getClaims()).toBeNull();
    expect((await auth.getSession()).data).toBeNull();
    const error = await auth.getToken().catch((e: unknown) => e);
    expect((error as Au1hError).status).toBe(401);
  });

  test("the built-in magic-link and email-OTP methods exist", () => {
    expect(typeof auth.signIn.magicLink).toBe("function");
    expect(typeof auth.emailOtp.sendVerificationOtp).toBe("function");
    expect(auth.appSlug).toBe(fx.appSlug);
  });

  test("the React entry point builds the same client plus useSession", () => {
    const react = createReactClient({
      baseURL: fx.url,
      appSlug: fx.appSlug,
      tokenStorage: memoryStorage(),
    });
    expect(typeof react.useSession).toBe("function");
    expect(typeof react.getToken).toBe("function");
    expect(typeof react.proxyFetch).toBe("function");
    expect(react.appSlug).toBe(fx.appSlug);
  });
});
