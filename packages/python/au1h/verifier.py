from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping

import jwt
from jwt import PyJWKClient

Claims = Mapping[str, Any]


class AuthError(Exception):
    """A missing or invalid token. `status` is the HTTP status to answer with."""

    def __init__(self, message: str, status: int = 401, code: str = "INVALID_TOKEN"):
        super().__init__(message)
        self.status = status
        self.code = code


# `typ` claim of the gateway's x-au1h-token; never a user access token.
PROXY_TOKEN_TYPE = "au1h-proxy"


@dataclass(frozen=True)
class User:
    id: str
    email: str
    name: str | None = None
    application_id: str | None = None

    @classmethod
    def from_claims(cls, claims: Claims) -> "User":
        return cls(
            id=claims["sub"],
            email=claims["email"],
            name=claims.get("name"),
            application_id=claims.get("applicationId"),
        )


class Verifier:
    """Verifies au1h JWTs: EdDSA via the au1h JWKS, exp, iss = au1h, aud = your slug."""

    def __init__(self, url: str, app_slug: str) -> None:
        self.url = url.rstrip("/")
        self.app_slug = app_slug
        self._jwks = PyJWKClient(f"{self.url}/api/auth/jwks", cache_keys=True)

    def verify(self, token: str) -> Claims:
        """Verify a user access token (from `GET /api/auth/token`).

        A gateway proof token (`typ == "au1h-proxy"`) is rejected here; use
        `verify_proxy_token` for `x-au1h-token`."""
        return self._verify(token, expect_proxy=False)

    def _verify(self, token: str, *, expect_proxy: bool) -> Claims:
        try:
            key = self._jwks.get_signing_key_from_jwt(token)
            claims = jwt.decode(
                token,
                key.key,
                algorithms=["EdDSA"],
                issuer=self.url,
                audience=self.app_slug,
            )
        except jwt.InvalidAudienceError as exc:
            raise AuthError("token was issued for another application", 403, "WRONG_AUDIENCE") from exc
        except jwt.PyJWTError as exc:
            raise AuthError(f"invalid token: {exc}") from exc
        if "sub" not in claims or "email" not in claims:
            raise AuthError("token is missing sub or email")
        is_proxy = claims.get("typ") == PROXY_TOKEN_TYPE
        if is_proxy != expect_proxy:
            raise AuthError(
                "a gateway proof token is not an access token"
                if is_proxy
                else "x-au1h-token is not a gateway proof token",
                401,
                "WRONG_TOKEN_TYPE",
            )
        return claims

    def verify_authorization(self, header: str | None) -> Claims:
        """Verify an `Authorization: Bearer <jwt>` header value."""
        if not header or not header.startswith("Bearer "):
            raise AuthError("missing bearer token", 401, "MISSING_TOKEN")
        return self.verify(header[len("Bearer ") :].strip())

    def verify_proxy_token(self, header: str | None) -> Claims:
        """Verify the `x-au1h-token` the au1h gateway attaches to proxied requests."""
        if not header:
            raise AuthError("missing x-au1h-token", 401, "MISSING_PROXY_TOKEN")
        return self._verify(header, expect_proxy=True)

    def user(self, token: str) -> User:
        return User.from_claims(self.verify(token))
