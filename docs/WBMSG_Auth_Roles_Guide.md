# Authentication, Registration & Roles — WBMSG

> How users sign up, log in, and how permissions are managed across Clerk and our database.

---

## 1. Registration Flow

New users go through a **2-step process**:

```
Step 1 — Identity (Clerk)
  User fills Sign Up form → email, password (or OAuth/Google)
  Clerk creates the account and issues a session
  Clerk redirects → /business-details

Step 2 — Business Details (Our System)
  User fills: company name, website, location, industry, category, revenue
  POST /api/register  →  POST /v1/register (API)
  API creates:
    • Organization row  (name, website, industry, revenue, …)
    • User row          (id = Clerk userId, role = "admin", isActive = true)
  Redirect → /dashboard
```

**Key rule:** The first user to register for an org automatically becomes **admin**.

> **No cookie is used.** Registration state is sourced entirely from the database.
> The dashboard layout calls `/v1/organizations/me` on every load; if the org row
> does not exist it redirects to `/business-details`. This works correctly on any
> device, after any browser reset, and for any role.

---

## 2. Login Flow

```
User fills Sign In form (Clerk UI)
  ↓
Clerk verifies credentials → issues signed JWT session token
  ↓
Redirect → /dashboard
  ↓
middleware.ts checks:
  1. Is the Clerk session valid?   No → redirect /sign-in
  ↓
(dashboard) layout.tsx checks (server component, runs on every full navigation):
  2. Does auth().orgSlug exist?
     No (user not in a Clerk org) → redirect /checklist
  3. Calls /v1/organizations/me AND /v1/onboarding/status in parallel
     /v1/organizations/me not 200 (org not in DB) → redirect /business-details
     Both OK                                       → render dashboard
  ↓
Every API call:
  auth plugin (apps/api/src/plugins/auth.ts) verifies the Clerk JWT
  → checks Redis cache (auth:user:{userId}, 60s TTL) — returns cached auth if hit
  → on cache miss: looks up User in DB  → gets role + organizationId  (isActive must be true)
  → looks up OrganizationMember         → gets fine-grained permissions JSON
  → writes to Redis cache, then attaches to request.auth = { userId, organizationId, role, permissions }
```

### Two-Layer Onboarding Gate

| Layer | Where | What it does |
|---|---|---|
| Layout gate | `(dashboard)/layout.tsx` (server component) | Redirects unregistered users to `/business-details` — UX protection |
| API gate | `apps/api/src/plugins/auth.ts` (preHandler) | Returns 403 for every request from unregistered users — data security |

The layout runs on every full navigation to any dashboard route. The API plugin runs on every single API call. An unregistered user cannot see data or perform any action even if they somehow bypass the layout.

---

## 3. Team Invitation Flow

Invited team members **do not** go through `/sign-up`. The flow is:

```
Admin sends invite from Settings → Team
  ↓
POST /v1/invitations  →  creates Invitation row (email, role, token, expiresAt 7 days)
  ↓
Frontend sends invite email (via Resend) containing the link:
  /invitations/<token>/accept   (public route — no Clerk session required)
  ↓
Invited user lands on the accept page:
  • If already signed in to Clerk: clicks "Join Organization" → calls POST /v1/invitations/:token/accept
  • If new user: fills name/email/password → creates Clerk account programmatically → calls POST /v1/invitations/:token/accept
  ↓
API creates User row  (role = whatever the admin set at invite time: admin/manager/agent/viewer)
  ↓
Invitation marked accepted; user redirected to /sign-in or /onboarding/checklist
```

> The **role is fixed at invite time** by the admin, not defaulted to "agent". Admin can still
> change it later from Settings → Team.

---

## 4. Roles

### Clerk vs Our System

| Responsibility | Clerk | Our Database |
|---|---|---|
| Email / password / OAuth | ✅ | — |
| MFA / OTP | ✅ | — |
| Session tokens (JWT) | ✅ | — |
| Invite emails | ❌ | ✅ via Resend (custom `/invitations/<token>/accept` flow) |
| User roles | ❌ | ✅ `User.role` |
| Organisation membership | ❌ | ✅ `OrganizationMember` |
| Fine-grained permissions | ❌ | ✅ `OrganizationMember.permissions` |
| Login audit log | ❌ | ✅ `LoginLog` (written by Clerk webhook on `session.created`) |

**Clerk = who you are. Our DB = what you can do.**

---

### Role Hierarchy

5 roles in the system (stored on `User.role`):

| Role | Scope | Who it's for |
|---|---|---|
| `superAdmin` | Platform-wide | Us (WBMSG team) — can impersonate any org |
| `admin` | Org-wide | Org owner, first user to register |
| `manager` | Org-wide | Team lead |
| `agent` | Org-wide | Support staff |
| `viewer` | Org-wide | Read-only access |

---

### Two-Level Permission System

Every user has **two layers** of access control:

#### Layer 1 — Role (coarse)
Stored on `User.role`. Controls broad API-level access. Checked like:
```typescript
if (request.auth.role !== "admin") {
  return reply.status(403).send({ error: "Only admins can do this" });
}
```

#### Layer 2 — Permissions (fine-grained)
Stored as a JSON object on `OrganizationMember.permissions`. Overrides the role defaults for specific features per user.

```json
{
  "inbox": "write",
  "contacts": "read",
  "campaigns": "none",
  "deals": "write",
  "analytics": "read"
}
```

**Default permissions per role** are stored in `VendorSetting`:

| Setting key | What it stores |
|---|---|
| `role_permissions_admin` | Default permissions for all admins |
| `role_permissions_manager` | Default permissions for all managers |
| `role_permissions_agent` | Default permissions for all agents |
| `role_permissions_viewer` | Default permissions for all viewers |

An **admin** (or **superAdmin**) can:
- Read all role defaults via `GET /v1/roles/permissions`
- Update role-level defaults via `PUT /v1/roles/:role/permissions`
- Override a specific team member via `PUT /v1/users/:id/permissions`

---

## 5. How Auth Works on Every API Request

```
Request arrives at API
  ↓
auth plugin (preHandler hook) runs:
  1. Is route marked { config: { public: true } }?  → skip auth entirely
     (only used for: webhooks with their own HMAC/Svix verification,
      /register, /countries, /invitations/:token/accept, /health)
  2. Is X-Impersonate-Token header present?          → superAdmin impersonation (Redis lookup)
  3. Otherwise: verify Clerk JWT from Authorization header
  4. Check Redis cache (key: auth:user:{userId}, TTL: 60 s)
     Cache hit  → attach cached { role, organizationId, permissions } and continue
     Cache miss → proceed to DB lookups
  5. Look up User in DB (must exist AND isActive = true)
  6. Look up OrganizationMember for fine-grained permissions
  7. Write to Redis cache; set request.auth = { userId, organizationId, role, permissions }
  ↓
Route handler runs — reads request.auth.role and request.auth.permissions
```

> **Cache invalidation:** The cache is deleted immediately whenever role, permissions, or
> `isActive` changes via `/users/:id/role`, `/users/:id/permissions`, or user deletion.
> The 60 s TTL is a safety net only.

> **Why `/register` is `public: true`:** A first-time user has no DB row yet, so steps 4–5
> would always fail. The route verifies the Clerk JWT manually inside the handler instead.

### SuperAdmin Impersonation

Allows the WBMSG team to debug a specific org without knowing their credentials:

```
superAdmin issues impersonation token → stored in Redis with organizationId
Sends request with header: X-Impersonate-Token: <token>
Auth plugin reads Redis → sets role = "superAdmin" for that request
```

---

## 6. Role Management in the UI

| Action | Where |
|---|---|
| Invite a team member | Settings → Team → Invite |
| Change a member's role | Settings → Team → change role dropdown |
| Update role default permissions | Settings → Roles & Permissions |
| Override an individual member's permissions | Settings → Team → member → Permissions |

Only users with role `admin` (or `superAdmin`) can perform any of the above.

---

## 7. Key Files

| File | Purpose |
|---|---|
| `apps/web/middleware.ts` | Clerk session protection; landing-page redirect |
| `apps/web/app/(dashboard)/layout.tsx` | DB-driven onboarding gate — redirects to `/business-details` if org missing |
| `apps/web/app/(auth)/sign-in/` | Clerk SignIn UI |
| `apps/web/app/(auth)/sign-up/` | Clerk SignUp UI |
| `apps/web/app/(setup)/business-details/page.tsx` | Step 2 registration form |
| `apps/web/app/api/register/route.ts` | Next.js handler — proxies to API |
| `apps/api/src/routes/register.ts` | Creates Org + User in DB (`public: true` — new user has no DB row yet) |
| `apps/api/src/plugins/auth.ts` | JWT verification + role/permissions lookup on every non-public request |
| `apps/api/src/routes/users.ts` | User management: list, `/users/me`, change role (`PATCH /users/:id/role`), remove, update individual permissions (`PUT /users/:id/permissions`); self-modify blocked on role/delete |
| `apps/api/src/routes/roles.ts` | Role-level permission defaults CRUD |
| `apps/api/src/routes/clerk-webhook.ts` | Clerk events: org provisioning, membership, login audit log (`session.created`) |
