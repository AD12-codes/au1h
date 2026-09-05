# au1h example · Go (net/http + lestrrat-go/jwx)

```bash
go run .               # http://localhost:8081
```

Configuration is read from the environment (`PORT`, `AU1H_URL`, `AU1H_APP_SLUG`,
optional `AU1H_APP_ID`); see `.env.example`. `main.go` verifies the au1h JWT with
`jwx` against `${AU1H_URL}/api/auth/jwks` (EdDSA / Ed25519), checks `iss` and `aud`,
and optionally pins `applicationId` to `AU1H_APP_ID`.
See [../README.md](../README.md) for the full walkthrough.
