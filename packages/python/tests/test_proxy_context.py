from au1h import read_proxy_context

FULL = {
    "x-user-id": "u1",
    "x-user-email": "u@example.com",
    "x-app-id": "app-id",
    "x-app-slug": "todo",
    "x-au1h-token": "proof",
}


def test_reads_the_gateway_headers():
    ctx = read_proxy_context(FULL)
    assert ctx is not None
    assert (ctx.user.id, ctx.user.email) == ("u1", "u@example.com")
    assert (ctx.app_id, ctx.app_slug, ctx.proxy_token) == ("app-id", "todo", "proof")


def test_header_names_are_matched_in_title_case_too():
    ctx = read_proxy_context({k.title(): v for k, v in FULL.items()})
    assert ctx is not None and ctx.user.id == "u1"


def test_returns_none_when_an_identity_header_is_missing():
    for missing in ("x-user-id", "x-user-email", "x-app-id", "x-app-slug"):
        assert read_proxy_context({k: v for k, v in FULL.items() if k != missing}) is None


def test_the_proof_token_is_optional():
    ctx = read_proxy_context({k: v for k, v in FULL.items() if k != "x-au1h-token"})
    assert ctx is not None and ctx.proxy_token is None
