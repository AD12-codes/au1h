from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any
from urllib import error, request

from .verifier import AuthError, User


@dataclass(frozen=True)
class Introspection:
    active: bool
    via: str | None = None
    user: User | None = None
    expires_at: int | None = None


class ServerClient:
    """Server-to-server calls authenticated with your application secret."""

    def __init__(self, url: str, app_slug: str, app_secret: str, timeout: float = 10.0) -> None:
        self.url = url.rstrip("/")
        self.app_slug = app_slug
        self.app_secret = app_secret
        self.timeout = timeout

    def _request(self, method: str, path: str, body: Any | None = None) -> Any:
        data = json.dumps(body).encode() if body is not None else None
        req = request.Request(
            f"{self.url}{path}",
            data=data,
            method=method,
            headers={
                "x-app-id": self.app_slug,
                "x-app-secret": self.app_secret,
                "content-type": "application/json",
            },
        )
        try:
            with request.urlopen(req, timeout=self.timeout) as res:  # noqa: S310 - fixed host
                return json.load(res)
        except error.HTTPError as exc:
            try:
                payload = json.load(exc)
            except Exception:  # noqa: BLE001
                payload = {}
            raise AuthError(
                payload.get("message") or payload.get("error") or f"au1h {path}: {exc.code}",
                403 if exc.code == 403 else 401,
                "SERVER_CLIENT",
            ) from exc

    def me(self) -> dict[str, str]:
        """Confirms the credentials; returns {"id", "slug"}."""
        return self._request("GET", "/api/apps/me")["application"]

    def introspect(self, token: str) -> Introspection:
        """Ask au1h whether a JWT or raw session token is active for your app."""
        d = self._request("POST", "/api/apps/introspect", {"token": token})
        user = d.get("user")
        return Introspection(
            active=bool(d.get("active")),
            via=d.get("via"),
            user=User(id=user["id"], email=user["email"], name=user.get("name")) if user else None,
            expires_at=d.get("expiresAt"),
        )
