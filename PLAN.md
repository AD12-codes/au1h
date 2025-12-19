# au1h Development Plan

> Centralized Multi-Application Authentication & API Proxy System

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

### 2C: JWT Validation Middleware

- [ ] Create JWKS fetcher with caching (from `/api/auth/.well-known/jwks.json`)
- [ ] Implement JWT signature validation
- [ ] Validate token expiration
- [ ] Extract and validate `application_id` claim
- [ ] Create Hono middleware for protected routes

### 2D: Proxy Routing

- [ ] Define route configuration structure (path → backend URL mapping)
- [ ] Implement proxy handler using `fetch` or `http-proxy`
- [ ] Add route: `/api/todos/*` → Python Todo service
- [ ] Add route: `/api/blog/*` → Go Blog service
- [ ] Handle proxy errors gracefully
- [ ] Add request/response logging

### 2E: Context Header Propagation

- [ ] Inject `x-app-id` header with application ID
- [ ] Inject `x-user-id` header with authenticated user ID
- [ ] Inject `x-user-email` header with user email
- [ ] Inject `x-user-roles` header with user roles (if applicable)
- [ ] Strip sensitive headers from client requests
- [ ] Document header contract for backend services

### 2F: Application Registration API

- [ ] Create `/api/apps/register` endpoint for new apps
- [ ] Create `/api/apps/:id/credentials` endpoint for secret rotation
- [ ] Create `/api/apps/:id/validate` endpoint for apps to verify tokens
- [ ] Implement rate limiting on registration endpoints
- [ ] Add webhook configuration for auth events

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
| Phase 1: Database & Schema | 🟡 In Progress | 80%        |
| Phase 2: Admin Portal UI   | ✅ Complete    | 100%       |
| Phase 3: API Gateway       | 🔲 Not Started | 0%         |

### Next Steps

1. Complete Phase 1F (RLS policies) - optional, can defer
2. Start Phase 3 (API Gateway)

---

_Last updated: December 19, 2024_
