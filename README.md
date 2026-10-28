<p align="center">
  <img src="assets/app-icon.svg" width="96" alt="au1h">
</p>
<h1 align="center">au1h</h1>

<p align="center">
  <a href="https://github.com/AD12-codes/au1h/actions/workflows/ci.yml"><img src="https://github.com/AD12-codes/au1h/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/@au1h/client"><img src="https://img.shields.io/npm/v/@au1h/client?label=%40au1h%2Fclient" alt="npm"></a>
  <a href="https://pypi.org/project/au1h/"><img src="https://img.shields.io/pypi/v/au1h?label=au1h%20(PyPI)" alt="PyPI"></a>
  <a href="https://pkg.go.dev/github.com/AD12-codes/au1h/packages/go"><img src="https://pkg.go.dev/badge/github.com/AD12-codes/au1h/packages/go.svg" alt="Go Reference"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-2F80FF" alt="MIT"></a>
</p>

<p align="center">
  Self-hosted authentication for all of your apps. One deployment, many products, zero shared users.
  <br>
  <a href="https://au1h.dev/docs">Documentation</a> · <a href="https://au1h.dev/docs/getting-started/quickstart">Quickstart</a> · <a href="examples/">Examples</a>
</p>

---

au1h (pronounced "auth") runs sign-up, sign-in, OAuth, sessions, organizations, email
flows and JWTs for every app you build, from a single server you own. Each app is a
**tenant**: the same email address is a different user in each one, with its own password,
sessions and OAuth links. Your backends never see a password. They verify a short-lived
JWT, or sit behind au1h's gateway and read trusted headers.

Built on [Better Auth](https://www.better-auth.com), Postgres and Redis.

## Features

- **Many apps, one server.** Register an app in the admin portal, get a slug, send
  `x-app-id: <slug>`. Users, sessions, accounts and organizations are scoped per app at the
  database adapter, not in your code.
- **Everything Better Auth does.** Email + password, GitHub and Google OAuth, magic links,
  email OTP, email verification, password reset, organizations and invitations.
- **Backends stay simple.** Verify an EdDSA JWT (`aud` = your app) with
  `@au1h/server`, the Go module or the Python package, or route traffic through the
  `/proxy` gateway and read `x-user-id`.
- **Admin portal and CLI.** Manage apps, users, sessions, gateway routes and personal
  access tokens in the browser or with `au1h apps create todo --init`.
- **Operable.** Docker images, migrations on start, Redis-backed rate limits and caches,
  redacted logs, integration tests against real Postgres.

## Quick start

Run the whole stack with Docker:

```bash
git clone https://github.com/AD12-codes/au1h && cd au1h
cp deploy/.env.example .env            # set BETTER_AUTH_SECRET, URLs, your admin email
docker compose up -d
```

Open the admin portal, create the first admin account, register an application and copy
its slug. Or for local development:

```bash
bun install
cp apps/server/.env.example apps/server/.env   # DATABASE_URL, REDIS_URL, BETTER_AUTH_SECRET
cp apps/web/.env.example apps/web/.env
bun run dev        # server :4444 · admin portal :4445 · docs :4446
```

## Use it from your app

**Browser** (`npm i @au1h/client better-auth`):

```ts
import { createAu1hClient } from "@au1h/client"; // "@au1h/client/react" for hooks

export const auth = createAu1hClient({ baseURL: "https://auth.example.com", appSlug: "todo" });

await auth.signIn.email({ email, password });
await auth.signIn.magicLink({ email, callbackURL: "/" });
const res = await auth.authFetch("https://api.todo.example.com/me"); // adds the JWT
```

**Backend**, TypeScript (`npm i @au1h/server`):

```ts
import { createVerifier } from "@au1h/server";
import { requireAu1hUser } from "@au1h/server/hono"; // or "@au1h/server/express"

const au1h = createVerifier({ au1hUrl: "https://auth.example.com", appSlug: "todo" });
app.use("/api/*", requireAu1hUser(au1h));
app.get("/api/me", (c) => c.json(c.get("au1hUser")));
```

Go:

```go
v, _ := au1h.NewVerifier(ctx, au1h.Options{URL: "https://auth.example.com", AppSlug: "todo"})
mux.Handle("/api/me", v.Require(http.HandlerFunc(me)))
```

Python:

```python
au1h = Verifier("https://auth.example.com", "todo")
@app.get("/api/me")
def me(user: User = Depends(require_user(au1h))): return user
```

A token minted for another app is rejected with 403. That is the whole point.

## CLI

```bash
npm i -g @au1h/cli                           # installs the `au1h` command
au1h login                                   # paste a personal access token
au1h apps create todo --origins http://localhost:3000 --init
au1h routes add todo /api/* http://localhost:8080
```

## How tenancy works

Every request to `/api/auth/*` resolves an application from `x-app-id` (or `?app=` on
links opened from emails) and runs inside a request-scoped tenant context. A wrapper around
the database adapter adds `application_id` to every read and write, and the Redis session
cache is tenant-checked, so isolation does not depend on any route remembering to filter.
The admin portal is just another tenant with a reserved slug. Details in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Deploy

Three images are published to GHCR on every push to `main`: `au1h-server`, `au1h-web` and
`au1h-docs`. Run them with `deploy/docker-compose.ghcr.yml`, or as three services on any
platform that runs Docker images, with Postgres 15+ and Redis alongside. The server applies
migrations on start. See the [deploy guide](https://au1h.dev/docs/getting-started/deploy).

## Repository

| Path              | What                                                             |
| ----------------- | ---------------------------------------------------------------- |
| `apps/server`     | Hono + Bun API: Better Auth, tenant-scoped adapter, admin API, gateway |
| `apps/web`        | Admin portal (React, TanStack Router, shadcn/ui)                 |
| `apps/docs`       | Documentation site (Fumadocs)                                    |
| `packages/client` | `@au1h/client`, browser SDK (vanilla and React)                  |
| `packages/server` | `@au1h/server`, JWT verification for Hono and Express            |
| `packages/go`     | Go module `github.com/AD12-codes/au1h/packages/go`               |
| `packages/python` | PyPI package `au1h`, with FastAPI helpers                         |
| `packages/cli`    | The `au1h` CLI                                                   |
| `examples/`       | Go, Rust, Python and TypeScript backends sharing one au1h        |

## Development

```bash
bun run check-types                  # tsc across the repo
bun x biome check .                  # lint + format
cd apps/server && bun test           # unit tests, no database needed
cd apps/server && AU1H_TEST_DATABASE_URL=postgresql://…/au1h_test bun run test:integration
```

`main` is protected; open a pull request and CI must pass.

## Security

Please report vulnerabilities privately, see [SECURITY.md](SECURITY.md).

## Support

au1h is free and self-hosted. If it saves you from wiring auth for the fifth time,
you can [buy me a coffee](https://buymeacoffee.com/anshuldharmadhikari).

## License

[MIT](LICENSE)
