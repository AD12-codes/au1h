"""Fixture for the tests that run against a live au1h.

They are skipped unless the fixture is present; start it with
`bun run test:sdks -- py` in apps/server.
"""

from __future__ import annotations

import base64
import json
import os
from dataclasses import dataclass

import pytest


@dataclass(frozen=True)
class Live:
    url: str
    app_id: str
    app_slug: str
    app_secret: str
    other_app_slug: str
    user_id: str
    email: str
    access: str
    other_app: str
    expired: str
    session: str
    proxy: str


@pytest.fixture(scope="session")
def live() -> Live:
    def env(name: str) -> str:
        return os.environ.get(f"AU1H_TEST_{name}", "")

    if not env("URL"):
        pytest.skip("no live au1h fixture (AU1H_TEST_URL); run `bun run test:sdks -- py` in apps/server")
    return Live(
        url=env("URL"),
        app_id=env("APP_ID"),
        app_slug=env("APP_SLUG"),
        app_secret=env("APP_SECRET"),
        other_app_slug=env("OTHER_APP_SLUG"),
        user_id=env("USER_ID"),
        email=env("USER_EMAIL"),
        access=env("ACCESS_TOKEN"),
        other_app=env("OTHER_APP_TOKEN"),
        expired=env("EXPIRED_TOKEN"),
        session=env("SESSION_TOKEN"),
        proxy=env("PROXY_TOKEN"),
    )


def tamper(token: str) -> str:
    """Swap the subject without re-signing."""
    header, payload, signature = token.split(".")
    claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
    claims["sub"] = "someone-else"
    forged = base64.urlsafe_b64encode(json.dumps(claims).encode()).rstrip(b"=").decode()
    return f"{header}.{forged}.{signature}"
