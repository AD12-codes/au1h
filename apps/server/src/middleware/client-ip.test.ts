import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { clientIp } from "./client-ip";

const SOCKET = "203.0.113.9";

/** What Bun hands Hono as `env`: the server, which knows the socket address. */
const bunServer = {
  requestIP: () => ({ address: SOCKET, family: "IPv4", port: 51_234 }),
};

async function ipSeen(
  headers: Record<string, string> = {},
  env: object = bunServer
): Promise<string> {
  const app = new Hono();
  app.get("/", (c) => c.text(clientIp(c)));
  const res = await app.fetch(
    new Request("http://au1h.test/", { headers }),
    env
  );
  return await res.text();
}

describe("clientIp", () => {
  let saved: string | undefined;
  beforeEach(() => {
    saved = process.env.AU1H_TRUST_PROXY;
    process.env.AU1H_TRUST_PROXY = "";
  });
  afterEach(() => {
    process.env.AU1H_TRUST_PROXY = saved ?? "";
  });

  test("uses the socket address by default", async () => {
    expect(await ipSeen()).toBe(SOCKET);
  });

  test("ignores x-forwarded-for unless a trusted proxy is declared", async () => {
    expect(await ipSeen({ "x-forwarded-for": "198.51.100.1" })).toBe(SOCKET);
  });

  test("only the exact value 'true' enables proxy trust", async () => {
    for (const value of ["1", "TRUE", "yes", " true"]) {
      process.env.AU1H_TRUST_PROXY = value;
      expect(await ipSeen({ "x-forwarded-for": "198.51.100.1" })).toBe(SOCKET);
    }
  });

  describe("behind a trusted proxy", () => {
    beforeEach(() => {
      process.env.AU1H_TRUST_PROXY = "true";
    });

    test("takes the hop the proxy appended", async () => {
      expect(await ipSeen({ "x-forwarded-for": "198.51.100.1" })).toBe(
        "198.51.100.1"
      );
    });

    test("takes the last hop, not the client-supplied first one", async () => {
      expect(
        await ipSeen({ "x-forwarded-for": "10.0.0.1, 192.0.2.7 ,198.51.100.1" })
      ).toBe("198.51.100.1");
    });

    test("falls back to the socket when the header is absent", async () => {
      expect(await ipSeen()).toBe(SOCKET);
    });

    test("falls back to the socket when the last hop is empty", async () => {
      expect(await ipSeen({ "x-forwarded-for": "198.51.100.1, " })).toBe(
        SOCKET
      );
    });
  });

  test("is 'unknown' when there is no socket to ask", async () => {
    expect(await ipSeen({}, {})).toBe("unknown");
  });
});
