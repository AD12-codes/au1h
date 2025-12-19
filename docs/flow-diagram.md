# au1h Authentication Flow Diagrams

## Overview

au1h is a centralized authentication service that allows multiple external applications to use a single auth backend while maintaining complete data isolation between apps.

---

## 1. Application Registration Flow

Before an external app can use au1h, it must be registered in the admin portal.

```mermaid
sequenceDiagram
    participant Admin as Admin User
    participant Portal as au1h Admin Portal
    participant Server as au1h Server
    participant DB as PostgreSQL

    Admin->>Portal: Login to Admin Portal
    Portal->>Server: Authenticate admin
    Server-->>Portal: Session established

    Admin->>Portal: Create New Application
    Note over Admin,Portal: Name: "Todo App"<br/>Slug: "todo-app"<br/>Allowed Origins: ["https://todo.example.com"]

    Portal->>Server: POST /api/applications
    Server->>DB: INSERT INTO applications
    Server->>Server: Generate app_secret
    Server-->>Portal: { app_id, app_secret, slug }

    Portal-->>Admin: Display credentials
    Note over Admin: Save app_id & app_secret<br/>for backend configuration
```

---

## 2. External App Integration Setup

How a developer integrates au1h into their application.

```mermaid
flowchart TB
    subgraph Developer Setup
        A[Developer gets app_id from Admin Portal] --> B[Add auth-client to their app]
        B --> C[Configure auth-client with au1h URL + app_id]
        C --> D[Add login buttons to their UI]
    end

    subgraph auth-client.ts Configuration
        E["createAuthClient({
            baseURL: 'https://auth.au1h.com',
            plugins: [...],
            fetchOptions: { credentials: 'include' },
            // Custom header for app identification
            headers: { 'x-app-id': 'todo-app' }
        })"]
    end

    D --> E
```

### Code Example for External App

```typescript
// External app's auth-client.ts
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: "https://auth.au1h.com", // Points to au1h server
  plugins: [],
  fetchOptions: {
    credentials: "include",
    headers: {
      "x-app-id": "todo-app", // Application identifier
    },
  },
});

export const { signIn, signOut, useSession } = authClient;
```

---

## 3. User Authentication Flow (OAuth - GitHub/Google)

Complete flow when a user logs into an external app using au1h.

```mermaid
sequenceDiagram
    participant User
    participant App as External App<br/>(Todo App)
    participant AU1H as au1h Server
    participant OAuth as OAuth Provider<br/>(GitHub/Google)
    participant DB as PostgreSQL

    User->>App: Click "Login with GitHub"
    App->>AU1H: POST /api/auth/signin/github<br/>Headers: { x-app-id: "todo-app" }

    AU1H->>AU1H: Validate app_id exists
    AU1H->>OAuth: Redirect to GitHub OAuth

    User->>OAuth: Authorize application
    OAuth-->>AU1H: Callback with auth code

    AU1H->>OAuth: Exchange code for tokens
    OAuth-->>AU1H: { access_token, user_info }

    AU1H->>DB: Check if user exists for this app
    Note over AU1H,DB: SELECT * FROM users<br/>WHERE email = ? AND application_id = ?

    alt User doesn't exist for this app
        AU1H->>DB: Create new user record
        Note over AU1H,DB: INSERT INTO users<br/>(email, name, application_id, ...)
        AU1H->>DB: Create account record
        Note over AU1H,DB: INSERT INTO accounts<br/>(provider_id, application_id, ...)
    end

    AU1H->>DB: Create session
    Note over AU1H,DB: INSERT INTO sessions<br/>(user_id, application_id, token, ...)

    AU1H->>AU1H: Generate JWT with app context
    Note over AU1H: JWT Claims:<br/>{ sub: user_id,<br/>  app_id: "todo-app",<br/>  email: "user@example.com" }

    AU1H-->>App: Set session cookie + redirect
    App-->>User: Logged in! Welcome to Todo App
```

---

## 4. Session Validation Flow

How au1h validates sessions for API requests.

```mermaid
sequenceDiagram
    participant User
    participant App as External App
    participant AU1H as au1h Server
    participant Redis as Redis Cache
    participant DB as PostgreSQL

    User->>App: Make authenticated request
    App->>AU1H: GET /api/auth/session<br/>Cookie: session_token<br/>Headers: { x-app-id: "todo-app" }

    AU1H->>Redis: Check session cache

    alt Session in cache
        Redis-->>AU1H: Cached session data
    else Session not cached
        AU1H->>DB: Query session
        Note over AU1H,DB: SELECT * FROM sessions<br/>WHERE token = ?<br/>AND application_id = ?
        DB-->>AU1H: Session + User data
        AU1H->>Redis: Cache session (5 min TTL)
    end

    AU1H->>AU1H: Validate session not expired
    AU1H->>AU1H: Validate app_id matches session

    AU1H-->>App: { user, session }
    App-->>User: Render authenticated content
```

---

## 5. API Gateway Proxy Flow

How requests flow through au1h gateway to backend services.

```mermaid
sequenceDiagram
    participant User
    participant App as External App<br/>(Todo App Frontend)
    participant Gateway as au1h API Gateway
    participant Auth as au1h Auth Service
    participant Backend as Todo Backend<br/>(Python Service)

    User->>App: Create new todo
    App->>Gateway: POST /api/todos<br/>Cookie: session_token<br/>Headers: { x-app-id: "todo-app" }

    Gateway->>Auth: Validate session
    Auth-->>Gateway: { user_id, app_id, email, roles }

    Gateway->>Gateway: Build context headers
    Note over Gateway: x-user-id: "usr_123"<br/>x-app-id: "todo-app"<br/>x-user-email: "user@example.com"

    Gateway->>Backend: POST /todos<br/>Headers: { x-user-id, x-app-id, x-user-email }
    Note over Backend: Backend trusts gateway<br/>No JWT validation needed

    Backend->>Backend: Create todo for user
    Backend-->>Gateway: { id: 1, title: "Buy milk" }

    Gateway-->>App: { id: 1, title: "Buy milk" }
    App-->>User: Todo created!
```

---

## 6. Multi-App Isolation Demonstration

Same user email across different applications - completely isolated.

```mermaid
flowchart TB
    subgraph au1h Database
        subgraph "Todo App Context"
            U1[User: john@example.com<br/>app_id: todo-app<br/>user_id: usr_001]
            S1[Sessions for usr_001]
            A1[GitHub Account<br/>for usr_001]
        end

        subgraph "Blog App Context"
            U2[User: john@example.com<br/>app_id: blog-app<br/>user_id: usr_002]
            S2[Sessions for usr_002]
            A2[Google Account<br/>for usr_002]
        end

        subgraph "Chat App Context"
            U3[User: john@example.com<br/>app_id: chat-app<br/>user_id: usr_003]
            S3[Sessions for usr_003]
            A3[GitHub Account<br/>for usr_003]
        end
    end

    subgraph "Same Person - Different App Users"
        John[John using john@example.com]
    end

    John -.->|Login to Todo| U1
    John -.->|Login to Blog| U2
    John -.->|Login to Chat| U3

    U1 --- S1
    U1 --- A1
    U2 --- S2
    U2 --- A2
    U3 --- S3
    U3 --- A3
```

### Key Points:

- **Same email** can exist in multiple apps
- **Different user_id** for each app
- **Sessions are isolated** - logging out of Todo doesn't affect Blog
- **Different OAuth providers** can be used per app

---

## 7. Complete System Architecture

```mermaid
flowchart TB
    subgraph External Applications
        TodoFE[Todo App Frontend]
        BlogFE[Blog App Frontend]
        ChatFE[Chat App Frontend]
    end

    subgraph "au1h Central Auth System"
        subgraph "Node.js Server (Hono)"
            AuthHandler[Better Auth Handler<br/>/api/auth/*]
            Gateway[API Gateway<br/>/api/*]
            AdminAPI[Admin API<br/>/api/admin/*]
        end

        subgraph "Data Layer"
            Redis[(Redis<br/>Session Cache)]
            Postgres[(PostgreSQL<br/>Users, Sessions,<br/>Applications)]
        end
    end

    subgraph "Admin Portal"
        AdminUI[React Admin UI]
    end

    subgraph "Backend Services"
        TodoBE[Todo Service<br/>Python/FastAPI]
        BlogBE[Blog Service<br/>Go/Gin]
        ChatBE[Chat Service<br/>Rust/Actix]
    end

    subgraph "OAuth Providers"
        GitHub[GitHub OAuth]
        Google[Google OAuth]
    end

    TodoFE -->|Auth Requests| AuthHandler
    BlogFE -->|Auth Requests| AuthHandler
    ChatFE -->|Auth Requests| AuthHandler

    TodoFE -->|API Requests| Gateway
    BlogFE -->|API Requests| Gateway
    ChatFE -->|API Requests| Gateway

    AdminUI --> AdminAPI
    AdminUI --> AuthHandler

    AuthHandler --> Redis
    AuthHandler --> Postgres
    Gateway --> Redis

    Gateway -->|Proxied + Headers| TodoBE
    Gateway -->|Proxied + Headers| BlogBE
    Gateway -->|Proxied + Headers| ChatBE

    AuthHandler <-->|OAuth Flow| GitHub
    AuthHandler <-->|OAuth Flow| Google
```

---

## 8. Token & Session Strategy

```mermaid
flowchart LR
    subgraph "What Frontend Gets"
        Cookie[HTTP-Only Cookie<br/>session_token]
    end

    subgraph "What's Stored Server-Side"
        Session[Session Record<br/>user_id, app_id,<br/>expires_at]
        JWT[JWT Token<br/>For internal use only]
    end

    subgraph "What Backend Services Get"
        Headers[Context Headers<br/>x-user-id<br/>x-app-id<br/>x-user-email]
    end

    Cookie -->|Validated by| Session
    Session -->|Used to generate| JWT
    JWT -->|Decoded into| Headers

    Note1[Frontend NEVER sees JWT]
    Note2[Backends NEVER validate JWT]
```

### Security Benefits:

1. **No JWT in browser** - Can't be stolen via XSS
2. **HTTP-Only cookies** - JavaScript can't access
3. **Backend simplicity** - Just read headers, no crypto
4. **Centralized revocation** - Delete session = immediate logout

---

## Summary

| Component            | Responsibility                                            |
| -------------------- | --------------------------------------------------------- |
| **External App**     | Provides UI, uses auth-client with `x-app-id` header      |
| **au1h Auth**        | Handles OAuth, sessions, user management per app          |
| **au1h Gateway**     | Validates sessions, proxies requests with context headers |
| **Backend Services** | Trust gateway headers, focus on business logic            |
| **Admin Portal**     | Manage applications, view users, system config            |
