# au1h — Architecture & Current State

> Status doc. Describes what au1h is, how it works today, and what needs fixing.
> Written against commit state of `apps/server` + `apps/web`, Better Auth `1.3.34`.

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
`linkAccount`, …) have no notion of a tenant. So au1h **overrides Better Auth's internal
adapter methods per request** to inject an `applicationId` filter. That override layer is
the heart of this codebase, and also its biggest liability (see §5.1).

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

`application_id IS NULL` is the sentinel for **au1h's own admin portal users**. Admin
users are scoped by organization instead, and get an auto-created
`"<FirstName>'s Workspace"` org on signup (<ref_snippet file="/Users/AD12-codes/projects/au1h/apps/server/src/lib/auth/internal-adapters.ts" lines="423-458" />).

Schema: <ref_file file="/Users/AD12-codes/projects/au1h/apps/server/src/db/schema/auth.ts" />

---

## 3. How a request flows

### 3.1 Auth request (`/api/auth/*`)

1. `dynamicCorsMiddleware` looks up allowed origins from the `applications` table
   (1-min in-process cache) and applies CORS. <ref_file file="/Users/AD12-codes/projects/au1h/apps/server/src/middleware/dynamic-cors.ts" />
2. A Hono middleware copies the `x-app-id` header into `au1h-app-id` +
   `au1h-is-client-app` cookies, so OAuth callbacks (which arrive without the header)
   can still recover app context. <ref_snippet file="/Users/AD12-codes/projects/au1h/apps/server/src/index.ts" lines="21-41" />
3. Better Auth's `hooks.before` (`authBeforeHook`) runs:
   - decides if this is an **admin-portal** request (`Origin`/`Referer` matches
     `AU1H_ADMIN_ORIGINS`, or a Redis marker keyed by client IP for OAuth callbacks),
   - resolves the app slug: `x-app-id` header → marker cookies → `au1h-app-id` cookie →
     origin→slug map,
   - resolves slug → `applications.id`, rejecting unknown/inactive apps with 401,
   - **monkey-patches `ctx.context.internalAdapter`** with the seven tenant-aware
     overrides. <ref_file file="/Users/AD12-codes/projects/au1h/apps/server/src/lib/auth/hooks-middleware.ts" />
4. Better Auth executes the endpoint, now transparently scoped to one application.
5. `databaseHooks` stamp `applicationId` (and `activeOrganizationId`) onto new sessions
   and accounts. <ref_file file="/Users/AD12-codes/projects/au1h/apps/server/src/lib/auth/database-hooks.ts" />

Overridden internal methods (<ref_file file="/Users/AD12-codes/projects/au1h/apps/server/src/lib/auth/internal-adapters.ts" />):
`findUserByEmail`, `createUser`, `createOAuthUser`, `findOAuthUser`, `findAccounts`,
`findAccountByProviderId`, `linkAccount`.

### 3.2 Proxied API request (`/proxy/*`)

`x-app-id` → match `application_routes` (30s cache, `/todos/*` and `/todos/:id`
patterns) → resolve session → strip client-supplied context headers → inject
`x-app-id`, `x-app-slug`, `x-user-id`, `x-user-email` → `fetch` the backend → stream the
response back. <ref_file file="/Users/AD12-codes/projects/au1h/apps/server/src/proxy/middleware.ts" />

---

## 4. What exists today

### Server (`apps/server`, Hono on Bun, port 4444)

| Area              | Files                        | State |
| ----------------- | ---------------------------- | ----- |
| Multi-tenant auth | `src/lib/auth/*`             | Works for the happy paths in `docs/new-flow.md` |
| Email + password  | Better Auth `emailAndPassword` | Done |
| GitHub OAuth      | `socialProviders.github`     | Done (Google is in `.env.example` and the docs, but **not** wired up) |
| JWT + JWKS        | `jwt()` plugin, `applicationId` claim | Done |
| Admin / org plugins | `admin()`, `organization()` | Done |
| Sessions          | Postgres + Redis secondary storage | Done |
| Applications CRUD | `src/applications/*`         | Done, org-scoped |
| Users admin       | `src/users/*`                | Done — **but unauthenticated** (§5.3) |
| Proxy route CRUD  | `src/routes-config/*`        | Done — **but unauthenticated** (§5.3) |
| API gateway       | `src/proxy/*`                | Done — **but unauthenticated** (§5.4) |
| Health            | `src/health/*`               | DB ping |
| Migrations        | 3 Drizzle migrations         | Applied |
| RLS (Phase 1F)    | —                            | Not started |
| Tests             | —                            | **None** |

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

### 5.1 The internal-adapter override is not concurrency-safe — this is the big one

`betterAuth()` calls `init(options)` **once** and every request does
`const ctx = await authContext` on that same object:

```js
// better-auth/dist/shared/better-auth.CDx1PoNO.mjs
const betterAuth = (options) => {
  const authContext = init(options);          // created ONCE
  return { handler: async (request) => { const ctx = await authContext; /* ... */ } };
};
```

So `ctx.context.internalAdapter` is **process-global state**, and
`overrideInternalAdapters()` rewrites it on every request
(<ref_snippet file="/Users/AD12-codes/projects/au1h/apps/server/src/lib/auth/hooks-middleware.ts" lines="188-213" />).
Two concurrent sign-ins from different apps will interleave: request A patches the
adapter for `app-todo`, request B overwrites it with `app-books`, then A's `createUser`
runs with B's `applicationId`. Consequences are silent cross-tenant writes — a user
created under the wrong app, or a login validated against another tenant's credentials.
It works today only because you're testing one request at a time.

**Recommended fix — `AsyncLocalStorage` + adapter-level scoping.** Keep one Better Auth
instance and one set of adapter functions; read the tenant from request-scoped storage
instead of mutating shared objects:

```ts
export const appContext = new AsyncLocalStorage<{ applicationId: string | null }>();

// hooks.before: resolve tenant, then appContext.enterWith({ applicationId })
// adapters: const { applicationId } = appContext.getStore() ?? { applicationId: null };
```

Then move the scoping **down into a wrapped Drizzle adapter** (inject the
`application_id` predicate into `findOne`/`findMany` and the value into `create`)
rather than reimplementing seven `internalAdapter` methods. That is far less surface
area to keep in sync with Better Auth, and it removes the hand-written `crypto.randomUUID()`
+ `db.insert()` duplication in `internal-adapters.ts`. Alternative (heavier) design: a
`Map<applicationId, ReturnType<typeof betterAuth>>` of per-app instances.

Either way: **pin Better Auth (already done: `1.3.34`) and add tests before upgrading.**
These overrides depend on undocumented internals — argument order in `findOAuthUser`,
the `{ user, accounts }` return shape, etc. A patch release can break tenant isolation
without a type error.

### 5.2 Admin privilege is decided by a spoofable header

`isDirectAdminOrigin()` trusts `Origin` / `Referer`
(<ref_snippet file="/Users/AD12-codes/projects/au1h/apps/server/src/lib/auth/app-context.ts" lines="219-230" />).
Browsers set these honestly; `curl` does not. Anyone can do:

```
curl -X POST https://au1h/api/auth/sign-up/email -H 'Origin: http://localhost:4445' ...
```

and be treated as an au1h admin-portal signup — `applicationId = NULL`, auto-created
organization, and from there full access to the applications API. That's privilege
escalation to tenant-admin from an unauthenticated request.

Fix: make the admin portal an explicitly registered application (or a dedicated
`/api/admin/auth/*` base path) authenticated by a server-side secret, and gate admin
signup behind an invite/allowlist. Never infer trust from `Origin`.

### 5.3 The v1 admin API has no authentication at all

`src/routes.ts` mounts `/api/v1/users` and `/api/v1/routes` with **zero** session check
and no org scoping:

- `GET /api/v1/users` — dump every user of every tenant.
- `POST /api/v1/users/:id/ban`, `DELETE /api/v1/users/:id/sessions` — ban anyone,
  kill anyone's sessions.
- `POST /api/v1/routes` — register a proxy route for **any** `applicationId`, pointing at
  any URL. That is both traffic hijacking and an SSRF primitive (au1h will fetch
  internal addresses for you).

Only `src/applications/*` checks a session, via `getActiveOrganizationId()`
(<ref_snippet file="/Users/AD12-codes/projects/au1h/apps/server/src/applications/controller.ts" lines="36-43" />).

Fix: one `requireOrgSession` Hono middleware applied to the whole `/api/v1` router;
every service function takes `organizationId` and filters on it, as `applications/service.ts`
already does. `routes-config` must verify the target application belongs to the caller's org,
and `backendUrl` should be validated against an allowlist / blocked from private IP ranges.

### 5.4 The proxy authenticates nothing

`getUserContext()` swallows session errors and returns `{}`
(<ref_snippet file="/Users/AD12-codes/projects/au1h/apps/server/src/proxy/middleware.ts" lines="44-59" />),
and the request is forwarded regardless. So any anonymous caller with a valid
`x-app-id` reaches the backend — while the backend has been told by
`docs/INTEGRATION.md` that these headers are trustworthy and that "no exposed backend
endpoints" exist. Worse, the session's `applicationId` is never compared with the
matched route's application, so a session issued for app A can drive app B's routes.

Fix: reject with 401 when there's no session; assert
`session.session.applicationId === route.applicationId`; support `Authorization: Bearer`
JWT (verify signature, expiry, and the app claim) alongside cookies. Optionally require
the app secret / mTLS on the gateway→backend hop so backends can't be called directly.

### 5.5 The composite unique constraints don't do what they look like

```sql
CREATE UNIQUE INDEX users_email_app_unique ON users (email, application_id);
```

In Postgres, `NULL` values are **distinct**, so this index does not prevent duplicate
emails among admin-portal users (`application_id IS NULL`) — the one group where email
*must* be unique. `accounts_provider_app_unique` has the same hole. `PLAN.md` §1C is
marked done, but the guarantee isn't there.

Fix: either `UNIQUE NULLS NOT DISTINCT` (PG 15+), or a pair of partial indexes
(`WHERE application_id IS NOT NULL` / `WHERE application_id IS NULL`), or replace the
`NULL` sentinel with a real "au1h system" application row — which would also delete a lot
of `isNull()` branching from `internal-adapters.ts` and make `users`/`accounts.application_id`
`NOT NULL` again.

### 5.6 The application secret is decorative

`createApplication()` stores `crypto.randomUUID()` in plaintext, despite the schema
comment `// Hashed API secret for backend auth`
(<ref_snippet file="/Users/AD12-codes/projects/au1h/apps/server/src/applications/service.ts" lines="160-184" />),
and **nothing in the codebase ever verifies it**. Apps are identified purely by the
client-supplied `x-app-id` slug. So "app registration" is not an authentication boundary —
any caller can claim any app's identity.

Fix: hash the secret at rest (Argon2/scrypt — Better Auth already ships a hasher), and
require it on the operations that matter: server-to-server calls, proxy registration,
and ideally an `x-app-secret` (or signed request) on auth endpoints so tenant selection
can't be forged. Also note `applications.allowedOrigins` is documented as "JSON array"
in the schema comment but is parsed as a comma-separated string.

### 5.7 Tokens and passwords are written to logs

`logger.info({ accountToInsert: newAccount }, "🔥 About to insert account")`
(<ref_snippet file="/Users/AD12-codes/projects/au1h/apps/server/src/lib/auth/internal-adapters.ts" lines="173-173" />)
serialises the whole account row — `accessToken`, `refreshToken`, `idToken`, and the
password hash — at `info` level. Same category: nearly every `🔥` line logs emails and
tenant ids at `info` on the hot path.

Fix: add a Pino redaction list (`accessToken`, `refreshToken`, `idToken`, `password`,
`token`, `secret`), drop these to `debug`, and delete the emoji-prefixed
developer-tracing logs. While in there, remove the "DEBUG: all matching accounts" query
in `createFindOAuthUser` — it's an extra full table scan on every OAuth login
(<ref_snippet file="/Users/AD12-codes/projects/au1h/apps/server/src/lib/auth/internal-adapters.ts" lines="221-249" />).

### 5.8 Session revocation doesn't revoke

Sessions are stored in Postgres **and** in Redis via `secondaryStorage`, but
`revokeSession` / `revokeAllUserSessions` delete only the Postgres rows
(<ref_snippet file="/Users/AD12-codes/projects/au1h/apps/server/src/users/service.ts" lines="234-250" />).
Better Auth reads secondary storage first, so a "revoked" session can keep working until
its TTL expires. Same concern for ban: `banUser` flips the column but doesn't kill
sessions. Use `auth.api.revokeSession` / `revokeUserSessions` instead of raw deletes.

### 5.9 OAuth context plumbing is fragile

The app slug survives the OAuth round-trip through a stack of unsigned cookies
(`au1h-app-id`, `au1h-is-client-app`, `au1h-is-admin`) plus a Redis marker **keyed by
client IP** (`oauth-admin:${clientIp}`). Problems:

- `au1h-app-id` is populated straight from a client-supplied header, so the tenant is
  attacker-selectable, and a stale cookie silently redirects a signup into the wrong app.
- IP keying collides for users behind the same NAT/proxy, and lets an unauthenticated
  request pre-plant the "this is admin" marker for a victim's IP.
- `getClientIp` reads `x-forwarded-for` without knowing whether a trusted proxy set it.
- `skipStateMismatch()` disables OAuth state checking in dev
  (<ref_file file="/Users/AD12-codes/projects/au1h/apps/server/src/lib/auth/plugins.ts" />) — a
  workaround for cross-port localhost cookies. Fine as long as it can never ship, but it
  hides the real problem.

Fix: carry the tenant in the OAuth `state` parameter (that's what it's for) or in a
signed/HMAC'd cookie, and delete the Redis-IP-marker mechanism entirely.

### 5.10 JWT claims are under-specified

`definePayload` emits `sub`, `email`, `name`, `applicationId`
(<ref_snippet file="/Users/AD12-codes/projects/au1h/apps/server/src/lib/auth/index.ts" lines="131-140" />)
but `docs/INTEGRATION.md` tells integrators to read `payload.app_id` — the docs and the
code disagree, so every published backend snippet gets `undefined`. More importantly
there's no per-app `aud`/`iss`, and all apps share one JWKS: a token minted for the todo
app verifies perfectly at the books app's backend. Nothing stops cross-app token reuse,
which `.windsurf/rules/au1h-core.md` explicitly lists as a requirement.

Fix: add `aud = <app slug>` (and `iss = au1h URL`), document that backends **must**
verify `aud`, and align the docs on one claim name.

### 5.11 Operational / correctness gaps

- **No tests.** Given §5.1, the priority test suite is: concurrent sign-ups across two
  apps (must not cross-contaminate), same email in 2 apps + admin, login isolation
  (app A password must fail on app B), OAuth link isolation, and proxy authz.
- **Caches are per-process.** Origins (twice — `dynamic-cors.ts` and `app-context.ts`
  duplicate the same query), and proxy routes, all in module-level `let` with TTLs.
  Multi-instance deployments will serve stale CORS/routes for up to a minute, and
  `invalidateOriginsCache()` only clears the local copy. Redis is already connected —
  use it, or pub/sub the invalidation.
- **Admin users are invisible in the Users page.** `listUsers`/`getUser` `innerJoin`
  `applications`, which drops every `application_id IS NULL` row
  (<ref_snippet file="/Users/AD12-codes/projects/au1h/apps/server/src/users/service.ts" lines="101-102" />).
  Should be a `leftJoin`. Relatedly `interface User.applicationId: string` is typed
  non-nullable but the column is nullable.
- **No rate limiting on `/api/v1/*` or `/proxy/*`.** Better Auth's own limiter covers
  `/api/auth/*` and only when `NODE_ENV=production` — note the codebase gates DB
  selection on `APP_ENV` and cookies/CORS on `NODE_ENV`; two env vars for one concept
  is a footgun.
- **Proxy details:** `x-forwarded-proto` is hardcoded to `https`; the whole request body
  is buffered into memory (`arrayBuffer()`), so large uploads/streaming won't work; there's
  no timeout on the backend `fetch`; backend `Set-Cookie` is passed through untouched.
- **RLS (Phase 1F) never started.** It's the defence-in-depth that makes §5.1-class bugs
  non-catastrophic, and `.windsurf/rules/au1h-core.md` treats it as a core requirement.
  Worth doing once tenant context lives in `AsyncLocalStorage`, since you can then
  `SET LOCAL app.application_id` per transaction.
- **Dead code / drift:** `src/lib/auth.reference.ts`, the unused exported
  `getAppSlugFromRequest` in `app-context.ts` (a second, divergent copy of the logic in
  `hooks-middleware.ts`), `src/test.html`, the unused "pool metadata" half of
  `utils/redis.ts`, and `db:seed` pointing at a `src/db/seed.ts` that doesn't exist.
- **Docs drift:** root `README.md` is still the unmodified Better-T-Stack template and
  describes a `packages/{api,auth,db}` layout that doesn't exist. `PLAN.md` claims
  "Phase 3: 100%" while its own header-contract item is unchecked, and is dated
  December 2024. Google OAuth appears in `.env.example`, `docs/new-flow.md`, and
  `docs/INTEGRATION.md` but not in `lib/auth/index.ts`.

---

## 6. Suggested order of work

1. **Fix tenant isolation properly** (§5.1) — `AsyncLocalStorage` + adapter-level
   scoping. Everything else is built on this.
2. **Write the isolation test suite** (§5.11) so #1 is provable and Better Auth upgrades
   stop being scary.
3. **Close the authz holes** (§5.3, §5.4, §5.2) — `requireOrgSession` on `/api/v1`,
   require a session + app match in the proxy, stop trusting `Origin` for admin.
4. **Make app identity real** (§5.6) — hash the secret and actually verify it.
5. **Fix the unique indexes** (§5.5) and session revocation (§5.8).
6. **Clean up logging** (§5.7) and delete the debug query.
7. **Harden the OAuth flow** (§5.9) — tenant in `state`, drop the IP marker.
8. **Then** the polish: JWT `aud` (§5.10), shared caches, RLS, dead code, docs.

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
