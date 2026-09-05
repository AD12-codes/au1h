import { describe, expect, test } from "bun:test";

import { emailMatchesAllowlist, parseAdminAllowlist } from "./admin";

describe("admin sign-up allowlist", () => {
  test("parses a comma-separated, case-insensitive list", () => {
    expect(parseAdminAllowlist(" Alice@Example.com, @corp.io ,, ")).toEqual([
      "alice@example.com",
      "@corp.io",
    ]);
    expect(parseAdminAllowlist(undefined)).toEqual([]);
  });

  test("matches exact addresses and whole domains only", () => {
    const list = parseAdminAllowlist("alice@example.com,@corp.io");

    expect(emailMatchesAllowlist("ALICE@example.com", list)).toBe(true);
    expect(emailMatchesAllowlist("bob@corp.io", list)).toBe(true);
    expect(emailMatchesAllowlist("bob@example.com", list)).toBe(false);
    expect(emailMatchesAllowlist("bob@corp.io.evil.com", list)).toBe(false);
    expect(emailMatchesAllowlist("bob@sub.corp.io", list)).toBe(false);
    expect(emailMatchesAllowlist("alice@example.com", [])).toBe(false);
  });
});
