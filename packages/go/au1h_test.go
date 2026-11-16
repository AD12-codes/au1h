package au1h_test

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	au1h "github.com/AD12-codes/au1h/packages/go"
)

// fixture is the live au1h the suite runs against. The tests that need it are
// skipped unless it is present; start it with `bun run test:sdks -- go` in
// apps/server.
type fixture struct {
	url, appID, appSlug, appSecret, otherAppSlug string
	userID, email                                string
	access, otherApp, expired, session, proxy    string
}

func live(t *testing.T) fixture {
	t.Helper()
	env := func(name string) string { return os.Getenv("AU1H_TEST_" + name) }
	if env("URL") == "" {
		t.Skip("no live au1h fixture (AU1H_TEST_URL); run `bun run test:sdks -- go` in apps/server")
	}
	return fixture{
		url: env("URL"), appID: env("APP_ID"), appSlug: env("APP_SLUG"), appSecret: env("APP_SECRET"),
		otherAppSlug: env("OTHER_APP_SLUG"), userID: env("USER_ID"), email: env("USER_EMAIL"),
		access: env("ACCESS_TOKEN"), otherApp: env("OTHER_APP_TOKEN"), expired: env("EXPIRED_TOKEN"),
		session: env("SESSION_TOKEN"), proxy: env("PROXY_TOKEN"),
	}
}

func verifier(t *testing.T, url, slug string) *au1h.Verifier {
	t.Helper()
	v, err := au1h.NewVerifier(context.Background(), au1h.Options{URL: url, AppSlug: slug})
	if err != nil {
		t.Fatalf("NewVerifier: %v", err)
	}
	return v
}

// wantAuthError asserts err is an *AuthError with the given status and code.
func wantAuthError(t *testing.T, err error, status int, code string) {
	t.Helper()
	var ae *au1h.AuthError
	if !errors.As(err, &ae) {
		t.Fatalf("want *AuthError %d %s, got %v", status, code, err)
	}
	if ae.Status != status || ae.Code != code {
		t.Fatalf("want %d %s, got %d %s (%s)", status, code, ae.Status, ae.Code, ae.Msg)
	}
}

// tamper swaps the subject without re-signing.
func tamper(t *testing.T, token string) string {
	t.Helper()
	parts := strings.Split(token, ".")
	raw, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		t.Fatal(err)
	}
	var claims map[string]any
	if err := json.Unmarshal(raw, &claims); err != nil {
		t.Fatal(err)
	}
	claims["sub"] = "someone-else"
	forged, _ := json.Marshal(claims)
	return parts[0] + "." + base64.RawURLEncoding.EncodeToString(forged) + "." + parts[2]
}

func TestNewVerifierRequiresOptions(t *testing.T) {
	for _, opts := range []au1h.Options{{}, {URL: "https://auth.example.com"}, {AppSlug: "todo"}} {
		if _, err := au1h.NewVerifier(context.Background(), opts); err == nil {
			t.Fatalf("NewVerifier(%+v) should fail", opts)
		}
	}
}

func TestReadProxyContext(t *testing.T) {
	h := http.Header{}
	h.Set("X-User-Id", "u1")
	h.Set("X-User-Email", "u@example.com")
	h.Set("X-App-Id", "app-id")
	h.Set("X-App-Slug", "todo")
	h.Set("X-Au1h-Token", "proof")

	p, ok := au1h.ReadProxyContext(h)
	if !ok {
		t.Fatal("want a proxy context")
	}
	if p.User.ID != "u1" || p.User.Email != "u@example.com" || p.AppID != "app-id" || p.AppSlug != "todo" || p.ProxyToken != "proof" {
		t.Fatalf("unexpected context: %+v", p)
	}

	for _, missing := range []string{"X-User-Id", "X-User-Email", "X-App-Id", "X-App-Slug"} {
		partial := h.Clone()
		partial.Del(missing)
		if _, ok := au1h.ReadProxyContext(partial); ok {
			t.Fatalf("context without %s should be rejected", missing)
		}
	}
}

func TestVerify(t *testing.T) {
	fx := live(t)
	ctx := context.Background()
	// A trailing slash must not break issuer or JWKS resolution.
	v := verifier(t, fx.url+"/", fx.appSlug)

	t.Run("accepts an access token for this application", func(t *testing.T) {
		tok, u, err := v.Verify(ctx, fx.access)
		if err != nil {
			t.Fatal(err)
		}
		if u.ID != fx.userID || u.Email != fx.email || u.ApplicationID != fx.appID {
			t.Fatalf("unexpected user: %+v", u)
		}
		if aud := tok.Audience(); len(aud) != 1 || aud[0] != fx.appSlug {
			t.Fatalf("unexpected audience: %v", aud)
		}
	})

	t.Run("another application's token is 403 WRONG_AUDIENCE", func(t *testing.T) {
		_, _, err := v.Verify(ctx, fx.otherApp)
		wantAuthError(t, err, http.StatusForbidden, "WRONG_AUDIENCE")
	})

	t.Run("expired, tampered and garbage tokens are 401", func(t *testing.T) {
		for name, token := range map[string]string{"expired": fx.expired, "tampered": tamper(t, fx.access), "garbage": "not-a-jwt"} {
			_, _, err := v.Verify(ctx, token)
			var ae *au1h.AuthError
			if !errors.As(err, &ae) || ae.Status != http.StatusUnauthorized {
				t.Fatalf("%s: want 401, got %v", name, err)
			}
		}
	})

	t.Run("a gateway proof token is not an access token", func(t *testing.T) {
		_, _, err := v.Verify(ctx, fx.proxy)
		wantAuthError(t, err, http.StatusUnauthorized, "WRONG_TOKEN_TYPE")
	})

	t.Run("VerifyAuthorization needs a Bearer header", func(t *testing.T) {
		for _, header := range []string{"", fx.access, "Basic abc"} {
			_, _, err := v.VerifyAuthorization(ctx, header)
			wantAuthError(t, err, http.StatusUnauthorized, "MISSING_TOKEN")
		}
		if _, u, err := v.VerifyAuthorization(ctx, "Bearer "+fx.access); err != nil || u.ID != fx.userID {
			t.Fatalf("want the user, got %v %v", u, err)
		}
	})

	t.Run("a verifier for another application rejects this application's tokens", func(t *testing.T) {
		_, _, err := verifier(t, fx.url, fx.otherAppSlug).Verify(ctx, fx.access)
		wantAuthError(t, err, http.StatusForbidden, "WRONG_AUDIENCE")
	})
}

// call runs one request through a handler and returns status and JSON body.
func call(h http.Handler, headers map[string]string) (int, map[string]string) {
	req := httptest.NewRequest(http.MethodGet, "/me", nil)
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	body := map[string]string{}
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	return rec.Code, body
}

func TestRequireUser(t *testing.T) {
	fx := live(t)
	h := verifier(t, fx.url, fx.appSlug).RequireUser(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u, _ := au1h.UserFromContext(r.Context())
		_ = json.NewEncoder(w).Encode(map[string]string{"id": u.ID})
	}))

	if status, body := call(h, map[string]string{"Authorization": "Bearer " + fx.access}); status != 200 || body["id"] != fx.userID {
		t.Fatalf("valid token: got %d %v", status, body)
	}
	if status, body := call(h, nil); status != 401 || body["code"] != "MISSING_TOKEN" {
		t.Fatalf("no token: got %d %v", status, body)
	}
	if status, body := call(h, map[string]string{"Authorization": "Bearer " + fx.otherApp}); status != 403 || body["code"] != "WRONG_AUDIENCE" {
		t.Fatalf("other app's token: got %d %v", status, body)
	}
}

func TestRequireProxy(t *testing.T) {
	fx := live(t)
	v := verifier(t, fx.url, fx.appSlug)
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p, _ := au1h.ProxyFromContext(r.Context())
		_ = json.NewEncoder(w).Encode(map[string]string{"id": p.User.ID})
	})
	headers := func(overrides map[string]string) map[string]string {
		h := map[string]string{
			"X-User-Id": fx.userID, "X-User-Email": fx.email,
			"X-App-Id": fx.appID, "X-App-Slug": fx.appSlug, "X-Au1h-Token": fx.proxy,
		}
		for k, val := range overrides {
			if val == "" {
				delete(h, k)
			} else {
				h[k] = val
			}
		}
		return h
	}

	verified := v.RequireProxy(true, next)
	if status, body := call(verified, headers(nil)); status != 200 || body["id"] != fx.userID {
		t.Fatalf("verified gateway request: got %d %v", status, body)
	}
	cases := []struct {
		name      string
		overrides map[string]string
		code      string
	}{
		{"called directly", map[string]string{"X-User-Id": ""}, "NOT_PROXIED"},
		{"forged identity", map[string]string{"X-User-Id": "victim"}, "PROXY_MISMATCH"},
		{"forged email", map[string]string{"X-User-Email": "victim@example.com"}, "PROXY_MISMATCH"},
		{"no proof token", map[string]string{"X-Au1h-Token": ""}, "MISSING_PROXY_TOKEN"},
		{"access token as proof", map[string]string{"X-Au1h-Token": fx.access}, "WRONG_TOKEN_TYPE"},
	}
	for _, c := range cases {
		if status, body := call(verified, headers(c.overrides)); status != 401 || body["code"] != c.code {
			t.Fatalf("%s: want 401 %s, got %d %v", c.name, c.code, status, body)
		}
	}

	// Without verification the headers are taken at face value (private network).
	if status, _ := call(v.RequireProxy(false, next), headers(map[string]string{"X-Au1h-Token": ""})); status != 200 {
		t.Fatalf("unverified mode: got %d", status)
	}
}

func TestServerClient(t *testing.T) {
	fx := live(t)
	ctx := context.Background()
	c := au1h.NewServerClient(fx.url+"/", fx.appSlug, fx.appSecret)

	id, slug, err := c.Me(ctx)
	if err != nil || id != fx.appID || slug != fx.appSlug {
		t.Fatalf("Me: got %q %q %v", id, slug, err)
	}

	if _, _, err := au1h.NewServerClient(fx.url, fx.appSlug, "au1h_sk_wrong").Me(ctx); err == nil {
		t.Fatal("a wrong secret should be rejected")
	} else {
		var ae *au1h.AuthError
		if !errors.As(err, &ae) || ae.Code != "SERVER_CLIENT" {
			t.Fatalf("want SERVER_CLIENT, got %v", err)
		}
	}

	jwt, err := c.Introspect(ctx, fx.access)
	if err != nil || !jwt.Active || jwt.Via != "jwt" || jwt.User == nil || jwt.User.ID != fx.userID || jwt.User.Email != fx.email {
		t.Fatalf("introspect JWT: %+v %v", jwt, err)
	}
	session, err := c.Introspect(ctx, fx.session)
	if err != nil || !session.Active || session.Via != "session" || session.User == nil || session.User.ID != fx.userID {
		t.Fatalf("introspect session: %+v %v", session, err)
	}
	for name, token := range map[string]string{"other app": fx.otherApp, "expired": fx.expired, "proof token": fx.proxy, "garbage": "garbage"} {
		got, err := c.Introspect(ctx, token)
		if err != nil || got.Active {
			t.Fatalf("introspect %s: want inactive, got %+v %v", name, got, err)
		}
	}
}
