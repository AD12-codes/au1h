# au1h

Authentication-as-a-service for your own apps. One au1h deployment hosts login, sessions,
OAuth and JWTs for many unrelated products, plus an API gateway that forwards each
product's API traffic to its backend with verified user context attached.

- **One Better Auth instance, many applications.** A product registers in the admin
  portal, gets a slug, and sends `x-app-id: <slug>`. The same email is a *different user*
  in every application: separate password, sessions, OAuth links and bans.
- **Backends stay auth-free.** They either verify au1h's JWT (EdDSA, `aud` = their slug)
  against the public JWKS, or sit behind the `/proxy` gateway and read trusted
  `x-user-id` / `x-app-id` headers.
- **Admin portal** for organizations to manage applications, users, sessions and proxy
  routes.

## Repository layout

| Path            | What                                                                 |
| --------------- | -------------------------------------------------------------------- |
| `apps/server`   | Hono + Bun API: Better Auth, tenant-scoped adapter, admin API, proxy  |
| `apps/web`      | Admin portal (React, TanStack Router, shadcn/ui), port 4445           |
| `examples/`     | Minimal Go, Rust, Python and TypeScript backends + demo pages         |
| `docs/`         | `ARCHITECTURE.md` (design + status), `INTEGRATION.md` (how to use it) |

## Getting started

Prerequisites: Bun, Postgres 15+, Redis.

```bash
bun install
cp apps/server/.env.example apps/server/.env   # set DATABASE_URL, BETTER_AUTH_SECRET, …
cp apps/web/.env.example apps/web/.env
```

Apply the schema (either way works; migrations live in `apps/server/src/db/migrations`):

```bash
cd apps/server && bun run db:migrate    # or: bun run db:push
```

Run both apps:

```bash
bun run dev            # server on http://localhost:4444, admin portal on http://localhost:4445
```

Open the admin portal and register. The very first admin account is created freely; after
that, admin sign-up requires `AU1H_ADMIN_EMAILS` (allowlist) or an organization invitation.
Then create an application, copy its slug, and follow `docs/INTEGRATION.md` or run the
`examples/`.

## Useful commands

```bash
bun run dev:server     # server only
bun run dev:web        # admin portal only
bun run check          # biome (lint + format) across the repo
bun run check-types    # tsc across the repo
cd apps/server && bun test      # server unit tests
cd apps/server && bun run db:generate   # new migration from schema changes
```

## Where to read next

- `docs/ARCHITECTURE.md` — how tenancy works, request flow, and the current status of
  every known issue.
- `docs/INTEGRATION.md` — client and backend integration in TypeScript, Go and Python.
- `examples/README.md` — run four backends and sign in with the same email in each.
