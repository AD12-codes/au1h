from __future__ import annotations

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from au1h import AuthError, ProxyContext, ServerClient, User, Verifier
from au1h.fastapi import require_proxy, require_user

from .conftest import Live, tamper


@pytest.fixture(scope="module")
def verifier(live: Live) -> Verifier:
    # A trailing slash must not break issuer or JWKS resolution.
    return Verifier(f"{live.url}/", live.app_slug)


def rejected(call, *args) -> AuthError:
    with pytest.raises(AuthError) as info:
        call(*args)
    return info.value


# --- Verifier -----------------------------------------------------------------


def test_accepts_an_access_token_for_this_application(live: Live, verifier: Verifier):
    claims = verifier.verify(live.access)
    assert claims["sub"] == live.user_id
    assert claims["email"] == live.email
    assert claims["applicationId"] == live.app_id
    assert claims["aud"] == live.app_slug
    user = verifier.user(live.access)
    assert (user.id, user.email, user.application_id) == (live.user_id, live.email, live.app_id)


def test_another_applications_token_is_403_wrong_audience(live: Live, verifier: Verifier):
    err = rejected(verifier.verify, live.other_app)
    assert (err.status, err.code) == (403, "WRONG_AUDIENCE")


def test_expired_tampered_and_garbage_tokens_are_401(live: Live, verifier: Verifier):
    for token in (live.expired, tamper(live.access), "not-a-jwt"):
        assert rejected(verifier.verify, token).status == 401


def test_a_gateway_proof_token_is_not_an_access_token(live: Live, verifier: Verifier):
    err = rejected(verifier.verify, live.proxy)
    assert (err.status, err.code) == (401, "WRONG_TOKEN_TYPE")


def test_verify_authorization_needs_a_bearer_header(live: Live, verifier: Verifier):
    for header in (None, "", live.access, "Basic abc"):
        assert rejected(verifier.verify_authorization, header).code == "MISSING_TOKEN"
    assert verifier.verify_authorization(f"Bearer {live.access}")["sub"] == live.user_id


def test_verify_proxy_token(live: Live, verifier: Verifier):
    claims = verifier.verify_proxy_token(live.proxy)
    assert (claims["typ"], claims["sub"]) == ("au1h-proxy", live.user_id)
    assert rejected(verifier.verify_proxy_token, None).code == "MISSING_PROXY_TOKEN"
    err = rejected(verifier.verify_proxy_token, live.access)
    assert (err.status, err.code) == (401, "WRONG_TOKEN_TYPE")


def test_a_verifier_for_another_application_rejects_this_applications_tokens(live: Live):
    err = rejected(Verifier(live.url, live.other_app_slug).verify, live.access)
    assert err.code == "WRONG_AUDIENCE"


# --- FastAPI ------------------------------------------------------------------


@pytest.fixture(scope="module")
def client(verifier: Verifier) -> TestClient:
    app = FastAPI()

    @app.get("/api/me")
    def me(user: User = Depends(require_user(verifier))):
        return {"id": user.id, "email": user.email}

    @app.get("/gateway/me")
    def gateway_me(ctx: ProxyContext = Depends(require_proxy(verifier))):
        return {"id": ctx.user.id}

    @app.get("/private/me")
    def private_me(ctx: ProxyContext = Depends(require_proxy())):
        return {"id": ctx.user.id}

    return TestClient(app)


def test_require_user(live: Live, client: TestClient):
    ok = client.get("/api/me", headers={"authorization": f"Bearer {live.access}"})
    assert (ok.status_code, ok.json()) == (200, {"id": live.user_id, "email": live.email})

    anonymous = client.get("/api/me")
    assert (anonymous.status_code, anonymous.json()["detail"]["code"]) == (401, "MISSING_TOKEN")

    other_app = client.get("/api/me", headers={"authorization": f"Bearer {live.other_app}"})
    assert (other_app.status_code, other_app.json()["detail"]["code"]) == (403, "WRONG_AUDIENCE")


def test_require_proxy(live: Live, client: TestClient):
    headers = {
        "x-user-id": live.user_id,
        "x-user-email": live.email,
        "x-app-id": live.app_id,
        "x-app-slug": live.app_slug,
        "x-au1h-token": live.proxy,
    }
    ok = client.get("/gateway/me", headers=headers)
    assert (ok.status_code, ok.json()) == (200, {"id": live.user_id})

    def code(overrides: dict[str, str | None]) -> tuple[int, str]:
        sent = {k: v for k, v in {**headers, **overrides}.items() if v is not None}
        res = client.get("/gateway/me", headers=sent)
        return res.status_code, res.json()["detail"]["code"]

    assert code({"x-user-id": None}) == (401, "NOT_PROXIED")
    assert code({"x-user-id": "victim"}) == (401, "PROXY_MISMATCH")
    assert code({"x-user-email": "victim@example.com"}) == (401, "PROXY_MISMATCH")
    assert code({"x-au1h-token": None}) == (401, "MISSING_PROXY_TOKEN")
    assert code({"x-au1h-token": live.access}) == (401, "WRONG_TOKEN_TYPE")

    # Without a verifier the headers are taken at face value (private network).
    unverified = {k: v for k, v in headers.items() if k != "x-au1h-token"}
    assert client.get("/private/me", headers=unverified).status_code == 200


# --- ServerClient -------------------------------------------------------------


def test_server_client_me(live: Live):
    assert ServerClient(f"{live.url}/", live.app_slug, live.app_secret).me() == {
        "id": live.app_id,
        "slug": live.app_slug,
    }
    err = rejected(ServerClient(live.url, live.app_slug, "au1h_sk_wrong").me)
    assert err.code == "SERVER_CLIENT"


def test_server_client_introspect(live: Live):
    client = ServerClient(live.url, live.app_slug, live.app_secret)

    jwt = client.introspect(live.access)
    assert (jwt.active, jwt.via) == (True, "jwt")
    assert jwt.user is not None and (jwt.user.id, jwt.user.email) == (live.user_id, live.email)

    session = client.introspect(live.session)
    assert (session.active, session.via) == (True, "session")
    assert session.user is not None and session.user.id == live.user_id

    for token in (live.other_app, live.expired, live.proxy, "garbage"):
        assert client.introspect(token).active is False
