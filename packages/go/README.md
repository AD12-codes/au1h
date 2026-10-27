# au1h for Go

```bash
go get github.com/AD12-codes/au1h/packages/go
```

```go
import au1h "github.com/AD12-codes/au1h/packages/go"

v, err := au1h.NewVerifier(ctx, au1h.Options{URL: "https://auth.example.com", AppSlug: "my-app"})
mux.Handle("/api/", v.RequireUser(api))

func me(w http.ResponseWriter, r *http.Request) {
    user, _ := au1h.UserFromContext(r.Context())
    json.NewEncoder(w).Encode(user)
}
```

Behind the gateway: `v.RequireProxy(true, handler)` reads `x-user-*` and verifies `x-au1h-token`.
Server-to-server: `au1h.NewServerClient(url, slug, secret).Introspect(ctx, token)`.
