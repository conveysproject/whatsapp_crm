# PRD — Roles & Permissions System (RBAC)

**Status:** Phase 1 (engine + action guards) deployed; **Phase 2 (section-view enforcement) — IN PROGRESS**
**Owner:** Platform / Auth
**Last updated:** 2026-06-24
**Module:** M1 (Auth & Multi-Tenancy)

> **Phase 1 outcome (2026-06-23):** the permission **engine** and **action** guards shipped (D1–D7, D11, D12 fixed @ `ef29c3a`). Role resolution, deny-by-default, default fallback, per-user overrides, and write-action guards (create/edit/delete/export) are live.
>
> **Phase 2 — section-view enforcement (this update, §6.1 + D13–D15):** Phase 1 deliberately gated only *actions* (the "do" layer). It did **not** gate *seeing* a section (nav, page view, backend reads). As a result a role without `campaigns_access` still sees the Campaigns nav item, opens the page, and the API returns the data. Phase 2 makes an **unchecked permission strictly hide and block** the whole section across all layers (see §6.1). This is the work tracked by D13–D15.
>
> Deferred (non-blocking): D8 masking, D10 `authorizedParties`.

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
| **D12** | Clerk webhook `organizationMembership.created` sets `role` on its **update** path too, so an admin created via `/register` is demoted to `agent` (the default) when the membership event later fires with no invitation | **High** | **The true root cause of the "admin sees Access Denied" report.** Found in final review; fixed by only setting role from a pending invitation on update, never the default |
| **D13** | **Sidebar navigation is not permission-aware** — every role sees every nav item (Campaigns, Flows, Analytics, Settings, …) regardless of permissions | **High** | Restricted roles see links to sections they have no access to |
| **D14** | **No page-view guard** — opening a section URL (e.g. `/campaigns`) renders the page for anyone with a session; only write *buttons* are hidden | **High** | Restricted roles can open restricted pages by URL |
| **D15** | **No backend read guard** — list/read endpoints (`GET /campaigns`, `/templates`, `/flows`, `/analytics/*`, …) have no permission check; only writes are gated | **Critical** | Restricted roles can fetch restricted data directly from the API — actual data exposure |

> **Status:** D1–D7, D11, D12 are **fixed & deployed** (2026-06-23). **D13–D15 are the Phase 2 work (§6.1), in progress.** D8 (masking) and D10 (`authorizedParties`) are deferred. The earlier "D9" (auto-sync promote/demote) is moot under §1.1 — we no longer sync from Clerk.

> **Sidebar (D13) update (2026-06-24):** the sidebar is now permission-gated (`Sidebar.tsx`). D14 (page-view guards) and D15 (backend read guards) remain.

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

### 4.1 Who can edit which roles (role-management hierarchy)

On the **Settings → Roles** page, a user may only modify roles **strictly below** their own in the hierarchy (`superAdmin > admin > manager > agent > viewer`). **Self-modification is disabled** — you can never edit your own role's permissions (or any role above you).

| Actor | Can edit | Cannot edit |
|---|---|---|
| `superAdmin` | admin, manager, agent, viewer | superAdmin (self) |
| `admin` | manager, agent, viewer | admin (self), superAdmin |
| manager / agent / viewer | — | (no access to the Roles page at all) |

Enforced in two places:
- **Backend (authoritative):** `GET /roles/permissions` returns only the actor's editable roles; `PUT /roles/:role/permissions` returns 403 if the target role is not strictly below the actor (`editableRolesFor(actorRole)` in `roles.ts`).
- **Frontend:** the Roles page renders tabs only for editable roles and defaults to the highest editable role.

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

### 6.1 Strict section enforcement (Phase 2 — D13–D15)

A permission checkbox in the Roles grid is binding in **both directions**, across **every layer**:

1. **Unchecked → the role cannot SEE or DO anything in that section.** Unchecking a parent (`<feature>_access`) strictly removes the whole section for that role: the nav item is hidden, the page returns Access Denied, the backend read/list endpoints return 403, and every action in it is blocked. Unchecking a sub (`<feature>_access@<action>`) blocks just that action while the section stays visible.
2. **Checked → allowed.** A checked parent grants visibility of the section; a checked sub grants that specific action (a sub requires its parent to also be checked — `canAccessSub`).
3. **No stored config → apply defaults.** If the org has no `role_permissions_<role>` row, fall back to `DEFAULT_ROLE_PERMISSIONS[role]` (the §6 fallback rule). New orgs created via `/register` are seeded with defaults; orgs onboarded another way have no row and are covered by the read-time fallback. A row that *exists* is used exactly as stored (even `{}` = deny all) — defaults are **not** re-merged into an existing row.

**The four enforcement layers (all must agree on the parent `<feature>_access` key):**

| Layer | Rule | Backend/Frontend |
|---|---|---|
| **Navigation** | Hide the nav item when `canAccess(parent)` is false | Frontend (`Sidebar.tsx`) — D13 ✅ |
| **Page view** | Opening the route shows Access Denied when `canAccess(parent)` is false | Frontend page guard — D14 |
| **Backend read** | `GET`/list endpoints return 403 when `canAccess(parent)` is false | Backend (authoritative) — D15 |
| **Actions** | `POST`/`PATCH`/`DELETE` and write buttons gated by the relevant sub (`canAccessSub`) | Backend + Frontend — Phase 1 ✅ |

**Authority:** the **backend read + action guards** are the real security boundary. Nav + page-view guards are UX so a restricted user never reaches a dead end — they do **not** replace the backend checks. A direct API call without the parent permission must always 403, independent of the UI.

**Section → parent key map** (the keys each section is gated by):

| Section | Parent key | Notes |
|---|---|---|
| Inbox, Message Log | `inbox_access` | |
| Contacts (All, Groups, Import) | `contacts_access` | Segments is gated by `campaigns_access` (segments live under campaigns) |
| Campaigns | `campaigns_access` | |
| Templates | `templates_access` | |
| Flows / Automation | `automation_access` | |
| Analytics | `analytics_access` | |
| Settings | `settings_access` | sub-pages further gated by `settings_*` subs |
| Deals, Trust Score | *(no key yet)* | Open to all until a key is added — tracked as an open question (§14) |

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

**Section-view enforcement (Phase 2, D13–D15)** — each section gated by its parent key at all three layers:

| Section (parent key) | Nav (D13) | Page view (D14) | Backend read (D15) |
|---|---|---|---|
| Inbox / Message Log (`inbox_access`) | ✅ | `GET` conversations/messages → 403 | guard list endpoints |
| Contacts (`contacts_access`) | ✅ | `/contacts*` Access Denied | `GET /contacts*` → 403 |
| Campaigns (`campaigns_access`) | ✅ | `/campaigns` Access Denied | `GET /campaigns*` → 403 |
| Templates (`templates_access`) | ✅ | `/templates` Access Denied | `GET /templates*` → 403 |
| Flows (`automation_access`) | ✅ | `/flows` Access Denied | `GET /flows`, `/chatbots`, `/auto-replies` → 403 |
| Analytics (`analytics_access`) | ✅ | `/analytics` Access Denied | `GET /analytics/*` → 403 |
| Settings (`settings_access`) | ✅ | `/settings*` Access Denied | settings read endpoints → 403 |

✅ = nav done (2026-06-24). Page-view (D14) and backend-read (D15) guards pending.

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
- **One-time role correction:** script `apps/api/scripts/fix-missing-org-admins.mjs` promotes each admin-less org's oldest active user to `admin` (dry-run by default; `--apply` to write). **Outcome (2026-06-23):** dry-run against production reported **0 orgs to fix** — every org already had an admin (the now-removed D11 JWT auto-sync had already promoted the affected user), so no `--apply` was needed. The JWT auto-sync (D11) is now removed entirely.

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

**Phase 2 — strict section enforcement (D13–D15, §6.1):**

8. With `campaigns_access` **unchecked** for a role, a user in that role: (a) does **not** see Campaigns in the nav, (b) gets **Access Denied** opening `/campaigns`, and (c) `GET /campaigns` returns **403** for them. (D13/D14/D15)
9. With `campaigns_access` **checked**, the same user sees the nav item, opens the page, and `GET /campaigns` returns 200 — while individual actions remain gated by their subs (e.g. create needs `campaigns_create`). (§6.1)
10. The same hold for every keyed section (Inbox, Contacts, Templates, Flows, Analytics, Settings). A direct API read without the parent key is always 403, regardless of the UI. (S1)
11. `admin`/`superAdmin` continue to see and reach every section (bypass). A role with **no stored row** sees exactly what its `DEFAULT_ROLE_PERMISSIONS` baseline grants. (§6 fallback)

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

### 13.1 Phase 2 rollout (section-view enforcement, D13–D15)

1. **Sidebar gating (D13):** filter nav items by `canAccess(parent)`. ✅ done (2026-06-24).
2. **Backend read guards (D15) — do first, it's the real boundary:** add `canAccess(role, permissions, parent)` to the list/read endpoints of each keyed section (`GET /campaigns*`, `/templates*`, `/flows`, `/chatbots`, `/auto-replies`, `/analytics/*`, `/contacts*`, conversations/messages, settings reads). Verify the agent/viewer defaults still permit their legitimate sections (e.g. agent keeps `contacts_access`, `inbox_access`, `templates_access`).
3. **Page-view guards (D14):** a reusable `PermissionGate` (frontend) wrapping each keyed page; renders Access Denied when `canAccess(parent)` is false. Works for both client and server pages by wrapping rendered children.
4. **Tests:** per-section — unchecked → 403/Access Denied/hidden; checked → 200/visible; admin bypass; default fallback.
5. **Verify** as an actual agent/viewer in the browser + direct API calls; ship.

---

## 14. Open Questions

**Resolved by product owner:**
- **Entry paths:** register → `admin`; invitation → admin-selected role. Clerk role (creator/member) never maps to a platform role. *(§4, §10)*
- **Initial admin:** only via `/register`; no Clerk-creator backstop needed.
- **Fallback rule:** absent `role_permissions_<role>` row → built-in defaults; present row (even `{}`) → used exactly as stored (`{}` = deny all). *(§6)*

**Still open:**
1. **Keyless sections (Deals, Trust Score):** they have no permission key in the catalog. Options: (a) leave visible to all for now, (b) admin-only, or (c) add `deals_access` / `trust_score_access` keys to the catalog + grid + defaults and gate them like the rest. Message Log is treated as `inbox_access`. *(Blocks only Deals/Trust Score gating, not the keyed sections.)*
2. **Masking scope:** which endpoints honour `hide_phone_number@hide_contact_fields`? Needs a concrete list before implementing D8. *(Non-blocking; can defer.)*
