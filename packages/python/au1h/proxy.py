from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping

from .verifier import User


@dataclass(frozen=True)
class ProxyContext:
    """Trusted identity attached by the au1h gateway. Only trust it when the
    request can only have come from au1h (private network, or verify
    `proxy_token` with `Verifier.verify_proxy_token`)."""

    user: User
    app_id: str
    app_slug: str
    proxy_token: str | None


def read_proxy_context(headers: Mapping[str, str]) -> ProxyContext | None:
    get = lambda k: headers.get(k) or headers.get(k.lower()) or headers.get(k.title())  # noqa: E731
    uid, email, app_id, slug = get("x-user-id"), get("x-user-email"), get("x-app-id"), get("x-app-slug")
    if not (uid and email and app_id and slug):
        return None
    return ProxyContext(
        user=User(id=uid, email=email, application_id=app_id),
        app_id=app_id,
        app_slug=slug,
        proxy_token=get("x-au1h-token"),
    )
