# Automated Testing Architecture — TrustCRM

> **Frameworks:** Vitest (unit/integration) + Playwright (E2E) + k6 (load)
> **Date:** 2026-05-18

---

## Test Pyramid

```
         ┌─────────────────┐
         │   E2E (Playwright)│  ← 20 tests, slow, golden path only
         ├─────────────────────┤
         │ Integration (Vitest) │  ← 200+ tests, route-level, mocked Meta
         ├──────────────────────────┤
         │   Unit (Vitest)          │  ← Fast, pure functions, no DB
         └──────────────────────────────┘
```

---

## File Layout

```
apps/api/src/routes/
  contacts.test.ts           ← Contact CRUD, labels, import, block
  conversations.test.ts      ← Inbox, send/receive, interactive
  campaigns.test.ts          ← Campaign lifecycle, worker
  chatbots.test.ts           ← Bot reply, timing window
  flows.test.ts              ← Flow builder, publish
  templates.test.ts          ← Template CRUD, carousel
  billing.test.ts            ← Stripe, Razorpay webhooks
  vendor-settings.test.ts    ← Settings, working hours

apps/api/src/test-helpers/
  app.ts                     ← buildTestApp() factory
  fixtures.ts                ← createTestOrg(), createTestContact(), etc.
  mocks.ts                   ← vi.mock for whatsapp.ts, stripe.ts, clerk.ts

apps/web/e2e/
  auth.spec.ts
  contacts.spec.ts
  inbox.spec.ts
  campaigns.spec.ts
  settings.spec.ts
  rbac.spec.ts

scripts/load-tests/
  campaign-worker.js         ← k6 load test: 10k campaign recipients
  api-throughput.js          ← k6 API throughput test
```

---

## Test Helper: `buildTestApp()`

```typescript
// apps/api/src/test-helpers/app.ts
import Fastify from 'fastify'
import { registerPlugins } from '../plugins/index.js'
import { registerRoutes } from '../routes/index.js'

export async function buildTestApp() {
  const app = Fastify({ logger: false })
  await registerPlugins(app)
  await registerRoutes(app)
  await app.ready()
  return app
}
```

## Test Helper: `fixtures.ts`

```typescript
// apps/api/src/test-helpers/fixtures.ts
import { prisma } from '../lib/prisma.js'

export async function createTestOrg(slug: string) {
  return prisma.organization.create({
    data: { id: `org-${slug}`, name: `Test Org ${slug}`, slug },
  })
}

export async function createTestContact(organizationId: string, overrides = {}) {
  return prisma.contact.create({
    data: { phone: `+91${Date.now()}`, organizationId, ...overrides },
  })
}

export function getAuthHeaders(userId: string, orgId: string) {
  // Return mock Clerk JWT headers that pass the test auth plugin
  return { authorization: `Bearer test-token-${userId}-${orgId}` }
}
```

---

## Mocking Strategy

| Dependency | Mock Approach |
|-----------|---------------|
| `whatsapp.ts` | `vi.mock('../lib/whatsapp.js')` — return `{ messageId: 'wamid.test' }` |
| `stripe.ts` | `vi.mock('../lib/stripe.js')` — return mock session/subscription |
| Clerk JWT | Test auth plugin that reads `Bearer test-token-{userId}-{orgId}` |
| BullMQ | `vi.mock('bullmq')` for route tests; real Redis for worker tests |
| Meilisearch | `vi.mock('../lib/search.js')` — return mock results |

**Never mock Prisma in route tests** — use a real test database (separate `DATABASE_URL_TEST` pointing to test DB with test data cleaned up in `afterEach`).

---

## Load Test: Campaign Worker

```javascript
// scripts/load-tests/campaign-worker.js
import http from 'k6/http'
import { check, sleep } from 'k6'

export const options = {
  stages: [
    { duration: '1m', target: 50 },   // ramp up
    { duration: '5m', target: 50 },   // sustained load
    { duration: '1m', target: 0 },    // ramp down
  ],
  thresholds: {
    http_req_duration: ['p95<500'],    // 95% of requests under 500ms
    http_req_failed: ['rate<0.01'],    // < 1% error rate
  },
}

export default function () {
  const res = http.post(
    `${__ENV.API_URL}/v1/campaigns`,
    JSON.stringify({
      title: `Load Test Campaign ${__ITER}`,
      templateId: __ENV.TEMPLATE_ID,
      segmentId: __ENV.SEGMENT_ID,
      scheduledAt: new Date().toISOString(),
    }),
    { headers: { Authorization: `Bearer ${__ENV.TOKEN}`, 'Content-Type': 'application/json' } }
  )
  check(res, { 'campaign created': r => r.status === 201 })
  sleep(1)
}
```

Run: `k6 run --env API_URL=https://trustcrmapi-production.up.railway.app scripts/load-tests/campaign-worker.js`

---

## CI Integration

```yaml
# .github/workflows/test.yml (or Railway build step)
- name: Run API tests
  run: pnpm --filter @WBMSG/api test -- --reporter=verbose

- name: Type check
  run: pnpm type-check

- name: Lint
  run: pnpm lint

- name: E2E (staging only)
  if: github.ref == 'refs/heads/main'
  run: cd apps/web && pnpm exec playwright test --project=chromium
  env:
    PLAYWRIGHT_BASE_URL: ${{ vars.STAGING_URL }}
```

---

*See individual test files in `apps/api/src/routes/*.test.ts` and `apps/web/e2e/*.spec.ts`*
