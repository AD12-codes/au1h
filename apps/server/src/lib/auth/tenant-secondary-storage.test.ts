import { describe, expect, test } from "bun:test";
import {
  runWithTenantStore,
  setTenantScope,
  TenantContextError,
} from "./tenant-context";
import {
  type SecondaryStorage,
  withTenantScopedSessions,
} from "./tenant-secondary-storage";

function memoryStorage(initial: Record<string, string>): SecondaryStorage {
  const data = new Map(Object.entries(initial));
  return {
    get: (key) => Promise.resolve(data.get(key) ?? null),
    set: (key, value) => {
      data.set(key, value);
      return Promise.resolve();
    },
    delete: (key) => {
      data.delete(key);
      return Promise.resolve();
    },
  };
}

const cached = (applicationId: string | null) =>
  JSON.stringify({
    session: { token: "t", userId: "u", applicationId },
    user: { id: "u", email: "john@example.com", applicationId },
  });

const inScope = <T>(applicationId: string | null, fn: () => Promise<T>) =>
  runWithTenantStore(() => {
    setTenantScope({ applicationId });
    return fn();
  });

// `SecondaryStorage.get` may return a bare value; normalise to a promise.
const read = (storage: SecondaryStorage, key: string) =>
  Promise.resolve(storage.get(key));

describe("withTenantScopedSessions", () => {
  const storage = withTenantScopedSessions(
    memoryStorage({
      "tok-todo": cached("app-todo"),
      "tok-admin": cached(null),
      "active-sessions-u": JSON.stringify([
        { token: "tok-todo", expiresAt: 0 },
      ]),
      "rate-limit:1.2.3.4": "3",
    })
  );

  test("returns a cached session only to its own tenant", async () => {
    expect(
      await inScope("app-todo", () => read(storage, "tok-todo"))
    ).not.toBeNull();
    expect(
      await inScope("app-books", () => read(storage, "tok-todo"))
    ).toBeNull();
    expect(await inScope(null, () => read(storage, "tok-todo"))).toBeNull();
  });

  test("admin-portal sessions are scoped to the NULL tenant", async () => {
    expect(
      await inScope(null, () => read(storage, "tok-admin"))
    ).not.toBeNull();
    expect(
      await inScope("app-todo", () => read(storage, "tok-admin"))
    ).toBeNull();
  });

  test("non-session values pass through without a tenant", async () => {
    expect(await read(storage, "rate-limit:1.2.3.4")).toBe("3");
    expect(await read(storage, "active-sessions-u")).toContain("tok-todo");
    expect(await read(storage, "missing")).toBeNull();
  });

  test("a cached session read without a resolved tenant fails loudly", async () => {
    await expect(storage.get("tok-todo")).rejects.toBeInstanceOf(
      TenantContextError
    );
  });
});
