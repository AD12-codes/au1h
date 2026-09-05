import { describe, expect, test } from "bun:test";

import {
  generateSecret,
  hashSecret,
  isHashedSecret,
  SECRET_PREFIX,
  verifySecret,
} from "./secret";

describe("application secrets", () => {
  test("generates prefixed, unique, high-entropy secrets", () => {
    const a = generateSecret();
    const b = generateSecret();
    expect(a.startsWith(SECRET_PREFIX)).toBe(true);
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(SECRET_PREFIX.length + 40);
  });

  test("hash verifies the original and rejects anything else", async () => {
    const secret = generateSecret();
    const hash = await hashSecret(secret);

    expect(hash).not.toContain(secret);
    expect(isHashedSecret(hash)).toBe(true);
    expect(await verifySecret(secret, hash)).toBe(true);
    expect(await verifySecret(`${secret}x`, hash)).toBe(false);
    expect(await verifySecret("", hash)).toBe(false);
  });

  test("legacy plaintext rows are never accepted", async () => {
    const legacy = "0d1cbf7a-2b0b-4e1e-9a2f-1c2d3e4f5a6b";
    expect(isHashedSecret(legacy)).toBe(false);
    expect(await verifySecret(legacy, legacy)).toBe(false);
  });
});
