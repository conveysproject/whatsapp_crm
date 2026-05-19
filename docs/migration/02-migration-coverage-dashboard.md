# Migration Coverage Dashboard — WhatsJet v7.2.0 → TrustCRM

> **Last Updated:** 2026-05-18 | **Status:** Cycle 2 Planning

---

## Overall Migration Health

```
┌─────────────────────────────────────────────────────────────────────┐
│  MIGRATION COVERAGE — TrustCRM vs WhatsJet v7.2.0                  │
├─────────────────┬───────────────┬──────────────┬────────────────────┤
│  Layer          │  Coverage     │  Score       │  Risk              │
├─────────────────┼───────────────┼──────────────┼────────────────────┤
│  Database       │  ████████░░   │  85%         │  LOW               │
│  API Routes     │  ███████░░░   │  70%         │  MEDIUM            │
│  Meta API       │  ██████░░░░   │  60%         │  HIGH              │
│  Frontend/UI    │  █████░░░░░   │  58%         │  HIGH              │
│  SuperAdmin     │  █░░░░░░░░░   │  14%         │  CRITICAL          │
│  Billing/Pmts   │  ██░░░░░░░░   │  25%         │  CRITICAL          │
│  Translation    │  ░░░░░░░░░░   │  0%          │  CRITICAL          │
│  External API   │  ░░░░░░░░░░   │  4%          │  CRITICAL          │
│  Mobile App API │  ░░░░░░░░░░   │  0%          │  CRITICAL          │
├─────────────────┼───────────────┼──────────────┼────────────────────┤
│  OVERALL        │  █████░░░░░   │  ~51%        │  HIGH              │
└─────────────────┴───────────────┴──────────────┴────────────────────┘
```

---

## Coverage by Domain

### Backend API Coverage

| Category | WhatsJet Routes | TrustCRM Routes | Coverage | Gap Count |
|----------|----------------|----------------|----------|-----------|
| Authentication | 12 | 10 | 83% | 2 |
| Users | 8 | 6 | 75% | 2 |
| Contacts | 20 | 14 | 70% | 6 (labels) |
| Conversations/Messages | 18 | 10 | 56% | 8 |
| Campaigns | 10 | 7 | 70% | 3 |
| Templates | 8 | 7 | 88% | 1 |
| Bot Replies | 8 | 5 | 63% | 3 |
| Bot Flows | 10 | 6 | 60% | 4 |
| Analytics | 8 | 5 | 63% | 3 |
| Billing | 12 | 4 | 33% | 8 |
| Vendor Settings | 14 | 12 | 86% | 2 |
| WhatsApp Account | 12 | 10 | 83% | 2 |
| Deals/CRM | 10 | 8 | 80% | 2 |
| SuperAdmin | 40+ | 2 | 5% | 38+ |
| External REST API | 23 | 1 | 4% | 22 |
| Mobile App API | 31 | 0 | 0% | 31 |
| **TOTAL** | **~246** | **~111** | **~45%** | **~135** |

---

### WhatsApp Meta API Coverage

| API Method | WhatsJet Calls | TrustCRM | Status |
|-----------|----------------|----------|--------|
| Send text message | ✅ | ✅ | ✅ Done |
| Send image | ✅ | ✅ | ✅ Done |
| Send video | ✅ | ✅ | ✅ Done |
| Send audio | ✅ | ✅ | ✅ Done |
| Send document | ✅ | ✅ | ✅ Done |
| Send sticker | ✅ | None | ❌ Missing |
| Send location | ✅ | None | ❌ Missing |
| Send contacts | ✅ | None | ❌ Missing |
| Send interactive buttons | ✅ | None | ❌ Missing |
| Send interactive list | ✅ | None | ❌ Missing |
| Send reply buttons | ✅ | None | ❌ Missing |
| Send CTA URL | ✅ | None | ❌ Missing |
| Send flow message | ✅ | None | ❌ Missing |
| Carousel template | ✅ | None | ❌ Missing |
| Upload media | ✅ | None | ❌ Missing |
| Download media | ✅ | None | ❌ Missing |
| Mark message read | ✅ | None | ❌ Missing |
| React to message | ✅ | None | ❌ Missing |
| Get business profile | ✅ | ✅ | ✅ Done |
| Update business profile | ✅ | ✅ | ✅ Done |
| Register phone | ✅ | ✅ | ✅ Done |
| Get phone numbers | ✅ | ✅ | ✅ Done |
| Template create | ✅ | ✅ | ✅ Done |
| Template list/sync | ✅ | ✅ | ✅ Done |
| Template delete | ✅ | ✅ | ✅ Done |
| **TOTAL** | **25** | **15** | **60%** |

---

### Frontend UI Coverage

| Page / Module | WhatsJet Screen | TrustCRM | Status |
|--------------|----------------|----------|--------|
| Sign In | ✅ | ✅ | ✅ |
| Sign Up | ✅ | ✅ | ✅ |
| Dashboard / Analytics | ✅ | ✅ | ✅ |
| Contacts List | ✅ | ✅ | ✅ |
| Contact Detail | ✅ | ✅ | ✅ |
| Contact Import | ✅ | ✅ | ✅ |
| Contact Labels | ✅ | None | ❌ |
| Conversations / Inbox | ✅ | ✅ | ✅ |
| Message Composer | ✅ | ✅ | ⚠️ Missing interactive types |
| Campaign List | ✅ | ✅ | ✅ |
| Campaign Create/Edit | ✅ | ✅ | ✅ |
| Campaign Analytics | ✅ | ✅ | ✅ |
| Template List | ✅ | ✅ | ✅ |
| Template Builder | ✅ | ✅ | ✅ |
| Flow Builder (Visual) | ✅ | ✅ | ✅ |
| Bot Replies | ✅ | ✅ | ✅ |
| AI Bot Config | ✅ | ✅ | ✅ |
| Deals / CRM Pipeline | ✅ | ✅ | ✅ |
| Segments | ✅ | ✅ | ✅ |
| Settings — General | ✅ | ✅ | ✅ |
| Settings — WhatsApp Account | ✅ | ✅ | ✅ |
| Settings — Members | ✅ | ✅ | ✅ |
| Settings — Branding | ✅ | ✅ | ✅ |
| Settings — Notifications | ✅ | ✅ | ✅ |
| Settings — Working Hours | ✅ | None | ❌ |
| Settings — Away Messages | ✅ | None | ❌ |
| Settings — Billing | ✅ | ⚠️ | ⚠️ Stripe only |
| Settings — Team | ✅ | ✅ | ✅ |
| Media Library | ✅ | None | ❌ |
| SuperAdmin — Vendor Management | ✅ | None | ❌ |
| SuperAdmin — Plans | ✅ | None | ❌ |
| SuperAdmin — Settings | ✅ | None | ❌ |
| SuperAdmin — Reports | ✅ | None | ❌ |
| Translation / i18n | ✅ (15 locales) | None | ❌ |
| Public Landing Page | ✅ | conveys.in | ⚠️ |
| Pricing Page | ✅ | None | ❌ |
| **TOTAL** | **36** | **23** | **58%** |

---

## Critical Gaps by Priority

### P0 — Blocking for Indian Market Launch

| Gap | Impact | Effort | Module |
|-----|--------|--------|--------|
| Razorpay payment gateway | Revenue — 80% of India payments | Medium | Billing |
| UPI payment gateway | Revenue — Standard India payment | Medium | Billing |
| PhonePe payment gateway | Revenue — India gateway | Medium | Billing |
| Mark-as-read API | UX — unread badges never clear | Low | Inbox |
| Interactive messages (5 types) | Feature parity — competitor offers this | High | Inbox |
| Contact labels (6 API endpoints) | Core CRM feature | Medium | Contacts |

### P1 — Required for GA

| Gap | Impact | Effort | Module |
|-----|--------|--------|--------|
| SuperAdmin console | SaaS operations — no vendor mgmt | Very High | SuperAdmin |
| External Partner API | B2B integrations | High | API |
| Campaign pause/resume | Operational safety | Low | Campaigns |
| Bot timing window | Compliance (no-contact hours) | Low | Bot Reply |
| Media upload/download via Meta | Full media workflow | Medium | Inbox |
| Working hours + away messages | Business hours compliance | Medium | Settings |

### P2 — Post-GA

| Gap | Impact | Effort | Module |
|-----|--------|--------|--------|
| Translation / i18n | International expansion | Very High | Translation |
| A/B campaign testing | Marketing maturity | High | Campaigns |
| Flow version history | Developer UX | Medium | Bot Flows |
| Contact timeline | Sales UX | Medium | Contacts |
| Agent performance analytics | Team management | Medium | Analytics |
| CMS / Public pages | Marketing | Very High | CMS |
| AI assistant mode (OpenAI) | AI parity | Medium | AI Bot |
| Custom roles (dynamic) | Enterprise permissions | High | User Mgmt |

---

## Trend Tracking

| Cycle | API Coverage | UI Coverage | DB Coverage | Notes |
|-------|-------------|-------------|-------------|-------|
| Baseline (pre-dev) | 0% | 0% | 0% | |
| After Sprint 6 | 40% | 30% | 60% | Core features |
| After Cycle 1 | 70% | 58% | 85% | Vendor settings, canned responses, WA account |
| After Cycle 2 (target) | 78% | 65% | 88% | Labels, interactive msgs, working hours |
| After Cycle 3 (target) | 85% | 72% | 90% | Billing gateways, media library |
| GA Target (April 2026) | 95%+ | 85%+ | 95%+ | SuperAdmin + i18n deferred |

---

## Risk Heatmap

```
IMPACT
  │
H │  [SuperAdmin]  [i18n]    [Interactive Msgs]
  │                          [Razorpay/UPI]
M │  [Partner API] [Media]   [Labels]    [Working Hrs]
  │  [Custom Roles]          [Bot Timing]
L │  [A/B Tests]   [Flow Ver][Mark Read] [Campaign P/R]
  └──────────────────────────────────────────────────
          LOW         MEDIUM        HIGH
                    EFFORT
```

---

*Dashboard refreshed each sprint. Owned by: Engineering Lead*
