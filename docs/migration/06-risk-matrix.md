# Risk Matrix — WhatsJet v7.2.0 → TrustCRM Migration

> **Date:** 2026-05-18 | **Review Cadence:** Weekly during active migration

---

## Risk Scoring

**Probability:** 1 (Rare) → 5 (Near-certain)
**Impact:** 1 (Negligible) → 5 (Catastrophic)
**Score = Probability × Impact**

| Score | Level | Action |
|-------|-------|--------|
| 1–4 | LOW | Monitor |
| 5–9 | MEDIUM | Mitigate |
| 10–14 | HIGH | Immediate plan required |
| 15–25 | CRITICAL | Block release / escalate |

---

## Risk Register

### RISK-001: Indian Payment Gateway Unavailability at Launch

| Field | Value |
|-------|-------|
| **Category** | Revenue / Market |
| **Probability** | 5 — not yet started |
| **Impact** | 5 — India is primary market; no UPI/Razorpay = no subscriptions |
| **Score** | **25 — CRITICAL** |
| **Description** | TrustCRM has Stripe only. 80%+ of Indian SMBs pay via UPI or Razorpay. Without these gateways, the product cannot generate revenue in its primary market. |
| **Trigger** | Any go-live date set before Razorpay and UPI integration complete |
| **Mitigation** | Implement Razorpay first (covers cards + UPI + netbanking), target Cycle 3. Block GA sign-off until integration passes QA. |
| **Owner** | Backend Lead |
| **Status** | OPEN — not started |

---

### RISK-002: SuperAdmin Console Missing — Ops Cannot Manage Tenants

| Field | Value |
|-------|-------|
| **Category** | Operations / SaaS |
| **Probability** | 5 — confirmed 0% coverage |
| **Impact** | 5 — cannot provision, suspend, or troubleshoot customer accounts |
| **Score** | **25 — CRITICAL** |
| **Description** | The entire SuperAdmin module (vendor management, plan config, system settings, impersonation, audit logs) is not implemented. Operations team has no tooling to manage the SaaS platform. |
| **Mitigation** | Direct DB access as emergency workaround. Schedule SuperAdmin buildout as a dedicated sprint (est. 20+ days). Must be complete before customer onboarding begins at scale. |
| **Owner** | Full-stack Lead |
| **Status** | OPEN — not started |

---

### RISK-003: Clerk Auth Vendor Lock-In / Outage

| Field | Value |
|-------|-------|
| **Category** | Technical / Infrastructure |
| **Probability** | 2 |
| **Impact** | 5 — all auth fails if Clerk is down |
| **Score** | **10 — HIGH** |
| **Description** | TrustCRM delegates 100% of auth to Clerk (unlike WhatsJet which self-manages sessions). A Clerk outage means no login, no session refresh, no 2FA. |
| **Mitigation** | Monitor Clerk SLA (99.99%). Implement Clerk offline-token caching in Redis. Architect a future fallback auth path (low priority but must be designed). |
| **Owner** | Backend Lead |
| **Status** | MONITORING |

---

### RISK-004: WhatsApp Meta API Rate Limiting / Account Suspension

| Field | Value |
|-------|-------|
| **Category** | Compliance / Platform |
| **Probability** | 3 — campaign volumes will hit limits |
| **Impact** | 5 — all messaging functionality stops |
| **Score** | **15 — CRITICAL** |
| **Description** | Meta enforces per-WABA message rate limits and quality ratings. High-volume campaigns or user complaints can trigger phone number suspension. Campaign worker currently does not enforce Meta's rate limits per phone number. |
| **Mitigation** | Implement per-WABA rate limiting in BullMQ campaign worker. Monitor quality rating webhook (`PHONE_NUMBER_QUALITY_UPDATE`). Auto-pause campaigns when quality rating drops. Alert when approaching tier limits. |
| **Owner** | Backend Lead |
| **Status** | OPEN — BullMQ rate limiter exists but not WABA-specific |

---

### RISK-005: Database RLS Policy Gaps (Multi-tenancy Breach)

| Field | Value |
|-------|-------|
| **Category** | Security / Compliance |
| **Probability** | 3 |
| **Impact** | 5 — tenant data cross-contamination is a GDPR breach |
| **Score** | **15 — CRITICAL** |
| **Description** | TrustCRM uses PostgreSQL RLS for multi-tenancy. If any new model is added without the corresponding RLS policy, queries may return cross-tenant data. WhatsJet used `vendors__id` FK on every query — explicit and auditable. TrustCRM's RLS approach is implicit and easier to misconfigure. |
| **Mitigation** | Policy: every new Prisma model addition requires a paired RLS policy migration, reviewed by a second engineer. Add integration test that verifies RLS isolation for each entity type (create two orgs, verify no cross-read). |
| **Owner** | Backend Lead + Security |
| **Status** | OPEN — RLS exists for core models; new models need audit |

---

### RISK-006: Campaign Worker Sends Duplicate Messages

| Field | Value |
|-------|-------|
| **Category** | Data / Operations |
| **Probability** | 3 — BullMQ retry logic can replay jobs |
| **Impact** | 4 — spam complaints, WABA suspension risk |
| **Score** | **12 — HIGH** |
| **Description** | BullMQ workers use retry-on-failure. Without idempotency guards, a campaign job that fails after partially sending (e.g., network error to Meta) will resend all messages on retry. |
| **Mitigation** | Track per-recipient send status in `CampaignRecipient` table. Worker checks `status === 'SENT'` before calling Meta API. Use BullMQ's built-in deduplication key = `${campaignId}:${contactId}`. |
| **Owner** | Backend Lead |
| **Status** | PARTIALLY MITIGATED — status tracking exists; dedup key not yet in place |

---

### RISK-007: Interactive Message Types Incompatible with WhatsJet Bot Flows

| Field | Value |
|-------|-------|
| **Category** | Feature Parity |
| **Probability** | 4 — bot flows in WhatsJet extensively use interactive messages |
| **Impact** | 3 — migrated bot flows will not work as expected |
| **Score** | **12 — HIGH** |
| **Description** | WhatsJet bot flows can send all 5 interactive message types. TrustCRM's FlowNode model doesn't support interactive message payloads. Any customer migrating from WhatsJet with interactive bot flows will find them broken. |
| **Mitigation** | Implement interactive messages (GAP-002) before any customer data migration begins. Block migration tooling from importing flows with interactive nodes until support is confirmed. |
| **Owner** | Backend + Product |
| **Status** | OPEN |

---

### RISK-008: Prisma Schema Drift from Production DB

| Field | Value |
|-------|-------|
| **Category** | Technical / Infrastructure |
| **Probability** | 3 — Railway DB is modified manually during dev |
| **Impact** | 4 — Prisma type errors, runtime panics |
| **Score** | **12 — HIGH** |
| **Description** | Known issue: `prisma migrate dev` hangs on this machine; workaround is `db push + migrate resolve`. This means migration history can diverge. If Railway DB state doesn't match generated Prisma client, runtime errors occur in production. |
| **Mitigation** | Before every Railway deploy, run `prisma migrate status` in CI to verify all migrations applied. Add a health-check endpoint that validates Prisma connectivity with a simple query. |
| **Owner** | Backend Lead |
| **Status** | OPEN — documented in CLAUDE.md; CI check not in place |

---

### RISK-009: No Audit Log — Compliance Gap

| Field | Value |
|-------|-------|
| **Category** | Compliance / Legal |
| **Probability** | 5 — confirmed missing |
| **Impact** | 3 — GDPR / SOC2 audit failure |
| **Score** | **15 — CRITICAL** |
| **Description** | WhatsJet logs every user action in `activity_log`. TrustCRM has no equivalent. For GDPR compliance (right to know what was done to your data) and SOC2 audit trails, this is required. |
| **Mitigation** | Implement audit logging middleware (GAP-014) before first enterprise customer onboarding. Log all mutations to contacts, messages, and configuration. |
| **Owner** | Backend Lead |
| **Status** | OPEN |

---

### RISK-010: ESM / Node 20 Compatibility Breakage

| Field | Value |
|-------|-------|
| **Category** | Technical |
| **Probability** | 2 |
| **Impact** | 3 — server won't start; build fails |
| **Score** | **6 — MEDIUM** |
| **Description** | `apps/api` uses `"type":"module"` (full ESM). All imports require `.js` extensions. New engineers frequently omit extensions, causing `ERR_MODULE_NOT_FOUND` in production. Next.js imports must NOT have `.js` extensions (webpack handles). This distinction confuses contributors. |
| **Mitigation** | ESLint rule `import/extensions` to enforce `.js` in `apps/api`. CI build must catch this before deploy. Document clearly in CLAUDE.md (already done). |
| **Owner** | All engineers |
| **Status** | PARTIALLY MITIGATED — CLAUDE.md documented |

---

### RISK-011: BullMQ Worker Crash Loses In-Flight Campaign Jobs

| Field | Value |
|-------|-------|
| **Category** | Reliability |
| **Probability** | 2 |
| **Impact** | 4 — partial campaign sends; data inconsistency |
| **Score** | **8 — MEDIUM** |
| **Description** | WhatsJet uses Laravel Queue with DB-backed `failed_jobs` table — jobs survive process restart. BullMQ uses Redis only. If Redis loses data (no persistence or AOF flush) and a worker crashes mid-campaign, job state is lost. |
| **Mitigation** | Enable Redis AOF persistence in Railway Redis config. Configure BullMQ with `attempts: 3, backoff: exponential`. Monitor failed job queue. |
| **Owner** | Backend + Infra |
| **Status** | OPEN — Redis AOF not confirmed enabled |

---

### RISK-012: Meilisearch Index Desync

| Field | Value |
|-------|-------|
| **Category** | Data Quality |
| **Probability** | 3 |
| **Impact** | 2 — contacts/conversations not searchable |
| **Score** | **6 — MEDIUM** |
| **Description** | Meilisearch is a secondary index populated by application writes. If an update fails to reach Meilisearch (network error, outage), the index diverges from PostgreSQL. WhatsJet used MySQL full-text search (no sync issue). |
| **Mitigation** | Implement a background re-index job that runs daily. Add Meilisearch health check to API startup. |
| **Owner** | Backend |
| **Status** | MONITORING |

---

## Risk Summary Dashboard

| Risk ID | Risk | Score | Level | Status |
|---------|------|-------|-------|--------|
| RISK-001 | India payment gateways missing | 25 | CRITICAL | OPEN |
| RISK-002 | SuperAdmin console missing | 25 | CRITICAL | OPEN |
| RISK-004 | Meta API rate limiting / suspension | 15 | CRITICAL | OPEN |
| RISK-005 | RLS policy gaps | 15 | CRITICAL | OPEN |
| RISK-009 | No audit log | 15 | CRITICAL | OPEN |
| RISK-003 | Clerk vendor lock-in | 10 | HIGH | MONITORING |
| RISK-006 | Campaign duplicate sends | 12 | HIGH | PARTIAL |
| RISK-007 | Interactive msgs in bot flows | 12 | HIGH | OPEN |
| RISK-008 | Prisma schema drift | 12 | HIGH | OPEN |
| RISK-010 | ESM import extensions | 6 | MEDIUM | PARTIAL |
| RISK-011 | BullMQ crash / Redis loss | 8 | MEDIUM | OPEN |
| RISK-012 | Meilisearch desync | 6 | MEDIUM | MONITORING |

---

---

## NEW RISKS — From Supplement Document Review

### RISK-013: Data Masking Not Enforced — Phone/Email Exposed to All Agents

| Field | Value |
|-------|-------|
| **Category** | Security / Compliance |
| **Probability** | 5 — confirmed missing |
| **Impact** | 5 — all agents see all customer phone numbers and emails regardless of permissions |
| **Score** | **25 — CRITICAL** |
| **Description** | WhatsJet masks `phone_number` and `email` in API responses when the agent has `hide_contact_phone_numbers` or `hide_contact_emails` permissions. TrustCRM returns all fields unmasked to all authenticated users. |
| **Mitigation** | Implement masking serializer in contact response. VendorAdmin (OWNER role) never masked. |
| **Owner** | Backend Lead |
| **Status** | OPEN — GAP-S06 |

### RISK-014: `assigned_chats_only` Not Enforced — Agents See All Conversations

| Field | Value |
|-------|-------|
| **Category** | Security / Data Privacy |
| **Probability** | 5 — confirmed missing |
| **Impact** | 4 — support agents see conversations not assigned to them |
| **Score** | **20 — CRITICAL** |
| **Description** | WhatsJet's `assigned_chats_only` permission restricts inbox to only conversations assigned to the calling user. TrustCRM's `GET /v1/conversations` returns all conversations for the org regardless of assignment. |
| **Mitigation** | Add permission check in conversation list query — GAP-S05 |
| **Owner** | Backend Lead |
| **Status** | OPEN |

### RISK-015: Plan Limits Not Enforced — Free Plan Customers Have Unlimited Access

| Field | Value |
|-------|-------|
| **Category** | Business / Revenue |
| **Probability** | 5 — confirmed missing |
| **Impact** | 4 — free plan users can create unlimited contacts, bots, flows |
| **Score** | **20 — CRITICAL** |
| **Description** | WhatsJet enforces plan limits on contact creation (free=2), campaign creation (10/month), bot replies (10), bot flows (5). TrustCRM enforces no limits. Any free user can create unlimited records. |
| **Mitigation** | Implement `checkPlanLimit()` utility in Sprint 7 — GAP-S28 |
| **Owner** | Backend Lead |
| **Status** | OPEN |

### RISK-016: Message Status Can Regress (read → delivered)

| Field | Value |
|-------|-------|
| **Category** | Data Integrity |
| **Probability** | 4 — webhook delivery order is not guaranteed by Meta |
| **Impact** | 3 — read receipts flicker; customer support confusion |
| **Score** | **12 — HIGH** |
| **Description** | Meta may deliver webhook status updates out of order (delivered event arriving after read event). Without downgrade protection, a message marked as `read` could be re-set to `delivered` by a late webhook. |
| **Mitigation** | Add terminal status guard in webhook handler — GAP-S23 |
| **Owner** | Backend Lead |
| **Status** | OPEN |

### RISK-017: PhonePe Live Keys Swapped (Do Not Copy WhatsJet Bug)

| Field | Value |
|-------|-------|
| **Category** | Payment / Revenue |
| **Probability** | 5 — confirmed bug in WhatsJet source |
| **Impact** | 5 — all live PhonePe payments fail silently |
| **Score** | **25 — CRITICAL** |
| **Description** | WhatsJet's PhonePeEngine has `clientVersion` and `clientSecret` assignments swapped in live mode. If TrustCRM copies this code, all live PhonePe transactions will fail. |
| **Mitigation** | Do NOT copy PhonePeEngine from WhatsJet. Implement from PhonePe API docs directly. Verify key mapping against PhonePe sandbox before live. |
| **Owner** | Backend Lead |
| **Status** | AWARENESS — don't copy bug |

---

## Release Gate Criteria

**GA release is BLOCKED if any CRITICAL risk is OPEN:**
- [ ] RISK-001: Razorpay + UPI implemented and tested
- [ ] RISK-002: SuperAdmin console at minimum viable state
- [ ] RISK-004: Campaign worker has per-WABA rate limiting
- [ ] RISK-005: All new models have RLS policies verified
- [ ] RISK-009: Audit log implemented for all mutation operations
- [ ] RISK-013: Contact phone/email masking implemented per permissions
- [ ] RISK-014: `assigned_chats_only` enforced in conversation list
- [ ] RISK-015: Plan feature limits enforced (free plan = 2 contacts)
- [ ] RISK-016: Message status downgrade protection active
- [ ] RISK-017: PhonePe implemented from docs, NOT copied from WhatsJet

---

*Owner: Engineering Lead | Reviewed: 2026-05-18*
