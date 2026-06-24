# Auth & Permissions System

## 1. Login

Clerk handles authentication entirely. No custom login code.

```
User enters email/password
        ↓
Clerk authenticates → issues a signed JWT
        ↓
JWT stored in browser (cookie / memory)
```

---

## 2. Every API Request

```
Browser → Next.js /api/v1/* proxy
              ↓
        Clerk extracts JWT from cookie
        adds Authorization: Bearer <token>
              ↓
        Fastify API receives request
              ↓
        auth.ts plugin runs on every route
```

**Inside `apps/api/src/plugins/auth.ts`:**

```
1. Verify JWT signature (Clerk SDK)
   → extracts userId + org_role from token

2. Check Redis cache (key: auth:user:<userId>, TTL: 60s)
   → HIT:  use cached role + permissions
   → MISS: continue

3. Fetch User from DB
   → gets role, organizationId

4. Auto-sync check
   If JWT says org:admin but DB says agent
   → promote to admin in DB silently

5. Fetch role defaults from VendorSettings
   (key = role_permissions_<role>)
   → set via the Roles settings page

6. Fetch OrganizationMember.permissions
   → per-user overrides (if any)

7. Merge: roleDefaults + memberOverrides = final permissions

8. Cache result in Redis (60s TTL)

9. Attach to request.auth = { userId, organizationId, role, permissions }
```

---

## 3. Roles

Stored in `User.role` (Prisma enum).

| Role | Who it's for | Bypasses all permission checks |
|---|---|---|
| `superAdmin` | Platform owner | Yes |
| `admin` | Org administrator | Yes |
| `manager` | Team lead | No |
| `agent` | Support agent | No |
| `viewer` | Read-only | No |

**How roles are assigned:**

- Clerk webhook `organizationMembership.created` maps `org:admin` → `admin`, everything else → `agent`
- Can be changed via `PATCH /v1/users/:id/role` (admin only)
- Auto-synced from Clerk JWT on each request if DB role is stale

---

## 4. Permissions

Two layers merged at request time:

| Layer | Table | Key | Set by |
|---|---|---|---|
| Role defaults | `VendorSetting` | `role_permissions_<role>` | Roles settings page |
| Per-user override | `OrganizationMember.permissions` | JSON object | Members page |

Values are `"allow"` or `"deny"`. Missing key = not configured.

**Storage format:**

```
Parent key:  "contacts_access"          = "allow"
Sub key:     "contacts_access@contacts_export" = "allow"
```

Sub-keys are stored as `parentKey@subKey`.

---

## 5. Permission Keys Reference

| DB Key | Feature | Type |
|---|---|---|
| `contacts_access` | Contact Hub | parent |
| `contacts_access@contacts_add` | Add Contacts | sub |
| `contacts_access@contacts_delete` | Delete Contacts | sub |
| `contacts_access@contacts_export` | Export Contacts | sub |
| `contacts_access@contacts_import` | Import Contacts | sub |
| `contacts_access@contacts_bulk_tag` | Bulk tag Contacts | sub |
| `contacts_access@contacts_manage_custom_fields` | Lead statuses + custom fields | sub |
| `hide_phone_number` | Hide Phone Number | parent |
| `hide_phone_number@hide_contact_fields` | Mask phone/email in contact views | sub |
| `inbox_access` | Inbox | parent |
| `inbox_access@inbox_all_conversations` | See All conversations tab | sub |
| `inbox_access@inbox_unassigned` | See Unassigned tab | sub |
| `inbox_access@assigned_chats_only` | See only own assigned chats | sub |
| `campaigns_access` | Campaign Manager | parent |
| `campaigns_access@campaigns_create` | Create campaigns | sub |
| `campaigns_access@campaigns_export_report` | Export campaign reports | sub |
| `campaigns_access@campaigns_manage_segments` | Create / update segments | sub |
| `templates_access` | Template Manager | parent |
| `templates_access@templates_create` | Create templates | sub |
| `templates_access@templates_edit` | Edit templates | sub |
| `templates_access@templates_delete` | Delete templates | sub |
| `templates_access@templates_ai_buttons` | AI smart button suggestions | sub |
| `settings_access` | Settings | parent |
| `settings_access@settings_agents` | Agent management | sub |
| `settings_access@settings_api_key` | API Keys page | sub |
| `settings_access@settings_whatsapp` | WhatsApp Business setup | sub |
| `settings_access@settings_billing` | Billing page | sub |
| `settings_access@settings_tags` | Manage tags | sub |
| `analytics_access` | Analytics | parent |
| `analytics_access@analytics_agent_performance` | Team performance tab | sub |
| `analytics_access@analytics_export` | Export analytics data | sub |
| `automation_access` | Automation | parent |
| `automation_access@automation_bot_flows` | Create / edit bot flows | sub |
| `automation_access@automation_bot_replies` | Create / edit auto-replies + canned responses | sub |
| `automation_access@automation_welcome_message` | Welcome message settings | sub |
| `automation_access@automation_export_report` | Export automation reports | sub |

---

## 6. Backend Permission Checks

Two helper functions in `apps/api/src/lib/permissions.ts`:

```typescript
// Parent-level check
canAccess(role, permissions, "contacts_access")
// → admin/superAdmin        → ALLOW (bypass)
// → permissions empty       → ALLOW (backwards compat)
// → key === "allow"         → ALLOW
// → else                    → DENY

// Parent + sub-key check
canAccessSub(role, permissions, "contacts_access", "contacts_export")
// → admin/superAdmin                          → ALLOW (bypass)
// → permissions empty                         → ALLOW (backwards compat)
// → parent !== "allow"                        → DENY
// → "contacts_access@contacts_export"="allow" → ALLOW
// → else                                      → DENY
```

---

## 7. Frontend Permission Checks

```typescript
// Fetch current user (React Query, cached 60s)
const { user } = useCurrentUser();
// user = { id, role, permissions }

// Parent check
canAccess(user, "campaigns_access")

// Parent + sub check
canAccessSub(user, "contacts_access", "contacts_export")

// Role-only checks (admin features)
isAdmin(user)           // admin or superAdmin
isManagerOrAbove(user)  // admin, superAdmin, or manager
```

Located in `apps/web/lib/can.ts`.  
Hook in `apps/web/hooks/useCurrentUser.ts`.

**Frontend checks control UI only** (show/hide buttons). The backend always re-enforces independently.

---

## 8. End-to-End Example

**Agent tries to export contacts:**

```
1. Frontend
   canAccessSub(user, "contacts_access", "contacts_export")
   → permissions["contacts_access"] = "allow" ✓
   → permissions["contacts_access@contacts_export"] = "allow" ✓
   → Export button is visible

2. Agent calls GET /v1/contacts/export
   → auth plugin loads role="agent", permissions from cache/DB
   → canAccessSub("agent", permissions, "contacts_access", "contacts_export")
   → both checks pass → 200 OK

3. If either check fails
   → button hidden (frontend)
   → 403 Forbidden (backend)
```

---

## 9. Key Rules

| Rule | Detail |
|---|---|
| `admin` / `superAdmin` bypass everything | No permission check is ever applied to them |
| Empty permissions = open access | Backwards compat — roles not yet configured in the Roles page get full access |
| Frontend = UI only | Hiding buttons is convenience, not security |
| Backend = real enforcement | Every guarded route re-checks independently of the frontend |
| Redis cache = 60s | Role + permissions cached per user; invalidated immediately on role/permission changes |
| All data is org-scoped | Every DB query includes `organizationId` — users can never see cross-org data |
