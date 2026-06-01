# Settings — Full Design Spec
**Date:** 2026-06-01  
**Status:** Approved  
**Scope:** Full overhaul — shell, all existing pages completed, all new sections added  
**Goal:** Ship Settings as the last GA feature, surpassing WhatsJet across every dimension

---

## 1. Overview

Settings is the final feature to complete before GA (April 2026). It covers 15+ sub-pages across org configuration, team management, WhatsApp, messaging, automations, security, and billing. The design choices are driven by three principles:

1. **Admin trust** — every change is auditable; admins can always answer "who did what"
2. **SMB fit** — India-first UX: straightforward, fast, no configuration overload
3. **Competitive gap** — WhatsJet has no audit log, broken routing UI, and a single-token API model; we close all three

---

## 2. Settings Shell & Navigation

### Layout

`app/(dashboard)/settings/layout.tsx` — server component wrapping all `/settings/**` routes with a persistent left sidebar + scrollable content area.

- **Sidebar width:** 240px, fixed, independently scrollable
- **Content area:** `max-w-3xl`, padded `p-8`
- **Active state:** green left border (`border-l-2 border-green-600`) + `bg-green-50` tint on active link
- **Mobile (< md):** sidebar hidden, replaced by horizontal scrollable tab strip at top of content area

### Sidebar Groups & Pages

```
ORGANIZATION
  General           /settings/general
  Business Hours    /settings/business-hours
  Branding          /settings/branding        (merged: logos + accent color)
  Audit Log         /settings/audit-log       (admin-only)

TEAM
  Members           /settings/members         (invite + remove + role)
  Permissions       /settings/team
  Routing Rules     /settings/routing

WHATSAPP
  Account           /settings/whatsapp-account
  Marketing Msgs    /settings/whatsapp-account (section within)

MESSAGING
  Canned Responses  /settings/canned-responses (new)
  Labels            /settings/labels
  Media Library     /settings/media-library
  Notifications     /settings/notifications    (expanded)

AUTOMATIONS
  AI Backend        /settings/ai
  Webhook Actions   /settings/webhook-actions

SECURITY & API
  API Keys          /settings/api-keys         (new)
  Advanced          /settings/vendor-settings

BILLING
  Billing           /settings/billing
```

Group headers: uppercase, 11px, `text-gray-400`, not clickable.  
Audit Log link hidden from sidebar for non-admin members (checked via Clerk `role`).

---

## 3. Page-by-Page Spec

### 3.1 General (new)
**Path:** `/settings/general`  
**Data source:** `GET /v1/organizations/me`, `PUT /v1/organizations/me`  
**Fields:**
- Organization name (text input)
- Timezone (searchable select, full IANA list, default `Asia/Kolkata`)
- Language (select: English only at GA, Hindi placeholder for post-GA)

Save button with success toast on `onSuccess`.

---

### 3.2 Business Hours (new)
**Path:** `/settings/business-hours`  
**Data source:** `VendorSetting` keys (`business_hours_{day}`, `business_hours_{day}_open`, `business_hours_{day}_close`)  
**UI:** 7-row table (Monday–Sunday). Each row: enabled toggle, open time input, close time input.  
**Holidays:** Add date (date picker) + label (text). Stored as `business_hours_holidays` JSON array in `VendorSetting`.  
**Used by:** Bot timing restrictions, auto-reply flows, routing rules.

---

### 3.3 Branding (upgraded — merged)
**Path:** `/settings/branding`  
**Adds to existing:** Accent color section below logo/favicon slots.  
- Color picker input (hex) + live swatch preview
- Saved as `VendorSetting` key `brand_accent_color`
- Applied via `ThemeProvider` (see Section 5.3)

---

### 3.4 Members (upgraded)
**Path:** `/settings/members`  
**Changes from current:** Read-only list → full management

**Sections:**
1. **Active Members** — avatar, name, email, role dropdown (inline edit → `PATCH /v1/organizations/members/:id/role`), Remove button (confirmation → `DELETE /v1/organizations/members/:id`)
2. **Pending Invites** — email, sent date, Resend / Revoke actions
3. **Invite Member** button → modal: email input + role selector (admin / agent) → `POST /v1/organizations/invite`

---

### 3.5 Routing Rules (completed)
**Path:** `/settings/routing`  
**Changes from current:** List-only → full CRUD

"Add Rule" button opens a `SlideOver` with:
- Rule name (text)
- Priority (number, lower = higher priority)
- Condition: field selector (`contact.city`, `contact.label`, `contact.assignedTo`, `message.keyword`) + operator (`equals`, `contains`, `starts_with`) + value (text)
- Assign to: agent selector (dropdown) or round-robin toggle

Each rule row: edit (reopens SlideOver), active/inactive toggle, delete with confirmation.  
API: `POST /v1/routing-rules`, `PUT /v1/routing-rules/:id`, `DELETE /v1/routing-rules/:id`

---

### 3.6 Canned Responses (new)
**Path:** `/settings/canned-responses`  
**API:** `/v1/canned-responses` (already exists)  
**UI:**
- Search bar (filter by shortcut or title, client-side)
- Table: shortcut column (`/thanks`), title, content preview (truncated to 80 chars), edit / delete actions
- "New Canned Response" button → `SlideOver`: shortcut input, title input, content textarea (with variable hint: `{{contact.name}}`)

---

### 3.7 Notifications (expanded)
**Path:** `/settings/notifications`  
**Data source:** `VendorSetting` keys (existing + new)

**Three groups of toggles:**

*In-app*
- Message sound (existing `is_disabled_message_sound_notification`)
- Desktop browser notification (requests `Notification` browser permission on enable; stored as `enable_desktop_notifications`)

*Email alerts* (stored as `notify_email_{event}` VendorSetting keys)
- New conversation assigned to me
- Mention in a note
- Daily activity digest (time selector: 8am / 12pm / 6pm)

*Mobile push* (stored as `notify_push_{event}` keys, used by Expo push worker)
- New message received
- Conversation assigned to me

---

### 3.8 API Keys (new)
**Path:** `/settings/api-keys`  
**Model:** `ApiKey` (new — see Section 4)  
**UI:**
- Table: name, key prefix (8 chars + `…`), created date, last used (relative time or "Never"), status badge (Active / Revoked)
- "New API Key" button → modal: name input → on create, full key shown once with copy button + warning "This is the only time you'll see this key"
- Revoke button per row (confirmation dialog, sets `revokedAt`)

---

### 3.9 Audit Log (new)
**Path:** `/settings/audit-log`  
**Access:** Admin-only (server-side role check; non-admins redirected to `/settings/general`)  
**UI:**
- Filters row: date range picker, actor dropdown (all members), category multi-select (contacts / campaigns / team / settings / auth / billing)
- Table (25 rows/page): timestamp, actor avatar + name, event badge (color-coded by category), resource label, details
- Pagination: previous / next
- "Export CSV" button: `GET /v1/audit-logs/export?...` with current filters, `Content-Disposition: attachment; filename=audit-log.csv`

**Events captured** (comprehensive):

| Category | Events |
|---|---|
| auth | login, logout, failed_login, password_changed, 2fa_enabled, 2fa_disabled |
| team | member_invited, member_removed, role_changed, permissions_changed |
| contacts | contact_created, contact_updated, contact_deleted, contact_imported, contact_exported, contact_blocked, contact_unblocked, bot_toggled, contact_assigned, notes_updated |
| campaigns | campaign_created, campaign_sent, campaign_paused, campaign_cancelled, campaign_deleted |
| templates | template_created, template_updated, template_deleted, template_submitted |
| flows | flow_created, flow_enabled, flow_disabled, flow_deleted |
| deals | deal_created, deal_stage_changed, deal_deleted, deal_assigned |
| segments | segment_created, segment_updated, segment_deleted |
| labels | label_created, label_updated, label_deleted |
| settings | org_profile_updated, branding_updated, whatsapp_connected, whatsapp_disconnected, vendor_settings_updated, routing_rule_created, routing_rule_updated, routing_rule_deleted, webhook_action_created, webhook_action_deleted, notifications_updated, business_hours_updated, ai_backend_changed, canned_response_created, canned_response_updated, canned_response_deleted |
| api_keys | api_key_created, api_key_revoked |
| billing | plan_changed, payment_received, subscription_cancelled |
| media | media_created, media_deleted |
| custom_fields | custom_field_created, custom_field_updated, custom_field_deleted |

---

## 4. Data Model

### 4.1 New Prisma Models

```prisma
model AuditLog {
  id            String    @id @default(uuid())
  orgId         String
  actorId       String?
  actorName     String?
  event         String
  category      String
  resourceId    String?
  resourceLabel String?
  metadata      Json?
  ipAddress     String?
  createdAt     DateTime  @default(now())

  @@index([orgId, createdAt])
  @@index([orgId, category])
}

model ApiKey {
  id          String    @id @default(uuid())
  orgId       String
  name        String
  keyHash     String    @unique
  prefix      String
  lastUsedAt  DateTime?
  createdAt   DateTime  @default(now())
  revokedAt   DateTime?

  @@index([orgId])
}
```

### 4.2 New API Routes

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/audit-logs` | Paginated list; query: `category`, `actorId`, `from`, `to`, `page` |
| GET | `/v1/audit-logs/export` | CSV download with same filters |
| GET | `/v1/api-keys` | List org keys (prefix + metadata only, never hash) |
| POST | `/v1/api-keys` | Create — returns full key once in response |
| DELETE | `/v1/api-keys/:id` | Revoke (sets `revokedAt`) |
| POST | `/v1/organizations/invite` | Invite member by email via Clerk |
| DELETE | `/v1/organizations/members/:id` | Remove member |
| PATCH | `/v1/organizations/members/:id/role` | Change member role |
| POST | `/v1/routing-rules` | Create routing rule |
| PUT | `/v1/routing-rules/:id` | Update routing rule |
| DELETE | `/v1/routing-rules/:id` | Delete routing rule |

### 4.3 Audit Middleware

Added to `apps/api/src/lib/prisma.ts` as a Prisma `$use` middleware.

- Intercepts `create`, `update`, `delete` operations on: `Contact`, `Campaign`, `Flow`, `Template`, `Deal`, `Label`, `Segment`, `WebhookAction`, `RoutingRule`, `ApiKey`, `CannedResponse`, `InfoMaterial`, `CustomField`
- Maps model + operation → `{ event, category, resourceLabel }`
- Actor ID injected per-request via `AsyncLocalStorage` (set in the auth plugin after token verification)
- Non-DB events (auth, WhatsApp connect/disconnect, billing, settings bulk-save) logged explicitly via `logAuditEvent(ctx, event, meta)` helper called directly in those route handlers

---

## 5. Frontend Architecture

### 5.1 Shared Constants

```
apps/web/components/settings/
  SettingsSidebar.tsx        — sidebar with group config + active link logic
  SlideOver.tsx              — reusable right-side panel for create/edit forms
  TimeRangePicker.tsx        — open/close time pair used by business hours
  ApiKeyRevealModal.tsx      — shows full key once with copy button
  AuditLogTable.tsx          — table + pagination for audit log
  DateRangePicker.tsx        — from/to date filter for audit log
```

### 5.2 Layout File

`app/(dashboard)/settings/layout.tsx` — server component.  
Renders `<SettingsSidebar />` + `<main>{children}</main>` side by side.  
`SettingsSidebar` is a client component (uses `usePathname()`).

### 5.3 ThemeProvider

Client component added to `app/layout.tsx`.  
On mount: fetches `VendorSetting.brand_accent_color` → sets `document.documentElement.style.setProperty('--brand-color', value)`.  
`tailwind.config.ts` adds `brand: 'var(--brand-color)'` to color palette.  
Existing green buttons unchanged — only new settings-facing elements use `brand-*` classes.

### 5.4 Consistent Page Patterns

- Section cards: `bg-white rounded-xl border border-gray-200 p-6`
- Page header: `<h1>` title + `<p>` subtitle, no back links
- Save: button at bottom of each form section, `useToast` on success
- Admin gate: server-side role check, redirect non-admins away from Audit Log

---

## 6. Testing

### 6.1 API Unit Tests (Vitest)

| File | Coverage |
|---|---|
| `audit-logs.test.ts` | Pagination, category filter, date range filter, non-admin blocked (403) |
| `api-keys.test.ts` | Create returns full key once; list returns prefix only; revoke sets `revokedAt`; revoked key returns 401 on auth |
| `routing-rules.test.ts` | Create, update, delete, priority ordering |
| `organizations.test.ts` | Invite (Clerk mocked), remove member, role change |

### 6.2 Audit Middleware Unit Test

Isolated test: mock a Prisma `create` on `Contact` model → assert `AuditLog` row written with correct `event`, `category`, `resourceLabel`. Merged into existing `vi.mock('@/lib/prisma')` factory.

### 6.3 What Is NOT Tested

- Settings UI pages (no component/E2E tests — manual verification covers this)
- `ThemeProvider` CSS variable injection (browser-only)
- Clerk invite SDK calls (mocked at boundary)

### 6.4 Manual Verification Checklist

1. Navigate all 15+ sidebar links — no 404s, active highlight correct
2. Invite member → accept in second browser tab → appears in list
3. Create routing rule → toggle off → edit → delete
4. Create API key → copy → use in curl against `/v1/contacts` → confirm `lastUsedAt` updates → revoke → confirm 401
5. Perform 10 actions across the app → open Audit Log → all 10 appear with correct actor + description
6. Change accent color → buttons/sidebar highlight update without page reload
7. Set business hours → trigger bot outside those hours → bot respects schedule

---

## 7. Out of Scope (Post-GA)

- Custom email domain (DNS verification flow)
- Multi-language UI (Hindi)
- What's New / Changelog page
- Per-conversation-type notification rules
