// au1h example backend in Go.
//
// It serves the demo page and a single protected endpoint, GET /api/me, which
// verifies the JWT minted by au1h (EdDSA / Ed25519) against au1h's JWKS and
// echoes the verified user claims back.
package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/lestrrat-go/jwx/v2/jwk"
	"github.com/lestrrat-go/jwx/v2/jwt"
)

var (
	au1hURL = strings.TrimRight(envOr("AU1H_URL", "http://localhost:4444"), "/")
	appSlug = envOr("AU1H_APP_SLUG", "example-go")
	appID   = os.Getenv("AU1H_APP_ID") // optional: pin tokens to this application
	port    = envOr("PORT", "8081")

	jwksURL   = au1hURL + "/api/auth/jwks"
	jwksCache *jwk.Cache
)

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// verifyAu1hToken validates signature, exp/nbf, issuer and audience.
func verifyAu1hToken(ctx context.Context, raw string) (jwt.Token, error) {
	keySet, err := jwksCache.Get(ctx, jwksURL)
	if err != nil {
		// The cache is empty when au1h was unreachable at startup; force a fetch.
		keySet, err = jwksCache.Refresh(ctx, jwksURL)
		if err != nil {
			return nil, err
		}
	}
	return jwt.Parse(
		[]byte(raw),
		jwt.WithKeySet(keySet),
		jwt.WithIssuer(au1hURL),
		jwt.WithAudience(au1hURL),
		jwt.WithValidate(true),
	)
}

func stringClaim(tok jwt.Token, key string) string {
	v, ok := tok.Get(key)
	if !ok {
		return ""
	}
	s, _ := v.(string)
	return s
}

func handleMe(w http.ResponseWriter, r *http.Request) {
	auth := r.Header.Get("Authorization")
	if !strings.HasPrefix(auth, "Bearer ") {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "missing bearer token"})
		return
	}

	tok, err := verifyAu1hToken(r.Context(), strings.TrimPrefix(auth, "Bearer "))
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid token: " + err.Error()})
		return
	}

	applicationID := stringClaim(tok, "applicationId")
	// Tenant check: a token from another au1h application must not be accepted here.
	if appID != "" && applicationID != appID {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "token was issued for a different application"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"language": "go",
		"library":  "github.com/lestrrat-go/jwx/v2",
		"user": map[string]any{
			"id":            tok.Subject(),
			"email":         stringClaim(tok, "email"),
			"name":          stringClaim(tok, "name"),
			"applicationId": applicationID,
		},
		"token": map[string]any{
			"issuer":    tok.Issuer(),
			"audience":  tok.Audience(),
			"issuedAt":  tok.IssuedAt().Unix(),
			"expiresAt": tok.Expiration().Unix(),
		},
	})
}

func main() {
	ctx := context.Background()
	jwksCache = jwk.NewCache(ctx)
	if err := jwksCache.Register(jwksURL, jwk.WithMinRefreshInterval(15*time.Minute)); err != nil {
		log.Fatalf("register jwks: %v", err)
	}
	if _, err := jwksCache.Refresh(ctx, jwksURL); err != nil {
		log.Printf("warning: initial JWKS fetch failed (%v); will retry on first request", err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /{$}", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "index.html")
	})
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("GET /api/config", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{
			"language": "go",
			"au1hUrl":  au1hURL,
			"appSlug":  appSlug,
		})
	})
	mux.HandleFunc("GET /api/me", handleMe)

	if _, err := strconv.Atoi(port); err != nil {
		log.Fatalf("invalid PORT %q", port)
	}
	log.Printf("au1h Go example listening on http://localhost:%s (app slug: %s)", port, appSlug)
	log.Fatal(http.ListenAndServe(":"+port, mux))
}
