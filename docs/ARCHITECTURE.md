# au1h architecture

How au1h is put together: what it is, the tenancy model, how a request flows, and
what is still open. File paths are relative to `apps/server/src`.

---

## 1. What au1h is

au1h is **authentication-as-a-service for your own apps**. One deployment hosts auth for
many unrelated products (a todo app, a books manager, a DVD rental app, …), plus an API
gateway that forwards those apps' API traffic to their own backends with verified user
context attached.

### Why not just Better Auth per app

Better Auth is a library. Using it normally means:

- installing and configuring it inside every app's server,
- running per-app migrations and per-app auth tables,
- duplicating OAuth app registration, JWKS, session config, ban/admin logic,
- no single place to see or manage users across products.

au1h inverts this: **Better Auth is installed exactly once, here.** A new product
registers itself in the admin portal, gets a slug + secret, and starts sending
`x-app-id: <slug>` — no auth code in the product's server at all. Product backends
either validate a JWT against au1h's JWKS, or sit behind au1h's proxy and simply trust
`x-user-id` / `x-app-id` headers.

### The hard part: tenant-scoped identity

The core requirement is that **the same email is a different user in every app**:

| user id | email            | application_id |
| ------- | ---------------- | -------------- |
| user-1  | john@example.com | `NULL`         | ← au1h admin portal user
| user-2  | john@example.com | app-todo       |
| user-3  | john@example.com | app-books      |

Three independent identities: separate passwords, separate OAuth links, separate
sessions, separate bans. Better Auth does not support this — it treats `user.email` as
globally unique and its internal lookups (`findUserByEmail`, `findOAuthUser`,
`linkAccount`, …) have no notion of a tenant. So au1h **wraps the database adapter**: the
tenant for the current request lives in `AsyncLocalStorage`, and every query Better Auth
makes against `user`, `session` or `account` gets an `application_id` predicate (and every
insert gets the value) injected by `lib/auth/tenant-adapter.ts`. That wrapper is the heart
of this codebase (see §3.1).

---

## 2. Tenancy model

```
organization  (workspace, owns applications — Better Auth `organization` plugin)
  └── application  (a product: slug, secret, allowed_origins, redirect_uris)
        ├── users        (application_id = app.id)
        ├── sessions     (application_id = app.id)
        ├── accounts     (application_id = app.id)
        └── application_routes  (proxy config: path_pattern → backend_url)
```

Organizations exist at both levels. In the admin scope an organization is a **workspace**
that owns applications. Inside a client application (when the application has
`organizations_enabled`), its users can create organizations, invite members and switch
between them; those rows carry `application_id` and are invisible to every other
application. The same slug can exist once per application.

`application_id IS NULL` is the sentinel for **au1h's own admin portal users**. The admin
portal is an explicit tenant: it sends the reserved slug `x-app-id: au1h-admin`
(`AU1H_ADMIN_APP_SLUG`), which no client application may register. Admin users are scoped
by organization, get an auto-created `"<FirstName>'s Workspace"` org on signup, and may
only sign up if allowlisted (`AU1H_ADMIN_EMAILS`), invited (pending `invitations` row), or
the very first admin.

Schema:

---

## 3. How a request flows

### 3.1 Auth request (`/api/auth/*`)

1. `dynamicCorsMiddleware` looks up allowed origins from the `applications` table
   (1-min in-process cache) and applies CORS.
2. A Hono middleware copies the `x-app-id` header into an `au1h-app-id` cookie (appended
   after the handler ran, so Better Auth's own Set-Cookie survives), so OAuth callbacks,
   which arrive without the header, can still recover app context.
3. `handleAuthRequest()` opens a fresh, empty **tenant store** (`AsyncLocalStorage`) for
   the request and calls `auth.handler` inside it.
4. Better Auth's `hooks.before` (`authBeforeHook`) runs:
   - resolves the app slug: `x-app-id` header → `au1h-app-id` cookie → origin→slug map
     (registered allowed origins only),
   - `au1h-admin` → admin scope (`applicationId = null`); any other slug →
     `applications.id`, rejecting unknown/inactive apps with 401; no slug → 401 except
     for the public `/jwks` and `/ok` endpoints. `Origin`/`Referer` are never consulted
     for the admin decision,
   - records `{ applicationId }` in the tenant store via `setTenantScope()`. Nothing on
     the shared Better Auth context is mutated.
5. Better Auth executes the endpoint. Every adapter call it makes for `user`, `session`,
   `account`, `organization`, `member` or `invitation` goes through the **tenant-scoped
   adapter**, which reads the store and adds `application_id = $tenant` to reads and
   writes, stamps it on creates, and throws if no tenant has been resolved. The
   `verification` table (email tokens, OAuth state) cannot take an extra column, so its
   `identifier` is namespaced as `<applicationId|admin>:<identifier>` at rest and
   stripped on the way out. Other models (`jwks`, `rateLimit`) pass through untouched.
   Sessions served from the Redis cache get the same check in `tenant-secondary-storage.ts`.
   `tenancy-plugin.ts` declares the `applicationId` field on the organization tables so
   Better Auth's field mapper accepts it.
6. `databaseHooks`: `user.create.before` rejects admin-portal sign-ups that are not
   allowlisted/invited/bootstrap (email and OAuth alike); `user.create.after` creates the
   workspace organization for new admin users; `session.create.before` sets
   `activeOrganizationId`.

Code outside the HTTP handler that needs a session calls `getSessionForRequest(headers)`
(the proxy; tenant from the client's `x-app-id`) or `getAdminSession(headers)` (the admin
API; tenant forced to the admin scope), both of which wrap `auth.api.getSession` in a
tenant store the same way. Calling `auth.api.*` directly throws `TenantContextError`.

The admin-portal scope is `application_id IS NULL`. Better Auth's `Where` type cannot
express `IS NULL` (the Drizzle adapter compiles `eq(field, null)` to `= NULL`), so for
that scope the wrapper fetches the candidate rows with the caller's predicate, filters
`applicationId == null` in memory, and re-issues writes by id. Replacing the NULL sentinel
with a real "au1h system" application would remove that branch.

### 3.2 Proxied API request (`/proxy/*`)

`x-app-id` → match `application_routes` (30s cache, `/todos/*` and `/todos/:id`
patterns) → **authenticate**: `Authorization: Bearer <au1h JWT>` (signature via our JWKS,
`exp`, `iss`/`aud`, and `applicationId` claim must equal the route's application, else
403) or the session cookie (resolved in the `x-app-id` tenant, and
`session.applicationId` must equal the route's application, else 403); neither → 401 →
strip client-supplied context headers → inject `x-app-id`, `x-app-slug`, `x-user-id`,
`x-user-email`, `x-forwarded-proto` (the real scheme) and `x-au1h-token` (a 60-second
au1h-signed JWT with `aud = <slug>`, so a backend can prove the hop came through au1h
by verifying it against the public JWKS) → `fetch` the backend with the request body
streamed and a timeout (`AU1H_PROXY_TIMEOUT_MS`, 504 on expiry) → stream the response back.

### 3.3 Admin API (`/api/v1/*`)

`health` is public. `applications`, `users` and `routes` all mount `requireOrgSession`:
an admin-portal session with an active organization, else 401/403. Controllers read the
organization from the Hono context and every service function filters on it: applications
by `organization_id`; users that belong to the org's applications or are members of the
org; proxy routes joined through their application. Proxy route `backendUrl`s must be
`http(s)` without credentials and, in production (or when
`AU1H_PROXY_ALLOW_PRIVATE_BACKENDS=false`), must not target loopback/private/link-local
addresses.

### 3.4 Server-to-server API (`/api/apps/*`)

For product backends, authenticated with the **application secret**
(`x-app-id: <slug>` + `x-app-secret`, checked against the stored scrypt hash by
`requireAppSecret`). `GET /api/apps/me` confirms credentials; `POST /api/apps/introspect`
`{ token }` verifies either an au1h JWT (offline, bound to the app) or a raw session token
(looked up in the app's tenant, so revocation and bans apply immediately) and returns
`{ active, user, expiresAt }`.

### 3.5 Rate limits and caches

`/proxy/*`, `/api/v1/*` and `/api/apps/*` sit behind a Redis fixed-window limiter keyed by
client IP (plus app slug where relevant); `x-forwarded-for` is trusted only with
`AU1H_TRUST_PROXY=true`. Better Auth's own limiter covers `/api/auth/*` and uses Redis as
its store.

Optionally (`AU1H_FAIR_SHARE_URL`), `/api/auth/*` and `/proxy/*` also pass through

---

## 4. Status and open items

Everything in §2 and §3 is implemented and covered by unit tests (`bun test`) and the
integration suite (`bun run test:integration`, real Postgres + Redis, HTTP through
`app.fetch`). Migrations live in `db/migrations` and run on server start.

Open, in rough priority order:

- **Row-level security.** Tenant scoping is enforced in the adapter and services. Postgres
  RLS with the tenant set per transaction would make a missed filter fail closed. Touches
  every query path, so it is its own change with its own tests.
- **Isolation integration suite.** Cross-application and cross-workspace attempts on every
  `/api/v1` and `/api/apps` route, concurrent sign-ups across apps, OAuth account linking.
- **OAuth tenant in `state`.** The tenant is recovered from the `au1h-app-id` cookie on the
  provider callback; carrying it in the OAuth `state` would remove the cookie dependency
  (`lib/auth/plugins.ts` holds a development-only state-check bypass for cross-port
  localhost).
- **Workspace roles.** Every workspace member can manage applications, routes and tokens.
  Gate mutating admin routes on `owner`/`admin`.
- **Per-application settings.** Email verification requirement, email sender, enabled OAuth
  providers and OAuth credentials are global today.
- **Hosted login pages**, **audit log**, **webhooks**: product features, not hardening.
