# au1h — working rules for coding agents

au1h is a self-hosted multi-tenant auth service: Hono/Bun server (`apps/server`), React admin
portal (`apps/web`), Fumadocs site (`apps/docs`), SDKs and CLI in `packages/*`, demo
backends in `examples/*`. Better Auth 1.3 underneath. Full design: `docs/ARCHITECTURE.md`.

## Before coding

- Plan in under 300 words, then build. No multi-round planning ceremonies.
- Anything under `/api/auth`, the adapter, or the proxy is tenant code: say which tenant
  every query runs as before touching it.

## Invariants (do not break)

- Every auth request runs inside the tenant store (`lib/auth/tenant-context.ts`); never call
  `auth.api.*` outside `handleAuthRequest`/`getSessionForRequest`.
- Admin scope is `application_id IS NULL`, slug `au1h-admin`. No header other than
  `x-app-id` (or `?app=` on emailed links) may select a tenant.
- `/api/v1/*` goes through `requireOrgSession`; services take `organizationId`.
- Secrets, PATs and app secrets are stored hashed only. Never log tokens, cookies or
  passwords (pino redaction list in `utils/logger.ts`).
- Emailed links carry `?app=<slug>`; tokens must not be usable by another application.

## Checks before a PR

```bash
bun x biome check .                 # lint + format, whole repo
bun run check-types
cd apps/server && bun test          # unit, no database
cd apps/server && AU1H_TEST_DATABASE_URL=postgresql://…/au1h_test bun run test:integration
```

Review checklist: tenant crossing, authz on new routes, input validation (zod) on bodies,
secrets in logs, migrations are additive, docs page updated when behaviour changes.

## Conventions

- `main` is protected: branch, PR, CI green. Conventional commit prefixes
  (`feat(server):`, `fix(client):`, `docs:`, `test(server):`).
- Biome via ultracite; fix lint by changing code, not by adding ignores.
- Never commit `.env`, `*.local.md`, or test rows; clean up test data you created.
