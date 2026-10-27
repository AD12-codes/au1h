"""au1h example backend in Python (FastAPI + the au1h SDK).

Serves the demo page and one protected endpoint, GET /api/me, which verifies
the JWT minted by au1h (EdDSA / Ed25519) against au1h's JWKS and echoes the
verified user claims back.
"""

import os
from pathlib import Path

from au1h import User, Verifier
from au1h.fastapi import require_user
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse

AU1H_URL = os.environ.get("AU1H_URL", "http://localhost:4444").rstrip("/")
APP_SLUG = os.environ.get("AU1H_APP_SLUG", "example-python")
PORT = int(os.environ.get("PORT", "8083"))

# Verifies au1h JWTs: EdDSA signature via JWKS, exp, iss = au1h, aud = APP_SLUG.
au1h = Verifier(AU1H_URL, APP_SLUG)
current_user = require_user(au1h)

app = FastAPI(title="au1h example · Python")


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
def me(request: Request, user: User = Depends(current_user)):
    claims = au1h.verify_authorization(request.headers.get("authorization"))
    return {
        "language": "python",
        "library": "au1h (PyJWT)",
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "applicationId": user.application_id,
        },
        "token": {
            "issuer": claims.get("iss"),
            "audience": claims.get("aud"),
            "issuedAt": claims.get("iat"),
            "expiresAt": claims.get("exp"),
        },
    }


# The demo page expects `{"error": "..."}`; the SDK raises HTTPException with
# detail={"error", "code"}; flatten it.
@app.exception_handler(HTTPException)
async def http_exception_handler(_: Request, exc: HTTPException):
    detail = exc.detail if isinstance(exc.detail, dict) else {"error": exc.detail}
    return JSONResponse(status_code=exc.status_code, content=detail)


if __name__ == "__main__":
    import uvicorn

    print(f"au1h Python example listening on http://localhost:{PORT} (app slug: {APP_SLUG})")
    uvicorn.run(app, host="0.0.0.0", port=PORT)
