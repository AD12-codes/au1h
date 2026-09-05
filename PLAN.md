# au1h Development Plan

> Centralized Multi-Application Authentication & API Proxy System
>
> **Historical document.** This plan tracked the original build-out (2025). The current
> design, status and remaining work live in `docs/ARCHITECTURE.md`; treat that file as the
> source of truth where the two disagree (e.g. Phase 1C's constraints were only made
> correct by migration `0003`, and Phase 1F/RLS is still open).

---

## Phase 1: Database & Schema (Application Isolation)

### 1A: Create Applications Table ✅

- [x] Create `applications` table with fields:
  - `id` (primary key)
  - `name` (display name)
  - `slug` (unique identifier for URLs)
  - `secret` (API secret for backend authentication)
  - `allowed_origins` (CORS origins for this app)
  - `metadata` (JSON for additional config)
  - `created_at`, `updated_at` timestamps
- [x] Generate and run migration

### 1B: Add Application Context to Auth Tables ✅

- [x] Add `application_id` foreign key to `users` table
- [x] Add `application_id` foreign key to `sessions` table
- [x] Add `application_id` foreign key to `accounts` table
- [x] Update Better Auth schema mapping
- [x] Generate and run migration

### 1C: Composite Unique Constraints ✅

- [x] Remove global unique constraint on `users.email`
- [x] Add composite unique constraint `(email, application_id)` on users
- [x] Add composite unique constraint `(account_id, provider_id, application_id)` on accounts
- [x] Generate and run migration

### 1D: Extend Better Auth for Application Context ✅

- [x] Create custom plugin/hook to inject `application_id` during signup
- [x] Modify login flow to validate credentials against application-scoped users
- [x] Pass application context through authentication middleware
- [x] Update session creation to include application binding

### 1E: JWT Configuration with Application Claims ✅

- [x] Configure Better Auth JWT plugin to include `application_id` claim
- [x] Add `applicationId` to JWT payload
- [x] Test JWT generation includes correct claims
- [x] Verify JWKS endpoint serves correct public keys

### 1F: PostgreSQL Row-Level Security (RLS)

- [ ] Enable RLS on `users` table
- [ ] Enable RLS on `sessions` table
- [ ] Enable RLS on `accounts` table
- [ ] Create policies that filter by `application_id` from session context
- [ ] Test isolation between applications

---

## Phase 2: Admin Portal UI

### 2A: Applications Management ✅

- [x] Create applications list page (`/applications`)
- [x] Create application detail/edit page (`/applications/:id`)
- [x] Create new application form
- [x] Implement delete application with confirmation
- [x] Add secret regeneration functionality
- [x] Display application stats (user count, session count)

### 2B: Users Management ✅

- [x] Create users list page (`/users`)
- [x] Add filter by application dropdown
- [x] Display user details (email, created_at, last_login)
- [x] Add user search functionality
- [x] Implement user ban/unban actions
- [x] Show user's active sessions

---

## Phase 3: API Gateway

### Authentication Patterns (Both Supported)

**Option 1: Client-to-Server (Direct JWT)**

```
App UI → App Backend (validates JWT via JWKS from au1h)
```

- Client gets JWT via Better Auth client
- Backend validates using `/api/auth/jwks`
- Best for: External apps, mobile apps, different platforms

**Option 2: Server-to-Server (Proxy via au1h)**

```
App UI → au1h Gateway → App Backend (trusts headers)
```

- JWT stays server-side (more secure)
- au1h injects trusted headers: `x-user-id`, `x-app-id`, etc.
- Best for: Internal apps, same-domain SPAs

### 3A: Application Routes Table ✅

- [x] Create `application_routes` table schema
- [x] Generate and run migration

### 3B: Routes CRUD API ✅

- [x] Create routes module (controller/service/route)
- [x] List routes for an application
- [x] Create new route
- [x] Update route
- [x] Delete route
- [x] Toggle route active status

### 3C: Proxy Middleware ✅

- [x] Implement Hono proxy middleware
- [x] Match incoming requests to configured routes
- [x] Forward to backend with context headers
- [x] Handle proxy errors gracefully
- [x] Add request/response logging

### 3D: Context Header Propagation ✅

- [x] Inject `x-app-id` header with application ID
- [x] Inject `x-user-id` header with authenticated user ID
- [x] Inject `x-user-email` header with user email
- [x] Strip sensitive headers from client requests
- [ ] Document header contract for backend services

### 3E: Admin UI for Routes ✅

- [x] Add routes section to application detail page
- [x] Create route form (add/edit)
- [x] Display routes list with actions
- [x] Toggle route active status

---

## Architecture Notes

### Admin Portal (apps/web)

The admin portal is a **privileged system application** that:

- Has access to all applications and users
- Requires system admin authentication
- Cannot be accessed by regular application users

### External Applications

Each external app (Todo, Blog, etc.) will:

1. Register with au1h and receive `app_id` + `secret`
2. Redirect users to au1h for login with their `app_id`
3. Receive authenticated users back with session cookies
4. Make API calls through the gateway with proper context

### Security Flow

```
User → App Login Page → au1h Auth (with app_id) → JWT + Session
     → Gateway validates JWT → Proxies to Backend with headers
     → Backend trusts headers → Returns response
```

---

## Progress Tracking

| Phase                      | Status         | Completion |
| -------------------------- | -------------- | ---------- |
| Phase 1: Database & Schema | 🟡 In Progress | 95%        |
| Phase 2: Admin Portal UI   | ✅ Complete    | 100%       |
| Phase 3: API Gateway       | ✅ Complete    | 100%       |

### Next Steps

1. Complete Phase 1F (RLS policies) - optional, can defer
2. Documentation created at `docs/INTEGRATION.md`

---

_Last updated: December 19, 2024_
