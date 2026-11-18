import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { Hono } from "hono";
import { type Harness, INTEGRATION, startHarness } from "./harness";

const describeIntegration = INTEGRATION ? describe : describe.skip;

/**
 * The limiter against a real Redis. A long window keeps the whole file inside
 * one fixed window, so the counts below cannot reset mid-test.
 */
const WINDOW = 3600;

describeIntegration("Redis-backed rate limiter", () => {
  let h: Harness;
  let rateLimit: typeof import("../middleware/rate-limit").rateLimit;
  let redisService: typeof import("../utils/redis").redisService;
  const run = Math.random().toString(36).slice(2, 8);
  let savedTrustProxy: string | undefined;
  let seq = 0;

  beforeAll(async () => {
    h = await startHarness();
    ({ rateLimit } = await import("../middleware/rate-limit"));
    ({ redisService } = await import("../utils/redis"));
    // Lets each test pick its client address through x-forwarded-for.
    savedTrustProxy = process.env.AU1H_TRUST_PROXY;
    process.env.AU1H_TRUST_PROXY = "true";
  }, 60_000);

  afterAll(async () => {
    process.env.AU1H_TRUST_PROXY = savedTrustProxy ?? "";
    const redis = redisService.getClient();
    const keys = await redis.keys(`ratelimit:it-${run}-*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    await h?.cleanup();
  });

  /** A fresh limiter namespace per test, so tests never share a bucket. */
  function limited(limit: number, byApp = false) {
    seq += 1;
    const name = `it-${run}-${seq}`;
    const app = new Hono();
    app.use(
      "*",
      rateLimit({
        name,
        limit,
        windowSeconds: WINDOW,
        ...(byApp ? { keyFor: (c) => c.req.header("x-app-id") ?? "-" } : {}),
      })
    );
    app.get("/", (c) => c.text("ok"));
    const hit = (ip: string, slug?: string) =>
      app.request("/", {
        headers: {
          "x-forwarded-for": ip,
          ...(slug ? { "x-app-id": slug } : {}),
        },
      });
    return { name, hit };
  }

  test("allows up to the limit, counting down the remaining budget", async () => {
    const { hit } = limited(3);
    const remaining: (string | null)[] = [];
    for (let i = 0; i < 3; i++) {
      const res = await hit("198.51.100.1");
      expect(res.status).toBe(200);
      expect(res.headers.get("X-RateLimit-Limit")).toBe("3");
      expect(res.headers.get("Retry-After")).toBeNull();
      remaining.push(res.headers.get("X-RateLimit-Remaining"));
    }
    expect(remaining).toEqual(["2", "1", "0"]);
  });

  test("the request over the limit is a 429 with Retry-After, and the handler does not run", async () => {
    const { hit } = limited(2);
    await hit("198.51.100.2");
    await hit("198.51.100.2");
    const res = await hit("198.51.100.2");

    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "Too Many Requests" });
    expect(res.headers.get("X-RateLimit-Limit")).toBe("2");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
    const retryAfter = Number(res.headers.get("Retry-After"));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(WINDOW);

    // Still blocked on the next attempt.
    expect((await hit("198.51.100.2")).status).toBe(429);
  });

  test("each client address has its own budget", async () => {
    const { hit } = limited(1);
    expect((await hit("198.51.100.3")).status).toBe(200);
    expect((await hit("198.51.100.3")).status).toBe(429);
    expect((await hit("198.51.100.4")).status).toBe(200);
  });

  test("keyFor splits one address into a budget per application", async () => {
    const { hit } = limited(1, true);
    expect((await hit("198.51.100.5", "app-one")).status).toBe(200);
    expect((await hit("198.51.100.5", "app-one")).status).toBe(429);
    expect((await hit("198.51.100.5", "app-two")).status).toBe(200);
  });

  test("a spoofed first x-forwarded-for hop does not buy a fresh budget", async () => {
    const { hit } = limited(1);
    expect((await hit("10.0.0.1, 198.51.100.6")).status).toBe(200);
    expect((await hit("10.0.0.2, 198.51.100.6")).status).toBe(429);
  });

  test("the counter expires with the window instead of living forever", async () => {
    const { name, hit } = limited(5);
    await hit("198.51.100.7");
    await hit("198.51.100.7");

    const redis = redisService.getClient();
    const keys = await redis.keys(`ratelimit:${name}:*`);
    expect(keys).toHaveLength(1);
    const ttl = await redis.ttl(keys[0] as string);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(WINDOW);
  });

  test("fails open when Redis errors: the request is served", async () => {
    const { hit } = limited(1);
    const broken = spyOn(redisService, "getClient").mockImplementation(() => {
      throw new Error("redis down");
    });
    try {
      for (let i = 0; i < 3; i++) {
        const res = await hit("198.51.100.8");
        expect(res.status).toBe(200);
        expect(res.headers.get("X-RateLimit-Limit")).toBeNull();
      }
    } finally {
      broken.mockRestore();
    }
  });
});
