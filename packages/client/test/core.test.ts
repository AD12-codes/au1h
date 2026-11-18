/**
 * Offline tests. The token manager talks to a stub au1h on a loopback port,
 * so requests are real HTTP rather than a mocked `fetch`.
 */
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { serve } from "bun";
import {
  Au1hError,
  betterAuthClientOptions,
  createTokenManager,
  decodeJwt,
  defaultStorage,
  localStorageStorage,
  memoryStorage,
  normalizeBaseURL,
} from "../src/core";

const SLUG = "my-app";

/** An unsigned token with the given claims; the client only decodes. */
function fakeJwt(claims: Record<string, unknown>): string {
  const part = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "EdDSA" })}.${part(claims)}.signature`;
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

interface Seen {
  method: string;
  path: string;
  headers: Record<string, string>;
}

/** Stub au1h: mints a new token per call, or answers with a canned failure. */
const stub = {
  mints: 0,
  ttl: 900,
  delayMs: 0,
  failure: null as Response | null,
  seen: [] as Seen[],
  reset() {
    this.mints = 0;
    this.ttl = 900;
    this.delayMs = 0;
    this.failure = null;
    this.seen = [];
  },
};

const server = serve({
  port: 0,
  hostname: "127.0.0.1",
  async fetch(req) {
    const url = new URL(req.url);
    const headers: Record<string, string> = {};
    req.headers.forEach((value, name) => {
      headers[name] = value;
    });
    stub.seen.push({
      method: req.method,
      path: url.pathname + url.search,
      headers,
    });
    if (url.pathname !== "/api/auth/token") {
      return Response.json({ echoed: url.pathname + url.search });
    }
    if (stub.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, stub.delayMs));
    }
    if (stub.failure) {
      return stub.failure.clone();
    }
    stub.mints += 1;
    return Response.json({
      token: fakeJwt({
        sub: "user-1",
        email: "ada@example.com",
        aud: SLUG,
        n: stub.mints,
        iat: nowSeconds(),
        exp: nowSeconds() + stub.ttl,
      }),
    });
  },
});
const baseURL = `http://127.0.0.1:${server.port}`;

afterAll(() => {
  server.stop(true);
});
beforeEach(() => {
  stub.reset();
});

const manager = (
  over: Partial<Parameters<typeof createTokenManager>[0]> = {}
) =>
  createTokenManager({
    baseURL,
    appSlug: SLUG,
    tokenStorage: memoryStorage(),
    ...over,
  });

describe("normalizeBaseURL", () => {
  test("drops trailing slashes and nothing else", () => {
    expect(normalizeBaseURL("https://auth.example.com")).toBe(
      "https://auth.example.com"
    );
    expect(normalizeBaseURL("https://auth.example.com/")).toBe(
      "https://auth.example.com"
    );
    expect(normalizeBaseURL("https://auth.example.com///")).toBe(
      "https://auth.example.com"
    );
    expect(normalizeBaseURL("https://example.com/auth/")).toBe(
      "https://example.com/auth"
    );
  });
});

describe("decodeJwt", () => {
  test("returns the payload of a token", () => {
    const claims = { sub: "u1", email: "ada@example.com", aud: SLUG, exp: 1 };
    expect(decodeJwt(fakeJwt(claims))).toMatchObject(claims);
  });

  test("handles base64url characters and missing padding", () => {
    // '>>>' and '???' encode to '-' and '_' in base64url.
    for (const name of ["a", "ab", "abc", ">>>>", "????"]) {
      expect(decodeJwt(fakeJwt({ name }))?.name).toBe(name);
    }
  });

  test("decodes names outside ASCII as UTF-8", () => {
    for (const name of ["José Ñandú", "Анна", "山田太郎", "Zoë 🎉"]) {
      expect(decodeJwt(fakeJwt({ name }))?.name).toBe(name);
    }
  });

  test("returns null instead of throwing on anything that is not a JWT", () => {
    const notJson = Buffer.from("plain text").toString("base64url");
    const notAnObject = Buffer.from("42").toString("base64url");
    for (const token of [
      "",
      "nope",
      "a.b",
      "a.!!!.c",
      "..",
      `a.${notJson}.c`,
      `a.${notAnObject}.c`,
    ]) {
      expect(decodeJwt(token)).toBeNull();
    }
  });
});

describe("token storage", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const install = (value: unknown) =>
    Object.defineProperty(globalThis, "localStorage", {
      value,
      configurable: true,
      writable: true,
    });
  afterEach(() => {
    if (original) {
      Object.defineProperty(globalThis, "localStorage", original);
    } else {
      install(undefined);
    }
  });

  function fakeLocalStorage() {
    const data = new Map<string, string>();
    return {
      data,
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value);
      },
      removeItem: (key: string) => {
        data.delete(key);
      },
    };
  }

  test("memoryStorage keeps, replaces and clears one token", () => {
    const storage = memoryStorage();
    expect(storage.get()).toBeNull();
    storage.set("one");
    storage.set("two");
    expect(storage.get()).toBe("two");
    storage.clear();
    expect(storage.get()).toBeNull();
  });

  test("two memory storages do not share a token", () => {
    const a = memoryStorage();
    const b = memoryStorage();
    a.set("only-a");
    expect(b.get()).toBeNull();
  });

  test("localStorageStorage reads and writes its own key", () => {
    const fake = fakeLocalStorage();
    install(fake);
    const storage = localStorageStorage("au1h:my-app:jwt");
    storage.set("token");
    expect(fake.data.get("au1h:my-app:jwt")).toBe("token");
    expect(storage.get()).toBe("token");
    storage.clear();
    expect(fake.data.size).toBe(0);
    expect(storage.get()).toBeNull();
  });

  test("a localStorage that throws (private mode, quota) is treated as empty", () => {
    const boom = () => {
      throw new Error("SecurityError");
    };
    install({ getItem: boom, setItem: boom, removeItem: boom });
    const storage = localStorageStorage("k");
    expect(() => storage.set("token")).not.toThrow();
    expect(storage.get()).toBeNull();
    expect(() => storage.clear()).not.toThrow();
  });

  test("defaultStorage keys localStorage by application slug", () => {
    const fake = fakeLocalStorage();
    install(fake);
    defaultStorage("app-one").set("t1");
    defaultStorage("app-two").set("t2");
    expect(fake.data.get("au1h:app-one:jwt")).toBe("t1");
    expect(fake.data.get("au1h:app-two:jwt")).toBe("t2");
  });

  test("defaultStorage falls back to memory where there is no localStorage", () => {
    install(undefined);
    const storage = defaultStorage(SLUG);
    storage.set("token");
    expect(storage.get()).toBe("token");
    expect(defaultStorage(SLUG).get()).toBeNull();
  });
});

describe("getToken", () => {
  test("mints from /api/auth/token with the app slug and credentials", async () => {
    const tokens = manager();
    const token = await tokens.getToken();
    expect(decodeJwt(token)?.email).toBe("ada@example.com");
    expect(stub.seen).toHaveLength(1);
    expect(stub.seen[0]?.path).toBe("/api/auth/token");
    expect(stub.seen[0]?.headers["x-app-id"]).toBe(SLUG);
  });

  test("serves a fresh token from storage without another request", async () => {
    const tokens = manager();
    const first = await tokens.getToken();
    expect(await tokens.getToken()).toBe(first);
    expect(await tokens.getToken()).toBe(first);
    expect(stub.mints).toBe(1);
  });

  test("concurrent callers share one mint", async () => {
    stub.delayMs = 30;
    const tokens = manager();
    const results = await Promise.all(
      Array.from({ length: 8 }, () => tokens.getToken())
    );
    expect(new Set(results).size).toBe(1);
    expect(stub.mints).toBe(1);
  });

  test("mints again once the token is inside the refresh leeway", async () => {
    stub.ttl = 30; // expires in 30s, default leeway is 60s
    const tokens = manager();
    const first = await tokens.getToken();
    const second = await tokens.getToken();
    expect(second).not.toBe(first);
    expect(stub.mints).toBe(2);
  });

  test("refreshLeewaySeconds moves the refresh point", async () => {
    stub.ttl = 30;
    const tokens = manager({ refreshLeewaySeconds: 5 });
    const first = await tokens.getToken();
    expect(await tokens.getToken()).toBe(first);
    expect(stub.mints).toBe(1);
  });

  test("an expired or undecodable stored token is replaced", async () => {
    for (const stale of [
      fakeJwt({ exp: nowSeconds() - 10 }),
      "not-a-jwt",
      fakeJwt({ sub: "no-exp" }),
    ]) {
      const tokenStorage = memoryStorage();
      tokenStorage.set(stale);
      const token = await manager({ tokenStorage }).getToken();
      expect(token).not.toBe(stale);
      expect(tokenStorage.get()).toBe(token);
    }
  });

  test("no session: throws Au1hError with status, message and code, and clears storage", async () => {
    const tokenStorage = memoryStorage();
    tokenStorage.set(fakeJwt({ exp: nowSeconds() - 10 }));
    stub.failure = Response.json(
      { message: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 }
    );
    const error = await manager({ tokenStorage })
      .getToken()
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Au1hError);
    expect(error).toMatchObject({
      name: "Au1hError",
      status: 401,
      message: "Unauthorized",
      code: "UNAUTHORIZED",
    });
    expect(tokenStorage.get()).toBeNull();
  });

  test("an error body with only `error` is used as the message", async () => {
    stub.failure = Response.json(
      { error: "Too Many Requests" },
      { status: 429 }
    );
    const error = await manager()
      .getToken()
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 429, message: "Too Many Requests" });
  });

  test("a non-JSON error body falls back to the status line", async () => {
    stub.failure = new Response("<html>bad gateway</html>", {
      status: 502,
      statusText: "Bad Gateway",
    });
    const error = (await manager()
      .getToken()
      .catch((e: unknown) => e)) as Au1hError;
    expect(error).toBeInstanceOf(Au1hError);
    expect(error.status).toBe(502);
    expect(error.message).toStartWith("502");
  });

  test("a JSON `null` error body (what au1h sends without a session) is still an Au1hError", async () => {
    stub.failure = new Response("null", {
      status: 401,
      statusText: "Unauthorized",
      headers: { "content-type": "application/json" },
    });
    const error = (await manager()
      .getToken()
      .catch((e: unknown) => e)) as Au1hError;
    expect(error).toBeInstanceOf(Au1hError);
    expect(error.status).toBe(401);
    expect(error.message).toStartWith("401");
  });

  test("a failed mint does not poison the next attempt", async () => {
    const tokens = manager();
    stub.failure = Response.json({ message: "nope" }, { status: 401 });
    await tokens.getToken().catch(() => null);
    stub.failure = null;
    expect(decodeJwt(await tokens.getToken())?.sub).toBe("user-1");
  });

  test("a trailing slash on baseURL does not double up", async () => {
    await manager({ baseURL: `${baseURL}/` }).getToken();
    expect(stub.seen[0]?.path).toBe("/api/auth/token");
  });
});

describe("claims and clearing", () => {
  test("getClaims is null before a token exists, then the token's payload", async () => {
    const tokens = manager();
    expect(tokens.getClaims()).toBeNull();
    await tokens.getToken();
    expect(tokens.getClaims()).toMatchObject({ sub: "user-1", aud: SLUG });
  });

  test("clearToken forgets the token, so the next call mints", async () => {
    const tokens = manager();
    await tokens.getToken();
    tokens.clearToken();
    expect(tokens.getClaims()).toBeNull();
    await tokens.getToken();
    expect(stub.mints).toBe(2);
  });
});

describe("authFetch", () => {
  test("adds the bearer token and keeps the caller's method, headers and body", async () => {
    const tokens = manager();
    const res = await tokens.authFetch(`${baseURL}/api/me?x=1`, {
      method: "POST",
      headers: { "x-trace": "abc", "content-type": "application/json" },
      body: JSON.stringify({ a: 1 }),
    });
    expect(await res.json()).toEqual({ echoed: "/api/me?x=1" });
    const call = stub.seen.at(-1);
    expect(call?.method).toBe("POST");
    expect(call?.headers.authorization).toBe(
      `Bearer ${await tokens.getToken()}`
    );
    expect(call?.headers["x-trace"]).toBe("abc");
  });

  test("replaces an Authorization header supplied by the caller", async () => {
    const tokens = manager();
    await tokens.authFetch(`${baseURL}/api/me`, {
      headers: { Authorization: "Bearer stale" },
    });
    expect(stub.seen.at(-1)?.headers.authorization).toBe(
      `Bearer ${await tokens.getToken()}`
    );
  });

  test("does not call the backend when there is no session", async () => {
    stub.failure = Response.json({ message: "Unauthorized" }, { status: 401 });
    const error = await manager()
      .authFetch(`${baseURL}/api/me`)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Au1hError);
    expect(stub.seen.map((s) => s.path)).toEqual(["/api/auth/token"]);
  });
});

describe("proxyFetch", () => {
  test("calls /proxy<path> on au1h with x-app-id and no bearer token", async () => {
    const res = await manager().proxyFetch("/todos/1?done=0");
    expect(await res.json()).toEqual({ echoed: "/proxy/todos/1?done=0" });
    const call = stub.seen.at(-1);
    expect(call?.headers["x-app-id"]).toBe(SLUG);
    expect(call?.headers.authorization).toBeUndefined();
    expect(stub.mints).toBe(0);
  });

  test("a path without a leading slash is joined correctly", async () => {
    await manager().proxyFetch("todos");
    expect(stub.seen.at(-1)?.path).toBe("/proxy/todos");
  });

  test("the caller cannot override x-app-id, and other headers pass", async () => {
    await manager().proxyFetch("/todos", {
      method: "DELETE",
      headers: { "x-app-id": "another-app", "x-trace": "abc" },
    });
    const call = stub.seen.at(-1);
    expect(call?.method).toBe("DELETE");
    expect(call?.headers["x-app-id"]).toBe(SLUG);
    expect(call?.headers["x-trace"]).toBe("abc");
  });
});

describe("betterAuthClientOptions", () => {
  const build = () => {
    let cleared = 0;
    const options = betterAuthClientOptions(
      { baseURL: "https://auth.example.com/", appSlug: SLUG },
      {
        clearToken: () => {
          cleared += 1;
        },
      }
    );
    const respond = (url: string) => {
      const response = new Response(null);
      Object.defineProperty(response, "url", { value: url });
      options.fetchOptions.onResponse({ response });
    };
    return { options, respond, cleared: () => cleared };
  };

  test("every Better Auth call carries the slug and cookies", () => {
    const { options } = build();
    expect(options.baseURL).toBe("https://auth.example.com");
    expect(options.fetchOptions.headers).toEqual({ "x-app-id": SLUG });
    expect(options.fetchOptions.credentials).toBe("include");
  });

  test("signing out drops the cached JWT; other responses do not", () => {
    const { respond, cleared } = build();
    respond("https://auth.example.com/api/auth/get-session");
    respond("https://auth.example.com/api/auth/sign-in/email");
    expect(cleared()).toBe(0);
    respond("https://auth.example.com/api/auth/sign-out");
    expect(cleared()).toBe(1);
  });
});
