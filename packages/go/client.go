package au1h

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
)

// ServerClient calls au1h's server-to-server API with your application secret.
type ServerClient struct {
	url, appSlug, appSecret string
	HTTP                    *http.Client
}

// NewServerClient creates a client. Keep appSecret server-side.
func NewServerClient(url, appSlug, appSecret string) *ServerClient {
	return &ServerClient{url: strings.TrimRight(url, "/"), appSlug: appSlug, appSecret: appSecret, HTTP: http.DefaultClient}
}

// Introspection is the result of Introspect.
type Introspection struct {
	Active    bool   `json:"active"`
	Via       string `json:"via,omitempty"`
	User      *User  `json:"user,omitempty"`
	ExpiresAt *int64 `json:"expiresAt,omitempty"`
}

func (c *ServerClient) do(ctx context.Context, method, path string, body any, out any) error {
	var buf bytes.Buffer
	if body != nil {
		if err := json.NewEncoder(&buf).Encode(body); err != nil {
			return err
		}
	}
	req, err := http.NewRequestWithContext(ctx, method, c.url+path, &buf)
	if err != nil {
		return err
	}
	req.Header.Set("X-App-Id", c.appSlug)
	req.Header.Set("X-App-Secret", c.appSecret)
	req.Header.Set("Content-Type", "application/json")
	res, err := c.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode >= 400 {
		var e struct{ Message, Error string }
		_ = json.NewDecoder(res.Body).Decode(&e)
		msg := e.Message
		if msg == "" {
			msg = e.Error
		}
		return &AuthError{Status: res.StatusCode, Code: "SERVER_CLIENT", Msg: fmt.Sprintf("au1h %s: %s", path, msg)}
	}
	return json.NewDecoder(res.Body).Decode(out)
}

// Me confirms the credentials and returns the application id and slug.
func (c *ServerClient) Me(ctx context.Context) (id, slug string, err error) {
	var out struct {
		Application struct{ ID, Slug string } `json:"application"`
	}
	if err = c.do(ctx, http.MethodGet, "/api/apps/me", nil, &out); err != nil {
		return "", "", err
	}
	return out.Application.ID, out.Application.Slug, nil
}

// Introspect asks au1h whether a JWT or session token is active for your app.
func (c *ServerClient) Introspect(ctx context.Context, token string) (*Introspection, error) {
	var out Introspection
	if err := c.do(ctx, http.MethodPost, "/api/apps/introspect", map[string]string{"token": token}, &out); err != nil {
		return nil, err
	}
	return &out, nil
}
