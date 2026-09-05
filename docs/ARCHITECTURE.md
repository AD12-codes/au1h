# au1h — Architecture & Current State

> Status doc. Describes what au1h is, how it works today, and what needs fixing.
> Written against commit state of `apps/server` + `apps/web`, Better Auth `1.3.34`.
> Updated 2026-09-05: §5.1–§5.10 are fixed and most of §5.11 is done; see §3 for the
> current flow and the end of each §5 item for what is still open.

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
of this codebase (see §3.1 and §5.1).

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

`application_id IS NULL` is the sentinel for **au1h's own admin portal users**. The admin
portal is an explicit tenant: it sends the reserved slug `x-app-id: au1h-admin`
(`AU1H_ADMIN_APP_SLUG`), which no client application may register. Admin users are scoped
by organization, get an auto-created `"<FirstName>'s Workspace"` org on signup, and may
only sign up if allowlisted (`AU1H_ADMIN_EMAILS`), invited (pending `invitations` row), or
the very first admin (<ref_file file="/Users/AD12-codes/projects/au1h/apps/server/src/lib/auth/admin.ts" />).

Schema: <ref_file file="/Users/AD12-codes/projects/au1h/apps/server/src/db/schema/auth.ts" />

---

## 3. How a request flows

### 3.1 Auth request (`/api/auth/*`)

1. `dynamicCorsMiddleware` looks up allowed origins from the `applications` table
   (1-min in-process cache) and applies CORS. <ref_file file="/Users/AD12-codes/projects/au1h/apps/server/src/middleware/dynamic-cors.ts" />
2. A Hono middleware copies the `x-app-id` header into an `au1h-app-id` cookie (appended
   after the handler ran, so Better Auth's own Set-Cookie survives), so OAuth callbacks,
   which arrive without the header, can still recover app context.
   <ref_file file="/Users/AD12-codes/projects/au1h/apps/server/src/index.ts" />
3. `handleAuthRequest()` opens a fresh, empty **tenant store** (`AsyncLocalStorage`) for
   the request and calls `auth.handler` inside it.
   <ref_file file="/Users/AD12-codes/projects/au1h/apps/server/src/lib/auth/tenant-context.ts" />
4. Better Auth's `hooks.before` (`authBeforeHook`) runs:
   - resolves the app slug: `x-app-id` header → `au1h-app-id` cookie → origin→slug map
     (registered allowed origins only),
   - `au1h-admin` → admin scope (`applicationId = null`); any other slug →
     `applications.id`, rejecting unknown/inactive apps with 401; no slug → 401 except
     for the public `/jwks` and `/ok` endpoints. `Origin`/`Referer` are never consulted
     for the admin decision,
   - records `{ applicationId }` in the tenant store via `setTenantScope()`. Nothing on
     the shared Better Auth context is mutated.
     <ref_file file="/Users/AD12-codes/projects/au1h/apps/server/src/lib/auth/hooks-middleware.ts" />
5. Better Auth executes the endpoint. Every adapter call it makes for `user`, `session` or
   `account` goes through the **tenant-scoped adapter**, which reads the store and adds
   `application_id = $tenant` to reads and writes, stamps it on creates, and throws if no
   tenant has been resolved. Other models pass through untouched. Sessions served from the
   Redis cache get the same check in `tenant-secondary-storage.ts`.
   <ref_file file="/Users/AD12-codes/projects/au1h/apps/server/src/lib/auth/tenant-adapter.ts" />
6. `databaseHooks`: `user.create.before` rejects admin-portal sign-ups that are not
   allowlisted/invited/bootstrap (email and OAuth alike); `user.create.after` creates the
   workspace organization for new admin users; `session.create.before` sets
   `activeOrganizationId`.
   <ref_file file="/Users/AD12-codes/projects/au1h/apps/server/src/lib/auth/database-hooks.ts" />

Code outside the HTTP handler that needs a session calls `getSessionForRequest(headers)`
(the proxy; tenant from the client's `x-app-id`) or `getAdminSession(headers)` (the admin
API; tenant forced to the admin scope), both of which wrap `auth.api.getSession` in a
tenant store the same way. Calling `auth.api.*` directly throws `TenantContextError`.

The admin-portal scope is `application_id IS NULL`. Better Auth's `Where` type cannot
express `IS NULL` (the Drizzle adapter compiles `eq(field, null)` to `= NULL`), so for
that scope the wrapper fetches the candidate rows with the caller's predicate, filters
`applicationId == null` in memory, and re-issues writes by id. Replacing the NULL sentinel
with a real "au1h system" application (§5.5) would remove that branch.

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
<ref_file file="/Users/AD12-codes/projects/au1h/apps/server/src/proxy/middleware.ts" />

### 3.3 Admin API (`/api/v1/*`)

`health` is public. `applications`, `users` and `routes` all mount `requireOrgSession`
(<ref_file file="/Users/AD12-codes/projects/au1h/apps/server/src/middleware/require-org-session.ts" />):
an admin-portal session with an active organization, else 401/403. Controllers read the
organization from the Hono context and every service function filters on it: applications
by `organization_id`; users that belong to the org's applications or are members of the
org; proxy routes joined through their application. Proxy route `backendUrl`s must be
`http(s)` without credentials and, in production (or when
`AU1H_PROXY_ALLOW_PRIVATE_BACKENDS=false`), must not target loopback/private/link-local
addresses (<ref_file file="/Users/AD12-codes/projects/au1h/apps/server/src/routes-config/backend-url.ts" />).

### 3.4 Server-to-server API (`/api/apps/*`)

For product backends, authenticated with the **application secret**
(`x-app-id: <slug>` + `x-app-secret`, checked against the stored scrypt hash by
`requireAppSecret`). `GET /api/apps/me` confirms credentials; `POST /api/apps/introspect`
`{ token }` verifies either an au1h JWT (offline, bound to the app) or a raw session token
(looked up in the app's tenant, so revocation and bans apply immediately) and returns
`{ active, user, expiresAt }`. <ref_file file="/Users/AD12-codes/projects/au1h/apps/server/src/apps/controller.ts" />

### 3.5 Rate limits and caches

`/proxy/*`, `/api/v1/*` and `/api/apps/*` sit behind a Redis fixed-window limiter keyed by
client IP (plus app slug where relevant); `x-forwarded-for` is trusted only with
`AU1H_TRUST_PROXY=true`. Better Auth's own limiter covers `/api/auth/*` and uses Redis as
its store. The in-process read caches (application origins, id→slug, proxy routes) are
cleared on every instance through a Redis pub/sub bus (`utils/cache-bus.ts`).

---

## 4. What exists today

### Server (`apps/server`, Hono on Bun, port 4444)

| Area              | Files                        | State |
| ----------------- | ---------------------------- | ----- |
| Multi-tenant auth | `src/lib/auth/*`             | Adapter-level scoping via `AsyncLocalStorage` (§5.1 done) |
| Email + password  | Better Auth `emailAndPassword` | Done |
| GitHub / Google OAuth | `socialProviders`        | Each enabled when its client id + secret are set |
| JWT + JWKS        | `jwt()` plugin, `applicationId` claim | Done |
| Admin / org plugins | `admin()`, `organization()` | Done |
| Sessions          | Postgres + Redis secondary storage | Done; revocation and bans clear both |
| Applications CRUD | `src/applications/*`         | Done, org-scoped |
| Users admin       | `src/users/*`                | Done, org-scoped (§5.3) |
| Server-to-server  | `src/apps/*`                 | `GET /me`, `POST /introspect`, app-secret authenticated (§5.6) |
| Proxy route CRUD  | `src/routes-config/*`        | Done, org-scoped + backend URL policy (§5.3) |
| API gateway       | `src/proxy/*`                | Done, requires session or JWT bound to the route's app (§5.4) |
| Health            | `src/health/*`               | DB ping |
| Migrations        | 4 Drizzle migrations         | `0003` adds the `NULLS NOT DISTINCT` unique constraints |
| RLS (Phase 1F)    | —                            | Not started |
| Tests             | `src/**/*.test.ts`           | Unit tests: tenant adapter, session cache, admin allowlist, backend URL policy, secret hashing (`bun test`); no integration tests yet |

### Admin portal (`apps/web`, React + TanStack Router + shadcn, port 4445)

Login/register, dashboard, applications list + detail (stats, secret reveal/regenerate,
integration snippets, proxy-route management), users list with app filter + search,
user detail with sessions and ban/unban, a docs page.

### Docs

`docs/INTEGRATION.md` (Next.js / Express / Go / FastAPI recipes), `docs/flow-diagram.md`,
`docs/er-diagram.md`, `docs/new-flow.md` (signup decision matrix), `PLAN.md`.

---

## 5. What needs to be improved

Ordered by severity. §5.1–§5.7 are things I'd fix before this handles anyone's real users.

### 5.1 ~~The internal-adapter override is not concurrency-safe~~ — fixed

**Status: fixed (2026-09-05).** The original design rewrote
`ctx.context.internalAdapter` on every request. `betterAuth()` calls `init(options)` once
and every request shares that object, so two concurrent sign-ins from different apps could
interleave and a user could be created under the wrong tenant.

The replacement is the design recommended here: one Better Auth instance, one adapter, and
the tenant read from request-scoped storage.

- `lib/auth/tenant-context.ts` — `AsyncLocalStorage` holding `{ applicationId }`. A store
  is opened per request by `handleAuthRequest()` / `getSessionForRequest()` and filled by
  `hooks.before`. (`enterWith` is deliberately not used: in Bun it does not propagate to
  the caller's continuation; `run` + mutating the shared store object does.)
- `lib/auth/tenant-adapter.ts` — `withTenantScoping(adapter)` wraps the Drizzle adapter
  returned by `drizzleAdapter(...)(options)` and confines every `user`/`session`/`account`
  operation to the current tenant, including `update*`/`delete*` and transactions.
  Missing tenant → `TenantContextError`, never an unscoped query.
- The seven hand-written `internalAdapter` overrides (`internal-adapters.ts`) are gone,
  along with their duplicated `crypto.randomUUID()` + `db.insert()` logic, the
  `accountToInsert` log line (§5.7), and the debug full-table scan in `findOAuthUser`.
- `lib/auth/tenant-secondary-storage.ts` — the same check for the Redis session cache.
  `findSession` reads `secondaryStorage.get(token)` *before* the database, so the adapter
  alone would not stop a session cookie issued for app A from being accepted on a request
  for app B. A cached session whose `applicationId` differs from the request's tenant is
  reported as a miss; the fall-through database lookup is scoped and misses too. Result: a
  session token issued for app A resolves to `null` under `x-app-id: B`, which the old
  overrides never covered.

Unit tests: `apps/server/src/lib/auth/tenant-adapter.test.ts` (`bun test`) cover email
lookup per tenant, cross-tenant writes by known id, the NULL/admin scope, transactions,
and 30 interleaved concurrent requests.

Still true: **pin Better Auth (`1.3.34`) and run the tests before upgrading.** The wrapper
depends only on the public `Adapter`/`Where` contract, but the NULL-scope branch assumes
Better Auth never uses `select` to drop `applicationId`, and it must be revisited if a
future version adds an `is_null` operator (at which point the branch can go away).

### 5.2 ~~Admin privilege is decided by a spoofable header~~ — fixed

**Status: fixed (2026-09-05).** `isDirectAdminOrigin()` trusted `Origin`/`Referer`, so
`curl -H 'Origin: http://localhost:4445' .../sign-up/email` created an admin-portal user
with its own organization.

Now:

- The admin portal is an explicit tenant: it sends `x-app-id: au1h-admin`
  (`AU1H_ADMIN_APP_SLUG`, mirrored as `VITE_AU1H_ADMIN_APP_SLUG` in `apps/web`). The slug
  is reserved; `POST /api/v1/applications` rejects it. `Origin`/`Referer`, the Redis
  `oauth-admin:<ip>` marker, `getClientIp`, and the `au1h-is-admin` /
  `au1h-is-client-app` cookies are gone (`lib/auth/admin.ts`, `hooks-middleware.ts`).
- Selecting the admin scope grants nothing: admin **sign-up** is refused with 403 unless
  the email matches `AU1H_ADMIN_EMAILS` (exact addresses or `@domain`s), has a pending
  organization invitation, or no admin exists yet (first-run bootstrap). Enforced in
  `databaseHooks.user.create.before`, so it covers email/password and OAuth sign-ups.
- An OAuth callback that cannot recover a tenant from the `au1h-app-id` cookie now fails
  with 401 instead of defaulting to the admin scope.

Still open from §5.9: the tenant travels through an unsigned cookie and the OAuth
`state` check is skipped in dev.

### 5.3 ~~The v1 admin API has no authentication at all~~ — fixed

**Status: fixed (2026-09-05).** `/api/v1/users` and `/api/v1/routes` had no session check
and no org scoping; `POST /api/v1/routes` could register a route for any application
pointing at any URL (traffic hijack + SSRF).

Now (§3.3): `requireOrgSession` on every v1 router except `health`; all `users/service.ts`
and `routes-config/service.ts` functions take `organizationId` and filter on it;
`routes-config` verifies the target application belongs to the caller's organization
(404 otherwise) and validates `backendUrl` (`http(s)` only, no credentials, no private /
loopback / link-local targets in production). Request bodies are zod-validated. Banning a
user also revokes their sessions, and session revocation clears the Redis cache entries
as well as the Postgres rows (part of §5.8).

Not covered: the literal-hostname check does not detect DNS rebinding to a private
address; a resolve-then-connect check or an egress allowlist would.

### 5.4 ~~The proxy authenticates nothing~~ — fixed

**Status: fixed (2026-09-05).** `getUserContext()` swallowed errors and forwarded anonymous
requests with no `x-user-id`, and never compared the session's application with the
route's.

Now (§3.2): the proxy accepts either an au1h-minted JWT (`Authorization: Bearer`, verified
with `jose` against our own JWKS; `iss`/`aud`/`exp`; `applicationId` claim must equal the
route's application) or the session cookie (resolved in the `x-app-id` tenant, and
`session.applicationId` must equal the route's application). Anything else is 401;
a credential from another application is 403. `x-user-id`/`x-user-email` are therefore
always present on forwarded requests.

Still open: the app secret / mTLS on the gateway→backend hop (§5.6), so backends can be
called directly by anyone who can reach them.

### 5.5 ~~The composite unique constraints don't do what they look like~~ — fixed

**Status: fixed (2026-09-05).** `CREATE UNIQUE INDEX ... (email, application_id)` treated
every `NULL` as distinct, so duplicate admin-portal emails were possible. Migration
`0003_unique_nulls_not_distinct` replaces both indexes with
`UNIQUE NULLS NOT DISTINCT` constraints (Postgres 15+; the schema uses
`unique().nullsNotDistinct()`), on `users (email, application_id)` and
`accounts (provider_id, account_id, application_id)`. Verified: inserting a second admin
row with an existing email now fails.

The NULL sentinel itself stays. Replacing it with a real "au1h system" application row
would still simplify the adapter's admin-scope branch (§5.1); it is no longer needed for
correctness.

### 5.6 ~~The application secret is decorative~~ — fixed

**Status: fixed (2026-09-05).** Secrets were random UUIDs stored in plaintext and never
checked.

Now (`applications/secret.ts`): secrets are `au1h_sk_` + 32 random bytes, shown once on
create/regenerate, and stored as an scrypt hash (Better Auth's password hasher). They
authenticate the server-to-server API (§3.4): `GET /api/apps/me` and
`POST /api/apps/introspect`. Rows created before hashing hold a UUID, which never
verifies; those applications must regenerate their secret from the admin portal.

What the secret deliberately does **not** do: gate `/api/auth/*`. Browser SPAs cannot hold
a secret, so tenant *selection* by `x-app-id` stays public (like an OAuth `client_id`),
and the isolation guarantees come from §5.1/§5.4 instead. For the gateway→backend hop the
proxy attaches `x-au1h-token`, an au1h-signed 60-second JWT with `aud = <slug>`, which
backends verify against the JWKS — no shared secret needed. Also fixed here:
`allowedOrigins` is documented as comma-separated (it always was; the schema comment was
wrong).

### 5.7 ~~Tokens and passwords are written to logs~~ — fixed

**Status: fixed (2026-09-05).** The account-row dump and the `🔥` tracing lines went with
§5.1/§5.2. `utils/logger.ts` now redacts `accessToken`, `refreshToken`, `idToken`,
`password`, `token`, `secret`, `secretHash`, `authorization`, `cookie` and `set-cookie`
at any nesting depth, takes its level from `LOG_LEVEL` (default `debug` in dev, `info`
in production), and only uses `pino-pretty` outside production.

### 5.8 ~~Session revocation doesn't revoke~~ — fixed

**Status: fixed (2026-09-05).** `users/service.ts` deletes the Postgres rows *and* the
Redis entries (`<token>` and `active-sessions-<userId>`) for `revokeSession` /
`revokeAllUserSessions`, and `banUser` revokes all of the user's sessions. Verified
end-to-end: a banned user's `get-session` returns `null` immediately.

### 5.9 OAuth context plumbing is fragile

**Status: partly fixed.** The Redis IP marker and the `au1h-is-admin` /
`au1h-is-client-app` cookies were removed in §5.2, and `skipStateMismatch()` is now
opt-in (`AU1H_SKIP_OAUTH_STATE_CHECK=true`, dev only) instead of always on outside
production. The app slug still survives the OAuth round-trip through the unsigned
`au1h-app-id` cookie. Remaining problems:

- `au1h-app-id` is populated straight from a client-supplied header, so a stale cookie
  can silently redirect a signup into the wrong app (the tenant itself is public, so
  signing the cookie would not add security; carrying it in `state` would).
- `skipStateMismatch()` still exists as an escape hatch
  (<ref_file file="/Users/AD12-codes/projects/au1h/apps/server/src/lib/auth/plugins.ts" />) — a
  workaround for cross-port localhost cookies. Fine as long as it can never ship, but it
  hides the real problem.

Fix: carry the tenant in the OAuth `state` parameter (that's what it's for) or in a
signed/HMAC'd cookie.

### 5.10 ~~JWT claims are under-specified~~ — fixed

**Status: fixed (2026-09-05).** Tokens now carry `iss = <au1h URL>`, `aud = <application
slug>` (`au1h-admin` for admin-portal users), `sub`, `email`, `name`, `applicationId`.
Backends verify `aud` against their own slug, so a token minted for the todo app is
rejected by the books app's backend even though they share one JWKS. The proxy and
`/api/apps/introspect` do the same check. `docs/INTEGRATION.md`, the admin portal's docs
page and all four `examples/` verify `aud` and read `applicationId` (never `app_id`).

### 5.11 Operational / correctness gaps

- **Only unit tests.** The tenant adapter is unit-tested (§5.1); there are no
  integration tests against Postgres. The priority integration suite is: concurrent
  sign-ups across two apps, same email in 2 apps + admin, login isolation (app A password
  must fail on app B), OAuth link isolation, and proxy authz.
- ~~**Caches are per-process.**~~ Done: one origins cache shared by CORS and the auth
  layer, and invalidation of origins/slugs/routes is broadcast to every instance over
  Redis pub/sub (`utils/cache-bus.ts`). TTLs remain as a safety net.
- ~~**Admin users are invisible in the Users page.**~~ Done (`leftJoin`; admin users of
  the caller's own organization are listed; `User.applicationId` is nullable).
- ~~**No rate limiting on `/api/v1/*` or `/proxy/*`.**~~ Done (§3.5). Better Auth's
  limiter is now always on (Redis store) unless `AU1H_AUTH_RATE_LIMIT=false`. Still
  true: DB selection is gated on `APP_ENV` while cookies/CORS/policies use `NODE_ENV`;
  the two variables should be collapsed once the deployment's env files are reviewed.
- **Proxy details:** done — `x-forwarded-proto` reflects the real scheme, the request
  body is streamed, and the backend `fetch` has a timeout (504). Backend `Set-Cookie`
  is still passed through untouched, deliberately (backends may need their own cookies).
- **RLS (Phase 1F) not started.** Still the one big defence-in-depth item. The tenant now
  lives in `AsyncLocalStorage`, so the shape is clear: run each adapter call in a
  transaction, `SET LOCAL app.application_id`, and add policies on `users`, `sessions`,
  `accounts`. It touches every query path, so it should be its own change with its own
  tests.
- ~~**Dead code / drift.**~~ Done: `getAppSlugFromRequest`, the pool-metadata half of
  `utils/redis.ts` and the `db:seed` script are gone.
- ~~**Docs drift.**~~ Done: root `README.md` describes au1h; `PLAN.md` points here as
  the source of truth; Google OAuth is wired (enabled when its credentials are set).

---

## 6. Suggested order of work

1. ~~**Fix tenant isolation properly** (§5.1)~~ — done: `AsyncLocalStorage` +
   adapter-level scoping.
2. **Write the integration test suite** (§5.11) against Postgres so #1 stays provable and
   Better Auth upgrades stop being scary.
3. ~~**Close the authz holes** (§5.3, §5.4, §5.2)~~ — done.
4. ~~**Make app identity real** (§5.6)~~ — done.
5. ~~**Fix the unique indexes** (§5.5) and session revocation (§5.8)~~ — done.
6. ~~**Clean up logging** (§5.7)~~ — done.
7. **Harden the OAuth flow** (§5.9) — carry the tenant in `state`; remove the
   dev-only state-check bypass once cross-port localhost OAuth is understood.
8. ~~JWT `aud` (§5.10), shared caches, dead code, docs~~ — done. **Remaining:** RLS,
   the `APP_ENV`/`NODE_ENV` split, and the integration test suite (#2).

---

## 7. Feature ideas beyond hardening

Things that would make au1h genuinely more attractive than "just add Better Auth":

- **A client SDK** (`@au1h/client`) that wraps `createAuthClient` with the app slug and
  proxy base URL preconfigured — right now every integrator hand-copies the snippets in
  `docs/INTEGRATION.md`.
- **Backend middleware packages** for Express/Hono/FastAPI/Go that verify the JWT
  (including `aud`) or the trusted headers, so integrators write zero auth code.
- **Hosted login pages** per application (branded with `applications.logo`), so a product
  doesn't even need to build a login form — redirect to au1h and come back.
- **Per-application config** currently hardcoded globally: enabled providers, session TTL,
  password policy, email verification, and per-app OAuth credentials (today all apps
  share one GitHub OAuth app).
- **Audit log** of auth events per application — you already have the centralisation
  argument, this is the payoff.
- **Webhooks** (`user.created`, `user.banned`, `session.revoked`) so product backends can
  keep their own user tables in sync.
- **Email verification + password reset**, neither of which is wired up today.
- **Usage/analytics** on the applications dashboard (sign-ins over time, active sessions,
  proxy latency and error rates — the proxy already logs durations).
