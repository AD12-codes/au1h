# au1h example · TypeScript (Bun + Hono + jose)

```bash
cp .env.example .env   # adjust if needed
bun install
bun run dev            # http://localhost:8084
```

`src/index.ts` verifies the au1h JWT with `jose` against `${AU1H_URL}/api/auth/jwks`
(EdDSA / Ed25519), checks `iss`, and
checks `aud` against its own slug (`AU1H_APP_SLUG`), which rejects tokens minted for other
applications. See [../README.md](../README.md) for the full walkthrough.
