import type { Adapter, TransactionAdapter, Where } from "better-auth";

import { logger } from "@/utils/logger";
import { requireTenantScope } from "./tenant-context";

/**
 * Logical Better Auth model names whose rows carry an `application_id` and
 * must therefore be isolated per tenant.
 */
export const TENANT_SCOPED_MODELS: ReadonlySet<string> = new Set([
  "user",
  "session",
  "account",
  // Organization plugin (admin workspaces live in the NULL scope). Fields are
  // declared by tenancy-plugin.ts.
  "organization",
  "member",
  "invitation",
]);

/**
 * Verification rows (email tokens, OAuth state) are keyed by `identifier`, an
 * email or a random state, which collides across applications. The core
 * table cannot take an extra column, so the tenant is folded into the
 * identifier instead: "<applicationId|admin>:<identifier>" at rest, plain on
 * the way out.
 */
const NAMESPACED_MODEL = "verification";
const NAMESPACED_FIELD = "identifier";

/** Logical field name; the Drizzle adapter maps it to `application_id`. */
const TENANT_FIELD = "applicationId";

type Row = Record<string, unknown> & { id: string };

interface ScopedArgs {
  model: string;
  where?: Where[];
}

function isScoped(model: string): boolean {
  return TENANT_SCOPED_MODELS.has(model);
}

function namespace(applicationId: string | null): string {
  return `${applicationId ?? "admin"}:`;
}

function namespaceWhere(where: Where[] | undefined, prefix: string): Where[] {
  return (where ?? []).map((w) =>
    w.field === NAMESPACED_FIELD && typeof w.value === "string"
      ? { ...w, value: prefix + w.value }
      : w
  );
}

function stripNamespace<T>(row: T, prefix: string): T {
  if (!row || typeof row !== "object") {
    return row;
  }
  const value = (row as Record<string, unknown>)[NAMESPACED_FIELD];
  if (typeof value === "string" && value.startsWith(prefix)) {
    return { ...row, [NAMESPACED_FIELD]: value.slice(prefix.length) };
  }
  return row;
}

/** Drop any caller-supplied tenant predicate; the scope is authoritative. */
function withoutTenantField(where: Where[] | undefined): Where[] {
  return (where ?? []).filter((w) => w.field !== TENANT_FIELD);
}

/**
 * `WHERE ... AND application_id = $applicationId`.
 *
 * Adding an `AND` entry is safe regardless of `OR` entries in the original
 * clause: the Drizzle adapter groups AND and OR connectors separately and
 * combines the groups with AND.
 */
function scopedWhere(
  where: Where[] | undefined,
  applicationId: string
): Where[] {
  return [
    ...withoutTenantField(where),
    {
      field: TENANT_FIELD,
      value: applicationId,
      operator: "eq",
      connector: "AND",
    },
  ];
}

function idIn(ids: string[]): Where[] {
  return [{ field: "id", operator: "in", value: ids, connector: "AND" }];
}

/**
 * Wrap a Better Auth adapter so that every operation on a tenant-scoped model
 * is confined to the tenant of the current request (see `tenant-context.ts`).
 *
 * - Reads (`findOne`, `findMany`, `count`) get an `application_id` predicate.
 * - Writes (`update*`, `delete*`) get the same predicate, so a request for app
 *   A can never touch app B's rows even when it knows their ids.
 * - `create` stamps `application_id` with the current tenant.
 * - Non-tenant models (verification, jwks, organization, member, …) pass through.
 *
 * ### The admin-portal (`application_id IS NULL`) scope
 *
 * Better Auth's `Where` type has no `is null` operator and the Drizzle adapter
 * compiles `eq(field, null)` to `application_id = NULL`, which never matches.
 * For the NULL scope we therefore fetch the candidate rows with the caller's
 * predicate, keep the ones with `applicationId == null` in memory, and run
 * writes against the resulting ids. The candidate sets are tiny (the same
 * email/token/userId across at most #applications tenants), so this costs one
 * extra round-trip on admin-portal requests only. Replacing the NULL sentinel
 * with a real "au1h system" application row (ARCHITECTURE.md §5.5) would make
 * this branch unnecessary.
 */
export function withTenantScoping<A extends TransactionAdapter | Adapter>(
  adapter: A
): A {
  const isAdminRow = (row: Row) => row[TENANT_FIELD] == null;

  /** Candidate rows for the NULL scope: caller's predicate, filtered in memory. */
  async function adminRows(
    args: ScopedArgs & { sortBy?: FindManyArgs["sortBy"] }
  ) {
    const rows = await adapter.findMany<Row>({
      model: args.model,
      where: withoutTenantField(args.where),
      sortBy: args.sortBy,
    });
    return rows.filter(isAdminRow);
  }

  type FindManyArgs = Parameters<Adapter["findMany"]>[0];

  const scoped = {
    ...adapter,

    create<T extends Record<string, unknown>, R = T>(args: {
      model: string;
      data: Omit<T, "id">;
      select?: string[];
      forceAllowId?: boolean;
    }): Promise<R> {
      if (args.model === NAMESPACED_MODEL) {
        const prefix = namespace(requireTenantScope().applicationId);
        const data = args.data as Record<string, unknown>;
        const identifier = data[NAMESPACED_FIELD];
        return adapter
          .create<T, R>({
            ...args,
            data: {
              ...data,
              [NAMESPACED_FIELD]:
                typeof identifier === "string"
                  ? prefix + identifier
                  : identifier,
            } as unknown as Omit<T, "id">,
          })
          .then((row) => stripNamespace(row, prefix));
      }
      if (!isScoped(args.model)) {
        return adapter.create<T, R>(args);
      }
      const { applicationId } = requireTenantScope();
      return adapter.create<T, R>({
        ...args,
        data: { ...args.data, [TENANT_FIELD]: applicationId } as Omit<T, "id">,
      });
    },

    async findOne<T>(args: {
      model: string;
      where: Where[];
      select?: string[];
    }): Promise<T | null> {
      if (args.model === NAMESPACED_MODEL) {
        const prefix = namespace(requireTenantScope().applicationId);
        const row = await adapter.findOne<T>({
          ...args,
          where: namespaceWhere(args.where, prefix),
        });
        return row === null ? null : stripNamespace(row, prefix);
      }
      if (!isScoped(args.model)) {
        return adapter.findOne<T>(args);
      }
      const { applicationId } = requireTenantScope();
      if (applicationId !== null) {
        return adapter.findOne<T>({
          ...args,
          where: scopedWhere(args.where, applicationId),
        });
      }
      const rows = await adminRows(args);
      const row = rows[0];
      if (!row) {
        return null;
      }
      if (args.select?.length) {
        return Object.fromEntries(
          args.select.map((key) => [key, row[key]])
        ) as T;
      }
      return row as unknown as T;
    },

    async findMany<T>(args: FindManyArgs): Promise<T[]> {
      if (args.model === NAMESPACED_MODEL) {
        const prefix = namespace(requireTenantScope().applicationId);
        const rows = await adapter.findMany<T>({
          ...args,
          where: namespaceWhere(args.where, prefix),
        });
        return rows.map((row) => stripNamespace(row, prefix));
      }
      if (!isScoped(args.model)) {
        return adapter.findMany<T>(args);
      }
      const { applicationId } = requireTenantScope();
      if (applicationId !== null) {
        return adapter.findMany<T>({
          ...args,
          where: scopedWhere(args.where, applicationId),
        });
      }
      const rows = await adminRows(args);
      const offset = args.offset ?? 0;
      const end = args.limit === undefined ? undefined : offset + args.limit;
      return rows.slice(offset, end) as unknown as T[];
    },

    async count(args: ScopedArgs): Promise<number> {
      if (args.model === NAMESPACED_MODEL) {
        const prefix = namespace(requireTenantScope().applicationId);
        return adapter.count({
          ...args,
          where: namespaceWhere(args.where, prefix),
        });
      }
      if (!isScoped(args.model)) {
        return adapter.count(args);
      }
      const { applicationId } = requireTenantScope();
      if (applicationId !== null) {
        return adapter.count({
          ...args,
          where: scopedWhere(args.where, applicationId),
        });
      }
      return (await adminRows(args)).length;
    },

    async update<T>(args: {
      model: string;
      where: Where[];
      update: Record<string, unknown>;
    }): Promise<T | null> {
      if (args.model === NAMESPACED_MODEL) {
        const prefix = namespace(requireTenantScope().applicationId);
        const row = await adapter.update<T>({
          ...args,
          where: namespaceWhere(args.where, prefix),
        });
        return row === null ? null : stripNamespace(row, prefix);
      }
      if (!isScoped(args.model)) {
        return adapter.update<T>(args);
      }
      const { applicationId } = requireTenantScope();
      const update = { ...args.update };
      // The tenant of a row is immutable.
      delete update[TENANT_FIELD];
      if (applicationId !== null) {
        return adapter.update<T>({
          ...args,
          update,
          where: scopedWhere(args.where, applicationId),
        });
      }
      const rows = await adminRows(args);
      if (rows.length === 0) {
        return null;
      }
      return adapter.update<T>({
        model: args.model,
        update,
        where: idIn(rows.map((r) => r.id)),
      });
    },

    async updateMany(args: {
      model: string;
      where: Where[];
      update: Record<string, unknown>;
    }): Promise<number> {
      if (args.model === NAMESPACED_MODEL) {
        const prefix = namespace(requireTenantScope().applicationId);
        return adapter.updateMany({
          ...args,
          where: namespaceWhere(args.where, prefix),
        });
      }
      if (!isScoped(args.model)) {
        return adapter.updateMany(args);
      }
      const { applicationId } = requireTenantScope();
      const update = { ...args.update };
      delete update[TENANT_FIELD];
      if (applicationId !== null) {
        return adapter.updateMany({
          ...args,
          update,
          where: scopedWhere(args.where, applicationId),
        });
      }
      const rows = await adminRows(args);
      if (rows.length === 0) {
        return 0;
      }
      return adapter.updateMany({
        model: args.model,
        update,
        where: idIn(rows.map((r) => r.id)),
      });
    },

    async delete<T>(args: { model: string; where: Where[] }): Promise<void> {
      if (args.model === NAMESPACED_MODEL) {
        const prefix = namespace(requireTenantScope().applicationId);
        return adapter.delete<T>({
          ...args,
          where: namespaceWhere(args.where, prefix),
        });
      }
      if (!isScoped(args.model)) {
        return adapter.delete<T>(args);
      }
      const { applicationId } = requireTenantScope();
      if (applicationId !== null) {
        return adapter.delete<T>({
          ...args,
          where: scopedWhere(args.where, applicationId),
        });
      }
      const rows = await adminRows(args);
      if (rows.length === 0) {
        return;
      }
      return adapter.delete<T>({
        model: args.model,
        where: idIn(rows.map((r) => r.id)),
      });
    },

    async deleteMany(args: { model: string; where: Where[] }): Promise<number> {
      if (args.model === NAMESPACED_MODEL) {
        // Expiry sweeps (`expiresAt < now`) carry no identifier and clean up
        // every tenant's stale rows, which is harmless.
        const prefix = namespace(requireTenantScope().applicationId);
        return adapter.deleteMany({
          ...args,
          where: namespaceWhere(args.where, prefix),
        });
      }
      if (!isScoped(args.model)) {
        return adapter.deleteMany(args);
      }
      const { applicationId } = requireTenantScope();
      if (applicationId !== null) {
        return adapter.deleteMany({
          ...args,
          where: scopedWhere(args.where, applicationId),
        });
      }
      const rows = await adminRows(args);
      if (rows.length === 0) {
        return 0;
      }
      return adapter.deleteMany({
        model: args.model,
        where: idIn(rows.map((r) => r.id)),
      });
    },
  } as A;

  // Transactions hand Better Auth a second adapter instance; scope it too.
  if ("transaction" in adapter && typeof adapter.transaction === "function") {
    const inner = adapter as Adapter;
    (scoped as Adapter).transaction = <R>(
      callback: (trx: TransactionAdapter) => Promise<R>
    ) => inner.transaction((trx) => callback(withTenantScoping(trx)));
  }

  logger.debug(
    { adapter: adapter.id, models: [...TENANT_SCOPED_MODELS] },
    "Tenant scoping enabled on database adapter"
  );

  return scoped;
}
