# Basic Automation (Welcome, OOO, Delayed Response) — Design Spec

**Date:** 2026-06-24  
**Status:** Approved for implementation  
**Reference:** Interakt Basic Automation feature (exact match)

---

## Goal

Add three time/event-aware automation features to the Flows section: Out of Office messages, Welcome messages (with new vs returning personalisation), and Delayed Response messages. All three share a Business Hours configuration that must be set up first.

---

## Scope

| Feature | In Scope |
|---|---|
| Business Hours config | Weekly schedule per org (day + time slots) |
| Out of Office (OOO) | Single auto-reply outside business hours |
| Welcome Message | Auto-reply on first contact or after 24h inactivity, with optional new/returning split |
| Delayed Response | Auto-reply if no agent replies within X mins during business hours |
| Welcome CTA options | Bot Flows or None (plain text) |
| Product Collections | ❌ Out of scope |
| WhatsApp Forms | ❌ Out of scope |

---

## Database Schema

### New model: `BusinessHours`

One row per org per day-slot. Multiple slots per day are allowed (e.g. split shifts).

```prisma
model BusinessHours {
  id             String   @id @default(uuid())
  organizationId String   @map("organization_id")
  dayOfWeek      Int      @map("day_of_week")   // 0=Sun, 1=Mon … 6=Sat
  startTime      String   @map("start_time")    // "HH:MM" 24h, e.g. "09:00"
  endTime        String   @map("end_time")      // "HH:MM" 24h, e.g. "18:00"
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@index([organizationId])
  @@map("business_hours")
}
```

### New model: `OrgAutomationSettings`

Singleton per org. Created with defaults on first GET if absent.

```prisma
model OrgAutomationSettings {
  id             String  @id @default(uuid())
  organizationId String  @unique @map("organization_id")

  // --- Out of Office ---
  oooEnabled        Boolean @default(false) @map("ooo_enabled")
  oooMessage        String? @map("ooo_message")
  oooMessageData    Json?   @map("ooo_message_data")   // media/attachments

  // --- Welcome Message ---
  welcomeEnabled       Boolean @default(false) @map("welcome_enabled")
  welcomePersonalized  Boolean @default(false) @map("welcome_personalized")
  // Single message (when personalized = false)
  welcomeMessage       String? @map("welcome_message")
  welcomeMessageData   Json?   @map("welcome_message_data")
  // New-customer variant (when personalized = true)
  welcomeNewMessage    String? @map("welcome_new_message")
  welcomeNewData       Json?   @map("welcome_new_data")
  // Returning-customer variant (when personalized = true)
  welcomeReturningMessage String? @map("welcome_returning_message")
  welcomeReturningData    Json?   @map("welcome_returning_data")
  // Optional bot flow to trigger after welcome
  welcomeFlowId        String? @map("welcome_flow_id")

  // --- Delayed Response ---
  delayedEnabled      Boolean @default(false) @map("delayed_enabled")
  delayedMinutes      Int     @default(30)    @map("delayed_minutes")   // grace period
  delayedMessage      String? @map("delayed_message")
  delayedMessageData  Json?   @map("delayed_message_data")
  delayedSendWithOoo  Boolean @default(false) @map("delayed_send_with_ooo")

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@map("org_automation_settings")
}
```

---

## API Routes

All routes in `apps/api/src/routes/automation-settings.ts`. All require `automation_access` (existing preHandler). Individual PUT routes require their respective sub-permissions.

### Business Hours

| Method | Path | Sub-permission | Description |
|---|---|---|---|
| GET | `/automation/business-hours` | `automation_access` | Returns array of all slots for org |
| PUT | `/automation/business-hours` | `automation_ooo` | Replaces entire weekly schedule |

**PUT body:**
```json
{
  "slots": [
    { "dayOfWeek": 1, "startTime": "09:00", "endTime": "18:00" },
    { "dayOfWeek": 2, "startTime": "09:00", "endTime": "18:00" }
  ]
}
```
Implementation: delete all existing rows for org, insert new slots in one transaction.

### Automation Settings (OOO + Welcome + Delayed)

| Method | Path | Sub-permission | Description |
|---|---|---|---|
| GET | `/automation/settings` | `automation_access` | Returns singleton settings (upsert defaults if missing) |
| PUT | `/automation/settings/ooo` | `automation_ooo` | Update OOO fields only |
| PUT | `/automation/settings/welcome` | `automation_welcome_message` | Update Welcome fields only |
| PUT | `/automation/settings/delayed` | `automation_delayed_response` | Update Delayed fields only |

---

## RBAC — New Permission Keys

Add two new sub-permissions to `automation_access`:

| Key | Label | Default (admin/manager) | Default (agent/viewer) |
|---|---|---|---|
| `automation_ooo` | Out of Office settings | allow | deny |
| `automation_delayed_response` | Delayed Response settings | allow | deny |

`automation_welcome_message` already exists — no change needed.

Update `apps/api/src/lib/default-role-permissions.ts` and `apps/web/components/permissions-grid.tsx`.

---

## Trigger Logic

Implemented in `apps/api/src/routes/whatsapp.ts` (inbound webhook handler) by calling a new helper `apps/api/src/lib/automation-trigger.ts`.

### On every inbound customer message

```
1. WELCOME check (runs first, regardless of hours):
   - Is this the contact's very first message ever? → send Welcome (new variant)
   - OR is contact.lastMessageAt > 24h ago? → send Welcome (returning variant if personalised)
   - After sending Welcome: if welcomeFlowId set, enqueue flow execution

2. BUSINESS HOURS check:
   - Is current time within any BusinessHours slot for this org?
   - YES → inside hours
   - NO  → outside hours

3. OOO check (outside hours only):
   - oooEnabled = true?
   - Conversation status is NOT "open"? (open conversations don't get OOO)
   - → send OOO message

4. DELAYED RESPONSE schedule (inside hours, or delayedSendWithOoo=true):
   - delayedEnabled = true?
   - Enqueue BullMQ job: { conversationId, orgId } with delay = delayedMinutes
   - Job key: `delayed-response:${conversationId}` (so we can cancel it)

5. On any OUTBOUND agent message:
   - Cancel BullMQ job for `delayed-response:${conversationId}` if pending
```

### Delayed Response Worker

New file: `apps/api/src/workers/delayed-response.worker.ts`

```
On job fire:
  1. Fetch conversation — still open? agent replied since job was scheduled?
     - If agent replied (last message is outbound) → skip, already handled
  2. Check delayedSendWithOoo toggle + current business hours
     - If outside hours AND delayedSendWithOoo = false → skip
  3. Send delayedMessage via WhatsApp API
```

---

## Helper: `isWithinBusinessHours(orgId, now)`

In `apps/api/src/lib/automation-trigger.ts`:

```typescript
// Returns true if `now` falls within any BusinessHours slot for the org.
// Uses org's timezone (stored in Organization.settings.timezone, defaults to UTC).
export async function isWithinBusinessHours(
  prisma: PrismaClient,
  organizationId: string,
  now: Date = new Date()
): Promise<boolean>
```

---

## Frontend

### Location

New cards inside the existing **Flows** page (`apps/web/app/(dashboard)/flows/page.tsx`), rendered below the existing auto-replies section.

### Card 1: Business Hours

- Weekly grid: 7 rows (Sun–Sat)
- Each row: toggle to enable day, time range picker (start → end), "+ Add slot" to add a second range for the same day, delete icon
- Default: Mon–Fri 09:00–18:00 pre-filled but disabled until saved
- Save button at bottom of card

### Card 2: Out of Office Message

- Toggle: Enable OOO (disabled if no business hours saved)
- Text area with variable chip inserter (`{{first_name}}`, `{{last_name}}`, `{{full_name}}`)
- Emoji button
- Media attachment (image/video/document via R2 upload)
- Live WhatsApp bubble preview on the right
- Save button

### Card 3: Welcome Message

- Toggle: Enable Welcome Message
- "Add personalisation" toggle:
  - OFF: single text area + CTA selector
  - ON: two text areas labelled "New customers" and "Existing / returning customers", each with own CTA selector
- CTA selector: `None (plain text)` or `Bot Flow → [flow picker dropdown]`
- Same variable inserter, emoji, media as OOO card
- Save button

### Card 4: Delayed Response

- Time picker: `[Hours input 0–23] hrs [Minutes input 0–59] mins` — max combined 24h
- Text area + variable inserter + emoji + media
- "Send along with Out of Office message" checkbox (with tooltip: "If enabled, delayed response fires even outside business hours")
- Save button

---

## Variables Supported

All message fields support:
- `{{first_name}}` — contact first name
- `{{last_name}}` — contact last name
- `{{full_name}}` — full name (fallback to phone)
- `{{phone}}` — contact phone number

---

## Migration

```
npx prisma migrate dev --name add_business_hours_and_automation_settings
```

Creates `business_hours` and `org_automation_settings` tables.

---

## Tests

### Unit tests — `automation-trigger.test.ts`
- `isWithinBusinessHours` returns true when `now` falls in a slot
- `isWithinBusinessHours` returns false when `now` is outside all slots
- `isWithinBusinessHours` returns false when no slots configured

### Route tests — `automation-settings.test.ts`
- GET `/automation/settings` returns defaults when no row exists
- PUT `/automation/settings/ooo` updates OOO fields, respects `automation_ooo` sub-perm
- PUT `/automation/business-hours` replaces slots atomically
- Agent role (no `automation_ooo`) gets 403 on PUT

### Worker tests — `delayed-response.worker.test.ts`
- Job fires and sends message when no agent reply
- Job skips when last message is outbound (agent already replied)
- Job skips when outside hours and `delayedSendWithOoo = false`
- Job sends when outside hours and `delayedSendWithOoo = true`

---

## Permissions Grid Update

Add to `automation_access` sub-permissions in `permissions-grid.tsx`:

```ts
{ key: "automation_ooo", label: "Out of Office settings" },
{ key: "automation_delayed_response", label: "Delayed Response settings" },
```

`automation_welcome_message` already present — no change.

---

## Non-Goals (this spec)

- Product Collections CTA
- WhatsApp Forms CTA
- Per-agent OOO (org-level only, matching Interakt)
- Timezone picker UI (defaults to UTC; can be added later via `Organization.settings.timezone`)
