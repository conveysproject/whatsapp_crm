# PRD — Roles & Permissions System (RBAC)

**Status:** Draft for review
**Owner:** Platform / Auth
**Last updated:** 2026-06-22
**Module:** M1 (Auth & Multi-Tenancy)

---

## 1. Summary

WBMSG is a multi-tenant WhatsApp CRM. Every user belongs to exactly one organization and holds one role. Roles carry a set of feature permissions that govern what the user can see (frontend) and do (backend API). Admins can tune each role's permissions per-organization via the **Settings → Roles** page.

This PRD defines the **target** behaviour of the role & permission engine. It exists because the current implementation has correctness and security gaps (see §3) that produce inconsistent access across the product.

### 1.1 Core principle — Clerk is identity only

**Clerk is used for authentication only. The platform's roles and permissions live entirely in our DB and are the sole authority for access control.**

- Clerk answers exactly one question: *"who is this user?"* (a verified `userId`).
- Clerk's own org-role (`org:admin` / `org:member`) is **not** consulted for permission decisions, and **not** mirrored into our role on every request.
- Our application defines five roles (§4) stored on `User.role`. These — and only these — govern the platform.
- Clerk's admin/member distinction is used **at most once**, at provisioning time, to decide who becomes the org's first `admin`. After that, role changes happen only through our own flows (registration, invitations, admin edits).

---

## 2. Goals & Non-Goals

### Goals
- **G1** — Deterministic access: the same user + role + org always resolves to the same permission set.
- **G2** — Secure by default: a user never receives more access than their role's baseline grants. No "accidentally open" state.
- **G3** — Single source of truth: one resolution algorithm used by both frontend and backend, fed by one stored representation.
- **G4** — Admin-tunable per org: admins can override role defaults from the Roles page, and the change takes effect predictably.
- **G5** — Per-user overrides: an admin can grant/revoke a specific permission for one user without changing the whole role.
- **G6** — Backwards compatible: existing orgs (including those onboarded via Clerk, with no saved config) keep working with sensible role-appropriate access — never blanket full access, never blanket lockout.

### Non-Goals
- Custom/named roles beyond the five fixed roles (future M8 agency mode).
- Resource-level ACLs (e.g. "agent X can only see contacts they own") beyond the existing inbox `assigned_chats_only` flag.
- Field-level encryption. (Masking is in scope; encryption is not.)
- Changing Clerk as the identity provider.

---

## 3. Current State & Problems

### 3.1 How it works today
- **Identity:** Clerk issues a JWT. `auth.ts` (Fastify `preHandler`) verifies it, loads the DB `User`, resolves permissions, and attaches `request.auth = { userId, organizationId, role, permissions }`.
- **(Regression)** `auth.ts` currently also reads `org_role` from the Clerk JWT and **auto-promotes** the DB role to `admin` on every request when Clerk says `org:admin` (commit `3c24381`). This violates the §1.1 principle and must be removed.
- **Role storage:** `User.role` enum — `superAdmin | admin | manager | agent | viewer`.
- **Role defaults storage:** `VendorSetting` rows, key `role_permissions_<role>`, value = JSON map of `key → "allow"|"deny"`.
- **Per-user overrides storage:** `OrganizationMember.permissions` JSON.
- **Resolution:** `permissions = { ...roleDefaults, ...memberOverrides }`, cached in Redis `auth:user:<userId>` for 60s.
- **Enforcement:** `canAccess` / `canAccessSub` (backend `permissions.ts`, mirrored in frontend `can.ts`).

### 3.2 Confirmed defects

| ID | Defect | Severity | Effect |
|---|---|---|---|
| **D1** | `canAccess`/`canAccessSub` treat an **empty permissions object as "allow everything"** | Critical | Any role with no stored config gets full access |
| **D2** | Orgs **not** created via `/register` (onboarded via Clerk webhook — `registeredAt: null`) get **no** `role_permissions_*` rows → empty perms → D1 → every role fully open | Critical | The core "messes up the whole product" symptom |
| **D3** | The auth layer does **not** fall back to `DEFAULT_ROLE_PERMISSIONS` when a role has no saved config | Critical | Root enabler of D1/D2 |
| **D4** | `GET /roles/permissions` returns `{}` for unconfigured roles → Roles page shows an **empty grid**; saving from it produces a broken partial config | High | Admin can't see/tune real defaults |
| **D5** | `OrganizationMember` is **never created** anywhere → `PUT /users/:id/permissions` always 404s | High | Per-user overrides are a dead feature |
| **D6** | Inconsistent helper semantics: `hasSubPermission` defaults **allow** (`!== "deny"`), `canAccessSub` defaults **deny** | Medium | Contradictory behaviour where both are used |
| **D7** | `chatbots.ts` still calls `hasSubPermission` with **non-existent keys** (`manage_bot_replies`, `add_edit_bot_replies`, `delete_bot_replies`) | Medium | Dead checks that always pass |
| **D8** | `shouldHideField` checks keys (`hide_contact_phone_numbers`, `hide_contact_emails`) that **don't exist** in the grid (grid uses `hide_phone_number@hide_contact_fields`); also currently unused | Low | Masking feature non-functional |
| **D10** | `verifyToken` doesn't validate `authorizedParties` | Low | Token-audience hardening missing |
| **D11** | `auth.ts` reads Clerk JWT `org_role` and mirrors it into the DB role on every request | **High** | Violates "Clerk = identity only" (§1.1); makes Clerk's role authoritative instead of our DB |

> **Note:** the earlier "D9" (auto-sync only promotes, never demotes) is superseded by **D11** — under §1.1 we don't sync from Clerk at all, so the promote/demote question disappears.

---

## 4. Roles

Five fixed roles. `User.role` is the authoritative role for permission resolution.

| Role | Intended for | Bypasses permission checks | Has default baseline |
|---|---|---|---|
| `superAdmin` | Platform/vendor operator | **Yes** | n/a (bypass) |
| `admin` | Organization owner/admin | **Yes** | Yes (full) |
| `manager` | Team lead | No | Yes |
| `agent` | Support agent | No | Yes |
| `viewer` | Read-only stakeholder | No | Yes |

**Rules:**
- `superAdmin` and `admin` always pass every permission check (bypass). Their baseline still exists for display in the Roles grid but is not consulted for enforcement.
- **Role is read from `User.role` in the DB. It is never read from, or synced from, the Clerk JWT** (§1.1). The auth engine treats the JWT purely as proof of identity.

**Two entry paths only.** Every user enters the system either by registering (becomes admin) or by accepting an invitation (gets the invited role). Both set `User.role` through our own logic.

| Entry path | Clerk side | Our DB role | Source of role |
|---|---|---|---|
| **Register** (frontend `/register`) | becomes Clerk org **creator/admin** | `admin` | Our register flow (explicit) |
| **Invitation** (admin invites, invitee signs up) | becomes Clerk org **member** | the role the admin selected on the invite form | `Invitation.role` |
| Admin edits an existing member | unchanged | the chosen role | `PATCH /users/:id/role` |
| Platform operator | n/a | `superAdmin` | Out-of-band / impersonation token |
| Webhook fires with **no** matching invitation (abnormal safety net) | member | `agent` | Our webhook default — **not** Clerk's org-role |

- **The only admin path is `/register`.** There is no need to read Clerk's "org creator" fact — our register flow already sets the creator to `admin`.
- **Invitees:** the admin picks the DB role (`manager` / `agent` / `viewer`) on the invitation form. On accept, the invitee is Clerk `member` but carries exactly the selected platform role. Clerk's `member` status never maps to a platform role.
- The webhook `agent` default exists only for the abnormal case where a user joins the Clerk org without a matching invitation; it should not occur in the normal flow.

---

## 5. Permission Catalog

Permissions form a two-level tree. Keys are stored flat:
- **Parent:** `feature_access` (e.g. `contacts_access`)
- **Sub:** `parent@sub` (e.g. `contacts_access@contacts_export`)

Value is `"allow"` or `"deny"`. Absence of a key = not granted (deny), except where the resolution algorithm fills it from the role baseline.

| Parent | Sub-permissions | Meaning |
|---|---|---|
| `contacts_access` | `contacts_add`, `contacts_delete`, `contacts_export`, `contacts_import`, `contacts_bulk_tag`, `contacts_manage_custom_fields` | Contact Hub + actions |
| `hide_phone_number` | `hide_contact_fields` | Masking of phone/email in contact views |
| `inbox_access` | `inbox_all_conversations`, `inbox_unassigned`, `assigned_chats_only` | Inbox scope |
| `campaigns_access` | `campaigns_create`, `campaigns_export_report`, `campaigns_custom_reports`, `campaigns_manage_segments` | Campaign Manager |
| `templates_access` | `templates_create`, `templates_edit`, `templates_delete`, `templates_ai_buttons` | Template Manager |
| `settings_access` | `settings_agents`, `settings_api_key`, `settings_whatsapp`, `settings_billing`, `settings_tags` | Settings sub-pages |
| `analytics_access` | `analytics_export`, `analytics_agent_performance` | Analytics |
| `automation_access` | `automation_bot_flows`, `automation_bot_replies`, `automation_welcome_message`, `automation_export_report` | Automation |

This catalog is the **single canonical list**. The PermissionsGrid UI, `DEFAULT_ROLE_PERMISSIONS`, and all route guards must reference only these keys. (Removes D7/D8 stale keys.)

### 5.1 Special semantics
- **`hide_phone_number@hide_contact_fields`** — *inverted*: `"allow"` means **hide** the data. Enforced server-side by masking phone/email in contact responses for that user.
- **`inbox_access@assigned_chats_only`** — *restrictive*: `"allow"` means the agent sees **only** their assigned chats, regardless of `inbox_all_conversations`.

---

## 6. Permission Resolution (the engine)

A single algorithm, used identically server-side (authoritative) and mirrored client-side (UI only).

**Input `role` always comes from `User.role` (DB).** The Clerk JWT is used only to verify identity and obtain `userId`; it contributes nothing to role or permission resolution.

```
resolve(user):
  role = User.role            # DB only — never the Clerk JWT

  # 1. Role baseline — decided by ROW PRESENCE, not by content
  row = VendorSetting(organizationId, "role_permissions_" + role)
  if row exists:
      baseline = JSON.parse(row.value)          # use EXACTLY what's stored,
                                                # even if it parses to {} (= deny all)
  else:
      baseline = DEFAULT_ROLE_PERMISSIONS[role] # no row → fall back to built-in defaults

  # 2. Per-user overrides
  overrides = OrganizationMember.permissions for (user, org)      # {} if none

  # 3. Merge — overrides win
  effective = { ...baseline, ...overrides }
  return effective
```

**Fallback rule (confirmed):**

| `role_permissions_<role>` row | Result |
|---|---|
| **Absent** | Fall back to `DEFAULT_ROLE_PERMISSIONS[role]` |
| **Present** (any content, incl. `{}`) | Use exactly what's stored — an empty object means *deny all* for that role |

> Implementation note: distinguish **row is `null`** (→ defaults) from **row exists with `value = "{}"`** (→ deny all). A corrupted/unparseable `value` is treated as `{}` (deny all), since the row exists and was intentionally written.

**Enforcement primitives** (deny-by-default; fixes D1):

```
canAccess(role, perms, parent):
  if role in (admin, superAdmin): return true        # bypass
  return perms[parent] == "allow"

canAccessSub(role, perms, parent, sub):
  if role in (admin, superAdmin): return true        # bypass
  if perms[parent] != "allow": return false
  return perms[parent + "@" + sub] == "allow"
```

**Key change vs today:** the "empty perms = allow" branch is removed. It is safe to remove **because** step 1 guarantees a non-admin role always resolves to its `DEFAULT_ROLE_PERMISSIONS` baseline when nothing is saved. Net effect: no org is ever blanket-open, and no legitimate user is ever blanket-locked-out.

**Deprecate** `hasPermission`, `hasSubPermission` (D6). All routes use `canAccess` / `canAccessSub` only.

---

## 7. Data Model

No schema migration required; all tables already exist.

| Table | Field | Role in system |
|---|---|---|
| `User` | `role` | Authoritative role for resolution |
| `User` | `organizationId`, `isActive` | Tenant scope + soft-delete |
| `VendorSetting` | key `role_permissions_<role>`, `value` (JSON) | Per-org role baseline override |
| `OrganizationMember` | `permissions` (JSON), unique `(organizationId, userId)` | Per-user permission override |

**New requirement:** `OrganizationMember` must exist for any user who has overrides. The override route (`PUT /users/:id/permissions`) must **upsert** it (fixes D5).

---

## 8. API Surface

| Method | Route | Auth | Behaviour |
|---|---|---|---|
| GET | `/v1/users/me` | any member | Returns `{ id, role, permissions }` with the **resolved effective** permissions |
| GET | `/v1/roles/permissions` | admin only | Returns each role's **effective baseline**: saved config if present, else `DEFAULT_ROLE_PERMISSIONS` (fixes D4) |
| PUT | `/v1/roles/:role/permissions` | admin only | Saves role baseline to `VendorSetting`; invalidates `auth:user:*` for all affected users |
| GET | `/v1/users` | any member | Lists members with their per-user override map |
| PATCH | `/v1/users/:id/role` | admin only | Changes a member's role; invalidates that user's cache |
| PUT | `/v1/users/:id/permissions` | admin only | **Upserts** `OrganizationMember.permissions`; invalidates that user's cache (fixes D5) |
| DELETE | `/v1/users/:id` | admin only | Soft-deletes (deactivates) the member; invalidates cache |

**Caching:** resolved permissions cached in Redis `auth:user:<userId>` (TTL 60s). Every mutation above must invalidate the affected user key(s) immediately; the TTL is only a safety net.

---

## 9. Enforcement Map (must stay in sync)

Every guarded surface checks the canonical key. Frontend hides UI; backend enforces. Backend is authoritative; frontend is convenience only.

| Surface | Frontend check | Backend route(s) |
|---|---|---|
| Add contact | `canAccessSub(contacts_access, contacts_add)` | `POST /contacts` |
| Delete contact | `canAccessSub(contacts_access, contacts_delete)` | `DELETE /contacts/:id`, `/bulk` |
| Export contacts | `canAccessSub(contacts_access, contacts_export)` | `GET /contacts/export` |
| Import contacts | `canAccessSub(contacts_access, contacts_import)` | `POST /contacts/import` |
| Bulk tag | `canAccessSub(contacts_access, contacts_bulk_tag)` | *(add guard)* |
| Custom fields / lead statuses | `canAccessSub(contacts_access, contacts_manage_custom_fields)` | `/custom-fields`, `/lead-statuses` writes |
| Contact groups | `canAccess(contacts_access)` | `/contact-groups` writes |
| Segments | `canAccessSub(campaigns_access, campaigns_manage_segments)` | `/segments` writes |
| Create campaign | `canAccess(campaigns_access)` (page) | `POST /campaigns` → `campaigns_create` |
| Templates create/edit/delete | per sub-key | `POST`/`DELETE /templates` |
| Bot flows | `canAccessSub(automation_access, automation_bot_flows)` | `POST /flows`, `/chatbots` writes |
| Auto-replies / canned | `canAccessSub(automation_access, automation_bot_replies)` | `/auto-replies`, `/canned-responses` writes |
| Inbox send | — | `POST /messages` → `inbox_access` |
| WhatsApp setup | — | `/whatsapp-account` → `settings_access@settings_whatsapp` |
| Vendor settings | — | `/vendor-settings` → `settings_access` |
| Analytics team tab | `canAccessSub(analytics_access, analytics_agent_performance)` | *(add guard)* |
| Roles / members admin | `isAdmin` | admin-only routes |

Gaps marked *(add guard)* are tracked but not all blocking for this PRD's core fix.

---

## 10. Onboarding & Seeding

### 10.1 Register (admin)
Frontend `/register` → create org + creating user with role `admin` (explicit), seed `DEFAULT_ROLE_PERMISSIONS` into `VendorSetting`. This is the **only** way an `admin` is created. (Already implemented.)

### 10.2 Invitation (member with selected role)
1. Admin opens the invite form, enters email, and **selects a platform role** (`manager` / `agent` / `viewer`).
2. We persist an `Invitation` row with that role and email; an invite email is sent.
3. The invitee signs up via Clerk (joining the Clerk org as a **member**) and accepts.
4. On accept, the user is created/activated in our DB with `User.role = Invitation.role`, and the invitation is marked `accepted`.
5. The Clerk webhook `organizationMembership.created` is reconciled against the pending invitation **by email**: role from `Invitation.role`, else `agent` (safety net). **No mapping from Clerk's `org:admin` / `org:member`.**

> The accept-route and the webhook must agree: both derive role from the invitation, so whichever runs first sets the same role.

### 10.3 Existing data
- **Orgs with no permission rows:** no migration needed — the read-time fallback (§6) makes them correct immediately.
- **One-time role correction:** any org whose creator is currently not `admin` (e.g. provisioned before this PRD, like an org with `registeredAt: null`) gets its creator promoted to `admin` via a one-off data fix. After that, the JWT auto-sync (D11) is removed entirely.

---

## 11. Security Requirements

- **S1** — Backend is the sole enforcement point. Frontend checks never substitute for server checks.
- **S2** — Deny-by-default for non-admin roles (no empty-open state).
- **S3** — All Prisma queries org-scoped by `organizationId` (existing project rule).
- **S4** — Cache entries keyed by user; invalidated on every role/permission/role-membership mutation.
- **S5** — `superAdmin` bypass reserved for platform operators and impersonation tokens only.
- **S6** *(hardening, optional)* — `verifyToken` validates `authorizedParties` (D10).
- **S7** — The auth engine must **not** read role/authorization claims from the Clerk JWT. Clerk verifies identity only (§1.1, D11).

---

## 12. Acceptance Criteria

1. An org with **no** `role_permissions_agent` row: an `agent` user can do exactly what the `agent` **default** baseline allows — **not** everything. (D1/D2/D3)
2. `GET /roles/permissions` for such an org returns the **default** baseline for each role that has no row, not `{}`. (D4)
2a. An org that has explicitly **saved** `role_permissions_agent = {}`: a non-admin `agent` user is **denied** every guarded action for that role (empty stored config = deny all). (§6 fallback rule)
3. Saving a role in the Roles page takes effect within one request after cache invalidation. (S4)
4. `PUT /users/:id/permissions` succeeds for a member with no prior `OrganizationMember` row (upsert), and the override is reflected in `/users/me`. (D5)
5. `admin` and `superAdmin` retain full access regardless of stored config. (bypass)
6. No route references a permission key outside the §5 catalog. (D6/D7/D8)
7. All existing API tests pass (they use `role: "admin"`, so bypass keeps them green).

---

## 13. Rollout Plan

1. **Remove the Clerk-role dependency (D11):** strip `org_role` reading and the JWT auto-sync from `auth.ts`; revert `verifyClerkToken` to return identity only. Role is read from `User.role` only.
2. **One-time data fix:** promote each org's creator to `admin` where the org currently has no admin (covers users provisioned as `agent` before this change).
3. Fix webhook role assignment: invitation role → else default `agent` (no Clerk-role mapping); add the initial-admin backstop.
4. Add `defaultsForRole(role)` helper to `default-role-permissions.ts`.
5. Update `auth.ts` resolution to fall back to `defaultsForRole(role)` when no `VendorSetting`.
6. Remove empty-open branch from `canAccess` / `canAccessSub`; delete/deprecate `hasPermission` / `hasSubPermission`.
7. Update `GET /roles/permissions` to return defaults fallback.
8. Make `PUT /users/:id/permissions` upsert `OrganizationMember`.
9. Replace stale-key checks in `chatbots.ts`; fix/relocate `shouldHideField` keys (or remove if unused).
10. Type-check + run API tests + targeted manual verification (agent in an unconfigured org; admin via DB role only).
11. Ship behind normal deploy; no schema migration; read-time fallback covers existing data.

---

## 14. Open Questions

**Resolved by product owner:**
- **Entry paths:** register → `admin`; invitation → admin-selected role. Clerk role (creator/member) never maps to a platform role. *(§4, §10)*
- **Initial admin:** only via `/register`; no Clerk-creator backstop needed.
- **Fallback rule:** absent `role_permissions_<role>` row → built-in defaults; present row (even `{}`) → used exactly as stored (`{}` = deny all). *(§6)*

**Still open:**
1. **Masking scope:** which endpoints honour `hide_phone_number@hide_contact_fields`? Needs a concrete list before implementing D8. *(Non-blocking; can defer.)*
