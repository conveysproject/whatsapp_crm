# Migration Gap Analysis Report — WhatsJet v7.2.0 → TrustCRM

> **Source of Truth:** `docs/WhatsJet_Legacy_System_Master_Documentation_v7.2.0.md`
> **Date:** 2026-05-18 | **Severity Scale:** P0 (Blocking) → P3 (Nice-to-have)

---

## Executive Summary

TrustCRM achieves **~51% functional parity** with WhatsJet v7.2.0. The most critical gaps are:
1. **SuperAdmin console** (0%) — no vendor/tenant management UI
2. **Indian payment gateways** (0%) — Razorpay, UPI, PhonePe missing (market-critical)
3. **Interactive WhatsApp messages** (0%) — 5 message types unsupported
4. **Contact labels** (0%) — core CRM feature, 6 API endpoints missing
5. **Internationalization** (0%) — English only vs 15 locales in WhatsJet

---

## Gap Registry

### GAP-001: Contact Labels

| Attribute | Value |
|-----------|-------|
| **Severity** | P1 |
| **Module** | Contact Management |
| **WhatsJet Implementation** | `contact_labels` table; 6 API endpoints: `GET/POST /contacts/labels`, `PUT/DELETE /contacts/labels/:id`, `POST/DELETE /contacts/:id/labels` |
| **TrustCRM Status** | No `Label` model, no label routes |
| **DB Impact** | Need new `Label` model + `ContactLabel` join table |
| **API Impact** | 6 new routes in `apps/api/src/routes/contacts.ts` |
| **UI Impact** | Label management page + label filter in contacts list |
| **Business Impact** | Agents cannot categorize contacts; inbox filtering broken |
| **Effort** | 3 days |
| **Owner** | Backend |

**WhatsJet Schema:**
```sql
CREATE TABLE contact_labels (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vendors__id INT NOT NULL,
  title VARCHAR(255),
  colour VARCHAR(20),
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

**Required TrustCRM implementation:**
```prisma
model Label {
  id             String   @id @default(uuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id])
  title          String
  colour         String?
  contacts       ContactLabel[]
  conversations  ConversationLabel[]
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}
model ContactLabel {
  contactId String
  labelId   String
  contact   Contact @relation(fields: [contactId], references: [id])
  label     Label   @relation(fields: [labelId], references: [id])
  @@id([contactId, labelId])
}
```

---

### GAP-002: Interactive WhatsApp Messages (5 Types)

| Attribute | Value |
|-----------|-------|
| **Severity** | P1 |
| **Module** | WhatsApp Chat / Inbox |
| **WhatsJet Implementation** | `messages.type = 'interactive'` with sub-types: `button`, `list`, `cta_url`, `flow`, `product` |
| **TrustCRM Status** | Only text/media types in `POST /v1/messages` |
| **API Impact** | Extend message send route to accept interactive payloads |
| **Meta API Impact** | `sendInteractiveMessage()` stub needed in `apps/api/src/lib/whatsapp.ts` |
| **UI Impact** | Message composer needs interactive type selector |
| **Business Impact** | Cannot send click-to-action buttons, product catalogs, or flow triggers |
| **Effort** | 5 days |
| **Owner** | Backend + Frontend |

**Meta API payload structure (button type):**
```json
{
  "type": "interactive",
  "interactive": {
    "type": "button",
    "body": { "text": "Choose an option:" },
    "action": {
      "buttons": [
        { "type": "reply", "reply": { "id": "btn-1", "title": "Yes" } },
        { "type": "reply", "reply": { "id": "btn-2", "title": "No" } }
      ]
    }
  }
}
```

---

### GAP-003: Mark Message as Read

| Attribute | Value |
|-----------|-------|
| **Severity** | P1 |
| **Module** | WhatsApp Chat / Inbox |
| **WhatsJet Implementation** | `POST /messages/mark-read` → calls Meta API `PUT /{phone-id}/messages` with `{"messaging_product":"whatsapp","status":"read","message_id":"..."}` |
| **TrustCRM Status** | No mark-as-read route; `Message.status` field exists but never set to `read` |
| **API Impact** | Add `POST /v1/messages/:id/read` route |
| **Meta API Impact** | `markMessageRead(messageId)` function in `whatsapp.ts` |
| **UI Impact** | Unread badge count never decrements |
| **Business Impact** | Agents cannot signal to customers that messages have been read |
| **Effort** | 0.5 days |
| **Owner** | Backend |

---

### GAP-004: Media Upload / Download via Meta API

| Attribute | Value |
|-----------|-------|
| **Severity** | P1 |
| **Module** | Inbox + Media Library |
| **WhatsJet Implementation** | `POST /media/upload` → uploads to Meta CDN, returns `media_id`; `GET /media/:id` → downloads from Meta CDN URL |
| **TrustCRM Status** | No media upload/download routes; messages hardcode media URLs only |
| **DB Impact** | `MediaFile` model or link from `Message` to S3/R2 key |
| **API Impact** | `POST /v1/media/upload`, `GET /v1/media/:id` |
| **Meta API Impact** | `uploadMedia(file, type)` and `getMediaUrl(mediaId)` in `whatsapp.ts` |
| **Business Impact** | Cannot send agent-uploaded files; incoming media not downloadable from UI |
| **Effort** | 3 days |
| **Owner** | Backend |

---

### GAP-005: Campaign Pause / Resume

| Attribute | Value |
|-----------|-------|
| **Severity** | P1 |
| **Module** | Campaign Engine |
| **WhatsJet Implementation** | `POST /campaigns/:id/pause` sets `campaigns.status = 'paused'`; campaign worker checks status before each batch |
| **TrustCRM Status** | Campaign status field exists (`CampaignStatus` enum) but no pause/resume routes; BullMQ job not checking pause state |
| **DB Impact** | Add `PAUSED` to `CampaignStatus` enum |
| **API Impact** | `POST /v1/campaigns/:id/pause`, `POST /v1/campaigns/:id/resume` |
| **Worker Impact** | Campaign worker must check `campaign.status === 'PAUSED'` and drain queue |
| **Business Impact** | Once started, campaigns cannot be stopped — financial/compliance risk |
| **Effort** | 1.5 days |
| **Owner** | Backend |

---

### GAP-006: Bot Timing Window (Active Hours)

| Attribute | Value |
|-----------|-------|
| **Severity** | P1 |
| **Module** | Bot Reply |
| **WhatsJet Implementation** | `bot_replies.start_time` / `end_time` fields; inbound worker checks current time before triggering bot |
| **TrustCRM Status** | `Chatbot` model has no time window fields |
| **DB Impact** | Add `activeFrom: String?`, `activeTo: String?`, `timezone: String?` to `Chatbot` |
| **API Impact** | Include fields in chatbot CRUD |
| **Worker Impact** | Inbound-message worker must respect timing window |
| **Business Impact** | Bots reply 24/7; businesses cannot set quiet hours — legal risk in some markets |
| **Effort** | 1 day |
| **Owner** | Backend |

---

### GAP-007: SuperAdmin Console (Entire Module)

| Attribute | Value |
|-----------|-------|
| **Severity** | P0 |
| **Module** | SuperAdmin / Platform Administration |
| **WhatsJet Implementation** | Full admin console at `/admin/*` with vendor management, plan management, payment gateway config, system settings, audit logs, impersonation |
| **TrustCRM Status** | 0% — no admin routes, no admin UI |
| **DB Impact** | `AdminSettings`, `AdminAnnouncement`, `License` models needed |
| **API Impact** | 40+ new routes under `/v1/admin/*` |
| **UI Impact** | Entire new admin console app section |
| **Business Impact** | Cannot manage customer accounts, configure plans, or view system health |
| **Effort** | 20+ days |
| **Owner** | Full-stack |

**Critical sub-gaps within SuperAdmin:**
- `GET/POST/PUT/DELETE /v1/admin/vendors` — vendor CRUD
- `POST /v1/admin/vendors/:id/suspend` / `unsuspend`
- `POST /v1/admin/vendors/:id/login` — impersonation
- `CRUD /v1/admin/plans` — subscription plan management
- `GET/PUT /v1/admin/settings` — global system settings
- `PUT /v1/admin/gateways/:name` — payment gateway configuration
- `GET /v1/admin/activity-logs` — audit trail
- `GET /v1/admin/reports` — revenue/usage reports

---

### GAP-008: Payment Gateways (India-Critical)

| Attribute | Value |
|-----------|-------|
| **Severity** | P0 |
| **Module** | Subscription & Billing |
| **WhatsJet Implementation** | Stripe + PayPal + Razorpay + Paystack + YooMoney + PhonePe + UPI + Bank Transfer |
| **TrustCRM Status** | Stripe only |
| **DB Impact** | None — `Payment` model is gateway-agnostic |
| **API Impact** | New payment provider handlers in billing routes |
| **Business Impact** | 80%+ of Indian SMBs pay via UPI/Razorpay; zero revenue from India market |
| **Effort** | Razorpay: 3 days · UPI: 2 days · PhonePe: 2 days |
| **Owner** | Backend |

**Gateway priority for India:**
1. Razorpay (covers cards + UPI + netbanking)
2. UPI direct (for smaller amounts)
3. PhonePe (market preference)

---

### GAP-009: Internationalization / Translation

| Attribute | Value |
|-----------|-------|
| **Severity** | P2 |
| **Module** | Translation |
| **WhatsJet Implementation** | `lang/` directory with 15 locales; `__()` helper; `locale` session variable; RTL support for Arabic/Hebrew |
| **TrustCRM Status** | English only — no i18n infrastructure |
| **DB Impact** | None |
| **Frontend Impact** | Add `next-intl` or similar; all UI strings must be extracted |
| **Business Impact** | Cannot serve non-English markets; international expansion blocked |
| **Effort** | 15+ days (framework setup + string extraction) |
| **Owner** | Frontend |

**Languages WhatsJet supports:** English, Hindi, Arabic, Portuguese (Brazil), Spanish, French, German, Dutch, Italian, Turkish, Russian, Hebrew, Bahasa Indonesia, Malay, Chinese (Simplified)

---

### GAP-010: External / Partner API

| Attribute | Value |
|-----------|-------|
| **Severity** | P1 |
| **Module** | External API |
| **WhatsJet Implementation** | REST API for partners: `POST /api/send-message`, `POST /api/send-template`, `GET/POST /api/contacts`, `POST/GET/DELETE /api/webhooks`; API keys in `api_keys` table |
| **TrustCRM Status** | No external API; no `ApiKey` model |
| **DB Impact** | New `ApiKey` model with rate limiting fields |
| **API Impact** | New `/v1/external/*` route group with API key auth plugin |
| **Business Impact** | No CRM integrations possible; B2B customers cannot automate WhatsApp sends |
| **Effort** | 8 days |
| **Owner** | Backend |

---

### GAP-011: Working Hours & Away Messages

| Attribute | Value |
|-----------|-------|
| **Severity** | P1 |
| **Module** | Vendor Settings |
| **WhatsJet Implementation** | `working_hours` table (per-vendor, per-day schedule); `away_messages` table (text + media, auto-send when outside hours) |
| **TrustCRM Status** | No working hours model; no away message model |
| **DB Impact** | New `WorkingHours` model, new `AwayMessage` model |
| **API Impact** | `GET/PUT /v1/vendor-settings/working-hours`, `GET/PUT /v1/vendor-settings/away-message` |
| **Worker Impact** | Inbound worker checks working hours before routing |
| **Business Impact** | Cannot set business hours; agents receive messages at 3am with no auto-reply |
| **Effort** | 2 days |
| **Owner** | Backend |

---

### GAP-012: Carousel Template Send

| Attribute | Value |
|-----------|-------|
| **Severity** | P1 |
| **Module** | Template Management + Inbox |
| **WhatsJet Implementation** | Supports Meta's carousel template type with up to 10 cards, each with image + buttons |
| **TrustCRM Status** | Template model doesn't include carousel card structure; send route doesn't build carousel payload |
| **DB Impact** | Add `CarouselCard` model linked to `Template` |
| **API Impact** | Template create/update + message send must handle carousel |
| **Business Impact** | Carousel templates drive 3x higher click rates per Meta data; competitive disadvantage |
| **Effort** | 3 days |
| **Owner** | Backend + Frontend |

---

### GAP-013: Info Materials / Media Library

| Attribute | Value |
|-----------|-------|
| **Severity** | P2 |
| **Module** | Media |
| **WhatsJet Implementation** | `info_materials` table for reusable media assets (PDFs, images, videos); categorized; used in bot replies and campaigns |
| **TrustCRM Status** | `info_materials` table not created; no media library UI |
| **DB Impact** | New `InfoMaterial` model with `MediaCategory` |
| **API Impact** | Full CRUD under `/v1/info-materials` |
| **UI Impact** | New media library section in settings |
| **Effort** | 3 days |
| **Owner** | Full-stack |

---

### GAP-014: User Activity / Audit Log

| Attribute | Value |
|-----------|-------|
| **Severity** | P2 |
| **Module** | User Management |
| **WhatsJet Implementation** | `activity_log` table — every user action logged with IP, user agent, action type, entity |
| **TrustCRM Status** | No audit logging infrastructure |
| **DB Impact** | New `ActivityLog` model |
| **API Impact** | Middleware to auto-log sensitive operations |
| **Business Impact** | No compliance audit trail; GDPR/SOC2 risk |
| **Effort** | 3 days |
| **Owner** | Backend |

---

### GAP-015: Contact Export (CSV)

| Attribute | Value |
|-----------|-------|
| **Severity** | P1 |
| **Module** | Contact Management |
| **WhatsJet Implementation** | `GET /contacts/export` — exports filtered contacts as CSV with custom field columns |
| **TrustCRM Status** | No export route |
| **API Impact** | `GET /v1/contacts/export` with query filter params |
| **Business Impact** | Customers cannot export their own data — GDPR right-to-portability issue |
| **Effort** | 1 day |
| **Owner** | Backend |

---

### GAP-016: Campaign A/B Testing

| Attribute | Value |
|-----------|-------|
| **Severity** | P3 |
| **Module** | Campaign Engine |
| **WhatsJet Implementation** | `campaign_ab_tests` table; split audience into N groups, different template per group, auto-promote winner |
| **TrustCRM Status** | No A/B test infrastructure |
| **Effort** | 5 days |
| **Owner** | Full-stack |

---

### GAP-017: Bot Flow Version History

| Attribute | Value |
|-----------|-------|
| **Severity** | P2 |
| **Module** | Bot Flow |
| **WhatsJet Implementation** | `bot_flow_versions` table; publish creates snapshot; rollback to previous version |
| **TrustCRM Status** | `FlowVersion` model defined in Prisma schema but no API endpoints or UI |
| **Effort** | 2 days |
| **Owner** | Backend |

---

### GAP-018: Contact Merge / Deduplication

| Attribute | Value |
|-----------|-------|
| **Severity** | P2 |
| **Module** | Contact Management |
| **WhatsJet Implementation** | `POST /contacts/merge` — detects duplicates by phone, merges conversation history |
| **TrustCRM Status** | No deduplication logic |
| **Effort** | 3 days |
| **Owner** | Backend |

---

### GAP-019: AI Assistant Mode (Persistent OpenAI Assistants)

| Attribute | Value |
|-----------|-------|
| **Severity** | P2 |
| **Module** | AI Bot |
| **WhatsJet Implementation** | OpenAI Assistants API — creates persistent assistant per vendor with uploaded knowledge base files |
| **TrustCRM Status** | Claude API (text mode only); no file upload to AI |
| **Notes** | TrustCRM has Whisper + ElevenLabs which WhatsJet lacks |
| **Effort** | 5 days |
| **Owner** | Backend |

---

### GAP-020: Device FCM Token Management

| Attribute | Value |
|-----------|-------|
| **Severity** | P1 |
| **Module** | Mobile App |
| **WhatsJet Implementation** | `device_tokens` table — stores FCM push tokens per user-device pair; campaign worker sends push |
| **TrustCRM Status** | Expo mobile app exists but no server-side FCM token storage |
| **DB Impact** | New `DeviceToken` model |
| **API Impact** | `POST/DELETE /v1/device-tokens` |
| **Business Impact** | Mobile push notifications never sent |
| **Effort** | 1.5 days |
| **Owner** | Backend + Mobile |

---

### GAP-023: PhonePe Webhook Signature Verification (Security Gap)

| Attribute | Value |
|-----------|-------|
| **Severity** | P0 |
| **Module** | Billing — PhonePe |
| **WhatsJet Implementation** | `PhonePeEngine.php` has **no webhook signature verification**. Razorpay uses HMAC SHA256 via `HTTP_X_RAZORPAY_SIGNATURE`; Paystack uses HMAC SHA512 via `HTTP_X_PAYSTACK_SIGNATURE`. PhonePe has neither. |
| **TrustCRM Status** | PhonePe not yet implemented (see GAP-008). Must NOT replicate this gap. |
| **Security Impact** | Any party can POST to the PhonePe webhook URL and trigger payment confirmation, enabling free subscriptions |
| **Fix** | When implementing PhonePe: add `X-VERIFY` header validation using PhonePe's SHA256+salt signature scheme before processing payment callbacks |
| **Source** | Supplement v7.2.0 §1.3, §20.1 |
| **Effort** | 0.5 days (included in GAP-008 PhonePe implementation) |
| **Owner** | Backend |

---

### GAP-021: Mobile App Companion API (Entire Module)

| Attribute | Value |
|-----------|-------|
| **Severity** | P1 |
| **Module** | Mobile App |
| **WhatsJet Implementation** | 31 endpoints under `app_api.vendor.authenticate` middleware at `/api/vendor/*` and `/api/user/*`. Covers full inbox (chat, messages, media), full contacts CRUD, bot preview/quick-reply, campaign status, and auth (login, register, 2FA, logout, push token). See Master Doc §4.2 for full route list. |
| **TrustCRM Status** | `apps/mobile` (Expo 51) exists but has no backing server-side API. All 31 mobile-specific endpoints are missing — the mobile app would need to use the `/v1/*` web API which lacks mobile-optimised flows (no `way=prepend/append` pagination, no `all-active-bots`, no `chat-box-data`, no FCM device token). |
| **DB Impact** | `DeviceToken` model (see GAP-020). Push notification token storage required. |
| **API Impact** | 31 new routes; mobile auth middleware using app API token (separate from Clerk JWT). Consider a `/api/mobile/` prefix namespace. |
| **Business Impact** | Expo mobile app ships non-functional; no offline/push capability; no mobile agent workflow |
| **Effort** | 10 days |
| **Owner** | Backend + Mobile |

**Key mobile-only routes (not in web API):**
- `GET /api/vendor/whatsapp/contact/chat-data/{uid}/{way?}` — bidirectional pagination (`prepend`/`append`)
- `GET /api/vendor/whatsapp/contact/chat-box-data/{uid}` — labels + team members sidebar in one call
- `GET /api/vendor/bot-replies/{uid}/all-active-bots` — active bot list for a contact
- `POST /api/vendor/bot-replies/quick-reply-process` — manual bot trigger
- `POST /api/user-device/token` — FCM push token registration

---

### GAP-022: Hidden Business Logic Preservation

| Attribute | Value |
|-----------|-------|
| **Severity** | P1 |
| **Module** | Cross-cutting |
| **WhatsJet Implementation** | Master Doc §12.2 documents 11 non-obvious behaviors that are computed at runtime (not stored) and must be replicated exactly. |
| **TrustCRM Status** | Mix — some partially implemented, others absent. No single place documents which are enforced. |
| **Effort** | 4 days (audit + implement missing items) |
| **Owner** | Backend |

**Logic items requiring explicit verification (from Master Doc §12.2):**

| # | Logic | TrustCRM Status | Risk |
|---|-------|----------------|------|
| BL-01 | Campaign execution state computed from queue+log counts (Upcoming/Awaiting/Processing/Executed/Aborted) — never stored | ⚠️ Partial | HIGH |
| BL-02 | Contact auto-created on first inbound WhatsApp message (`wa_id` lookup then create) | ✅ inbound worker | LOW |
| BL-03 | Demo mode masking (`maskForDemo()` for phone/name, `maskString()` for partial) | ❌ Not implemented | MEDIUM |
| BL-04 | Bot timing restrictions — timezone-aware operating hours window; separate AI vs regular bot flags | ❌ GAP-006 | HIGH |
| BL-05 | AI `use_existing_chat_history` — previous N messages sent as context to OpenAI | ❌ Not implemented | MEDIUM |
| BL-06 | Template variable extraction — regex `/{{\d+}}/` → `field_N` (body), `header_field_N` (header), `button_N` (URL buttons) | ⚠️ Partial | HIGH |
| BL-07 | WhatsApp error extraction — nested path `webhook_responses.failed.0.changes.0.value.statuses.0.errors.0.error_data.details` with fallback chain | ❌ Not implemented | MEDIUM |
| BL-08 | Queue entry expiry — `expiry_at` in `__data`; entries past expiry set `status=5` (expired), not retried | ❌ BullMQ TTL differs | HIGH |
| BL-09 | Campaign delete guard — blocked if any `whatsapp_message_logs` entries exist for campaign | ❌ Not enforced | HIGH |
| BL-10 | Vendor slug uniqueness — enforced at settings level; slug must be unique across all tenants | ⚠️ DB unique constraint only | MEDIUM |
| BL-11 | Impersonation session state — original user ID stored in session; `logout-as` restores it | ❌ GAP-007 (SuperAdmin) | LOW |

**Immediate actions required:**
- BL-01: Implement campaign status computation function matching WhatsJet's 6-state logic
- BL-06: Verify TrustCRM template variable extraction matches WhatsJet regex exactly
- BL-07: Add `whatsapp_message_error` computed field to Message model API response
- BL-08: Add `expiresAt` field to campaign queue entries; campaign worker must check before processing
- BL-09: Add delete guard to `DELETE /v1/campaigns/:id` — check `Message.count({ where: { campaignId } })` before deleting

---

## Gap Summary Table

| Gap ID | Feature | Severity | Effort (days) | Module |
|--------|---------|---------|--------------|--------|
| GAP-001 | Contact Labels | P1 | 3 | Contacts |
| GAP-002 | Interactive Messages (5 types) | P1 | 5 | Inbox |
| GAP-003 | Mark as Read | P1 | 0.5 | Inbox |
| GAP-004 | Media Upload/Download | P1 | 3 | Inbox/Media |
| GAP-005 | Campaign Pause/Resume | P1 | 1.5 | Campaigns |
| GAP-006 | Bot Timing Window | P1 | 1 | Bot Reply |
| GAP-007 | SuperAdmin Console | P0 | 20+ | SuperAdmin |
| GAP-008 | Payment Gateways (India) | P0 | 7 | Billing |
| GAP-009 | Internationalization | P2 | 15+ | Translation |
| GAP-010 | External/Partner API | P1 | 8 | External API |
| GAP-011 | Working Hours + Away Msg | P1 | 2 | Settings |
| GAP-012 | Carousel Templates | P1 | 3 | Templates |
| GAP-013 | Info Materials/Media Lib | P2 | 3 | Media |
| GAP-014 | Audit/Activity Log | P2 | 3 | Users |
| GAP-015 | Contact Export CSV | P1 | 1 | Contacts |
| GAP-016 | Campaign A/B Tests | P3 | 5 | Campaigns |
| GAP-017 | Flow Version History | P2 | 2 | Bot Flow |
| GAP-018 | Contact Merge | P2 | 3 | Contacts |
| GAP-019 | AI Assistant Mode | P2 | 5 | AI Bot |
| GAP-020 | Device FCM Tokens | P1 | 1.5 | Mobile |
| GAP-021 | Mobile App Companion API (31 endpoints) | P1 | 10 | Mobile |
| GAP-022 | Hidden Business Logic (BL-01 to BL-11) | P1 | 4 | Cross-cutting |
| GAP-023 | PhonePe Webhook Security (no HMAC) | P0 | 0.5 | Billing |
| **TOTAL P0** | 3 gaps | | **27.5+ days** | |
| **TOTAL P1** | 12 gaps | | **43.5 days** | |
| **TOTAL P2** | 6 gaps | | **31 days** | |
| **TOTAL P3** | 2 gaps | | **10 days** | |

**Total estimated effort to reach full parity: ~112+ engineering days**

---

*Reviewed: 2026-05-18 | Source: Master Doc §4.1, §4.2, §12.2 | Owner: Product Engineering*
