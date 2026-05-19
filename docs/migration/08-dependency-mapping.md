# Dependency Mapping — WhatsJet Migration Features

> **Date:** 2026-05-18 | **Purpose:** Identify what must ship before what

---

## Feature Dependency Graph

```
FOUNDATION (already complete — Cycle 1)
├── Organization + RLS multi-tenancy ✅
├── Clerk auth + JWT middleware ✅
├── Prisma + PostgreSQL connection ✅
├── BullMQ + Redis workers ✅
├── Fastify routes + Zod validation ✅
├── Meta webhook verification ✅
└── Contact/Conversation/Message base models ✅

CYCLE 2 (no blocking dependencies on new features)
├── GAP-001: Contact Labels ─── independent
├── GAP-003: Mark as Read ─── independent
├── GAP-005: Campaign Pause/Resume ─── independent
├── GAP-006: Bot Timing Window ─── independent
├── GAP-011: Working Hours + Away Messages ─── independent
└── GAP-015: Contact Export CSV ─── independent

GAP-002: Interactive Messages ─── depends on: Message model stable ✅
GAP-004: Media Upload ─── depends on: S3/R2 credentials configured
GAP-008: Razorpay ─── depends on: Stripe pattern established ✅
GAP-012: Carousel Templates ─── depends on: Template model stable ✅
GAP-010: External API ─── depends on: ApiKey model (new), auth plugin
GAP-007: SuperAdmin ─── depends on: All org models stable
GAP-009: i18n ─── depends on: All UI components finalized (do LAST)
GAP-014: Audit Log ─── depends on: All mutation routes identified
GAP-020: FCM Tokens ─── depends on: Firebase project + Expo push setup
```

---

## Layer Dependencies

### Prisma Schema Layer (must ship before routes that use them)

| Schema Change | Needed By | Can Ship Without |
|--------------|-----------|-----------------|
| `Label` + `ContactLabel` models | GAP-001 contact labels routes | Nothing else blocked |
| `WorkingHours` model | GAP-011 working hours route | Inbound worker (check working hours) |
| `AwayMessage` model | GAP-011 away message route | Inbound worker (send away msg) |
| `MediaFile` model | GAP-004 media upload route | Message send (can send URL directly) |
| `CarouselCard` model | GAP-012 carousel template | Template send route |
| `ApiKey` model | GAP-010 external API routes | Auth plugin for external API |
| `ActivityLog` model | GAP-014 audit middleware | Nothing — middleware is additive |
| `DeviceToken` model | GAP-020 FCM routes | Mobile push worker |
| `CampaignVariant` model | A/B testing (Cycle 6) | Nothing until Cycle 6 |

### Worker Layer Dependencies

| Worker | Depends On | Required Before |
|--------|-----------|----------------|
| `inbound-message.ts` — working hours check | `WorkingHours` model + DB data | GAP-011 API done |
| `inbound-message.ts` — bot timing check | `Chatbot.activeFrom/activeTo` fields | GAP-006 DB change done |
| `inbound-message.ts` — bot trigger (existing) | none — already works | — |
| `campaign.ts` — pause check | `CampaignStatus.PAUSED` enum | GAP-005 enum change |
| `campaign.ts` — WABA rate limiting | per-phone rate limit config | Deployment risk mitigation |
| `campaign.ts` — FCM push | `DeviceToken` table populated | GAP-020 API done |

### Meta API Layer Dependencies

| `whatsapp.ts` Function | Needed By | Status |
|----------------------|-----------|--------|
| `sendTextMessage()` | Message send route | ✅ Done (stub — real call needed) |
| `sendMediaMessage()` | Message send route | ✅ Done (stub) |
| `markMessageRead()` | GAP-003 | ❌ Not implemented |
| `sendInteractiveMessage()` | GAP-002 | ❌ Not implemented |
| `uploadMedia()` | GAP-004 | ❌ Not implemented |
| `getMediaUrl()` | GAP-004 | ❌ Not implemented |
| `sendCarouselTemplate()` | GAP-012 | ❌ Not implemented |

> **Note:** `whatsapp.ts` functions are currently stubs per CLAUDE.md. Real Meta API calls not yet wired. All stubs must be replaced with real implementations before production.

### Auth / Permission Layer Dependencies

| Feature | Depends On |
|---------|-----------|
| All `/v1/*` routes | Clerk JWT middleware ✅ |
| SuperAdmin routes `/v1/admin/*` | `isSuperAdmin` hook (not yet built) |
| External API routes | `ApiKey` auth plugin (not yet built) |
| Organization suspension enforcement | `Organization.status` field + middleware check |

---

## Critical Path to GA (April 2026)

```
WEEK 1-2 (Sprint 7):
  Contact Labels → Mark as Read → Contact Export CSV

WEEK 3-4 (Sprint 8):
  Interactive Messages → Bot Timing Window → Working Hours → Campaign Pause/Resume

WEEK 5-6 (Sprint 9):
  Razorpay → UPI (via Razorpay) → Media Upload/Download

WEEK 7-8 (Sprint 10):
  PhonePe → Carousel Templates → Bot Flow Publish

WEEK 9-10 (Sprint 11):
  SuperAdmin Auth Guard → Vendor Management → Plan Management

WEEK 11-12 (Sprint 12):
  Audit Log → Activity Log API → External API (Phase 1: send message + contacts)

WEEK 13-14 (Sprint 13):
  SuperAdmin System Settings → FCM Tokens → Campaign A/B Tests (Phase 1)

WEEK 15-16 (Sprint 14):
  i18n Foundation (Hindi) → Contact Merge → Flow Version History

WEEK 17-18 (Hardening):
  Load Testing → Security Audit → RLS Verification → Go-Live Prep
```

---

## Integration Dependencies (External Services)

| Integration | Config Required | Who Owns Config | Status |
|------------|----------------|----------------|--------|
| Meta WhatsApp API | `META_ACCESS_TOKEN`, `META_PHONE_NUMBER_ID`, `META_WEBHOOK_SECRET` | Backend Lead | ✅ Configured |
| Clerk | `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Infra | ✅ Configured |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Infra | ✅ Configured |
| Razorpay | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Infra | ❌ Not configured |
| PhonePe | `PHONEPE_MERCHANT_ID`, `PHONEPE_SALT_KEY`, `PHONEPE_SALT_INDEX` | Infra | ❌ Not configured |
| Firebase (FCM) | `FIREBASE_SERVICE_ACCOUNT` JSON | Infra | ❌ Not configured |
| AWS S3 or Cloudflare R2 | `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | Infra | ❌ Not confirmed |
| Sentry | `SENTRY_DSN` | Infra | ⚠️ Dev DSN set; prod DSN needed |
| Datadog | `DD_API_KEY` | Infra | ❌ Not confirmed |

---

## Shared Model Usage (Cross-Feature Impact)

When modifying these models, check all features that use them:

| Model | Used By Features |
|-------|----------------|
| `Contact` | Labels, Segments, Campaigns, Conversations, Bot Reply, Deals |
| `Message` | Inbox, Bot Reply, Interactive Messages, Media, Templates |
| `Organization` | All features (root tenant model) |
| `Conversation` | Inbox, Labels, Assign, Close/Reopen, Bot Reply |
| `Chatbot` | Bot Reply, Bot Timing Window, Toggle Bot |
| `Campaign` | Campaign CRUD, Pause/Resume, Analytics, A/B Tests |
| `Template` | Template CRUD, Sync, Carousel, Campaign Send |
| `Flow` | Flow CRUD, Publish, Versions, Flow Execution Worker |

---

*Owner: Engineering Lead | Update when new features begin*
