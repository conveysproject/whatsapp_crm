# PRD — Roles & Permissions System (RBAC)

**Status:** Phase 1 (engine + action guards) deployed ✅ · **Phase 2 (section-view enforcement) — COMPLETE ✅** (all 9 keyed sections: Campaigns, Contacts, Templates, Flows, Analytics, Inbox + Message Log, Settings, Deals, Trust Score)
**Owner:** Platform / Auth
**Last updated:** 2026-06-24
**Module:** M1 (Auth & Multi-Tenancy)

> **Phase 1 outcome (2026-06-23):** the permission **engine** and **action** guards shipped (D1–D7, D11, D12 fixed @ `ef29c3a`). Role resolution, deny-by-default, default fallback, per-user overrides, and write-action guards (create/edit/delete/export) are live.
>
> **Phase 2 — section-view enforcement (§6.1 + D13–D15):** Phase 1 gated only *actions* (the "do" layer). Phase 2 makes an **unchecked parent permission strictly hide and block** the entire section across all three layers (nav, page, backend read). All 9 keyed sections complete (2026-06-24): Campaigns, Contacts, Templates, Flows, Analytics, Inbox + Message Log, Settings, Deals, Trust Score.
>
> Deferred (non-blocking): D10 `authorizedParties`. D8 masking **fixed 2026-06-24**.

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
| **D8** | `shouldHideField` checks keys (`hide_contact_phone_numbers`, `hide_contact_emails`) that **don't exist** in the grid (grid uses `hide_phone_number@hide_contact_fields`); also currently unused | Low | ~~Masking feature non-functional~~ **Fixed 2026-06-24** — all routes now check `hide_phone_number@hide_contact_fields`; stale keys removed from admin defaults |
| **D10** | `verifyToken` doesn't validate `authorizedParties` | Low | Token-audience hardening missing |
| **D11** | `auth.ts` reads Clerk JWT `org_role` and mirrors it into the DB role on every request | **High** | Violates "Clerk = identity only" (§1.1); makes Clerk's role authoritative instead of our DB |
| **D12** | Clerk webhook `organizationMembership.created` sets `role` on its **update** path too, so an admin created via `/register` is demoted to `agent` (the default) when the membership event later fires with no invitation | **High** | **The true root cause of the "admin sees Access Denied" report.** Found in final review; fixed by only setting role from a pending invitation on update, never the default |
| **D13** | **Sidebar navigation is not permission-aware** — every role sees every nav item (Campaigns, Flows, Analytics, Settings, …) regardless of permissions | **High** | ~~Restricted roles see links to sections they have no access to~~ **Fixed Phase 2 (2026-06-24)** |
| **D14** | **No page-view guard** — opening a section URL (e.g. `/campaigns`) renders the page for anyone with a session; only write *buttons* are hidden | **High** | ~~Restricted roles can open restricted pages by URL~~ **Fixed Phase 2 (2026-06-24)** |
| **D15** | **No backend read guard** — list/read endpoints (`GET /campaigns`, `/templates`, `/flows`, `/analytics/*`, …) have no permission check; only writes are gated | **Critical** | ~~Restricted roles can fetch restricted data directly from the API — actual data exposure~~ **Fixed Phase 2 (2026-06-24)** |

> **Status:** D1–D8, D11, D12 are **fixed & deployed**. D13, D14, D15 ✅ done for all 9 sections. D10 (`authorizedParties`) remains deferred. D9 is moot under §1.1.

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
| `campaigns_access` | `campaigns_create`, `campaigns_pause_resume`, `campaigns_abort`, `campaigns_archive`, `campaigns_delete`, `campaigns_export_report` | Campaign Manager (each action has its own sub) |
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

**This is a universal rule — it applies uniformly to EVERY section and EVERY permission key in the catalog (§5), not a hand-picked subset.** Every parent (`<feature>_access`) and every sub (`<feature>_access@<action>`) in the Roles grid behaves identically under the rules below. No section is exempt, and any section added to the grid in the future inherits the same behaviour automatically. The per-section tables in this doc are **illustrative examples**, not the scope — the scope is "all of them."

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

**Full nav → parent key map** (all 11 sidebar sections; see `Sidebar.tsx` NAV array):

| # | Nav label | Route(s) | Parent key | Gated? |
|---|---|---|---|---|
| 1 | Dashboard | `/dashboard` | *(none)* | No — visible to all roles |
| 2 | Inbox | `/inbox` | `inbox_access` | Yes |
| 3 | Message Log | `/messages` | `inbox_access` | Yes — shares Inbox's key |
| 4 | Contacts (+ All / Groups / Segments / Import) | `/contacts*` | `contacts_access` | Yes |
| 5 | Campaigns | `/campaigns*` | `campaigns_access` | Yes |
| 6 | Templates | `/templates*` | `templates_access` | Yes |
| 7 | Flows | `/flows*` | `automation_access` | Yes |
| 8 | Deals | `/deals` | *(none)* | No — visible to all roles |
| 9 | Analytics | `/analytics*` | `analytics_access` | Yes |
| 10 | Trust Score | `/trust-score` | *(none)* | No — visible to all roles |
| 11 | Settings | `/settings*` | `settings_access` | Yes — sub-pages further gated by `settings_*` subs |

**Sections with no key (Dashboard, Deals, Trust Score)** are open to all roles by design for now. Adding a permission key to them is tracked as an open question (§14).

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
| Segments | `canAccess(contacts_access)` | `/segments` writes |
| Create / edit campaign | `canAccessSub(campaigns_access, campaigns_create)` | `POST /campaigns`, `PATCH /campaigns/:id`, `POST /campaigns/:id/schedule` |
| Pause / Resume / Requeue | `canAccessSub(campaigns_access, campaigns_pause_resume)` | `POST /campaigns/:id/pause`, `/resume`, `/requeue-failed` |
| Abort campaign | `canAccessSub(campaigns_access, campaigns_abort)` | `POST /campaigns/:id/abort` |
| Archive / Unarchive | `canAccessSub(campaigns_access, campaigns_archive)` | `POST /campaigns/:id/archive`, `/unarchive` |
| Delete campaign | `canAccessSub(campaigns_access, campaigns_delete)` | `DELETE /campaigns/:id` |
| Export campaign report | `canAccessSub(campaigns_access, campaigns_export_report)` | `GET /campaigns/:id/export`, `/queue-log-export`, `/expired-log-export` |
| Templates create/edit/delete | per sub-key | `POST`/`DELETE /templates` |
| Bot flows | `canAccessSub(automation_access, automation_bot_flows)` | `POST /flows`, `/chatbots` writes |
| Auto-replies / canned | `canAccessSub(automation_access, automation_bot_replies)` | `/auto-replies`, `/canned-responses` writes |
| Inbox send | — | `POST /messages` → `inbox_access` |
| WhatsApp setup | — | `/whatsapp-account` → `settings_access@settings_whatsapp` |
| Vendor settings | — | `/vendor-settings` → `settings_access` |
| Analytics team tab | `canAccessSub(analytics_access, analytics_agent_performance)` | *(add guard)* |
| Roles / members admin | `isAdmin` | admin-only routes |

Gaps marked *(add guard)* are tracked but not all blocking for this PRD's core fix.

**Section-view enforcement (Phase 2, D13–D15)** — all 11 nav sections:

| # | Section | Parent key | Nav (D13) | Page (D14) | Backend (D15) | Action subs |
|---|---|---|---|---|---|---|
| 1 | Dashboard | *(none)* | N/A — no key | N/A | N/A | N/A |
| 2 | Inbox | `inbox_access` | ✅ | ✅ | ✅ | ✅ Phase 1 |
| 3 | Message Log | `inbox_access` | ✅ | ✅ | ✅ | ✅ Phase 1 |
| 4 | Contacts | `contacts_access` | ✅ | ✅ | ✅ | ✅ Phase 1 |
| 5 | Campaigns | `campaigns_access` | ✅ | ✅ | ✅ | ✅ all 6 subs |
| 6 | Templates | `templates_access` | ✅ | ✅ | ✅ | ✅ Phase 1 |
| 7 | Flows | `automation_access` | ✅ | ✅ | ✅ | ✅ Phase 1 |
| 8 | Deals | *(none)* | N/A — no key | N/A | N/A | N/A |
| 9 | Analytics | `analytics_access` | ✅ | ✅ | ✅ | ✅ Phase 1 |
| 10 | Trust Score | *(none)* | N/A — no key | N/A | N/A | N/A |
| 11 | Settings | `settings_access` | ✅ | ✅ | ✅ | ✅ Phase 1 |

**Dashboard / Deals / Trust Score:** no permission key; always visible to all roles. Phase 2 does not apply until a key is added (§14).

See §13.2 for the per-section 8-point checklist and implementation order.

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

8. ✅ **Campaigns (confirmed 2026-06-24):** With `campaigns_access` **unchecked**, a user in that role: (a) does not see Campaigns in nav, (b) gets Access Denied opening `/campaigns`, (c) `GET /campaigns` returns 403. With it **checked**, section is visible and accessible; individual actions gated by their subs (`campaigns_create`, `campaigns_pause_resume`, `campaigns_abort`, `campaigns_archive`, `campaigns_delete`, `campaigns_export_report`).
9. ✅ **All remaining sections complete (2026-06-24):** the same three-layer enforcement now covers Contacts, Templates, Flows/Automation, Analytics, Inbox + Message Log, and Settings (§13.2).
10. A direct API read without the parent key always returns 403, regardless of the UI state. (S1)
11. `admin`/`superAdmin` continue to see and reach every section (bypass). A role with no stored row sees exactly what its `DEFAULT_ROLE_PERMISSIONS` baseline grants. (§6 fallback)

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

1. **Sidebar gating (D13):** filter nav items by `canAccess(parent)`. ✅ done for all sections (2026-06-24).
2. **Pilot on Campaigns:** all 8 checklist items (§13.2) applied and confirmed. ✅ done (2026-06-24).
3. **Remaining sections:** ✅ All complete (2026-06-24) — Contacts → Templates → Flows → Analytics → Inbox → Settings applied in order.

### 13.2 Phase 2 — Per-section 8-point checklist

Every section follows the same 8-point pattern piloted on Campaigns. Each item must be completed for a section to be considered Phase 2 complete.

| # | Item | What it means |
|---|---|---|
| 1 | **Sidebar nav** | Add `perm: "<parent_key>"` to the nav item in `Sidebar.tsx` — hidden when `canAccess(parent)` is false |
| 2 | **Page view guard (D14)** | Wrap page with `<PermissionGate permission="<parent_key>">` — shows Access Denied if parent off |
| 3 | **Backend read gate (D15)** | Add `preHandler` hook to the section router — all `GET *` return 403 if `canAccess(parent)` false |
| 4 | **Granular action subs** | Each write action in the section has its own sub-key; backend route + frontend button each check it |
| 5 | **Cleanup** | Remove or relocate any stale / wrong-section permission keys; verify grid matches live keys |
| 6 | **Tests** | Add tests: section gate blocks without parent, passes with parent; admin bypass; each sub blocks/allows independently |
| 7 | **Defaults updated** | `DEFAULT_ROLE_PERMISSIONS` in `default-role-permissions.ts` reflects any new subs (admin + manager at minimum) |
| 8 | **Docs updated** | `auth-and-permissions.md` §5 key reference and §10 action guard table current; PRD §9 status updated |

---

#### Dashboard — ⛔ No permission key (always visible)

No `perm` field in the nav. Dashboard is open to all roles by design. Phase 2 does not apply until a `dashboard_access` key is added to the catalog and grid. Tracked in §14.

---

#### Campaigns — ✅ Complete (confirmed 2026-06-24)

| # | Item | Status | Notes |
|---|---|---|---|
| 1 | Sidebar nav | ✅ | `perm: "campaigns_access"` on nav item |
| 2 | Page view guard | ✅ | `PermissionGate` on list, new, and edit pages |
| 3 | Backend read gate | ✅ | `preHandler` on campaigns router |
| 4 | Granular action subs | ✅ | 6 subs: create, pause_resume, abort, archive, delete, export_report |
| 5 | Cleanup | ✅ | Removed `campaigns_manage_segments` (→ contacts), `campaigns_custom_reports` (no feature) |
| 6 | Tests | ✅ | 8 tests: section gate + all 6 subs + admin bypass (40 total passing) |
| 7 | Defaults updated | ✅ | Admin + manager defaults include all 6 new subs |
| 8 | Docs updated | ✅ | Both docs current |

---

#### Contacts — ✅ Complete (2026-06-24)

| # | Item | Status | Notes |
|---|---|---|---|
| 1 | Sidebar nav | ✅ | `perm: "contacts_access"` on nav item and all children (incl. Segments) |
| 2 | Page view guard | ✅ | `PermissionGate permission="contacts_access"` on `/contacts`, `/contacts/groups`, `/contacts/segments`, `/contacts/import` |
| 3 | Backend read gate | ✅ | `preHandler` on contacts router — `GET /contacts*` → 403 without `contacts_access` |
| 4 | Granular action subs | ✅ | Phase 1: add, delete, export, import, bulk_tag, manage_custom_fields — each route has its sub check |
| 5 | Cleanup | ✅ | `campaigns_manage_segments` removed; Segments now gated by `contacts_access` parent only |
| 6 | Tests | ✅ | 5 tests: section gate blocks/allows; contacts_export sub; contacts_delete sub; admin bypass |
| 7 | Defaults updated | ✅ | Admin + manager defaults correct |
| 8 | Docs updated | ✅ | PRD + auth doc updated |

---

#### Templates — ✅ Complete (2026-06-24)

| # | Item | Status | Notes |
|---|---|---|---|
| 1 | Sidebar nav | ✅ | `perm: "templates_access"` on nav item |
| 2 | Page view guard | ✅ | `PermissionGate permission="templates_access"` on `/templates`; `sub="templates_create"` on `/templates/new` |
| 3 | Backend read gate | ✅ | `preHandler` on templates router — `GET /templates*` → 403 without `templates_access` |
| 4 | Granular action subs | ✅ | Phase 1: create, edit, delete, ai_buttons — each route has its sub check |
| 5 | Cleanup | ✅ | No stale keys |
| 6 | Tests | ✅ | 5 tests: section gate blocks/allows; templates_create sub; templates_delete sub; admin bypass |
| 7 | Defaults updated | ✅ | Admin + manager defaults correct; agent has `templates_access` parent only |
| 8 | Docs updated | ✅ | PRD + auth doc updated |

---

#### Flows / Automation — ✅ Complete (2026-06-24)

| # | Item | Status | Notes |
|---|---|---|---|
| 1 | Sidebar nav | ✅ | `perm: "automation_access"` on nav item |
| 2 | Page view guard | ✅ | `PermissionGate permission="automation_access"` on `/flows`, `/flows/new`, `/flows/[id]` |
| 3 | Backend read gate | ✅ | `preHandler` on all 4 automation routers (flows, chatbots, auto-replies, canned-responses) → 403 without `automation_access` |
| 4 | Granular action subs | ✅ | Phase 1: bot_flows, bot_replies, welcome_message, export_report — each route has its sub check |
| 5 | Cleanup | ✅ | D7 stale keys (`manage_bot_replies` etc.) removed in Phase 1 |
| 6 | Tests | ✅ | 4 tests: section gate blocks/allows; automation_bot_flows create sub; admin bypass |
| 7 | Defaults updated | ✅ | Admin + manager defaults correct; agent has no automation access by default |
| 8 | Docs updated | ✅ | PRD + auth doc updated |

---

#### Analytics — ✅ Complete (2026-06-24)

| # | Item | Status | Notes |
|---|---|---|---|
| 1 | Sidebar nav | ✅ | `perm: "analytics_access"` on nav item |
| 2 | Page view guard | ✅ | `PermissionGate permission="analytics_access"` on `/analytics` and `/analytics/predictive` |
| 3 | Backend read gate | ✅ | `preHandler` on analytics router — `GET /analytics/*` → 403 without `analytics_access` |
| 4 | Granular action subs | ✅ | Phase 2: `/analytics/team` uses `canAccessSub(analytics_agent_performance)`; `/analytics/export` uses `canAccessSub(analytics_export)` — replaced old hardcoded role checks |
| 5 | Cleanup | ✅ | No stale keys |
| 6 | Tests | ✅ | 8 tests: section gate blocks/allows/admin-bypass; sub gate blocks/allows for analytics_agent_performance + analytics_export; admin bypass sub gate (+ Redis cache mocked) |
| 7 | Defaults updated | ✅ | Admin + manager defaults correct; viewer has parent only (read dashboards, no export) |
| 8 | Docs updated | ✅ | PRD + auth doc updated |

---

#### Inbox + Message Log — ✅ Complete (2026-06-24)

Both `/inbox` and `/messages` share `inbox_access` as their parent key (`Sidebar.tsx` lines 31–32).

| # | Item | Status | Notes |
|---|---|---|---|
| 1 | Sidebar nav | ✅ | `perm: "inbox_access"` on both Inbox and Message Log nav items |
| 2 | Page view guard | ✅ | `PermissionGate permission="inbox_access"` on both `/inbox` and `/messages` pages |
| 3 | Backend read gate | ✅ | `preHandler` on `conversationsRouter` and `messagesRouter` — `GET /conversations*` and `GET /messages*` → 403 without `inbox_access` |
| 4 | Granular action subs | ✅ | Phase 1: inbox_all_conversations, inbox_unassigned, assigned_chats_only — view-scope subs; tab/filter visibility respects each sub |
| 5 | Cleanup | ✅ | No stale keys |
| 6 | Tests | ✅ | 3 tests: section gate blocks/allows on conversations route; admin bypass |
| 7 | Defaults updated | ✅ | Agent: unassigned + assigned_chats_only; manager: all + unassigned; viewer: all_conversations |
| 8 | Docs updated | ✅ | PRD + auth doc updated |

---

#### Settings — ✅ Complete (2026-06-24)

| # | Item | Status | Notes |
|---|---|---|---|
| 1 | Sidebar nav | ✅ | `perm: "settings_access"` on nav item |
| 2 | Page view guard | ✅ | `PermissionGate permission="settings_access"` on `/settings`, `/settings/vendor-settings`, `/settings/whatsapp-account` |
| 3 | Backend read gate | ✅ | `preHandler` on `vendorSettingsRouter` and `whatsappAccountRouter` → 403 without `settings_access` |
| 4 | Granular action subs | ✅ | Phase 2: `canAccessSub` on `DELETE /tags/:tag` (settings_tags), `PATCH/DELETE /users/:id` (settings_agents), `POST /invitations` (settings_agents), `POST /billing/cancel,cancel-now,switch-plan,portal` (settings_billing); `settings_whatsapp` on `connect-webhook` (pre-existing); `settings_api_key` — no routes yet (planned) |
| 5 | Cleanup | ✅ | No stale keys |
| 6 | Tests | ✅ | 13 tests: vendor-settings section gate (4); settings_whatsapp sub (2); settings_tags sub in labels.test.ts (3 + 1 GET happy-path); settings_agents sub in users.test.ts (3); settings_billing sub in billing.test.ts (3) |
| 7 | Defaults updated | ✅ | Admin: all subs; manager: agents + tags only; agent/viewer: no settings access |
| 8 | Docs updated | ✅ | PRD + auth doc updated |

---

#### Deals — ✅ Complete (2026-06-24)

| # | Item | Status | Notes |
|---|---|---|---|
| 1 | Sidebar nav | ✅ | `perm: "deals_access"` added to Deals nav entry |
| 2 | Page view guard | ✅ | `PermissionGate permission="deals_access"` on `/deals` page |
| 3 | Backend read gate | ✅ | `preHandler` on `dealsRouter` → 403 without `deals_access` |
| 4 | Granular action subs | N/A | No sub-permissions defined for Deals |
| 5 | Cleanup | ✅ | No stale keys |
| 6 | Tests | ✅ | 3 tests: section gate blocks/allows/admin-bypass on `GET /deals` |
| 7 | Defaults updated | ✅ | Admin + Manager + Agent + Viewer all get `deals_access: "allow"` |
| 8 | Docs updated | ✅ | This entry |

---

#### Trust Score — ✅ Complete (2026-06-24)

| # | Item | Status | Notes |
|---|---|---|---|
| 1 | Sidebar nav | ✅ | `perm: "trust_score_access"` added to Trust Score nav entry |
| 2 | Page view guard | ✅ | `PermissionGate permission="trust_score_access"` on `/trust-score` page |
| 3 | Backend read gate | ✅ | `preHandler` on `trustScoreRouter` → 403 without `trust_score_access` |
| 4 | Granular action subs | N/A | No sub-permissions defined for Trust Score |
| 5 | Cleanup | ✅ | No stale keys |
| 6 | Tests | ✅ | 2 tests: section gate blocks; admin bypass (with fetch + Prisma mocked) |
| 7 | Defaults updated | ✅ | Admin + Manager + Agent + Viewer all get `trust_score_access: "allow"` |
| 8 | Docs updated | ✅ | This entry |

---

**Resolved by product owner:**
- **Entry paths:** register → `admin`; invitation → admin-selected role. Clerk role (creator/member) never maps to a platform role. *(§4, §10)*
- **Initial admin:** only via `/register`; no Clerk-creator backstop needed.
- **Fallback rule:** absent `role_permissions_<role>` row → built-in defaults; present row (even `{}`) → used exactly as stored (`{}` = deny all). *(§6)*

**Still open:**
1. **Dashboard section:** No `perm` field in the nav. Dashboard (`/dashboard`) is open to all roles by design — no action planned.
2. **D10 `authorizedParties`:** Clerk JWT `authorizedParties` validation not enforced. Low risk in current single-client setup — deferred.

**Closed:**
- ~~Masking scope (D8)~~ — fixed 2026-06-24: contacts, conversations, campaigns all use `hide_phone_number@hide_contact_fields`.
