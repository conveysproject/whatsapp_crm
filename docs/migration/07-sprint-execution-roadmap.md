# Sprint Execution Roadmap — WhatsJet Parity Migration

> **Target GA:** April 2026 | **Approach:** Iterative delivery, P0 gaps first
> **Gap source:** `docs/migration/05-gap-analysis-report.md`
> **Risk source:** `docs/migration/06-risk-matrix.md`

---

## Roadmap Summary

| Cycle | Duration | Focus | Cumulative API Coverage |
|-------|----------|-------|------------------------|
| Cycle 1 ✅ | 4 weeks | Vendor settings, canned responses, WA account, contact ops | 70% |
| Cycle 2 | 4 weeks | Labels, interactive msgs, mark-read, working hrs, bot timing | 78% |
| Cycle 3 | 4 weeks | India billing, media library, campaign pause/resume, partner API | 85% |
| Cycle 4 | 4 weeks | SuperAdmin console (Phase 1), audit log, export | 90% |
| Cycle 5 | 4 weeks | SuperAdmin console (Phase 2), carousel templates, FCM tokens | 93% |
| Cycle 6 | 4 weeks | i18n foundation, A/B tests, flow versions, bot preview | 96% |
| Hardening | 2 weeks | Performance, security audit, load testing, go-live prep | — |

---

## URGENT: P0 Gaps from Supplement Review (Add to Sprint 7)

These P0 gaps were found in the supplement docs and must be addressed immediately:

### T7-0a: Message Status Downgrade Protection (GAP-S23)
**Estimate:** 0.5 days
- [ ] In `workers/inbound-message.ts` webhook handler, when updating `Message.status`:
  ```typescript
  const TERMINAL_STATUSES = ['read', 'played']
  if (TERMINAL_STATUSES.includes(existingMessage.status)) {
    return // Do not downgrade
  }
  await prisma.message.update({ where: { id }, data: { status: newStatus } })
  ```

### T7-0b: `assigned_chats_only` Enforcement (GAP-S05)
**Estimate:** 0.5 days
- [ ] In `GET /v1/conversations` route, check caller's permissions:
  ```typescript
  const member = await prisma.organizationMember.findUnique({ where: { userId_orgId } })
  const perms = member?.permissions as Record<string, unknown>
  const assignedOnly = perms?.assigned_chats_only === 'allow'
  const where = assignedOnly ? { assignedTo: request.user.userId } : {}
  ```

### T7-0c: Plan Feature Limit Enforcement (GAP-S28) — Phase 1
**Estimate:** 2 days (contacts + chatbots + flows limit checks)
- [ ] Add `checkPlanLimit(orgId, feature)` utility:
  ```typescript
  export async function checkPlanLimit(orgId: string, feature: 'contacts' | 'bot_replies' | 'bot_flows' | 'contact_custom_fields' | 'system_users'): Promise<boolean> {
    const sub = await prisma.subscription.findFirst({ where: { organizationId: orgId, status: 'ACTIVE' } })
    const limits: Record<string, Record<string, number>> = {
      FREE:     { contacts: 2, bot_replies: 10, bot_flows: 5, contact_custom_fields: 2, system_users: 0 },
      STANDARD: { contacts: 5, bot_replies: 10, bot_flows: 5, contact_custom_fields: 5, system_users: 5 },
      PREMIUM:  { contacts: 15, bot_replies: 10, bot_flows: 5, contact_custom_fields: 10, system_users: 10 },
      ULTIMATE: { contacts: -1, bot_replies: -1, bot_flows: -1, contact_custom_fields: -1, system_users: -1 },
    }
    const plan = sub?.plan ?? 'FREE'
    const limit = limits[plan]?.[feature] ?? 0
    if (limit === -1) return true // unlimited
    const countMap: Record<string, () => Promise<number>> = {
      contacts: () => prisma.contact.count({ where: { organizationId: orgId } }),
      bot_replies: () => prisma.chatbot.count({ where: { organizationId: orgId } }),
      bot_flows: () => prisma.flow.count({ where: { organizationId: orgId } }),
    }
    const current = await (countMap[feature]?.() ?? Promise.resolve(0))
    return current < limit
  }
  ```
- [ ] Call `checkPlanLimit` in `POST /v1/contacts`, `POST /v1/chatbots`, `POST /v1/flows` — return 403 if limit reached
- [ ] Write Vitest tests for free plan limit enforcement

---

## Cycle 2 — Sprint 7 (Weeks 1–2)

**Theme: Contact Organization + Inbox Quality**

### Sprint 7 Tasks

#### T7-1: Contact Labels — Database + API
**Priority:** P1 | **Estimate:** 3 days | **Owner:** Backend

- [ ] Add `Label` and `ContactLabel` models to Prisma schema
  ```prisma
  model Label {
    id             String   @id @default(uuid())
    organizationId String
    title          String
    colour         String   @default("#3B82F6")
    organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
    contacts       ContactLabel[]
    conversations  ConversationLabel[]
    createdAt      DateTime @default(now())
    updatedAt      DateTime @updatedAt
    @@index([organizationId])
  }
  model ContactLabel {
    contactId String
    labelId   String
    assignedAt DateTime @default(now())
    contact   Contact @relation(fields: [contactId], references: [id], onDelete: Cascade)
    label     Label   @relation(fields: [labelId], references: [id], onDelete: Cascade)
    @@id([contactId, labelId])
  }
  ```
- [ ] Run `pnpm --filter @WBMSG/api generate`
- [ ] Run `prisma db push --accept-data-loss`
- [ ] Create RLS policy for `Label` and `ContactLabel` tables
- [ ] Implement label routes in `apps/api/src/routes/contacts.ts`:
  - `GET /v1/contacts/labels`
  - `POST /v1/contacts/labels`
  - `PUT /v1/contacts/labels/:id`
  - `DELETE /v1/contacts/labels/:id`
  - `POST /v1/contacts/:id/labels`
  - `DELETE /v1/contacts/:id/labels/:labelId`
- [ ] Write Vitest tests for all 6 routes
- [ ] Commit: `feat(api): contact labels CRUD + assign/remove endpoints`

#### T7-2: Mark Message as Read
**Priority:** P1 | **Estimate:** 0.5 days | **Owner:** Backend

- [ ] Add `markMessageRead(messageId: string, phoneNumberId: string)` to `apps/api/src/lib/whatsapp.ts`
  ```typescript
  export async function markMessageRead(messageId: string, phoneNumberId: string): Promise<void> {
    await fetch(`${META_API_BASE}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${META_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', status: 'read', message_id: messageId }),
    })
  }
  ```
- [ ] Add `POST /v1/messages/:id/read` route in `apps/api/src/routes/messages.ts`
- [ ] Call `markMessageRead` on inbound message receipt in `workers/inbound-message.ts`
- [ ] Write Vitest test (mock `whatsapp.ts`)
- [ ] Commit: `feat(api): mark-as-read endpoint + auto-read on inbound`

#### T7-3: Contact Export CSV
**Priority:** P1 | **Estimate:** 1 day | **Owner:** Backend

- [ ] Add `GET /v1/contacts/export` route with query params: `labelId`, `segmentId`, `createdAfter`, `createdBefore`
- [ ] Use `fast-csv` or manual CSV serialization (no new deps if possible)
- [ ] Include custom field columns in export
- [ ] Set `Content-Disposition: attachment; filename="contacts.csv"` header
- [ ] Write Vitest test
- [ ] Commit: `feat(api): contact export CSV endpoint`

---

## Cycle 2 — Sprint 8 (Weeks 3–4)

**Theme: Bot Quality + Operational Safety**

### Sprint 8 Tasks

#### T8-1: Interactive WhatsApp Messages
**Priority:** P1 | **Estimate:** 5 days | **Owner:** Backend + Frontend

- [ ] Add interactive message support to `apps/api/src/lib/whatsapp.ts`:
  ```typescript
  type InteractiveButton = { type: 'reply'; reply: { id: string; title: string } }
  type InteractiveList = { sections: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }> }

  export async function sendInteractiveMessage(
    to: string, phoneNumberId: string,
    payload: { type: 'button' | 'list' | 'cta_url' | 'flow'; body: { text: string }; action: unknown }
  ): Promise<MetaMessageResponse> { ... }
  ```
- [ ] Extend `POST /v1/messages` to accept `type: 'interactive'` with `interactive` body field
- [ ] Validate interactive payload shape with Zod schema in route handler
- [ ] Update `Message` model to store interactive payload as JSON
- [ ] Add interactive type selector to message composer in `apps/web/components/inbox/`
- [ ] Write Vitest tests for all 5 interactive types (mock Meta API)
- [ ] Commit: `feat: interactive message types — button, list, cta_url, flow, product`

#### T8-2: Bot Timing Window
**Priority:** P1 | **Estimate:** 1 day | **Owner:** Backend

- [ ] Add fields to `Chatbot` model:
  ```prisma
  model Chatbot {
    // ... existing fields
    activeFrom String?  // "09:00" 24h format
    activeTo   String?  // "18:00" 24h format
    timezone   String?  // "Asia/Kolkata"
  }
  ```
- [ ] Update chatbot CRUD routes to include timing fields
- [ ] In `workers/inbound-message.ts`, check timing window before triggering chatbot:
  ```typescript
  function isBotActive(chatbot: { activeFrom?: string; activeTo?: string; timezone?: string }): boolean {
    if (!chatbot.activeFrom || !chatbot.activeTo) return true
    const tz = chatbot.timezone ?? 'UTC'
    const now = new Date().toLocaleTimeString('en-US', { hour12: false, timeZone: tz, hour: '2-digit', minute: '2-digit' })
    return now >= chatbot.activeFrom && now <= chatbot.activeTo
  }
  ```
- [ ] Write Vitest tests: bot active during window, bot silent outside window
- [ ] Commit: `feat(api): bot timing window — activeFrom/activeTo/timezone`

#### T8-3: Working Hours + Away Messages
**Priority:** P1 | **Estimate:** 2 days | **Owner:** Backend

- [ ] Add `WorkingHours` and `AwayMessage` models:
  ```prisma
  model WorkingHours {
    id             String   @id @default(uuid())
    organizationId String   @unique
    organization   Organization @relation(fields: [organizationId], references: [id])
    timezone       String   @default("Asia/Kolkata")
    monday         Json?    // { open: "09:00", close: "18:00", enabled: true }
    tuesday        Json?
    wednesday      Json?
    thursday       Json?
    friday         Json?
    saturday       Json?
    sunday         Json?
  }
  model AwayMessage {
    id             String   @id @default(uuid())
    organizationId String   @unique
    organization   Organization @relation(fields: [organizationId], references: [id])
    enabled        Boolean  @default(false)
    message        String
    mediaUrl       String?
  }
  ```
- [ ] Add `GET/PUT /v1/vendor-settings/working-hours` routes
- [ ] Add `GET/PUT /v1/vendor-settings/away-message` routes
- [ ] Inbound worker: check working hours; if outside, send away message
- [ ] Write Vitest tests
- [ ] Commit: `feat(api): working hours + away messages`

#### T8-4: Campaign Pause / Resume
**Priority:** P1 | **Estimate:** 1.5 days | **Owner:** Backend

- [ ] Add `PAUSED` to `CampaignStatus` enum in schema
- [ ] Add `POST /v1/campaigns/:id/pause` and `POST /v1/campaigns/:id/resume` routes
- [ ] Campaign worker: check `status !== 'PAUSED'` before processing each batch; drain BullMQ queue on pause
- [ ] Write Vitest tests
- [ ] Commit: `feat(api): campaign pause and resume`

---

## Cycle 3 — Sprint 9–10 (Weeks 5–8)

**Theme: India Market Readiness + Media**

### Sprint 9 Tasks

#### T9-1: Razorpay Integration
**Priority:** P0 | **Estimate:** 3 days | **Owner:** Backend

- [ ] Install `razorpay` package: `pnpm --filter @WBMSG/api add razorpay`
- [ ] Create `apps/api/src/lib/razorpay.ts` with order create, verify payment signature
- [ ] Add Razorpay checkout session route: `POST /v1/billing/razorpay/checkout`
- [ ] Add Razorpay webhook handler: `POST /v1/webhooks/razorpay`
- [ ] Verify webhook signature using `X-Razorpay-Signature` header
- [ ] Update subscription status on `payment.captured` event
- [ ] Write Vitest tests (mock Razorpay SDK)
- [ ] Commit: `feat(api): Razorpay payment gateway`

#### T9-2: UPI / PhonePe Integration
**Priority:** P0 | **Estimate:** 2 days each | **Owner:** Backend

- [ ] UPI via Razorpay (Razorpay supports UPI as payment method — no separate integration needed if Razorpay is complete)
- [ ] PhonePe: Create `apps/api/src/lib/phonepe.ts`
- [ ] Implement PhonePe PG API: initiate payment, check status, handle callback
- [ ] Commit: `feat(api): PhonePe payment gateway`

#### T9-3: Media Upload / Download
**Priority:** P1 | **Estimate:** 3 days | **Owner:** Backend

- [ ] Add `MediaFile` model to schema:
  ```prisma
  model MediaFile {
    id             String   @id @default(uuid())
    organizationId String
    organization   Organization @relation(fields: [organizationId], references: [id])
    metaMediaId    String?  // Meta CDN ID
    s3Key          String?  // S3/R2 storage key
    mimeType       String
    filename       String
    sizeBytes      Int?
    uploadedBy     String
    createdAt      DateTime @default(now())
  }
  ```
- [ ] Implement `uploadMedia(buffer, mimeType)` in `whatsapp.ts` — calls Meta upload API
- [ ] Implement `getMediaUrl(mediaId)` — calls `GET /{media-id}` Meta endpoint
- [ ] Add `POST /v1/media/upload` — accepts multipart/form-data, uploads to Meta, stores record
- [ ] Add `GET /v1/media/:id` — returns presigned download URL or proxies from Meta
- [ ] Commit: `feat(api): media upload and download via Meta API`

---

## Cycle 4 — Sprint 11–12 (Weeks 9–12)

**Theme: SuperAdmin Phase 1 + Compliance**

### Sprint 11 Tasks

#### T11-1: SuperAdmin Auth Guard
- [ ] Add SuperAdmin role to Clerk user metadata
- [ ] Create `isSuperAdmin` Fastify hook that checks Clerk `publicMetadata.role === 'superadmin'`
- [ ] Apply hook to all `/v1/admin/*` routes

#### T11-2: Vendor (Organization) Management
- [ ] `GET /v1/admin/organizations` — paginated list with status, plan, user count
- [ ] `GET /v1/admin/organizations/:id` — detail view
- [ ] `POST /v1/admin/organizations/:id/suspend` — set `Organization.status = 'SUSPENDED'`
- [ ] `POST /v1/admin/organizations/:id/unsuspend`
- [ ] `DELETE /v1/admin/organizations/:id` — soft delete
- [ ] Commit: `feat(api): superadmin organization management`

#### T11-3: Plan Management (Admin)
- [ ] `GET/POST/PUT/DELETE /v1/admin/plans`
- [ ] Admin can create/update pricing plans and sync to Stripe
- [ ] Commit: `feat(api): superadmin plan management`

#### T11-4: Audit Log
- [ ] Add `ActivityLog` model:
  ```prisma
  model ActivityLog {
    id             String   @id @default(uuid())
    organizationId String?
    userId         String
    action         String   // "contact.create", "campaign.send", etc.
    entityType     String?
    entityId       String?
    metadata       Json?
    ipAddress      String?
    userAgent      String?
    createdAt      DateTime @default(now())
    @@index([organizationId])
    @@index([userId])
    @@index([createdAt])
  }
  ```
- [ ] Create Fastify hook `logActivity(action, entityType, entityId)` called in mutation routes
- [ ] `GET /v1/admin/activity-logs` (admin) + `GET /v1/audit-logs` (vendor-scoped)
- [ ] Commit: `feat(api): audit activity logging`

---

## Cycle 5 — Sprint 13–14 (Weeks 13–16)

**Theme: SuperAdmin Phase 2 + Carousel Templates**

#### T13-1: SuperAdmin System Settings
- [ ] `GET/PUT /v1/admin/settings` — global config (email provider, storage provider, default plan)
- [ ] `PUT /v1/admin/gateways/:name` — enable/disable and configure payment gateways per-instance

#### T13-2: Carousel Template Support
- [ ] Add `CarouselCard` model linked to `Template`
- [ ] Update template CRUD to include carousel cards
- [ ] Build carousel payload in `sendTemplateMessage()` in `whatsapp.ts`
- [ ] Frontend template builder: add carousel card editor

#### T13-3: Device FCM Tokens (Mobile Push)
- [ ] Add `DeviceToken` model with `userId`, `token`, `platform (ios|android)`, `lastSeen`
- [ ] `POST /v1/device-tokens` — register token on app launch
- [ ] `DELETE /v1/device-tokens` — deregister on logout
- [ ] Worker: send FCM push when new message arrives for user with registered device
- [ ] Commit: `feat(api): FCM device token management + push notifications`

---

## Cycle 6 — Sprint 15–16 (Weeks 17–20)

**Theme: i18n Foundation + Advanced Features**

#### T15-1: i18n Foundation (Frontend)
- [ ] Install `next-intl` in `apps/web`
- [ ] Create `messages/en.json` with all current UI strings
- [ ] Create `messages/hi.json` (Hindi — primary Indian market)
- [ ] Wrap root layout with `NextIntlClientProvider`
- [ ] Replace all hardcoded strings in components with `useTranslations()` hook
- [ ] Add language switcher to settings page

#### T15-2: Bot Flow Version History
- [ ] `POST /v1/flows/:id/publish` — create `FlowVersion` snapshot
- [ ] `GET /v1/flows/:id/versions` — list versions
- [ ] `POST /v1/flows/:id/versions/:versionId/restore` — rollback

#### T15-3: Campaign A/B Testing (Phase 1)
- [ ] `CampaignVariant` model with `templateId`, `audiencePercent`
- [ ] Campaign create accepts `variants` array
- [ ] Worker distributes contacts evenly across variants

---

## Hardening Sprint (2 Weeks Before GA)

### Checklist

- [ ] Load test: campaign worker handles 100k contacts/hour without memory leak
- [ ] Security audit: all routes behind auth; no PII in logs; CORS configured
- [ ] RLS verification: automated test creates 2 orgs, verifies complete isolation
- [ ] Prisma migration status: all migrations applied in Railway prod
- [ ] Meilisearch: full re-index run; verify search returns correct results
- [ ] Redis AOF: confirm persistence enabled in Railway
- [ ] Sentry: all error boundaries wired; source maps uploaded
- [ ] Datadog: dashboards configured; alerts set for API error rate > 1%, p95 latency > 500ms
- [ ] Backup: PostgreSQL automated backup confirmed; retention = 30 days
- [ ] DNS/TLS: all prod domains with valid certs; no HTTP redirect to HTTPS
- [ ] Penetration testing: external security firm or automated scanner (OWASP ZAP)

---

## Dependencies Between Cycles

```
GAP-003 (Mark Read)        → Independent — can ship any time
GAP-005 (Campaign Pause)   → Independent
GAP-001 (Labels)           → Independent
GAP-006 (Bot Timing)       → Independent
GAP-011 (Working Hours)    → Independent
GAP-008 (Razorpay)         → Depends on: Stripe pattern established ✅
GAP-004 (Media Upload)     → Depends on: S3/R2 credentials in Railway
GAP-002 (Interactive Msgs) → Depends on: Message model stable ✅
GAP-007 (SuperAdmin)       → Depends on: Clerk org management ✅
GAP-009 (i18n)             → Depends on: All UI strings finalized (do last)
GAP-012 (Carousel)         → Depends on: Template model stable ✅
GAP-020 (FCM Tokens)       → Depends on: Firebase project setup
```

---

*Owner: Engineering Lead | Next review: Start of each cycle*
