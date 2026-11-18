import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { sleep } from "bun";
import { type Harness, INTEGRATION, startHarness } from "./harness";

const describeIntegration = INTEGRATION ? describe : describe.skip;

/**
 * Email-verification tokens name an address, not an application, so each one
 * is bound in Redis to the application(s) it was sent for. The end-to-end
 * consequence (a link for app B cannot verify the address in app A) is in
 * `email-flows.test.ts`; this file pins the binding itself.
 */
describeIntegration("verification token binding", () => {
  let h: Harness;
  let binding: typeof import("../lib/email/token-binding");
  let redisService: typeof import("../utils/redis").redisService;
  const run = Math.random().toString(36).slice(2, 8);
  const minted: string[] = [];
  const token = (label: string) => {
    const value = `it-token-${run}-${label}`;
    minted.push(value);
    return value;
  };
  const keyOf = (value: string) =>
    `au1h:email-token:${createHash("sha256").update(value).digest("hex")}`;

  beforeAll(async () => {
    h = await startHarness();
    binding = await import("../lib/email/token-binding");
    ({ redisService } = await import("../utils/redis"));
  }, 60_000);

  afterAll(async () => {
    if (minted.length > 0) {
      await redisService.getClient().del(...minted.map(keyOf));
    }
    await h?.cleanup();
  });

  test("a token is bound to the application it was sent for, and only that one", async () => {
    const t = token("one");
    await binding.bindTokenToApp(t, "app-a", 60);
    expect(await binding.isTokenBoundToApp(t, "app-a")).toBe(true);
    expect(await binding.isTokenBoundToApp(t, "app-b")).toBe(false);
    expect(await binding.isTokenBoundToApp(t, "au1h-admin")).toBe(false);
  });

  test("a token that was never bound belongs to no application", async () => {
    expect(await binding.isTokenBoundToApp(token("never"), "app-a")).toBe(
      false
    );
  });

  test("slugs are compared exactly", async () => {
    const t = token("exact");
    await binding.bindTokenToApp(t, "app-a", 60);
    expect(await binding.isTokenBoundToApp(t, "app")).toBe(false);
    expect(await binding.isTokenBoundToApp(t, "app-a2")).toBe(false);
    expect(await binding.isTokenBoundToApp(t, "APP-A")).toBe(false);
  });

  test("two applications that mint the same token are both bound", async () => {
    const t = token("shared");
    await binding.bindTokenToApp(t, "app-a", 60);
    await binding.bindTokenToApp(t, "app-b", 60);
    expect(await binding.isTokenBoundToApp(t, "app-a")).toBe(true);
    expect(await binding.isTokenBoundToApp(t, "app-b")).toBe(true);
    expect(await binding.isTokenBoundToApp(t, "app-c")).toBe(false);
  });

  test("the token is stored as a hash, never in the clear", async () => {
    const t = token("hashed");
    await binding.bindTokenToApp(t, "app-a", 60);
    const redis = redisService.getClient();
    expect(await redis.exists(keyOf(t))).toBe(1);
    expect(await redis.keys(`*${t}*`)).toEqual([]);
  });

  test("the binding carries the requested time to live", async () => {
    const t = token("ttl");
    await binding.bindTokenToApp(t, "app-a", 120);
    const ttl = await redisService.getClient().ttl(keyOf(t));
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(120);
  });

  test("an expired binding no longer vouches for the token", async () => {
    const t = token("expired");
    await binding.bindTokenToApp(t, "app-a", 1);
    expect(await binding.isTokenBoundToApp(t, "app-a")).toBe(true);
    await sleep(1200);
    expect(await binding.isTokenBoundToApp(t, "app-a")).toBe(false);
  });
});
