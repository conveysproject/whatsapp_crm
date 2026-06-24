# Auth & Permissions System

> **Last updated:** 2026-06-24
> This document reflects the live system as of the Phase 2 RBAC implementation.
> Authoritative PRD: `docs/prd-roles-and-permissions.md`

---

## 1. Authentication (Login)

Clerk handles identity entirely. No custom login code.

```
User enters email/password
        ↓
Clerk authenticates → issues a signed JWT
        ↓
JWT stored in browser (cookie / memory)
        ↓
Next.js /api/v1/* proxy extracts JWT from cookie
adds: Authorization: Bearer <token>
        ↓
Fastify API receives request
```

**Clerk answers exactly one question:** *"Who is this user?"* (a verified `userId`).
Clerk's org-role (`org:admin` / `org:member`) is **not used** for access control.

---

## 2. Every API Request — Auth Resolution

**`apps/api/src/plugins/auth.ts`** runs on every route:

```
1. Verify JWT signature (Clerk SDK)
   → extract userId only (org_role intentionally ignored)

2. Check Redis cache (key: auth:user:<userId>, TTL: 60s)
   → HIT:  use cached { role, permissions } — skip steps 3-7
   → MISS: continue

3. Fetch User from DB
   → gets User.role, organizationId
   → 401 if user not found or not active

4. Resolve role baseline (presence-based fallback):
   Fetch VendorSetting row: key = role_permissions_<role>

   Row ABSENT  → use DEFAULT_ROLE_PERMISSIONS[role] (built-in defaults)
   Row PRESENT → use exactly what is stored (even {} = deny all)
   Row exists but unparseable → treat as {} (deny all)

5. Fetch OrganizationMember.permissions
   → per-user overrides for this user in this org (empty object if none)

6. Merge: roleBaseline + memberOverrides = effective permissions
   (memberOverrides win on conflict)

7. Cache result in Redis (60s TTL, invalidated on role/permission save)

8. Attach to request: { userId, organizationId, role, permissions }
```

**Key changes vs old implementation:**
- Step 1: `org_role` from JWT is **never read** (Clerk = identity only)
- Step 4: absence of a row falls back to **built-in defaults**, not open access
- Step 4: present row used **exactly** as stored (no merging with defaults)
- No auto-sync from Clerk role to DB role on each request

---

## 3. Roles

Stored in `User.role` (Prisma enum). **DB role is the sole authority.**

| Role | Who it's for | Bypasses all permission checks |
|---|---|---|
| `superAdmin` | Platform operator | Yes |
| `admin` | Org administrator | Yes |
| `manager` | Team lead | No |
| `agent` | Support agent | No |
| `viewer` | Read-only | No |

**How roles are assigned:**

| Path | Result |
|---|---|
| `/register` (new org) | Creating user becomes `admin` |
| Invitation | Admin selects role at invite time; stored in `Invitation.role` |
| Clerk webhook `organizationMembership.created` | Role from `Invitation.role` if pending invite exists; else `agent` (safety net). **Clerk's `org:admin` is never mapped.** |
| Admin edit | `PATCH /v1/users/:id/role` — hierarchy enforced |

**Role hierarchy (edit permissions):**
- `superAdmin` can modify: `admin`, `manager`, `agent`, `viewer`
- `admin` can modify: `manager`, `agent`, `viewer`
- No self-modification

---

## 4. Permissions

Two layers merged at request time:

| Layer | Source | Set by |
|---|---|---|
| Role baseline | `VendorSetting.role_permissions_<role>` | Settings → Roles page |
| Per-user override | `OrganizationMember.permissions` | Members page |

Values: `"allow"`. Anything else (missing, `"deny"`) = denied.

**Storage format:**
```
Parent key:  "contacts_access"                    → "allow"
Sub key:     "contacts_access@contacts_export"    → "allow"
```

**Fallback rule:**

| `VendorSetting` row | Effective permissions |
|---|---|
| Row absent | `DEFAULT_ROLE_PERMISSIONS[role]` (built-in defaults) |
| Row present (any content) | Stored value used exactly — `{}` = deny all |

---

## 5. Permission Keys Reference

### Section Parents (control nav visibility + page access + backend reads)

| Key | Section | Notes |
|---|---|---|
| `contacts_access` | Contacts (All, Groups, Import, Segments) | Segments moved here from Campaigns |
| `inbox_access` | Inbox + Message Log | |
| `campaigns_access` | Campaigns | |
| `templates_access` | Templates | |
| `automation_access` | Flows / Automation | |
| `analytics_access` | Analytics | |
| `settings_access` | Settings | |

> **Deals** and **Trust Score** have no permission key — visible to all roles for now.

### Sub-permissions (gate specific actions)

| Key | Label | Section |
|---|---|---|
| `contacts_access@contacts_add` | Add Contacts | Contacts |
| `contacts_access@contacts_delete` | Delete Contacts | Contacts |
| `contacts_access@contacts_export` | Export Contacts | Contacts |
| `contacts_access@contacts_import` | Import Contacts | Contacts |
| `contacts_access@contacts_bulk_tag` | Bulk tag Contacts | Contacts |
| `contacts_access@contacts_manage_custom_fields` | Lead statuses + custom fields | Contacts |
| `hide_phone_number@hide_contact_fields` | Mask phone / email in contact views | Contacts |
| `inbox_access@inbox_all_conversations` | See All conversations tab | Inbox |
| `inbox_access@inbox_unassigned` | See Unassigned tab | Inbox |
| `inbox_access@assigned_chats_only` | See only own assigned chats | Inbox |
| `campaigns_access@campaigns_create` | Create / edit campaigns | Campaigns |
| `campaigns_access@campaigns_pause_resume` | Pause / Resume campaigns | Campaigns |
| `campaigns_access@campaigns_abort` | Abort campaigns | Campaigns |
| `campaigns_access@campaigns_archive` | Archive / Unarchive campaigns | Campaigns |
| `campaigns_access@campaigns_delete` | Delete campaigns | Campaigns |
| `campaigns_access@campaigns_export_report` | Export campaign reports | Campaigns |
| `templates_access@templates_create` | Create templates | Templates |
| `templates_access@templates_edit` | Edit templates | Templates |
| `templates_access@templates_delete` | Delete templates | Templates |
| `templates_access@templates_ai_buttons` | AI smart button suggestions | Templates |
| `settings_access@settings_agents` | Agent management | Settings |
| `settings_access@settings_api_key` | API Keys page | Settings |
| `settings_access@settings_whatsapp` | WhatsApp Business setup | Settings |
| `settings_access@settings_billing` | Billing page | Settings |
| `settings_access@settings_tags` | Manage tags | Settings |
| `analytics_access@analytics_agent_performance` | Team performance tab | Analytics |
| `analytics_access@analytics_export` | Export analytics data | Analytics |
| `automation_access@automation_bot_flows` | Create / edit bot flows | Automation |
| `automation_access@automation_bot_replies` | Create / edit auto-replies + canned responses | Automation |
| `automation_access@automation_welcome_message` | Welcome message settings | Automation |
| `automation_access@automation_export_report` | Export automation reports | Automation |

---

## 6. Built-in Default Permissions Per Role

Used when no `VendorSetting` row exists for a role. Source: [apps/api/src/lib/default-role-permissions.ts](../apps/api/src/lib/default-role-permissions.ts)

| Key | admin | manager | agent | viewer |
|---|---|---|---|---|
| `contacts_access` | ✅ | ✅ | ✅ | ✅ |
| `contacts_access@contacts_export` | ✅ | ✅ | | |
| `contacts_access@contacts_add` | ✅ | ✅ | ✅ | |
| `contacts_access@contacts_delete` | ✅ | | | |
| `contacts_access@contacts_bulk_tag` | ✅ | ✅ | | |
| `contacts_access@contacts_import` | ✅ | ✅ | | |
| `contacts_access@contacts_manage_custom_fields` | ✅ | | | |
| `hide_phone_number` | ✅ | | | |
| `hide_phone_number@hide_contact_fields` | ✅ | | | |
| `inbox_access` | ✅ | ✅ | ✅ | ✅ |
| `inbox_access@inbox_all_conversations` | ✅ | ✅ | | ✅ |
| `inbox_access@inbox_unassigned` | ✅ | ✅ | ✅ | |
| `inbox_access@assigned_chats_only` | ✅ | | ✅ | |
| `campaigns_access` | ✅ | ✅ | | ✅ |
| `campaigns_access@campaigns_create` | ✅ | ✅ | | |
| `campaigns_access@campaigns_pause_resume` | ✅ | ✅ | | |
| `campaigns_access@campaigns_abort` | ✅ | ✅ | | |
| `campaigns_access@campaigns_archive` | ✅ | ✅ | | |
| `campaigns_access@campaigns_delete` | ✅ | ✅ | | |
| `campaigns_access@campaigns_export_report` | ✅ | ✅ | | |
| `templates_access` | ✅ | ✅ | ✅ | ✅ |
| `templates_access@templates_ai_buttons` | ✅ | | | |
| `templates_access@templates_create` | ✅ | ✅ | | |
| `templates_access@templates_edit` | ✅ | ✅ | | |
| `templates_access@templates_delete` | ✅ | | | |
| `settings_access` | ✅ | ✅ | | |
| `settings_access@settings_agents` | ✅ | ✅ | | |
| `settings_access@settings_api_key` | ✅ | | | |
| `settings_access@settings_whatsapp` | ✅ | | | |
| `settings_access@settings_billing` | ✅ | | | |
| `settings_access@settings_tags` | ✅ | ✅ | | |
| `analytics_access` | ✅ | ✅ | | ✅ |
| `analytics_access@analytics_export` | ✅ | ✅ | | |
| `analytics_access@analytics_agent_performance` | ✅ | ✅ | | |
| `automation_access` | ✅ | ✅ | | ✅ |
| `automation_access@automation_export_report` | ✅ | ✅ | | |
| `automation_access@automation_welcome_message` | ✅ | ✅ | | |
| `automation_access@automation_bot_flows` | ✅ | | | |
| `automation_access@automation_bot_replies` | ✅ | ✅ | | |

> `admin` and `superAdmin` bypass all permission checks — their defaults are never evaluated at runtime. `superAdmin` has no entry in `DEFAULT_ROLE_PERMISSIONS`.

---

## 7. Three-Layer Enforcement (Phase 2)

Every section with a parent key is enforced at **all three layers**. The backend is the real security boundary — nav and page guards are UX.

| Layer | What it does | Where |
|---|---|---|
| **Nav** | Hides the sidebar link when parent is off | `Sidebar.tsx` — filters by `canAccess(parent)` |
| **Page view** | Shows Access Denied when parent (or sub) is off | `PermissionGate` component wrapping each page |
| **Backend read** | Returns 403 when parent is off — actual data protection | `preHandler` hook on each router |
| **Actions** | Hides buttons + returns 403 for write endpoints when sub is off | Per-route `canAccessSub` check |

**Current enforcement status by section:**

| Section | Nav | Page | Backend read | Actions |
|---|---|---|---|---|
| Campaigns | ✅ | ✅ | ✅ | ✅ (all 6 subs) |
| Contacts | ✅ nav only | ❌ | ❌ | ✅ (Phase 1) |
| Templates | ✅ nav only | ❌ | ❌ | ✅ (Phase 1) |
| Flows | ✅ nav only | ❌ | ❌ | ✅ (Phase 1) |
| Analytics | ✅ nav only | ❌ | ❌ | ✅ (Phase 1) |
| Inbox | ✅ nav only | ❌ | ❌ | ✅ (Phase 1) |
| Settings | ✅ nav only | ❌ | ❌ | ✅ (Phase 1) |

> Contacts → Settings: page-view guard (D14) and backend read guard (D15) are Phase 2 work — pending.

---

## 8. Backend Permission Checks

`apps/api/src/lib/permissions.ts`:

```typescript
// Parent check — deny-by-default (no "empty = open" branch)
canAccess(role, permissions, "campaigns_access")
// admin/superAdmin → ALLOW (bypass)
// permissions["campaigns_access"] === "allow" → ALLOW
// else → DENY

// Sub check
canAccessSub(role, permissions, "campaigns_access", "campaigns_create")
// admin/superAdmin → ALLOW (bypass)
// parent !== "allow" → DENY
// parent === "allow" AND sub === "allow" → ALLOW
// else → DENY
```

**Section preHandler pattern (Campaigns example):**
```typescript
fastify.addHook("preHandler", async (request, reply) => {
  const { role, permissions } = request.auth;
  if (!canAccess(role, permissions, "campaigns_access")) {
    return reply.status(403).send({ error: { code: "FORBIDDEN", ... } });
  }
});
```

---

## 9. Frontend Permission Checks

`apps/web/lib/can.ts`:

```typescript
const { user } = useCurrentUser(); // { id, role, permissions }

canAccess(user, "campaigns_access")       // parent check
canAccessSub(user, "campaigns_access", "campaigns_create") // sub check
isAdmin(user)           // admin or superAdmin
isManagerOrAbove(user)  // admin, superAdmin, or manager
```

**`PermissionGate` component** (page-view guard):
```tsx
// Section gate (parent only)
<PermissionGate permission="campaigns_access">
  <CampaignsPage />
</PermissionGate>

// Action gate (parent + sub — for create/edit pages)
<PermissionGate permission="campaigns_access" sub="campaigns_create">
  <NewCampaignPage />
</PermissionGate>
```

Frontend checks **control UI only**. Backend always re-enforces independently.

---

## 10. Action Guard Reference (Campaigns — complete)

| Action | Sub required | Routes gated |
|---|---|---|
| View section | `campaigns_access` (parent) | all `/campaigns*` routes (preHandler) |
| Create / edit | `campaigns_create` | `POST /campaigns`, `PATCH /campaigns/:id`, `POST /campaigns/:id/schedule` |
| Pause / Resume / Requeue | `campaigns_pause_resume` | `/pause`, `/resume`, `/requeue-failed` |
| Abort | `campaigns_abort` | `/abort` |
| Archive / Unarchive | `campaigns_archive` | `/archive`, `/unarchive` |
| Delete | `campaigns_delete` | `DELETE /campaigns/:id` |
| Export reports | `campaigns_export_report` | `/export`, `/queue-log-export`, `/expired-log-export` |

---

## 11. Key Rules

| Rule | Detail |
|---|---|
| `admin` / `superAdmin` bypass everything | No permission check ever applies to them |
| Deny-by-default | Non-admin roles are denied unless a key is explicitly `"allow"` — no empty = open |
| Row absent → defaults | No `VendorSetting` row for a role → built-in `DEFAULT_ROLE_PERMISSIONS[role]` |
| Row present → exact | Stored row used as-is; `{}` = deny everything for that role |
| Frontend = UI only | Hiding buttons is UX, not security |
| Backend = real enforcement | Every guarded route re-checks independently |
| Redis cache = 60s TTL | Invalidated immediately on role/permission save (Redis `del auth:user:<id>`) |
| All data is org-scoped | Every DB query includes `organizationId` |
| Clerk = identity only | JWT verifies who the user is; DB `User.role` governs what they can do |
