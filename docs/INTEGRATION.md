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

1. User logs in via au1h
2. Your frontend gets JWT token
3. Frontend sends JWT to your backend
4. Backend validates JWT using au1h's JWKS endpoint

### Pattern 2: Proxy via au1h Gateway

```
┌─────────┐     ┌─────────────┐     ┌─────────────┐
│ Your UI │────▶│ au1h Gateway│────▶│ Your Backend│
└─────────┘     │ (validates  │     │ (trusts     │
                │  + proxies) │     │  headers)   │
                └─────────────┘     └─────────────┘
```

1. User logs in via au1h
2. Frontend makes API calls to au1h proxy endpoint
3. au1h validates session and proxies to your backend
4. Your backend receives trusted headers (`x-user-id`, `x-app-id`, etc.)

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
  // Your application slug is passed via headers
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

export async function fetchTodos() {
  // Get JWT token from Better Auth
  const { data } = await authClient.getSession();
  const token = data?.session?.token;

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

**Important**: These headers are stripped from client requests and only injected by au1h. Your backend can trust them.

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
let jwks = null;

// Cache JWKS
async function getJWKS() {
  if (!jwks) {
    jwks = jose.createRemoteJWKSet(new URL(`${AU1H_URL}/api/auth/jwks`));
  }
  return jwks;
}

export async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing token" });
  }

  const token = authHeader.slice(7);

  try {
    const JWKS = await getJWKS();
    const { payload } = await jose.jwtVerify(token, JWKS);

    req.user = {
      id: payload.sub,
      email: payload.email,
      appId: payload.app_id,
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
go get github.com/golang-jwt/jwt/v5
go get github.com/lestrrat-go/jwx/v2/jwk
```

#### Middleware (Direct JWT)

```go
// middleware/auth.go
package middleware

import (
	"context"
	"net/http"
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

		token, err := jwt.Parse(
			[]byte(tokenString),
			jwt.WithKeySet(keySet),
		)
		if err != nil {
			http.Error(w, "Invalid token", http.StatusUnauthorized)
			return
		}

		user := UserContext{
			ID:    token.Subject(),
			Email: getStringClaim(token, "email"),
			AppID: getStringClaim(token, "app_id"),
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
pip install fastapi uvicorn python-jose httpx
```

#### Middleware (Direct JWT)

```python
# middleware/auth.py
from fastapi import Request, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, jwk
from jose.exceptions import JWTError
import httpx
from functools import lru_cache
from dataclasses import dataclass

AU1H_URL = "http://localhost:4444"

security = HTTPBearer()

@dataclass
class User:
    id: str
    email: str
    app_id: str

@lru_cache(maxsize=1)
def get_jwks():
    """Fetch and cache JWKS from au1h"""
    response = httpx.get(f"{AU1H_URL}/api/auth/jwks")
    response.raise_for_status()
    return response.json()

def get_public_key(token: str):
    """Get the public key for the given token"""
    jwks = get_jwks()
    unverified_header = jwt.get_unverified_header(token)

    for key in jwks["keys"]:
        if key["kid"] == unverified_header["kid"]:
            return jwk.construct(key)

    raise HTTPException(status_code=401, detail="Key not found")

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> User:
    """Validate JWT and return user context"""
    token = credentials.credentials

    try:
        public_key = get_public_key(token)
        payload = jwt.decode(
            token,
            public_key,
            algorithms=["RS256"]
        )

        return User(
            id=payload.get("sub"),
            email=payload.get("email"),
            app_id=payload.get("app_id")
        )
    except JWTError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")
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
| `/api/auth/jwks`          | GET    | Get JWKS for token verification   |
| `/api/auth/token`         | GET    | Get JWT token for current session |

### Proxy Endpoint

| Endpoint   | Method | Description                           |
| ---------- | ------ | ------------------------------------- |
| `/proxy/*` | ANY    | Proxy requests to configured backends |

**Required Headers:**

- `x-app-id`: Your application slug

### Admin API (v1)

| Endpoint                   | Method | Description             |
| -------------------------- | ------ | ----------------------- |
| `/api/v1/applications`     | GET    | List all applications   |
| `/api/v1/applications/:id` | GET    | Get application details |
| `/api/v1/applications`     | POST   | Create application      |
| `/api/v1/applications/:id` | PUT    | Update application      |
| `/api/v1/applications/:id` | DELETE | Delete application      |
| `/api/v1/routes`           | GET    | List proxy routes       |
| `/api/v1/routes/:id`       | GET    | Get route details       |
| `/api/v1/routes`           | POST   | Create route            |
| `/api/v1/routes/:id`       | PUT    | Update route            |
| `/api/v1/routes/:id`       | DELETE | Delete route            |
| `/api/v1/users`            | GET    | List users              |
| `/api/v1/users/:id`        | GET    | Get user details        |

---

## Troubleshooting

### Common Issues

**1. CORS errors**

- Ensure your frontend URL is in the application's "Allowed Origins"
- Check that `credentials: "include"` is set for fetch requests

**2. Token validation fails**

- Verify JWKS endpoint is accessible
- Check that the token hasn't expired
- Ensure you're using the correct application context

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
