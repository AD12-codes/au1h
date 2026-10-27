// Package au1h verifies tokens issued by an au1h server and reads the trusted
// headers the au1h gateway attaches to proxied requests.
//
//	v, _ := au1h.NewVerifier(ctx, au1h.Options{URL: "https://auth.example.com", AppSlug: "my-app"})
//	mux.Handle("/api/", v.RequireUser(apiHandler))
package au1h

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/lestrrat-go/jwx/v2/jwk"
	"github.com/lestrrat-go/jwx/v2/jwt"
)

// Options configures a Verifier.
type Options struct {
	// URL is the au1h base URL, e.g. https://auth.example.com.
	URL string
	// AppSlug is your application's slug; the JWT audience must equal it.
	AppSlug string
	// JWKSRefresh is the minimum interval between JWKS refreshes (default 15m).
	JWKSRefresh time.Duration
}

// User is the identity carried by an au1h token.
type User struct {
	ID            string `json:"id"`
	Email         string `json:"email"`
	Name          string `json:"name,omitempty"`
	ApplicationID string `json:"applicationId,omitempty"`
}

// AuthError is returned when a token or header is missing or invalid.
type AuthError struct {
	Status int
	Code   string
	Msg    string
}

func (e *AuthError) Error() string { return e.Msg }

var ErrMissingToken = &AuthError{Status: http.StatusUnauthorized, Code: "MISSING_TOKEN", Msg: "missing bearer token"}

// Verifier checks au1h JWTs against the server's JWKS.
type Verifier struct {
	url     string
	appSlug string
	jwksURL string
	cache   *jwk.Cache
}

// NewVerifier creates a Verifier and performs an initial JWKS fetch (errors on
// the initial fetch are not fatal; keys are fetched on first use).
func NewVerifier(ctx context.Context, opts Options) (*Verifier, error) {
	if opts.URL == "" || opts.AppSlug == "" {
		return nil, errors.New("au1h: URL and AppSlug are required")
	}
	refresh := opts.JWKSRefresh
	if refresh == 0 {
		refresh = 15 * time.Minute
	}
	v := &Verifier{
		url:     strings.TrimRight(opts.URL, "/"),
		appSlug: opts.AppSlug,
		cache:   jwk.NewCache(ctx),
	}
	v.jwksURL = v.url + "/api/auth/jwks"
	if err := v.cache.Register(v.jwksURL, jwk.WithMinRefreshInterval(refresh)); err != nil {
		return nil, fmt.Errorf("au1h: register jwks: %w", err)
	}
	_, _ = v.cache.Refresh(ctx, v.jwksURL)
	return v, nil
}

// Verify validates a raw JWT: signature (EdDSA via JWKS), exp, iss and aud.
// ProxyTokenType is the `typ` claim of the gateway's x-au1h-token. Such a
// token proves a request came through au1h; it is never a user access token.
const ProxyTokenType = "au1h-proxy"

// Verify checks a user access token (from GET /api/auth/token): EdDSA signature
// against the JWKS, expiry, issuer and audience. A gateway proof token is rejected.
func (v *Verifier) Verify(ctx context.Context, raw string) (jwt.Token, *User, error) {
	return v.verify(ctx, raw, false)
}

func (v *Verifier) verify(ctx context.Context, raw string, expectProxy bool) (jwt.Token, *User, error) {
	keys, err := v.cache.Get(ctx, v.jwksURL)
	if err != nil {
		if keys, err = v.cache.Refresh(ctx, v.jwksURL); err != nil {
			return nil, nil, &AuthError{Status: http.StatusUnauthorized, Code: "JWKS_UNAVAILABLE", Msg: "cannot fetch au1h keys: " + err.Error()}
		}
	}
	tok, err := jwt.Parse([]byte(raw),
		jwt.WithKeySet(keys),
		jwt.WithIssuer(v.url),
		jwt.WithAudience(v.appSlug),
		jwt.WithValidate(true),
	)
	if err != nil {
		code, status := "INVALID_TOKEN", http.StatusUnauthorized
		if errors.Is(err, jwt.ErrInvalidAudience()) {
			code, status = "WRONG_AUDIENCE", http.StatusForbidden
		}
		return nil, nil, &AuthError{Status: status, Code: code, Msg: "invalid token: " + err.Error()}
	}
	u := &User{
		ID:            tok.Subject(),
		Email:         claim(tok, "email"),
		Name:          claim(tok, "name"),
		ApplicationID: claim(tok, "applicationId"),
	}
	if u.ID == "" || u.Email == "" {
		return nil, nil, &AuthError{Status: http.StatusUnauthorized, Code: "INVALID_TOKEN", Msg: "token is missing sub or email"}
	}
	if isProxy := claim(tok, "typ") == ProxyTokenType; isProxy != expectProxy {
		msg := "a gateway proof token is not an access token"
		if !isProxy {
			msg = "x-au1h-token is not a gateway proof token"
		}
		return nil, nil, &AuthError{Status: http.StatusUnauthorized, Code: "WRONG_TOKEN_TYPE", Msg: msg}
	}
	return tok, u, nil
}

// VerifyAuthorization validates an "Authorization: Bearer <jwt>" header value.
func (v *Verifier) VerifyAuthorization(ctx context.Context, header string) (jwt.Token, *User, error) {
	if !strings.HasPrefix(header, "Bearer ") {
		return nil, nil, ErrMissingToken
	}
	return v.Verify(ctx, strings.TrimSpace(strings.TrimPrefix(header, "Bearer ")))
}

type ctxKey int

const (
	userKey ctxKey = iota
	proxyKey
)

// UserFromContext returns the user set by RequireUser.
func UserFromContext(ctx context.Context) (*User, bool) {
	u, ok := ctx.Value(userKey).(*User)
	return u, ok
}

// RequireUser is net/http middleware that verifies the bearer token and puts
// the User on the request context.
func (v *Verifier) RequireUser(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, u, err := v.VerifyAuthorization(r.Context(), r.Header.Get("Authorization"))
		if err != nil {
			writeAuthError(w, err)
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), userKey, u)))
	})
}

// ProxyContext is the trusted identity the au1h gateway attaches to proxied
// requests. Trust it only when the request can only have come from au1h (a
// private network, or RequireProxy with token verification).
type ProxyContext struct {
	User       User
	AppID      string
	AppSlug    string
	ProxyToken string
}

// ReadProxyContext reads the x-user-* / x-app-* / x-au1h-token headers.
func ReadProxyContext(h http.Header) (*ProxyContext, bool) {
	id, email := h.Get("X-User-Id"), h.Get("X-User-Email")
	appID, slug := h.Get("X-App-Id"), h.Get("X-App-Slug")
	if id == "" || email == "" || appID == "" || slug == "" {
		return nil, false
	}
	return &ProxyContext{User: User{ID: id, Email: email, ApplicationID: appID}, AppID: appID, AppSlug: slug, ProxyToken: h.Get("X-Au1h-Token")}, true
}

// ProxyFromContext returns the ProxyContext set by RequireProxy.
func ProxyFromContext(ctx context.Context) (*ProxyContext, bool) {
	p, ok := ctx.Value(proxyKey).(*ProxyContext)
	return p, ok
}

// RequireProxy is middleware for backends behind the au1h gateway. With
// verify=true it also checks the x-au1h-token signature, proving the request
// passed through au1h.
func (v *Verifier) RequireProxy(verify bool, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p, ok := ReadProxyContext(r.Header)
		if !ok {
			writeAuthError(w, &AuthError{Status: http.StatusUnauthorized, Code: "NOT_PROXIED", Msg: "missing au1h gateway headers"})
			return
		}
		if verify {
			if p.ProxyToken == "" {
				writeAuthError(w, &AuthError{Status: http.StatusUnauthorized, Code: "MISSING_PROXY_TOKEN", Msg: "missing x-au1h-token"})
				return
			}
			tok, u, err := v.verify(r.Context(), p.ProxyToken, true)
			if err != nil {
				writeAuthError(w, err)
				return
			}
			if tok.Subject() != p.User.ID || u.Email != p.User.Email {
				writeAuthError(w, &AuthError{Status: http.StatusUnauthorized, Code: "PROXY_MISMATCH", Msg: "proxy token does not match x-user-id / x-user-email"})
				return
			}
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), proxyKey, p)))
	})
}

func writeAuthError(w http.ResponseWriter, err error) {
	var ae *AuthError
	if !errors.As(err, &ae) {
		ae = &AuthError{Status: http.StatusUnauthorized, Code: "UNAUTHORIZED", Msg: "unauthorized"}
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(ae.Status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": ae.Msg, "code": ae.Code})
}

func claim(tok jwt.Token, key string) string {
	v, ok := tok.Get(key)
	if !ok {
		return ""
	}
	s, _ := v.(string)
	return s
}
