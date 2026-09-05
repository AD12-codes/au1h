"""au1h example backend in Python (FastAPI + PyJWT).

Serves the demo page and one protected endpoint, GET /api/me, which verifies
the JWT minted by au1h (EdDSA / Ed25519) against au1h's JWKS and echoes the
verified user claims back.
"""

import os
from pathlib import Path

import jwt
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from jwt import PyJWKClient

AU1H_URL = os.environ.get("AU1H_URL", "http://localhost:4444").rstrip("/")
APP_SLUG = os.environ.get("AU1H_APP_SLUG", "example-python")
APP_ID = os.environ.get("AU1H_APP_ID") or None  # optional: pin tokens to this application
PORT = int(os.environ.get("PORT", "8083"))

# PyJWKClient fetches and caches au1h's signing keys; unknown kids trigger a refetch.
jwks_client = PyJWKClient(f"{AU1H_URL}/api/auth/jwks", cache_keys=True)

app = FastAPI(title="au1h example · Python")


def current_claims(request: Request) -> dict:
    """Extract and verify the bearer token; returns the JWT claims."""
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="missing bearer token")
    token = auth[len("Bearer ") :]

    try:
        signing_key = jwks_client.get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["EdDSA"],
            issuer=AU1H_URL,
            audience=AU1H_URL,
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail=f"invalid token: {exc}") from exc

    # Tenant check: a token from another au1h application must not be accepted here.
    if APP_ID and claims.get("applicationId") != APP_ID:
        raise HTTPException(status_code=403, detail="token was issued for a different application")

    return claims


@app.get("/")
def index():
    return FileResponse(Path(__file__).with_name("index.html"))


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/config")
def config():
    return {"language": "python", "au1hUrl": AU1H_URL, "appSlug": APP_SLUG}


@app.get("/api/me")
def me(claims: dict = Depends(current_claims)):
    return {
        "language": "python",
        "library": "PyJWT",
        "user": {
            "id": claims.get("sub"),
            "email": claims.get("email"),
            "name": claims.get("name"),
            "applicationId": claims.get("applicationId"),
        },
        "token": {
            "issuer": claims.get("iss"),
            "audience": claims.get("aud"),
            "issuedAt": claims.get("iat"),
            "expiresAt": claims.get("exp"),
        },
    }


# The demo page expects `{"error": "..."}`; FastAPI's default is `{"detail": "..."}`.
@app.exception_handler(HTTPException)
async def http_exception_handler(_: Request, exc: HTTPException):
    from fastapi.responses import JSONResponse

    return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})


if __name__ == "__main__":
    import uvicorn

    print(f"au1h Python example listening on http://localhost:{PORT} (app slug: {APP_SLUG})")
    uvicorn.run(app, host="0.0.0.0", port=PORT)
