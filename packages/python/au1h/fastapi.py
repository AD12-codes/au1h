"""FastAPI helpers.

    from au1h import Verifier
    from au1h.fastapi import require_user

    au1h = Verifier("https://auth.example.com", "my-app")
    current_user = require_user(au1h)

    @app.get("/api/me")
    def me(user: User = Depends(current_user)):
        return user
"""

from __future__ import annotations

from typing import Callable

from fastapi import HTTPException, Request

from .proxy import ProxyContext, read_proxy_context
from .verifier import AuthError, User, Verifier


def _http(exc: AuthError) -> HTTPException:
    return HTTPException(status_code=exc.status, detail={"error": str(exc), "code": exc.code})


def require_user(verifier: Verifier) -> Callable[[Request], User]:
    """Dependency: verifies `Authorization: Bearer <au1h JWT>` and returns the User."""

    def dependency(request: Request) -> User:
        try:
            return User.from_claims(verifier.verify_authorization(request.headers.get("authorization")))
        except AuthError as exc:
            raise _http(exc) from exc

    return dependency


def require_proxy(verifier: Verifier | None = None) -> Callable[[Request], ProxyContext]:
    """Dependency for backends behind the au1h gateway. With a verifier it also
    checks `x-au1h-token`, proving the request passed through au1h."""

    def dependency(request: Request) -> ProxyContext:
        ctx = read_proxy_context(request.headers)
        if ctx is None:
            raise _http(AuthError("missing au1h gateway headers", 401, "NOT_PROXIED"))
        if verifier is not None:
            try:
                claims = verifier.verify_proxy_token(ctx.proxy_token)
            except AuthError as exc:
                raise _http(exc) from exc
            if claims["sub"] != ctx.user.id or claims["email"] != ctx.user.email:
                raise _http(AuthError("proxy token does not match x-user-id / x-user-email", 401, "PROXY_MISMATCH"))
        return ctx

    return dependency
