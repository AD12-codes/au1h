import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Tenant scope for the current request.
 *
 * `applicationId === null` is the au1h admin portal (users with
 * `application_id IS NULL`); a string is a registered client application.
 */
export interface TenantScope {
  applicationId: string | null;
}

/**
 * Request-scoped store. It is created *empty* at the HTTP boundary
 * (`runWithTenantStore`) and filled in by Better Auth's `hooks.before` once
 * the tenant has been resolved (`setTenantScope`). The store object is shared
 * by reference across the whole async call tree of one request, so mutating
 * it from inside the hook is visible to the adapter without relying on
 * `AsyncLocalStorage.enterWith` (which does not propagate to the caller's
 * continuation in Bun).
 */
interface TenantStore {
  scope: TenantScope | undefined;
}

const storage = new AsyncLocalStorage<TenantStore>();

export class TenantContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantContextError";
  }
}

/**
 * Run `fn` with a fresh, unresolved tenant store. Every Better Auth entry
 * point (the HTTP handler and any `auth.api.*` call) must go through this so
 * that `hooks.before` has somewhere to record the resolved tenant.
 */
export function runWithTenantStore<T>(fn: () => Promise<T>): Promise<T> {
  return storage.run({ scope: undefined }, fn);
}

/**
 * Record the resolved tenant for the current request. Called from
 * `hooks.before` after the app slug has been validated.
 */
export function setTenantScope(scope: TenantScope): void {
  const store = storage.getStore();
  if (!store) {
    throw new TenantContextError(
      "No tenant store for this request. Better Auth must be invoked inside runWithTenantStore()."
    );
  }
  store.scope = scope;
}

/** The resolved scope, or `undefined` when outside a request / not yet resolved. */
export function getTenantScope(): TenantScope | undefined {
  return storage.getStore()?.scope;
}

/**
 * The resolved scope, throwing if it is missing. Used by the tenant-scoped
 * adapter so that a tenant-scoped table can never be read or written without
 * an explicit tenant — a loud 500 instead of a silent cross-tenant query.
 */
export function requireTenantScope(): TenantScope {
  const store = storage.getStore();
  if (!store) {
    throw new TenantContextError(
      "Tenant-scoped database access outside of a request context. Wrap the call in runWithTenantStore()."
    );
  }
  if (store.scope === undefined) {
    throw new TenantContextError(
      "Tenant-scoped database access before the tenant was resolved by hooks.before."
    );
  }
  return store.scope;
}
