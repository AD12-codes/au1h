# Signup Flow Documentation

## Overview

This document outlines all signup scenarios for the au1h multi-tenant authentication system. The flow differs based on:

1. **Source Application** - Where the signup request originates (au1h UI vs client apps)
2. **x-app-id Header** - Whether an application ID is provided
3. **Application Registration** - Whether the app is registered in the organization
4. **Email Existence** - Whether the email already exists in the system

---

## Decision Matrix

| x-app-id | Source                   | App Registered? | Action                                                                    |
| -------- | ------------------------ | --------------- | ------------------------------------------------------------------------- |
| NULL     | au1h UI (localhost:4445) | N/A             | ✅ Create user + Create org                                               |
| NULL     | NOT au1h UI              | N/A             | ❌ 401: "Unauthorized: Missing application context"                       |
| EXISTS   | N/A                      | NO              | ❌ 401: "App not registered. Please contact your org owner: {owner_name}" |
| EXISTS   | N/A                      | YES             | ✅ Create user with applicationId                                         |

---

## Flow 1: au1h Admin Portal Signup

**Conditions:**

- `x-app-id` = NULL
- Request origin = au1h UI (`localhost:4445` or configured admin URL)

**Actions:**

1. Create user with `applicationId = NULL`
2. Create organization for the user (e.g., "{FirstName}'s Workspace")
3. Add user as organization owner/admin
4. Create session

**Applies to:** GitHub, Google, Email/Password signup on au1h UI

---

## Flow 2: Client App Signup (Registered App)

**Conditions:**

- `x-app-id` = EXISTS (valid application slug)
- Application is registered in au1h by an organization owner

**Actions:**

1. Resolve `applicationId` from slug
2. Check if email exists in admin portal (with NULL applicationId)
   - **If email exists:** Create NEW user with `applicationId` (adapter override handles this)
   - **If new email:** Create user with `applicationId`
3. Create account linked to user with `applicationId`
4. Create session
5. **DO NOT create organization** (client app users are scoped to apps, not orgs)

**Applies to:** GitHub, Google, Email/Password signup on registered client apps

---

## Flow 3: Unauthorized - Missing App Context

**Conditions:**

- `x-app-id` = NULL
- Request origin ≠ au1h UI

**Actions:**

1. Throw 401 error
2. Message: "Unauthorized: Missing application context. Ensure x-app-id header is set."

**Reason:** Prevents orphan users from apps that forgot to set the header

---

## Flow 4: Unauthorized - Unregistered App

**Conditions:**

- `x-app-id` = EXISTS
- Application slug NOT found in `applications` table OR app is inactive

**Actions:**

1. Throw 401 error
2. Message: "App not registered. Please contact your organization owner."

**Reason:** Only registered applications can authenticate users

---

## Implementation Notes

### Detecting au1h UI Origin

Check request origin/referer against configured admin URLs:

- `localhost:4445` (development)
- Production admin URL (from env)

```typescript
const AU1H_ADMIN_ORIGINS = [
  "http://localhost:4445",
  process.env.AU1H_ADMIN_URL, // production
].filter(Boolean);

function isAu1hAdminRequest(headers: Headers): boolean {
  const origin = headers.get("origin");
  const referer = headers.get("referer");

  return AU1H_ADMIN_ORIGINS.some(
    (adminUrl) => origin?.startsWith(adminUrl) || referer?.startsWith(adminUrl)
  );
}
```

### Organization Creation

Only triggered when:

- `applicationId` is NULL
- Request is from au1h UI
- Signup method: GitHub, Google, or Email/Password

---

## Test Scenarios

### ✅ Should Succeed

| #   | Scenario                                     | Expected Result                                        |
| --- | -------------------------------------------- | ------------------------------------------------------ |
| 1   | Signup on au1h UI with GitHub                | User created (appId=NULL), Org created                 |
| 2   | Signup on au1h UI with Google                | User created (appId=NULL), Org created                 |
| 3   | Signup on au1h UI with Email/Password        | User created (appId=NULL), Org created                 |
| 4   | Signup on registered app with new email      | User created (appId=UUID)                              |
| 5   | Signup on registered app with existing email | New user created (appId=UUID), existing user unchanged |
| 6   | Login on registered app (existing user)      | Session created                                        |

### ❌ Should Fail

| #   | Scenario                                    | Expected Error                   |
| --- | ------------------------------------------- | -------------------------------- |
| 7   | Signup from unknown origin without x-app-id | 401: Missing application context |
| 8   | Signup with x-app-id for unregistered app   | 401: App not registered          |
| 9   | Signup with x-app-id for inactive app       | 401: App not registered          |

---

## Database State Examples

### After Scenario 1+4 (Same email on au1h + todo-app)

**users table:**
| id | email | applicationId | name |
|----|-------|---------------|------|
| user-1 | john@example.com | NULL | John Doe |
| user-2 | john@example.com | app-uuid-123 | John Doe |

**accounts table:**
| id | userId | applicationId | providerId |
|----|--------|---------------|------------|
| acc-1 | user-1 | NULL | github |
| acc-2 | user-2 | app-uuid-123 | github |

**organizations table:**
| id | name | slug |
|----|------|------|
| org-1 | John's Workspace | john-workspace-user1 |

**members table:**
| id | userId | organizationId | role |
|----|--------|----------------|------|
| mem-1 | user-1 | org-1 | owner |
