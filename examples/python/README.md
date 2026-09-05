# au1h example · Python (FastAPI + PyJWT)

```bash
uv run main.py         # http://localhost:8083
```

Or without uv:

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
python main.py
```

Configuration is read from the environment (`PORT`, `AU1H_URL`, `AU1H_APP_SLUG`,
optional `AU1H_APP_ID`); see `.env.example`. `main.py` verifies the au1h JWT with
PyJWT against `${AU1H_URL}/api/auth/jwks` (EdDSA / Ed25519), checks `iss` and `aud`,
and optionally pins `applicationId` to `AU1H_APP_ID`.
See [../README.md](../README.md) for the full walkthrough.
