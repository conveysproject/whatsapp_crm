# Shadow Testing Strategy — WhatsJet → TrustCRM

> **Date:** 2026-05-18 | **Purpose:** Validate TrustCRM behavior matches WhatsJet before full cutover

---

## Overview

Shadow testing runs both WhatsJet (legacy) and TrustCRM (new) in parallel for the same traffic, comparing outputs to catch behavioral mismatches before customers are fully migrated.

**Note:** TrustCRM is a **ground-up rewrite**, not a migration of running instances. Shadow testing here means: during the customer migration period (when some customers are on WhatsJet and others are on TrustCRM), we validate that TrustCRM behaves identically to WhatsJet for the same inputs.

---

## Strategy 1: API Response Comparison

### Approach

For a defined set of read endpoints, run the same request against both the WhatsJet staging instance and TrustCRM staging. Compare response shapes.

### Setup

```typescript
// scripts/shadow-compare.ts
// Run with: ts-node scripts/shadow-compare.ts

interface ShadowTestCase {
  name: string
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  path: string
  body?: unknown
  whatsjetTransform?: (res: unknown) => unknown // normalize legacy response
  trustcrmTransform?: (res: unknown) => unknown  // normalize new response
}

const testCases: ShadowTestCase[] = [
  {
    name: 'List contacts',
    method: 'GET',
    path: '/contacts',
    whatsjetTransform: (r: any) => r.data.map((c: any) => ({ name: c.name, phone: c.phone_number })),
    trustcrmTransform: (r: any) => r.data.map((c: any) => ({ name: c.name, phone: c.phone })),
  },
  {
    name: 'List campaigns',
    method: 'GET',
    path: '/campaigns',
    whatsjetTransform: (r: any) => r.data.map((c: any) => ({ title: c.title, status: c.status })),
    trustcrmTransform: (r: any) => r.data.map((c: any) => ({ title: c.title, status: c.status })),
  },
]

async function runShadowTest(tc: ShadowTestCase) {
  const [whatsjetRes, trustcrmRes] = await Promise.all([
    fetch(`${WHATSJET_STAGING}${tc.path}`, { headers: whatsjetHeaders }),
    fetch(`${TRUSTCRM_STAGING}${tc.path}`, { headers: trustcrmHeaders }),
  ])
  const whatsjetData = tc.whatsjetTransform?.(await whatsjetRes.json())
  const trustcrmData = tc.trustcrmTransform?.(await trustcrmRes.json())
  const match = JSON.stringify(whatsjetData) === JSON.stringify(trustcrmData)
  return { name: tc.name, match, whatsjetData, trustcrmData }
}
```

### Endpoints to Shadow-Test

| Endpoint | WhatsJet Route | TrustCRM Route | Priority |
|---------|---------------|---------------|---------|
| List contacts | `GET /contacts` | `GET /v1/contacts` | P0 |
| Get contact | `GET /contacts/:id` | `GET /v1/contacts/:id` | P0 |
| List conversations | `GET /conversations` | `GET /v1/conversations` | P0 |
| List campaigns | `GET /campaigns` | `GET /v1/campaigns` | P0 |
| List templates | `GET /templates` | `GET /v1/templates` | P1 |
| Get analytics | `GET /analytics` | `GET /v1/analytics` | P1 |
| List bot replies | `GET /bot-replies` | `GET /v1/chatbots` | P1 |

---

## Strategy 2: Webhook Replay Testing

### Approach

Capture real Meta webhook payloads from the WhatsJet production webhook log, then replay them against TrustCRM staging to verify:
1. Webhook signature verification passes
2. Message records created correctly
3. Bot triggers fire correctly
4. Conversation state updated correctly

### Webhook Capture Tool

```bash
# Capture webhook payloads from Railway logs
railway service link "@trustcrm/api"
railway service logs --lines 500 | grep "POST /v1/webhooks/whatsapp" > webhook-log.txt

# Or use a webhook inspector (ngrok inspect) during development
# ngrok logs at localhost:4040/inspect/http
```

### Replay Script

```typescript
// scripts/replay-webhooks.ts
import webhookFixtures from './fixtures/meta-webhooks.json'

for (const fixture of webhookFixtures) {
  const payload = JSON.stringify(fixture.body)
  const signature = computeHmac(payload, WEBHOOK_SECRET)

  const res = await fetch(`${TRUSTCRM_STAGING}/v1/webhooks/whatsapp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hub-signature-256': `sha256=${signature}`,
    },
    body: payload,
  })

  console.log(`${fixture.name}: ${res.status} ${res.status === 200 ? '✅' : '❌'}`)
}
```

### Fixture Catalog

```json
// scripts/fixtures/meta-webhooks.json
[
  {
    "name": "Inbound text message",
    "body": {
      "object": "whatsapp_business_account",
      "entry": [{
        "id": "WABA_ID",
        "changes": [{
          "value": {
            "messaging_product": "whatsapp",
            "metadata": { "display_phone_number": "919876543210", "phone_number_id": "PHONE_ID" },
            "messages": [{
              "from": "919876543210",
              "id": "wamid.test123",
              "timestamp": "1716048000",
              "text": { "body": "Hello" },
              "type": "text"
            }]
          },
          "field": "messages"
        }]
      }]
    }
  },
  {
    "name": "Message status delivered",
    "body": {
      "object": "whatsapp_business_account",
      "entry": [{
        "changes": [{
          "value": {
            "statuses": [{
              "id": "wamid.test456",
              "status": "delivered",
              "timestamp": "1716048060",
              "recipient_id": "919876543210"
            }]
          }
        }]
      }]
    }
  },
  {
    "name": "Interactive button reply",
    "body": {
      "object": "whatsapp_business_account",
      "entry": [{
        "changes": [{
          "value": {
            "messages": [{
              "from": "919876543210",
              "id": "wamid.test789",
              "type": "interactive",
              "interactive": {
                "type": "button_reply",
                "button_reply": { "id": "btn-1", "title": "Yes" }
              }
            }]
          }
        }]
      }]
    }
  }
]
```

---

## Strategy 3: Canary Release

### Approach

When onboarding new customers, direct a small percentage to TrustCRM while keeping existing customers on WhatsJet. Monitor error rates, CSAT, and support tickets between cohorts.

### Traffic Split

| Phase | TrustCRM % | WhatsJet % | Criteria to advance |
|-------|-----------|-----------|-------------------|
| Phase 1 (Week 1) | 5% new signups | 95% | Zero P0 incidents for 7 days |
| Phase 2 (Week 2) | 20% new signups | 80% | Error rate < 0.5%, CSAT ≥ 4.0 |
| Phase 3 (Week 3) | 50% new signups | 50% | Error rate < 0.2%, CSAT ≥ 4.2 |
| Phase 4 (Week 4) | 100% new signups | Existing only | All P1 gaps resolved |
| Phase 5 (Month 2) | 100% all | WhatsJet sunset | All P0 gaps resolved |

### Canary Metrics

Collect per-cohort:
- HTTP 5xx rate
- Message send success rate (Meta API)
- Campaign completion rate
- Webhook processing time p95
- Support ticket volume

**Canary rollback trigger:** If TrustCRM cohort has > 2× error rate vs WhatsJet cohort for any 1-hour window → pause new TrustCRM signups immediately.

---

## Strategy 4: Parallel Execution (Migration Validation)

### For Data Migration

When migrating an existing WhatsJet customer to TrustCRM:

```
STEP 1: Export customer data from WhatsJet
STEP 2: Import into TrustCRM (contacts, templates, bot flows, campaigns)
STEP 3: Run parallel for 24h — all NEW messages go to both systems
STEP 4: Compare message counts, contact records, template list
STEP 5: If match → cut over; if mismatch → investigate before cutover
```

### Validation Query

```sql
-- Run in TrustCRM DB after migration import
-- Compare contact count
SELECT COUNT(*) FROM "Contact" WHERE "organizationId" = '<org_id>';
-- Expected: matches WhatsJet SELECT COUNT(*) FROM contacts WHERE vendors__id = <vendor_id>

-- Compare template count
SELECT COUNT(*) FROM "Template" WHERE "organizationId" = '<org_id>';
-- Expected: matches WhatsJet SELECT COUNT(*) FROM templates WHERE vendors__id = <vendor_id>
```

---

## Rollback Trigger Conditions

| Condition | Action |
|-----------|--------|
| TrustCRM error rate > 5% during canary | Pause canary; route all new signups to WhatsJet |
| Message send failure rate > 2% | Pause campaigns; investigate Meta API integration |
| Data migration validation fails > 1% discrepancy | Stop migration; investigate import logic |
| Any CRITICAL risk from `06-risk-matrix.md` triggers | Full rollback per `12-rollback-strategy.md` |

---

## Shadow Testing Sign-Off Criteria

Before advancing each canary phase, the following must be confirmed by Engineering Lead:

- [ ] API comparison tests: 100% pass for P0 endpoints
- [ ] Webhook replay tests: 100% pass for all fixture types
- [ ] RLS isolation test: zero cross-tenant data exposure
- [ ] Campaign idempotency: no duplicate sends in load test
- [ ] Error rate < 0.5% in canary cohort
- [ ] All CRITICAL risks in `06-risk-matrix.md` resolved

---

*Owner: QA Lead + Engineering Lead | Review: Weekly during canary phase*
