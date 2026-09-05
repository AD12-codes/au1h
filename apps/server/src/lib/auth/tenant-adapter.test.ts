/** biome-ignore-all lint/suspicious/useAwait: the fake adapter mirrors the async Adapter contract without needing to await */
import { describe, expect, test } from "bun:test";
import type { Adapter, Where } from "better-auth";
import { withTenantScoping } from "./tenant-adapter";
import {
  runWithTenantStore,
  setTenantScope,
  TenantContextError,
} from "./tenant-context";

type Row = Record<string, unknown> & { id: string };
type AdapterMethod = Extract<
  Adapter[keyof Adapter],
  (...args: never[]) => unknown
>;
type Args<K extends keyof Adapter> = Parameters<
  Extract<Adapter[K], AdapterMethod>
>[0];

/**
 * Minimal in-memory adapter that understands the subset of `Where` the
 * wrapper emits (`eq` and `in`, AND-connected) and records every call.
 */
function fakeAdapter(initial: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = structuredClone(initial);
  const calls: Array<{ op: string; model: string; where?: Where[] }> = [];

  const matches = (row: Row, where: Where[] | undefined) =>
    (where ?? []).every((w) =>
      w.operator === "in"
        ? (w.value as string[]).includes(row[w.field] as string)
        : row[w.field] === w.value
    );

  const adapter = {
    id: "fake",
    async create({ model, data }: Args<"create">) {
      calls.push({ op: "create", model });
      const table = tables[model] ?? [];
      tables[model] = table;
      const row = { id: `${model}-${table.length}`, ...data };
      table.push(row as Row);
      return row;
    },
    async findOne({ model, where }: Args<"findOne">) {
      calls.push({ op: "findOne", model, where });
      return tables[model]?.find((r) => matches(r, where)) ?? null;
    },
    async findMany({ model, where, limit, offset }: Args<"findMany">) {
      calls.push({ op: "findMany", model, where });
      const rows = (tables[model] ?? []).filter((r) => matches(r, where));
      return rows.slice(offset ?? 0, limit ? (offset ?? 0) + limit : undefined);
    },
    async count({ model, where }: Args<"count">) {
      calls.push({ op: "count", model, where });
      return (tables[model] ?? []).filter((r) => matches(r, where)).length;
    },
    async update({ model, where, update }: Args<"update">) {
      calls.push({ op: "update", model, where });
      const rows = (tables[model] ?? []).filter((r) => matches(r, where));
      for (const r of rows) {
        Object.assign(r, update);
      }
      return rows[0] ?? null;
    },
    async updateMany({ model, where, update }: Args<"updateMany">) {
      calls.push({ op: "updateMany", model, where });
      const rows = (tables[model] ?? []).filter((r) => matches(r, where));
      for (const r of rows) {
        Object.assign(r, update);
      }
      return rows.length;
    },
    async delete({ model, where }: Args<"delete">) {
      calls.push({ op: "delete", model, where });
      tables[model] = (tables[model] ?? []).filter((r) => !matches(r, where));
    },
    async deleteMany({ model, where }: Args<"deleteMany">) {
      calls.push({ op: "deleteMany", model, where });
      const before = tables[model]?.length ?? 0;
      tables[model] = (tables[model] ?? []).filter((r) => !matches(r, where));
      return before - tables[model].length;
    },
    async transaction(cb: (trx: Adapter) => Promise<unknown>) {
      return cb(adapter);
    },
  } as unknown as Adapter;

  return { adapter, tables, calls };
}

const seed = {
  user: [
    { id: "u-admin", email: "john@example.com", applicationId: null },
    { id: "u-todo", email: "john@example.com", applicationId: "app-todo" },
    { id: "u-books", email: "john@example.com", applicationId: "app-books" },
  ],
  session: [
    {
      id: "s-todo",
      token: "tok-todo",
      userId: "u-todo",
      applicationId: "app-todo",
    },
    {
      id: "s-admin",
      token: "tok-admin",
      userId: "u-admin",
      applicationId: null,
    },
  ],
  verification: [
    { id: "v-1", identifier: "john@example.com", applicationId: "ignored" },
  ],
};

const inScope = <T>(applicationId: string | null, fn: () => Promise<T>) =>
  runWithTenantStore(async () => {
    setTenantScope({ applicationId });
    return fn();
  });

describe("withTenantScoping", () => {
  test("findOne by email returns the tenant's own user", async () => {
    const { adapter } = fakeAdapter(seed);
    const scoped = withTenantScoping(adapter);
    const byEmail: Where[] = [{ field: "email", value: "john@example.com" }];

    const todo = await inScope("app-todo", () =>
      scoped.findOne<Row>({ model: "user", where: byEmail })
    );
    const books = await inScope("app-books", () =>
      scoped.findOne<Row>({ model: "user", where: byEmail })
    );
    const admin = await inScope(null, () =>
      scoped.findOne<Row>({ model: "user", where: byEmail })
    );

    expect(todo?.id).toBe("u-todo");
    expect(books?.id).toBe("u-books");
    expect(admin?.id).toBe("u-admin");
  });

  test("client scope adds an application_id predicate to the SQL where clause", async () => {
    const { adapter, calls } = fakeAdapter(seed);
    const scoped = withTenantScoping(adapter);

    await inScope("app-todo", () =>
      scoped.findOne({
        model: "user",
        where: [{ field: "id", value: "u-todo" }],
      })
    );

    expect(calls[0].where).toEqual([
      { field: "id", value: "u-todo" },
      {
        field: "applicationId",
        value: "app-todo",
        operator: "eq",
        connector: "AND",
      },
    ]);
  });

  test("a session token from app A is invisible to app B", async () => {
    const { adapter } = fakeAdapter(seed);
    const scoped = withTenantScoping(adapter);
    const byToken: Where[] = [{ field: "token", value: "tok-todo" }];

    expect(
      await inScope("app-todo", () =>
        scoped.findOne<Row>({ model: "session", where: byToken })
      )
    ).not.toBeNull();
    expect(
      await inScope("app-books", () =>
        scoped.findOne<Row>({ model: "session", where: byToken })
      )
    ).toBeNull();
    expect(
      await inScope(null, () =>
        scoped.findOne<Row>({ model: "session", where: byToken })
      )
    ).toBeNull();
  });

  test("create stamps the current tenant, including NULL for the admin portal", async () => {
    const { adapter, tables } = fakeAdapter(seed);
    const scoped = withTenantScoping(adapter);

    await inScope("app-todo", () =>
      scoped.create({
        model: "user",
        data: { email: "new@example.com", applicationId: "spoofed" },
      })
    );
    await inScope(null, () =>
      scoped.create({ model: "user", data: { email: "new@example.com" } })
    );

    const created = tables.user.filter((u) => u.email === "new@example.com");
    expect(created.map((u) => u.applicationId)).toEqual(["app-todo", null]);
  });

  test("writes cannot cross tenants even with a known id", async () => {
    const { adapter, tables } = fakeAdapter(seed);
    const scoped = withTenantScoping(adapter);
    const byId: Where[] = [{ field: "id", value: "u-todo" }];

    const updated = await inScope("app-books", () =>
      scoped.update<Row>({
        model: "user",
        where: byId,
        update: { email: "hacked" },
      })
    );
    await inScope(null, () => scoped.delete({ model: "user", where: byId }));
    const deleted = await inScope("app-books", () =>
      scoped.deleteMany({ model: "user", where: byId })
    );

    expect(updated).toBeNull();
    expect(deleted).toBe(0);
    expect(tables.user.find((u) => u.id === "u-todo")?.email).toBe(
      "john@example.com"
    );
  });

  test("admin-scope writes are re-issued against the filtered ids", async () => {
    const { adapter, calls, tables } = fakeAdapter(seed);
    const scoped = withTenantScoping(adapter);

    const n = await inScope(null, () =>
      scoped.updateMany({
        model: "user",
        where: [{ field: "email", value: "john@example.com" }],
        update: { name: "Admin John", applicationId: "must-not-change" },
      })
    );

    expect(n).toBe(1);
    expect(tables.user.find((u) => u.id === "u-admin")).toMatchObject({
      name: "Admin John",
      applicationId: null,
    });
    expect(tables.user.find((u) => u.id === "u-todo")?.name).toBeUndefined();
    expect(calls.at(-1)).toMatchObject({
      op: "updateMany",
      where: [{ field: "id", operator: "in", value: ["u-admin"] }],
    });
  });

  test("admin-scope findMany honours limit/offset and count filters in memory", async () => {
    const { adapter } = fakeAdapter({
      user: [
        { id: "a1", applicationId: null },
        { id: "t1", applicationId: "app-todo" },
        { id: "a2", applicationId: null },
        { id: "a3", applicationId: null },
      ],
    });
    const scoped = withTenantScoping(adapter);

    const page = await inScope(null, () =>
      scoped.findMany<Row>({ model: "user", limit: 2, offset: 1 })
    );
    const total = await inScope(null, () => scoped.count({ model: "user" }));

    expect(page.map((r) => r.id)).toEqual(["a2", "a3"]);
    expect(total).toBe(3);
  });

  test("non-tenant models pass through untouched", async () => {
    const { adapter, calls } = fakeAdapter(seed);
    const scoped = withTenantScoping(adapter);
    const where: Where[] = [{ field: "identifier", value: "john@example.com" }];

    const row = await inScope("app-todo", () =>
      scoped.findOne<Row>({ model: "verification", where })
    );
    const outside = await scoped.findOne<Row>({ model: "verification", where });

    expect(row?.id).toBe("v-1");
    expect(outside?.id).toBe("v-1");
    expect(calls[0].where).toEqual(where);
  });

  test("tenant-scoped access without a resolved tenant fails loudly", async () => {
    const { adapter } = fakeAdapter(seed);
    const scoped = withTenantScoping(adapter);
    const byId: Where[] = [{ field: "id", value: "u-todo" }];

    await expect(
      scoped.findOne({ model: "user", where: byId })
    ).rejects.toBeInstanceOf(TenantContextError);
    await expect(
      runWithTenantStore(() => scoped.findOne({ model: "user", where: byId }))
    ).rejects.toBeInstanceOf(TenantContextError);
  });

  test("transactions receive a scoped adapter", async () => {
    const { adapter, tables } = fakeAdapter(seed);
    const scoped = withTenantScoping(adapter);

    await inScope("app-books", () =>
      scoped.transaction(async (trx) => {
        const user = await trx.create<Row>({
          model: "user",
          data: { email: "trx@example.com" },
        });
        await trx.create({
          model: "account",
          data: { userId: user.id, providerId: "github" },
        });
      })
    );

    expect(tables.user.at(-1)?.applicationId).toBe("app-books");
    expect(tables.account.at(-1)?.applicationId).toBe("app-books");
  });

  test("concurrent requests for different tenants do not interleave", async () => {
    const { adapter } = fakeAdapter(seed);
    const slow = {
      ...adapter,
      findOne: async (args: Parameters<Adapter["findOne"]>[0]) => {
        await new Promise((r) => setTimeout(r, Math.random() * 10));
        return adapter.findOne(args);
      },
    } as Adapter;
    const scoped = withTenantScoping(slow);
    const byEmail: Where[] = [{ field: "email", value: "john@example.com" }];

    const results = await Promise.all(
      Array.from({ length: 30 }, (_, i) => {
        const tenant = (["app-todo", "app-books", null] as const)[i % 3];
        return inScope(tenant, async () => {
          const row = await scoped.findOne<Row>({
            model: "user",
            where: byEmail,
          });
          return row?.applicationId === tenant;
        });
      })
    );

    expect(results.every(Boolean)).toBe(true);
  });
});
