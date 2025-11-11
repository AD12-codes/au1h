---
trigger: manual
---

Architectural Context: Centralized Multi-Application Authentication & API Proxy System
Part 1: Centralized Authentication with Application-Level Isolation
Objective
Build a single centralized authentication backend using Better Auth that serves multiple independent applications while maintaining strict data and access isolation between applications.

Core Requirements
User Registration & Application Binding

Users sign up for a specific application (e.g., Todo App or Blog App)

A user email and password are unique within an application context, not globally

The same email can exist across different applications with independent credentials

Each user registration is tied to an application_id or app_identifier in the database

A user cannot use their Todo app credentials to access the Blog app

Shared Database, Logical Separation

All user data, sessions, and authentication records live in a single centralized database (managed by Better Auth)

Data differentiation happens at the logical level through application identifiers, not separate databases

Multiple applications query the same tables but data is scoped by application context

Row-Level Security (RLS) policies in PostgreSQL enforce database-level isolation automatically

Multi-Tenant Data Model

Better Auth's core tables (users, sessions, accounts) are extended with application context

Each record includes metadata identifying which application it belongs to

Application context flows through all authentication operations (login, signup, token generation, session validation)

JWT tokens generated include application identifier to prevent token reuse across apps

Benefits

Single authentication codebase reduces maintenance overhead

Centralized user management and audit trails

Consistent security policies across all applications

Efficient resource utilization (one database, one authentication service)

Easy to add new applications without duplicating infrastructure

Security Considerations
Application Context Enforcement

Every database query must include application filtering to ensure users only see their own data

Application context is validated on every request before processing

No queries execute without explicit application scope

Data Isolation Guarantees

PostgreSQL RLS policies automatically reject queries that attempt cross-application access

Even if application code has bugs, database-level policies prevent data leakage

Sensitive data can be encrypted per application or per user

Session & Token Management

Sessions are scoped to both user and application

JWT tokens include application identifier as a claim

Token validation checks both user validity and application access rights

Session invalidation in one application doesn't affect other applications

Authentication Flow

User logs into specific application during signup/login

Authentication service validates credentials against application-scoped user records

JWT token is issued with embedded application context

Token is cached server-side and never exposed to frontend

All subsequent requests validate both token and application context

Part 2: JWT Proxy Pattern with API Gateway
Objective
Create a Node.js-based API gateway that serves as a single authentication and routing layer for multiple backend services written in different languages (Python, Go, etc.), using JWT validation and secure proxying without exposing tokens to the frontend.

Core Architecture
Single Entry Point Gateway

Frontend always communicates with Node.js backend, never directly with Python/Go services

Node.js acts as the API gateway and authentication validator

All requests pass through centralized validation before reaching backend services

Consistent authentication across all backend microservices regardless of implementation language

JWT Validation & JWKS

Node.js gateway retrieves public keys (JWKS) from Better Auth's public endpoint

JWKS is cached locally to avoid repeated network calls

Incoming requests carry JWT tokens in Authorization headers

Gateway validates JWT signature, expiration, issuer, and application context claims

Only validated requests are forwarded to backend services

Token Isolation from Frontend

Backend generates and validates JWTs server-side only

Tokens are never returned to or stored on the frontend

Frontend receives session information or cookies, never raw JWT

This prevents client-side token theft, exposure in localStorage/localStorage, or accidental logging

Request Routing & Proxying

Gateway acts as a reverse proxy for backend services

Routing rules map incoming requests to appropriate backends

/api/todos/\* → Python Todo service

/api/blog/\* → Go Blog service

Service-specific endpoints routed to respective backends

Gateway maintains request/response transformation and header injection

Context Propagation to Backends

After validating JWT, extract user information and application context

Pass extracted context to backend services via secure headers or internal tokens

Backends trust the gateway's validation and don't need to re-validate JWT

Backends receive user ID, application ID, roles, and permissions directly

Backend services can focus on business logic, not authentication complexity

Security Model
Authentication Validation

Every request is authenticated at the gateway before reaching backends

Backends are protected from unauthenticated requests automatically

No exposed backend endpoints (backends are not directly accessible from outside)

Service-to-Service Security

Backend services don't need to handle JWT validation themselves

Gateway validates centralized authentication and passes trusted context

Optional: Implement mTLS (Mutual TLS) between gateway and backend services for additional security

Communication between gateway and backends is internal and secured

Token Lifecycle Management

JWT generation and expiration handled by Better Auth

Gateway validates token expiration before proxying

Refresh token logic can be centralized at gateway level

Token rotation and revocation flows managed centrally

Cross-Origin & Backend Protection

CORS policies enforced at gateway level

Backends are not exposed to direct requests from untrusted origins

All external requests validated before forwarding

Benefits
Language Flexibility

Backend services can be written in any language (Python, Go, Rust, etc.)

No need to implement authentication in each backend

Teams can choose best language/framework for specific service requirements

Security Centralization

Single place to audit and monitor authentication

Easier to implement security policies consistently

Reduced attack surface compared to distributed authentication

Token secrets not spread across multiple services

Scalability

New backend services can be added by registering routes at gateway

No need to configure authentication on each new service

Gateway can be scaled independently based on load

Backends remain stateless and simple

Operational Simplicity

Authentication updates apply to all services automatically

Token validation happens once, reducing latency and computation

Monitoring and logging centralized at gateway

Easier to debug authentication issues

Integration Between Both Parts
End-to-End Flow

User signs up/logs into specific application (Better Auth - Part 1)

Better Auth validates credentials against application-scoped data

JWT token is generated with application context and user information

Frontend makes request to Node.js gateway with JWT in Authorization header

Gateway validates JWT using Better Auth's JWKS (Part 2)

Gateway extracts user context and application ID from validated token

Gateway proxies request to appropriate backend service (Python/Go)

Backend service receives user context via headers, not the JWT itself

Backend executes business logic knowing the request is authenticated and application-scoped

Response flows back through gateway to frontend

Consistency Points

Application ID flows through both parts (Better Auth to Gateway to Backend)

JWT claims always include application context

Both layers respect application isolation boundaries

User context is verified at authentication (Part 1) and request (Part 2) levels
