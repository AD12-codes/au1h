# au1h examples

Four tiny backends, one per language, that all authenticate against a single au1h
deployment. Each one serves a demo page and a protected `GET /api/me` endpoint that
verifies the au1h JWT and returns the signed-in user's info.

| Language   | Folder         | Stack                        | Port | App slug (`x-app-id`) |
| ---------- | -------------- | ---------------------------- | ---- | --------------------- |
| Go         | `go/`          | net/http + lestrrat-go/jwx   | 8081 | `example-go`          |
| Rust       | `rust/`        | axum + jsonwebtoken          | 8082 | `example-rust`        |
| Python     | `python/`      | FastAPI + PyJWT              | 8083 | `example-python`      |
| TypeScript | `typescript/`  | Bun + Hono + jose            | 8084 | `example-typescript`  |

The point of the demo: **sign in with the same email in all four apps.** Each app
gets its own user (different user id, password, session) because au1h scopes identity
per application. Nothing in these backends knows about the other apps.

## How it works

```
browser (localhost:808x)          au1h (localhost:4444)              backend (localhost:808x)
─────────────────────────         ─────────────────────              ────────────────────────
POST /api/auth/sign-in/email  ─▶  x-app-id: example-go
                              ◀─  session cookie
GET  /api/auth/token          ─▶  x-app-id: example-go
                              ◀─  { token: <JWT, EdDSA> }
GET  /api/me  Authorization: Bearer <JWT>  ───────────────────────▶  fetch JWKS from au1h once,
                                                                     verify signature, iss, aud,
                                                                     optional applicationId pin
                              ◀──────────────────────────────────── { user, token, language }
```

- The page talks to au1h directly with the `x-app-id` header. No auth code runs in the
  backend beyond verifying the JWT.
- The backend fetches `GET {AU1H_URL}/api/auth/jwks` (public, no app context needed),
  caches the keys, and verifies the token with `alg=EdDSA`, `iss=aud=AU1H_URL`.
- The JWT carries `sub`, `email`, `name`, `applicationId`. Set `AU1H_APP_ID` to the app's
  UUID (from the admin portal) and the backend rejects tokens minted for any other app
  with `403`. Leave it empty to see that, without the pin, a token from one app verifies
  at another (that is the cross-app reuse gap described in `docs/ARCHITECTURE.md` §5.10).

## Setup

1. **Run au1h** (`bun run dev:server` from the repo root; Postgres and Redis must be up).
2. **Register the four applications** in the admin portal (`http://localhost:4445` →
   Applications → Create), one per row of the table above:
   - Name: anything, e.g. `Example · Go`
   - Slug: exactly the slug from the table (this is the `x-app-id`)
   - Allowed origins: `http://localhost:<port>` from the table

   Or, for a local database, insert them directly:

   ```sql
   insert into applications (id, organization_id, name, slug, secret, allowed_origins, is_active)
   select gen_random_uuid()::text, '<your organization id>', n, s, gen_random_uuid()::text, o, true
   from (values
     ('Example · Go',         'example-go',         'http://localhost:8081'),
     ('Example · Rust',       'example-rust',       'http://localhost:8082'),
     ('Example · Python',     'example-python',     'http://localhost:8083'),
     ('Example · TypeScript', 'example-typescript', 'http://localhost:8084')
   ) as v(n, s, o)
   on conflict (slug) do nothing;
   ```

3. **Start the backends**, each in its own terminal:

   ```bash
   cd examples/go         && go run .
   cd examples/rust       && cargo run
   cd examples/python     && uv run main.py
   cd examples/typescript && bun install && bun run dev
   ```

   Every backend reads `PORT`, `AU1H_URL` (default `http://localhost:4444`),
   `AU1H_APP_SLUG` and optional `AU1H_APP_ID` from the environment; the defaults match
   the table, so no configuration is needed for a local au1h. See each folder's
   `.env.example`.

## Demo script

1. Open `http://localhost:8081`, enter an email + password, click **Sign up**.
   The page shows the user info as verified by the Go backend, including the user id and
   the `applicationId`.
2. Open `http://localhost:8082`, **Sign up** with the *same* email and password.
   Different user id, different `applicationId`. Repeat for 8083 and 8084.
3. Reload any of the four pages: each stays signed in as its own user (the JWT is kept in
   that origin's `localStorage`).
4. Try to sign **in** (not up) on a fifth, unregistered slug, or with a password from
   another app: it fails, because credentials are per application.
5. Cross-app tokens: copy the token from one page's localStorage and call another backend:

   ```bash
   curl -H "authorization: Bearer <token from example-go>" http://localhost:8082/api/me
   ```

   Without `AU1H_APP_ID` set, the Rust backend accepts it and shows Go's `applicationId`.
   Start it with `AU1H_APP_ID=<example-rust uuid> cargo run` and the same call returns `403`.

## Things to know

- **JWTs expire after 15 minutes** (Better Auth's default for the `jwt` plugin). When the
  backend returns `401`, the page drops the token and shows the sign-in form again.
- **All four apps share one au1h cookie.** Browsers key cookies by host, not port, so
  the `better-auth.session_token` cookie for `localhost` is overwritten each time you sign
  in on another example. The pages do not depend on the cookie after sign-in (they use the
  stored JWT), but **Sign out** signs out whichever session the cookie currently holds.
  In a real deployment every app has its own origin and this does not apply.
- **Endpoints used**: `POST /api/auth/sign-up/email`, `POST /api/auth/sign-in/email`,
  `GET /api/auth/token`, `POST /api/auth/sign-out` (all with `x-app-id`), and
  `GET /api/auth/jwks` (no app context).
