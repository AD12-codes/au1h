import { describe, expect, test } from "bun:test";

import { isPrivateHostname, validateBackendUrl } from "./backend-url";

describe("isPrivateHostname", () => {
  test("flags loopback, RFC1918, link-local and local names", () => {
    for (const h of [
      "localhost",
      "api.localhost",
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "::1",
      "[::1]",
      "fd12::1",
      "fe80::1",
      "::ffff:10.0.0.1",
      "db.internal",
      "printer.local",
    ]) {
      expect(isPrivateHostname(h)).toBe(true);
    }
  });

  test("allows public hosts", () => {
    for (const h of [
      "api.example.com",
      "8.8.8.8",
      "172.32.0.1",
      "2001:4860::8888",
      "100.128.0.1",
    ]) {
      expect(isPrivateHostname(h)).toBe(false);
    }
  });
});

describe("validateBackendUrl", () => {
  const strict = { allowPrivate: false };
  const lax = { allowPrivate: true };

  test("rejects malformed, non-http, and credentialed URLs", () => {
    expect(validateBackendUrl("not a url", lax)).toContain("absolute URL");
    expect(validateBackendUrl("ftp://example.com", lax)).toContain(
      "http or https"
    );
    expect(validateBackendUrl("http://user:pw@example.com", lax)).toContain(
      "credentials"
    );
  });

  test("blocks private targets only under the strict policy", () => {
    expect(validateBackendUrl("http://localhost:8081", strict)).toContain(
      "private"
    );
    expect(
      validateBackendUrl("http://169.254.169.254/latest", strict)
    ).toContain("private");
    expect(validateBackendUrl("http://localhost:8081", lax)).toBeNull();
    expect(validateBackendUrl("https://api.example.com/v1", strict)).toBeNull();
  });
});
