import { afterEach, describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { envInt, rateLimit } from "./rate-limit";

describe("envInt", () => {
  const NAME = "AU1H_TEST_ENV_INT";
  afterEach(() => {
    process.env[NAME] = "";
  });

  test("returns the fallback when the variable is unset or empty", () => {
    process.env[NAME] = "";
    expect(envInt(NAME, 300)).toBe(300);
    expect(envInt("AU1H_TEST_ENV_INT_NEVER_SET", 7)).toBe(7);
  });

  test("reads a positive integer", () => {
    process.env[NAME] = "42";
    expect(envInt(NAME, 300)).toBe(42);
  });

  test("rejects zero, negatives and non-numbers", () => {
    for (const raw of ["0", "-5", "abc", "NaN"]) {
      process.env[NAME] = raw;
      expect(envInt(NAME, 300)).toBe(300);
    }
  });

  test("takes the leading integer of a decimal or suffixed value", () => {
    process.env[NAME] = "12.9";
    expect(envInt(NAME, 300)).toBe(12);
    process.env[NAME] = "60rpm";
    expect(envInt(NAME, 300)).toBe(60);
  });
});

/**
 * Counting against Redis is covered by the integration suite. Here Redis is
 * simply not connected, which is the fail-open path.
 */
describe("rateLimit without Redis", () => {
  test("lets every request through and adds no rate-limit headers", async () => {
    const app = new Hono();
    app.use("*", rateLimit({ name: "unit", limit: 1, windowSeconds: 60 }));
    app.get("/", (c) => c.text("ok"));

    for (let i = 0; i < 3; i++) {
      const res = await app.request("/");
      expect(res.status).toBe(200);
      expect(res.headers.get("X-RateLimit-Limit")).toBeNull();
    }
  });
});
