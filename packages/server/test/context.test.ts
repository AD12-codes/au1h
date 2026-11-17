import { describe, expect, test } from "bun:test";
import { readProxyContext, userFromClaims } from "../src/index";

describe("readProxyContext", () => {
  const full = {
    "x-user-id": "u1",
    "x-user-email": "u@example.com",
    "x-app-id": "app-id",
    "x-app-slug": "todo",
    "x-au1h-token": "proof",
  };

  test("reads the gateway headers from a Headers object", () => {
    expect(readProxyContext(new Headers(full))).toEqual({
      user: { id: "u1", email: "u@example.com" },
      appId: "app-id",
      appSlug: "todo",
      proxyToken: "proof",
    });
  });

  test("reads them from a Node-style header record, including array values", () => {
    const ctx = readProxyContext({ ...full, "x-user-id": ["u1", "u2"] });
    expect(ctx?.user.id).toBe("u1");
  });

  test("returns null when any identity header is missing", () => {
    for (const missing of [
      "x-user-id",
      "x-user-email",
      "x-app-id",
      "x-app-slug",
    ]) {
      const { [missing]: _dropped, ...rest } = full as Record<string, string>;
      expect(readProxyContext(rest)).toBeNull();
    }
  });

  test("the proof token is optional", () => {
    const { "x-au1h-token": _dropped, ...rest } = full;
    expect(readProxyContext(rest)?.proxyToken).toBeNull();
  });
});

test("userFromClaims maps claims and defaults missing fields to null", () => {
  expect(userFromClaims({ sub: "u1", email: "u@example.com", exp: 1 })).toEqual(
    { id: "u1", email: "u@example.com", name: null, applicationId: null }
  );
});
