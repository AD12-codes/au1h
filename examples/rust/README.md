# au1h example · Rust (axum + jsonwebtoken)

```bash
cargo run              # http://localhost:8082
```

Configuration is read from the environment (`PORT`, `AU1H_URL`, `AU1H_APP_SLUG`,
optional `AU1H_APP_ID`); see `.env.example`. `src/main.rs` verifies the au1h JWT with
`jsonwebtoken` against `${AU1H_URL}/api/auth/jwks` (EdDSA / Ed25519), checks `iss`
and `aud`, and optionally pins `applicationId` to `AU1H_APP_ID`.
See [../README.md](../README.md) for the full walkthrough.
