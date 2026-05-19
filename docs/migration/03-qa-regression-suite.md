# QA Regression Suite — WhatsJet v7.2.0 → TrustCRM

> **Source of Truth:** `docs/WhatsJet_Legacy_System_Master_Documentation_v7.2.0.md`
> **Framework:** Vitest (unit/integration) + Playwright (E2E)
> **Date:** 2026-05-18

---

## Test Suite Structure

```
apps/api/src/routes/
  contacts.test.ts        ← Labels, import, export, block, assign
  conversations.test.ts   ← Send/receive, interactive, mark-read
  campaigns.test.ts       ← Create, schedule, pause, resume, analytics
  chatbots.test.ts        ← CRUD, timing window, trigger
  flows.test.ts           ← CRUD, publish, version restore
  templates.test.ts       ← CRUD, sync, carousel
  billing.test.ts         ← Stripe, Razorpay, webhook verification
  vendor-settings.test.ts ← Settings, working hours, away messages
  users.test.ts           ← CRUD, permissions

apps/web/e2e/
  auth.spec.ts
  inbox.spec.ts
  contacts.spec.ts
  campaigns.spec.ts
  settings.spec.ts
  rbac.spec.ts
```

---

## Critical Path Test Cases

### Suite 1: Authentication

| TC ID | Test Case | Priority | Type |
|-------|-----------|---------|------|
| AUTH-001 | Valid credentials return JWT session | P0 | Integration |
| AUTH-002 | Invalid credentials return 401 | P0 | Integration |
| AUTH-003 | Expired JWT returns 401 | P0 | Integration |
| AUTH-004 | Requests without JWT header return 401 | P0 | Integration |
| AUTH-005 | Organization member can access org resources | P0 | Integration |
| AUTH-006 | Organization member cannot access other org resources (RLS) | P0 | Integration |
| AUTH-007 | Suspended organization returns 403 on all API calls | P1 | Integration |

**Vitest template for AUTH-006 (RLS isolation):**
```typescript
// apps/api/src/routes/contacts.test.ts
import { describe, it, expect, beforeAll } from 'vitest'
import { buildTestApp } from '../test-helpers/app'
import { createTestOrg, createTestContact, getAuthHeaders } from '../test-helpers/fixtures'

describe('RLS isolation', () => {
  let orgA_headers: Record<string, string>
  let orgB_contact_id: string

  beforeAll(async () => {
    const orgA = await createTestOrg('org-a')
    const orgB = await createTestOrg('org-b')
    orgA_headers = await getAuthHeaders(orgA.userId)
    orgB_contact_id = (await createTestContact(orgB.id)).id
  })

  it('AUTH-006: org A cannot read org B contact', async () => {
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'GET',
      url: `/v1/contacts/${orgB_contact_id}`,
      headers: orgA_headers,
    })
    expect(res.statusCode).toBe(404) // not 403; don't leak existence
  })
})
```

---

### Suite 2: Contact Management

| TC ID | Test Case | Priority | Type |
|-------|-----------|---------|------|
| CONT-001 | Create contact with all fields | P0 | Integration |
| CONT-002 | Create contact — duplicate phone returns 409 | P0 | Integration |
| CONT-003 | List contacts returns paginated results | P0 | Integration |
| CONT-004 | Update contact — partial update (PATCH semantics) | P0 | Integration |
| CONT-005 | Delete contact — soft delete, not hard | P1 | Integration |
| CONT-006 | Import contacts CSV — valid file | P0 | Integration |
| CONT-007 | Import contacts CSV — invalid phone numbers skipped | P1 | Integration |
| CONT-008 | Import contacts CSV — duplicate phones deduplicated | P1 | Integration |
| CONT-009 | Block contact — sets `blocked: true`, bot stops | P1 | Integration |
| CONT-010 | Toggle bot — sets `botEnabled: false` | P1 | Integration |
| CONT-011 | Assign contact to agent | P1 | Integration |
| CONT-012 | Create label | P1 | Integration |
| CONT-013 | Assign label to contact | P1 | Integration |
| CONT-014 | Remove label from contact | P1 | Integration |
| CONT-015 | List contacts filtered by label | P1 | Integration |
| CONT-016 | Export contacts as CSV | P1 | Integration |
| CONT-017 | Export contacts filtered by segment | P2 | Integration |

**Vitest template for CONT-007:**
```typescript
it('CONT-007: invalid phone numbers skipped during import', async () => {
  const app = await buildTestApp()
  const csvContent = [
    'name,phone,email',
    'Alice,+919876543210,alice@test.com',     // valid
    'Bob,NOT_A_PHONE,bob@test.com',           // invalid — should skip
    'Charlie,+911234567890,charlie@test.com', // valid
  ].join('\n')

  const form = new FormData()
  form.append('file', new Blob([csvContent], { type: 'text/csv' }), 'contacts.csv')

  const res = await app.inject({ method: 'POST', url: '/v1/contacts/import', payload: form, headers: validOrgHeaders })
  expect(res.statusCode).toBe(202)
  const { data } = JSON.parse(res.body)
  expect(data.queued).toBe(true)
  // Poll import job result
  await waitForImportComplete(data.jobId)
  const contacts = await getContactList(validOrgHeaders)
  expect(contacts.map(c => c.name)).toContain('Alice')
  expect(contacts.map(c => c.name)).not.toContain('Bob')
  expect(contacts.map(c => c.name)).toContain('Charlie')
})
```

---

### Suite 3: WhatsApp Inbox

| TC ID | Test Case | Priority | Type |
|-------|-----------|---------|------|
| INBX-001 | Send text message — returns messageId from Meta | P0 | Integration |
| INBX-002 | Send image message | P0 | Integration |
| INBX-003 | Send document message | P0 | Integration |
| INBX-004 | Receive inbound webhook — creates message record | P0 | Integration |
| INBX-005 | Receive inbound webhook — signature validation (reject invalid) | P0 | Integration |
| INBX-006 | Receive inbound webhook — creates conversation if first message | P0 | Integration |
| INBX-007 | Mark message as read — calls Meta API | P1 | Integration |
| INBX-008 | Send interactive button message | P1 | Integration |
| INBX-009 | Send interactive list message | P1 | Integration |
| INBX-010 | Assign conversation to agent | P1 | Integration |
| INBX-011 | Close conversation | P1 | Integration |
| INBX-012 | Reopen conversation | P1 | Integration |
| INBX-013 | Bot auto-replies when contact messages and bot enabled | P1 | Integration |
| INBX-014 | Bot does NOT reply when contact is blocked | P1 | Integration |
| INBX-015 | Bot does NOT reply outside timing window | P1 | Integration |
| INBX-016 | Away message sent outside working hours | P1 | Integration |
| INBX-017 | Real-time Socket.io event fires on new message | P2 | Integration |
| INBX-018 | Message status webhook updates message.status | P2 | Integration |

**Vitest template for INBX-005 (webhook signature):**
```typescript
it('INBX-005: rejects webhook with invalid signature', async () => {
  const app = await buildTestApp()
  const payload = JSON.stringify({ object: 'whatsapp_business_account', entry: [] })
  const res = await app.inject({
    method: 'POST',
    url: '/v1/webhooks/whatsapp',
    payload,
    headers: {
      'x-hub-signature-256': 'sha256=invalidsignature',
      'content-type': 'application/json',
    },
  })
  expect(res.statusCode).toBe(401)
})
```

---

### Suite 4: Campaign Engine

| TC ID | Test Case | Priority | Type |
|-------|-----------|---------|------|
| CAMP-001 | Create campaign with template and segment | P0 | Integration |
| CAMP-002 | Campaign scheduled_at in past — starts immediately | P1 | Integration |
| CAMP-003 | Campaign worker sends to all segment contacts | P0 | Integration |
| CAMP-004 | Campaign worker skips blocked contacts | P1 | Integration |
| CAMP-005 | Campaign worker skips opted-out contacts | P1 | Integration |
| CAMP-006 | Pause campaign — BullMQ job drains | P1 | Integration |
| CAMP-007 | Resume campaign — BullMQ job resumes | P1 | Integration |
| CAMP-008 | Campaign analytics return correct counts | P1 | Integration |
| CAMP-009 | Duplicate campaign — clones with DRAFT status | P2 | Integration |
| CAMP-010 | Campaign to 10k contacts — no duplicate sends (idempotency) | P0 | Integration |

---

### Suite 5: Bot Reply (Chatbot)

| TC ID | Test Case | Priority | Type |
|-------|-----------|---------|------|
| BOT-001 | Create bot with exact match keyword | P0 | Integration |
| BOT-002 | Inbound "hello" triggers exact-match bot | P0 | Integration |
| BOT-003 | Inbound "HELLO" does NOT trigger case-sensitive bot | P1 | Integration |
| BOT-004 | Bot with CONTAINS match triggers on partial keyword | P1 | Integration |
| BOT-005 | Bot outside timing window does NOT trigger | P1 | Integration |
| BOT-006 | Bot with bot disabled for contact does NOT trigger | P1 | Integration |
| BOT-007 | Delete bot — stops triggering | P0 | Integration |

---

### Suite 6: Billing (Stripe)

| TC ID | Test Case | Priority | Type |
|-------|-----------|---------|------|
| BILL-001 | Create checkout session — returns Stripe URL | P0 | Integration |
| BILL-002 | Stripe `checkout.session.completed` webhook activates subscription | P0 | Integration |
| BILL-003 | Stripe webhook — reject invalid signature | P0 | Integration |
| BILL-004 | `invoice.payment_failed` sets subscription to PAST_DUE | P1 | Integration |
| BILL-005 | `customer.subscription.deleted` sets subscription to CANCELED | P1 | Integration |
| BILL-006 | Trial period — subscription created with `trialEndsAt` | P1 | Integration |
| BILL-007 | Razorpay checkout session — returns order ID | P1 | Integration |
| BILL-008 | Razorpay webhook — signature valid, subscription activates | P1 | Integration |
| BILL-009 | Razorpay webhook — invalid signature rejected | P0 | Integration |

---

### Suite 7: RBAC Regression

| TC ID | Test Case | Role | Expected |
|-------|-----------|------|----------|
| RBAC-001 | Admin can delete campaign | ADMIN | 200 |
| RBAC-002 | Member cannot delete campaign | MEMBER | 403 |
| RBAC-003 | Admin can update user permissions | ADMIN | 200 |
| RBAC-004 | Member cannot update user permissions | MEMBER | 403 |
| RBAC-005 | Agent can send message | AGENT | 200 |
| RBAC-006 | Agent cannot create campaign | AGENT | 403 |
| RBAC-007 | SuperAdmin can access `/v1/admin/*` | SUPERADMIN | 200 |
| RBAC-008 | Admin cannot access `/v1/admin/*` | ADMIN | 403 |
| RBAC-009 | Unauthenticated request to any route | NONE | 401 |

---

### Suite 8: Database Integrity

| TC ID | Test Case | Priority |
|-------|-----------|---------|
| DB-001 | Organization delete cascades to all child records | P0 |
| DB-002 | Contact delete cascades to messages and labels | P0 |
| DB-003 | Two orgs — Prisma query for org A returns zero records from org B | P0 |
| DB-004 | Label delete removes ContactLabel join records | P1 |
| DB-005 | Campaign delete does NOT delete contacts (they are reused) | P1 |

---

### Suite 9: Edge Cases (from WhatsJet Section 10)

| TC ID | Test Case | Priority |
|-------|-----------|---------|
| EDGE-001 | Contact imports 10,000 rows — job completes within 5 minutes | P1 |
| EDGE-002 | Campaign to contact with no WhatsApp number is skipped | P1 |
| EDGE-003 | Concurrent bot reply + human message — no duplicate sends | P1 |
| EDGE-004 | Webhook received with duplicate message_id — deduplicated | P1 |
| EDGE-005 | Template variable substitution with empty variable — uses fallback | P1 |
| EDGE-006 | API call to Meta fails — message marked as FAILED, not SENT | P0 |
| EDGE-007 | Redis down — BullMQ workers fail gracefully; new jobs queue when Redis recovers | P1 |
| EDGE-008 | Meilisearch down — contact search returns empty, not 500 | P2 |
| EDGE-009 | Prisma connection pool exhausted — returns 503, not hang | P1 |
| EDGE-010 | Invalid JWT clock skew (< 5s) — accepted; > 30s — rejected | P2 |

---

### Suite 10: E2E Smoke Tests (Playwright)

| TC ID | Test Case | Spec File |
|-------|-----------|-----------|
| E2E-001 | Sign in → dashboard loads | auth.spec.ts |
| E2E-002 | Contacts list renders after sign in | contacts.spec.ts |
| E2E-003 | Open inbox → conversation list renders | inbox.spec.ts |
| E2E-004 | Send a message from inbox | inbox.spec.ts |
| E2E-005 | Create campaign and verify in list | campaigns.spec.ts |
| E2E-006 | Navigate to settings, change display name | settings.spec.ts |
| E2E-007 | Admin can access team members | settings.spec.ts |
| E2E-008 | Member cannot access billing settings | rbac.spec.ts |

---

## Running the Test Suite

```bash
# Unit + integration (all)
pnpm test

# API only
pnpm --filter @WBMSG/api test

# Watch mode (development)
pnpm --filter @WBMSG/api test -- --watch

# E2E (Playwright)
cd apps/web && pnpm exec playwright test

# E2E specific spec
cd apps/web && pnpm exec playwright test e2e/inbox.spec.ts

# E2E with UI
cd apps/web && pnpm exec playwright test --ui
```

---

*Owner: QA Lead | Update after each new route is implemented*
