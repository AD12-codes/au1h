// au1h example backend in Go, using the au1h Go SDK.
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
	"strings"

	au1h "github.com/AD12-codes/au1h/packages/go"
)

var (
	au1hURL = strings.TrimRight(envOr("AU1H_URL", "http://localhost:4444"), "/")
	appSlug = envOr("AU1H_APP_SLUG", "example-go")
	port    = envOr("PORT", "8081")
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

func main() {
	verifier, err := au1h.NewVerifier(context.Background(), au1h.Options{URL: au1hURL, AppSlug: appSlug})
	if err != nil {
		log.Fatal(err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /{$}", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "index.html")
	})
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("GET /api/config", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"language": "go", "au1hUrl": au1hURL, "appSlug": appSlug})
	})

	// RequireUser verifies the bearer token (signature via JWKS, exp, iss, aud)
	// and puts the user on the request context.
	mux.Handle("GET /api/me", verifier.RequireUser(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user, _ := au1h.UserFromContext(r.Context())
		tok, _, _ := verifier.VerifyAuthorization(r.Context(), r.Header.Get("Authorization"))
		writeJSON(w, http.StatusOK, map[string]any{
			"language": "go",
			"library":  "github.com/AD12-codes/au1h/packages/go",
			"user":     user,
			"token": map[string]any{
				"issuer":    tok.Issuer(),
				"audience":  tok.Audience(),
				"issuedAt":  tok.IssuedAt().Unix(),
				"expiresAt": tok.Expiration().Unix(),
			},
		})
	})))

	log.Printf("au1h Go example listening on http://localhost:%s (app slug: %s)", port, appSlug)
	log.Fatal(http.ListenAndServe(":"+port, mux))
}
