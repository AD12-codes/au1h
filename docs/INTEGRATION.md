# au1h Integration Guide

au1h is a centralized multi-application authentication system. This guide covers how to integrate au1h into your applications.

## Table of Contents

- [Overview](#overview)
- [Authentication Patterns](#authentication-patterns)
- [Getting Started](#getting-started)
- [Frontend Integration (Next.js)](#frontend-integration-nextjs)
- [Backend Integration](#backend-integration)
  - [Node.js / Express](#nodejs--express)
  - [Go](#go)
  - [Python / FastAPI](#python--fastapi)
- [API Reference](#api-reference)

---

## Overview

au1h provides two authentication patterns:

1. **Client-to-Server (Direct JWT)** - Your app gets JWT tokens and validates them directly
2. **Server-to-Server (Proxy)** - Requests go through au1h gateway which injects trusted headers

### When to Use Each Pattern

| Pattern    | Best For                                                |
| ---------- | ------------------------------------------------------- |
| Direct JWT | External apps, mobile apps, different hosting platforms |
| Proxy      | Internal apps, same-domain SPAs, microservices          |

---

## Authentication Patterns

### Pattern 1: Direct JWT

```
┌─────────┐     ┌─────────┐     ┌─────────────┐
│ Your UI │────▶│ au1h    │────▶│ Your Backend│
└─────────┘     │ Auth    │     │ (validates  │
                └─────────┘     │  via JWKS)  │
                                └─────────────┘
```

1. User logs in via au1h (every request carries `x-app-id: <your slug>`)
2. Your frontend calls `GET /api/auth/token` and receives a JWT
3. Frontend sends the JWT to your backend as `Authorization: Bearer <jwt>`
4. Backend validates the JWT against au1h's JWKS endpoint

#### The JWT

| Property        | Value                                                          |
| --------------- | -------------------------------------------------------------- |
| Algorithm       | `EdDSA` (Ed25519). Not RS256.                                  |
| JWKS            | `GET {AU1H_URL}/api/auth/jwks` — public, no `x-app-id` needed  |
| `iss`           | au1h's base URL (`BETTER_AUTH_URL`)                            |
| `aud`           | **Your application slug** (the same value as `x-app-id`)       |
| Lifetime        | 15 minutes; call `/api/auth/token` again to get a fresh one    |
| Claims          | `sub` (user id), `email`, `name`, `applicationId`              |

**Always verify the signature, `iss`, and `aud` = your slug.** All applications share one
JWKS, so the `aud` check is what stops a token minted for another application from being
accepted at your backend. The tenant id is also available as the `applicationId` claim
(there is no `app_id` claim).

Working, runnable backends for Go, Rust, Python and TypeScript live in
[`examples/`](../examples/README.md).

### Pattern 2: Proxy via au1h Gateway

```
┌─────────┐     ┌─────────────┐     ┌─────────────┐
│ Your UI │────▶│ au1h Gateway│────▶│ Your Backend│
└─────────┘     │ (validates  │     │ (trusts     │
                │  + proxies) │     │  headers)   │
                └─────────────┘     └─────────────┘
```

1. User logs in via au1h
2. Frontend makes API calls to au1h proxy endpoint (`/proxy/...`, with `x-app-id`)
3. au1h **requires** a credential and checks it belongs to your application: the session
   cookie, or `Authorization: Bearer <au1h JWT>`. No credential → 401; a credential from
   another application → 403. Only then is the request forwarded.
4. Your backend receives trusted headers (`x-user-id`, `x-user-email`, `x-app-id`,
   `x-app-slug`); they are always present on proxied requests. It also receives
   `x-au1h-token`, a 60-second JWT signed by au1h with `aud` = your slug: verify it
   against the JWKS if you want cryptographic proof the request came through au1h.

---

## Getting Started

### 1. Register Your Application

1. Log into the au1h Admin Portal
2. Go to **Applications** → **Create Application**
3. Fill in:

   - **Name**: Your app name (e.g., "Todo App")
   - **Slug**: URL-friendly identifier (e.g., "todo-app")
   - **Allowed Origins**: Your frontend URLs (e.g., `http://localhost:3000`)
   - **Redirect URIs**: OAuth callback URLs

4. Save and copy your:
   - **Application ID** (UUID)
   - **Application Secret** (keep this secure!)

### 2. Configure Proxy Routes (Optional)

If using the proxy pattern:

1. Go to your application's detail page
2. Scroll to **Proxy Routes**
3. Add routes:
   - **Path Pattern**: e.g., `/todos/*`
   - **Backend URL**: e.g., `http://your-backend:8080`
   - **Methods**: Select allowed HTTP methods

---

## Frontend Integration (Next.js)

### Installation

```bash
npm install better-auth
# or
pnpm add better-auth
# or
bun add better-auth
```

### Configuration

Create `lib/auth-client.ts`:

```typescript
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_AUTH_URL, // e.g., "https://auth.yoursite.com"
  fetchOptions: {
    credentials: "include",
    // Every request to au1h must identify your application.
    headers: { "x-app-id": process.env.NEXT_PUBLIC_APP_SLUG! },
  },
});

// Export hooks for convenience
export const { useSession, signIn, signOut } = authClient;
```

### Environment Variables

```env
NEXT_PUBLIC_AUTH_URL=http://localhost:4444
NEXT_PUBLIC_APP_SLUG=your-app-slug
```

### Login Page

```tsx
// app/login/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const result = await authClient.signIn.email({
        email,
        password,
      });

      if (result.error) {
        setError(result.error.message);
      } else {
        router.push("/dashboard");
      }
    } catch (err) {
      setError("An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleLogin}>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        required
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        required
      />
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={loading}>
        {loading ? "Signing in..." : "Sign In"}
      </button>
    </form>
  );
}
```

### Protected Routes (Middleware)

```typescript
// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const session = request.cookies.get("better-auth.session_token");

  if (!session && request.nextUrl.pathname.startsWith("/dashboard")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
```

### Getting User Session

```tsx
// components/user-profile.tsx
"use client";

import { useSession } from "@/lib/auth-client";

export function UserProfile() {
  const { data: session, isPending } = useSession();

  if (isPending) return <div>Loading...</div>;
  if (!session) return <div>Not logged in</div>;

  return (
    <div>
      <p>Welcome, {session.user.name}!</p>
      <p>Email: {session.user.email}</p>
    </div>
  );
}
```

### Making API Calls (Proxy Pattern)

```typescript
// lib/api.ts
const API_BASE = process.env.NEXT_PUBLIC_AUTH_URL;
const APP_SLUG = process.env.NEXT_PUBLIC_APP_SLUG;

export async function fetchTodos() {
  const response = await fetch(`${API_BASE}/proxy/todos`, {
    headers: {
      "x-app-id": APP_SLUG,
    },
    credentials: "include", // Important: sends session cookies
  });

  if (!response.ok) {
    throw new Error("Failed to fetch todos");
  }

  return response.json();
}

export async function createTodo(title: string) {
  const response = await fetch(`${API_BASE}/proxy/todos`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-app-id": APP_SLUG,
    },
    credentials: "include",
    body: JSON.stringify({ title }),
  });

  if (!response.ok) {
    throw new Error("Failed to create todo");
  }

  return response.json();
}
```

### Making API Calls (Direct JWT Pattern)

```typescript
// lib/api.ts
import { authClient } from "@/lib/auth-client";

const API_BASE = "https://your-backend.com";

const AU1H_URL = process.env.NEXT_PUBLIC_AUTH_URL;
const APP_SLUG = process.env.NEXT_PUBLIC_APP_SLUG;

// The session token in the cookie is NOT a JWT. Ask au1h to mint one.
// It is valid for 15 minutes; cache it and refresh on 401.
export async function getJwt(): Promise<string> {
  const response = await fetch(`${AU1H_URL}/api/auth/token`, {
    headers: { "x-app-id": APP_SLUG },
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("Not signed in");
  }
  const { token } = await response.json();
  return token;
}

export async function fetchTodos() {
  const token = await getJwt();

  const response = await fetch(`${API_BASE}/api/todos`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch todos");
  }

  return response.json();
}
```

---

## Backend Integration

### Context Headers (Proxy Pattern)

When using the proxy pattern, au1h injects these trusted headers:

| Header         | Description               |
| -------------- | ------------------------- |
| `x-user-id`    | Authenticated user's UUID |
| `x-user-email` | User's email address      |
| `x-app-id`     | Application UUID          |
| `x-app-slug`   | Application slug          |

**Important**: These headers are stripped from client requests and only injected by au1h,
and au1h only forwards authenticated requests whose session or JWT belongs to the route's
application. Your backend can trust them if it is only reachable from au1h (network
policy / private network), **or** if it verifies the `x-au1h-token` header (an au1h-signed
JWT, `aud` = your slug, valid 60 seconds) with the same JWKS code as the Direct JWT
pattern.

---

### Node.js / Express

#### Installation

```bash
npm install express jose
```

#### Middleware (Direct JWT)

```javascript
// middleware/auth.js
import * as jose from "jose";

const AU1H_URL = process.env.AU1H_URL || "http://localhost:4444";
const APP_SLUG = process.env.AU1H_APP_SLUG; // the same value you send as x-app-id

// createRemoteJWKSet caches the keys and refetches on unknown `kid`s.
const JWKS = jose.createRemoteJWKSet(new URL(`${AU1H_URL}/api/auth/jwks`));

export async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing token" });
  }

  const token = authHeader.slice(7);

  try {
    // `audience` is your slug: tokens minted for other applications fail here.
    const { payload } = await jose.jwtVerify(token, JWKS, {
      algorithms: ["EdDSA"],
      issuer: AU1H_URL,
      audience: APP_SLUG,
    });

    req.user = {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      appId: payload.applicationId,
    };

    next();
  } catch (error) {
    console.error("JWT verification failed:", error);
    return res.status(401).json({ error: "Invalid token" });
  }
}
```

#### Middleware (Proxy Pattern - Trusted Headers)

```javascript
// middleware/auth.js
export function authMiddleware(req, res, next) {
  const userId = req.headers["x-user-id"];
  const userEmail = req.headers["x-user-email"];
  const appId = req.headers["x-app-id"];

  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  req.user = {
    id: userId,
    email: userEmail,
    appId: appId,
  };

  next();
}
```

#### Example Express App

```javascript
// index.js
import express from "express";
import { authMiddleware } from "./middleware/auth.js";

const app = express();
app.use(express.json());

// Public routes
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Protected routes
app.use("/api", authMiddleware);

app.get("/api/todos", (req, res) => {
  // req.user is available here
  console.log("User:", req.user.id, req.user.email);

  // Fetch todos for this user
  res.json({
    todos: [{ id: 1, title: "Example todo", userId: req.user.id }],
  });
});

app.post("/api/todos", (req, res) => {
  const { title } = req.body;

  // Create todo for authenticated user
  const todo = {
    id: Date.now(),
    title,
    userId: req.user.id,
    completed: false,
  };

  res.status(201).json(todo);
});

app.listen(8080, () => {
  console.log("Server running on port 8080");
});
```

---

### Go

#### Dependencies

```bash
go get github.com/lestrrat-go/jwx/v2
```

#### Middleware (Direct JWT)

```go
// middleware/auth.go
package middleware

import (
	"context"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/lestrrat-go/jwx/v2/jwk"
	"github.com/lestrrat-go/jwx/v2/jwt"
)

type UserContext struct {
	ID    string
	Email string
	AppID string
}

type contextKey string

const UserContextKey contextKey = "user"

var (
	jwksCache *jwk.Cache
	jwksOnce  sync.Once
	au1hURL   = "http://localhost:4444"
	appSlug   = os.Getenv("AU1H_APP_SLUG") // the same value you send as x-app-id
)

func getJWKS() jwk.Set {
	jwksOnce.Do(func() {
		ctx := context.Background()
		jwksURL := au1hURL + "/api/auth/jwks"

		jwksCache = jwk.NewCache(ctx)
		jwksCache.Register(jwksURL, jwk.WithMinRefreshInterval(15*time.Minute))

		// Initial fetch
		jwksCache.Refresh(ctx, jwksURL)
	})

	set, _ := jwksCache.Get(context.Background(), au1hURL+"/api/auth/jwks")
	return set
}

func AuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if !strings.HasPrefix(authHeader, "Bearer ") {
			http.Error(w, "Missing token", http.StatusUnauthorized)
			return
		}

		tokenString := strings.TrimPrefix(authHeader, "Bearer ")
		keySet := getJWKS()

		// Signature (EdDSA, from the JWKS), exp, iss and aud are all checked here.
		// The audience is your slug: tokens minted for other applications fail.
		token, err := jwt.Parse(
			[]byte(tokenString),
			jwt.WithKeySet(keySet),
			jwt.WithIssuer(au1hURL),
			jwt.WithAudience(appSlug),
			jwt.WithValidate(true),
		)
		if err != nil {
			http.Error(w, "Invalid token", http.StatusUnauthorized)
			return
		}

		user := UserContext{
			ID:    token.Subject(),
			Email: getStringClaim(token, "email"),
			AppID: getStringClaim(token, "applicationId"),
		}

		ctx := context.WithValue(r.Context(), UserContextKey, user)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func getStringClaim(token jwt.Token, key string) string {
	val, ok := token.Get(key)
	if !ok {
		return ""
	}
	str, _ := val.(string)
	return str
}

// Helper to get user from context
func GetUser(ctx context.Context) *UserContext {
	user, ok := ctx.Value(UserContextKey).(UserContext)
	if !ok {
		return nil
	}
	return &user
}
```

#### Middleware (Proxy Pattern - Trusted Headers)

```go
// middleware/auth.go
package middleware

import (
	"context"
	"net/http"
)

type UserContext struct {
	ID    string
	Email string
	AppID string
}

type contextKey string

const UserContextKey contextKey = "user"

func AuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		userID := r.Header.Get("X-User-Id")
		if userID == "" {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		user := UserContext{
			ID:    userID,
			Email: r.Header.Get("X-User-Email"),
			AppID: r.Header.Get("X-App-Id"),
		}

		ctx := context.WithValue(r.Context(), UserContextKey, user)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func GetUser(ctx context.Context) *UserContext {
	user, ok := ctx.Value(UserContextKey).(UserContext)
	if !ok {
		return nil
	}
	return &user
}
```

#### Example Go Server

```go
// main.go
package main

import (
	"encoding/json"
	"log"
	"net/http"

	"yourapp/middleware"
)

type Todo struct {
	ID        int    `json:"id"`
	Title     string `json:"title"`
	UserID    string `json:"userId"`
	Completed bool   `json:"completed"`
}

func main() {
	mux := http.NewServeMux()

	// Public routes
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	})

	// Protected routes
	protected := http.NewServeMux()
	protected.HandleFunc("GET /api/todos", getTodos)
	protected.HandleFunc("POST /api/todos", createTodo)

	mux.Handle("/api/", middleware.AuthMiddleware(protected))

	log.Println("Server running on port 8080")
	http.ListenAndServe(":8080", mux)
}

func getTodos(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUser(r.Context())

	todos := []Todo{
		{ID: 1, Title: "Example todo", UserID: user.ID, Completed: false},
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(todos)
}

func createTodo(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUser(r.Context())

	var input struct {
		Title string `json:"title"`
	}
	json.NewDecoder(r.Body).Decode(&input)

	todo := Todo{
		ID:        1,
		Title:     input.Title,
		UserID:    user.ID,
		Completed: false,
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(todo)
}
```

---

### Python / FastAPI

#### Installation

```bash
pip install fastapi uvicorn "pyjwt[crypto]"
```

`pyjwt[crypto]` is required: the tokens are EdDSA (Ed25519), which needs the
`cryptography` backend.

#### Middleware (Direct JWT)

```python
# middleware/auth.py
import os
from dataclasses import dataclass

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient

AU1H_URL = os.environ.get("AU1H_URL", "http://localhost:4444")
APP_SLUG = os.environ.get("AU1H_APP_SLUG")  # the same value you send as x-app-id

security = HTTPBearer()

# Fetches and caches au1h's signing keys; refetches on unknown kids.
jwks_client = PyJWKClient(f"{AU1H_URL}/api/auth/jwks", cache_keys=True)


@dataclass
class User:
    id: str
    email: str
    name: str | None
    app_id: str | None


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> User:
    """Validate the au1h JWT and return the user context."""
    token = credentials.credentials

    try:
        signing_key = jwks_client.get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["EdDSA"],
            issuer=AU1H_URL,
            audience=APP_SLUG,  # tokens minted for other applications fail here
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail=f"Invalid token: {exc}") from exc

    return User(
        id=payload["sub"],
        email=payload["email"],
        name=payload.get("name"),
        app_id=payload.get("applicationId"),
    )
```

#### Middleware (Proxy Pattern - Trusted Headers)

```python
# middleware/auth.py
from fastapi import Request, HTTPException, Depends
from dataclasses import dataclass

@dataclass
class User:
    id: str
    email: str
    app_id: str

async def get_current_user(request: Request) -> User:
    """Extract user from trusted headers"""
    user_id = request.headers.get("x-user-id")

    if not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")

    return User(
        id=user_id,
        email=request.headers.get("x-user-email", ""),
        app_id=request.headers.get("x-app-id", "")
    )
```

#### Example FastAPI App

```python
# main.py
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
from middleware.auth import get_current_user, User

app = FastAPI(title="Todo API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Todo(BaseModel):
    id: int
    title: str
    user_id: str
    completed: bool = False

class CreateTodoInput(BaseModel):
    title: str

# In-memory storage (use a real database in production)
todos: List[Todo] = []

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.get("/api/todos", response_model=List[Todo])
async def get_todos(user: User = Depends(get_current_user)):
    """Get all todos for the authenticated user"""
    return [t for t in todos if t.user_id == user.id]

@app.post("/api/todos", response_model=Todo, status_code=201)
async def create_todo(
    input: CreateTodoInput,
    user: User = Depends(get_current_user)
):
    """Create a new todo for the authenticated user"""
    todo = Todo(
        id=len(todos) + 1,
        title=input.title,
        user_id=user.id,
        completed=False
    )
    todos.append(todo)
    return todo

@app.put("/api/todos/{todo_id}", response_model=Todo)
async def update_todo(
    todo_id: int,
    completed: bool,
    user: User = Depends(get_current_user)
):
    """Update a todo's completion status"""
    for todo in todos:
        if todo.id == todo_id and todo.user_id == user.id:
            todo.completed = completed
            return todo

    raise HTTPException(status_code=404, detail="Todo not found")

@app.delete("/api/todos/{todo_id}", status_code=204)
async def delete_todo(
    todo_id: int,
    user: User = Depends(get_current_user)
):
    """Delete a todo"""
    global todos
    todos = [t for t in todos if not (t.id == todo_id and t.user_id == user.id)]

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
```

---

## API Reference

### Authentication Endpoints

| Endpoint                  | Method | Description                       |
| ------------------------- | ------ | --------------------------------- |
| `/api/auth/sign-in/email` | POST   | Sign in with email/password       |
| `/api/auth/sign-up/email` | POST   | Create new account                |
| `/api/auth/sign-out`      | POST   | Sign out (invalidate session)     |
| `/api/auth/session`       | GET    | Get current session               |
| `/api/auth/jwks`          | GET    | Public JWKS (EdDSA) for token verification; no `x-app-id` needed |
| `/api/auth/token`         | GET    | Mint a 15-minute JWT for the current session (`{ "token": "..." }`) |

### Proxy Endpoint

| Endpoint   | Method | Description                           |
| ---------- | ------ | ------------------------------------- |
| `/proxy/*` | ANY    | Proxy requests to configured backends |

**Required Headers:**

- `x-app-id`: Your application slug

### Server-to-server API (application secret)

Authenticate with `x-app-id: <slug>` and `x-app-secret: <secret>` (shown once when the
application is created or its secret is regenerated in the admin portal; only a hash is
stored). Applications created before secrets were hashed must regenerate theirs.

| Endpoint               | Method | Description                                                                 |
| ---------------------- | ------ | --------------------------------------------------------------------------- |
| `/api/apps/me`         | GET    | Check credentials; returns your application id and slug                     |
| `/api/apps/introspect` | POST   | `{ "token": "<au1h JWT or session token>" }` → `{ active, user, expiresAt }` |

Use `introspect` when you want au1h to check a token for you (it also reflects session
revocation and bans immediately), instead of verifying the JWT offline.

### Admin API (v1)

Requires an au1h admin-portal session (`x-app-id: au1h-admin`) with an active
organization; everything is scoped to that organization. Unauthenticated calls get `401`.

| Endpoint                   | Method | Description             |
| -------------------------- | ------ | ----------------------- |
| `/api/v1/applications`     | GET    | List all applications   |
| `/api/v1/applications/:id` | GET    | Get application details |
| `/api/v1/applications`     | POST   | Create application      |
| `/api/v1/applications/:id` | PUT    | Update application      |
| `/api/v1/applications/:id` | DELETE | Delete application      |
| `/api/v1/routes`           | GET    | List proxy routes       |
| `/api/v1/routes/:id`       | GET    | Get route details       |
| `/api/v1/routes`           | POST   | Create route (application must belong to your organization; `backendUrl` must be public `http(s)` in production) |
| `/api/v1/routes/:id`       | PUT    | Update route            |
| `/api/v1/routes/:id`       | DELETE | Delete route            |
| `/api/v1/users`            | GET    | List users              |
| `/api/v1/users/:id`        | GET    | Get user details        |
| `/api/v1/users/:id/ban`    | POST   | Ban user and revoke their sessions |

---

## Troubleshooting

### Common Issues

**1. CORS errors**

- Ensure your frontend URL is in the application's "Allowed Origins"
- Check that `credentials: "include"` is set for fetch requests

**2. Token validation fails**

- Verify the JWKS endpoint is accessible from your backend
- Use `EdDSA`, not RS256; make sure your JWT library supports Ed25519 (OKP) keys
- Verify `iss` against au1h's base URL exactly (scheme, host, port, no trailing slash) and
  `aud` against your application slug
- Check that the token hasn't expired (15-minute lifetime)
- Read the tenant from the `applicationId` claim (there is no `app_id` claim)

**2b. Sign-in returns 401 "Missing application context"**

- Every `/api/auth/*` request needs `x-app-id: <your slug>`; the Better Auth client must
  be configured with that header (see the frontend section)

**3. Proxy returns 404**

- Verify the route is configured in au1h admin
- Check that the route is active
- Ensure the path pattern matches your request

**4. Headers not received by backend**

- Verify your backend is receiving the `x-user-id` header
- Check that the proxy route is configured correctly
- Ensure au1h can reach your backend URL

---

## Support

For issues and feature requests, please open an issue on GitHub.
