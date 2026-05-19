# Production Readiness Checklist — TrustCRM

> **Target GA:** April 2026
> **Scoring:** Each item is PASS / FAIL / N/A
> **Gate:** ALL P0 items must PASS before go-live is approved

---

## Section 1: Infrastructure

### 1.1 Database

| # | Check | Priority | Owner | Status |
|---|-------|---------|-------|--------|
| 1.1.1 | PostgreSQL running on Railway production environment | P0 | Infra | ⬜ |
| 1.1.2 | Automated daily backups enabled (Railway managed) | P0 | Infra | ⬜ |
| 1.1.3 | Backup retention ≥ 30 days | P0 | Infra | ⬜ |
| 1.1.4 | Point-in-time recovery tested (restore backup to staging) | P0 | Infra | ⬜ |
| 1.1.5 | All Prisma migrations applied: `prisma migrate status` shows 0 pending | P0 | Backend | ⬜ |
| 1.1.6 | RLS policies enabled and tested on all multi-tenant tables | P0 | Backend | ⬜ |
| 1.1.7 | Connection pool size configured for Railway tier (max_connections) | P1 | Backend | ⬜ |
| 1.1.8 | Database `DATABASE_URL` uses `127.0.0.1` (not localhost) in all env configs | P0 | Backend | ⬜ |
| 1.1.9 | No raw SQL in application code (all queries via Prisma) | P0 | Backend | ⬜ |

### 1.2 Redis

| # | Check | Priority | Owner | Status |
|---|-------|---------|-------|--------|
| 1.2.1 | Redis 7 running on Railway | P0 | Infra | ⬜ |
| 1.2.2 | AOF (Append-Only File) persistence enabled | P1 | Infra | ⬜ |
| 1.2.3 | Redis password authentication configured | P0 | Infra | ⬜ |
| 1.2.4 | BullMQ worker connects to Redis successfully on startup | P0 | Backend | ⬜ |
| 1.2.5 | BullMQ failed job queue monitored (alert on failed > 0) | P1 | Backend | ⬜ |

### 1.3 Meilisearch

| # | Check | Priority | Owner | Status |
|---|-------|---------|-------|--------|
| 1.3.1 | Meilisearch v1.8 running on Railway | P0 | Infra | ⬜ |
| 1.3.2 | `MEILI_MASTER_KEY` set and not default | P0 | Infra | ⬜ |
| 1.3.3 | Contacts and conversations indexes created and populated | P0 | Backend | ⬜ |
| 1.3.4 | Search returns results within 100ms (p95) | P1 | Backend | ⬜ |
| 1.3.5 | API degrades gracefully when Meilisearch is down (returns empty, not 500) | P1 | Backend | ⬜ |

---

## Section 2: Application

### 2.1 API (Fastify)

| # | Check | Priority | Owner | Status |
|---|-------|---------|-------|--------|
| 2.1.1 | API starts without errors: `pnpm --filter @WBMSG/api build && pnpm start` | P0 | Backend | ⬜ |
| 2.1.2 | Health check endpoint returns 200: `GET /health` | P0 | Backend | ⬜ |
| 2.1.3 | Swagger docs load without errors: `GET /docs` | P1 | Backend | ⬜ |
| 2.1.4 | All routes behind auth (no unauthenticated data endpoints) | P0 | Backend | ⬜ |
| 2.1.5 | Rate limiting configured (per-IP and per-org) | P1 | Backend | ⬜ |
| 2.1.6 | CORS: only `trustcrm-web-*.vercel.app` and `localhost:3000` allowed in production | P0 | Backend | ⬜ |
| 2.1.7 | All environment variables set in Railway: `railway variable` | P0 | Backend | ⬜ |
| 2.1.8 | `NODE_ENV=production` set | P0 | Infra | ⬜ |
| 2.1.9 | Sentry DSN configured; test error appears in Sentry dashboard | P1 | Backend | ⬜ |
| 2.1.10 | No `console.log` with PII (phone numbers, emails, tokens) | P0 | Backend | ⬜ |
| 2.1.11 | All API responses return `{ data: ... }` envelope | P0 | Backend | ⬜ |
| 2.1.12 | ESM `.js` import extensions present on all internal imports in `apps/api` | P0 | Backend | ⬜ |

### 2.2 Web (Next.js)

| # | Check | Priority | Owner | Status |
|---|-------|---------|-------|--------|
| 2.2.1 | Web builds without type errors: `pnpm type-check` | P0 | Frontend | ⬜ |
| 2.2.2 | Web builds without lint errors: `pnpm lint` | P0 | Frontend | ⬜ |
| 2.2.3 | Web deployed on Vercel, production URL resolves | P0 | Frontend | ⬜ |
| 2.2.4 | `NEXT_PUBLIC_API_URL` set to Railway production URL | P0 | Frontend | ⬜ |
| 2.2.5 | Clerk publishable key set; sign-in flow works in production | P0 | Frontend | ⬜ |
| 2.2.6 | No `.js` import extensions in `apps/web` (webpack handles) | P0 | Frontend | ⬜ |
| 2.2.7 | All API calls unwrap `.data` from response envelope | P0 | Frontend | ⬜ |
| 2.2.8 | Error boundaries present on all page routes | P1 | Frontend | ⬜ |
| 2.2.9 | Core Web Vitals: LCP < 2.5s, CLS < 0.1, FID < 100ms | P1 | Frontend | ⬜ |
| 2.2.10 | Mobile responsive — all pages usable on 375px viewport | P1 | Frontend | ⬜ |

### 2.3 BullMQ Workers

| # | Check | Priority | Owner | Status |
|---|-------|---------|-------|--------|
| 2.3.1 | Campaign worker starts and processes a test job | P0 | Backend | ⬜ |
| 2.3.2 | Contact import worker processes 1000-row CSV in < 2 minutes | P1 | Backend | ⬜ |
| 2.3.3 | Inbound message worker handles Meta webhook within 2s | P0 | Backend | ⬜ |
| 2.3.4 | Flow execution worker processes triggered flow | P1 | Backend | ⬜ |
| 2.3.5 | Workers recover after Redis restart (reconnect logic) | P1 | Backend | ⬜ |
| 2.3.6 | Failed jobs are retried 3× with exponential backoff | P1 | Backend | ⬜ |
| 2.3.7 | Dead letter queue monitored; alert fires when DLQ > 0 | P1 | Backend | ⬜ |

---

## Section 3: Integrations

### 3.1 WhatsApp / Meta

| # | Check | Priority | Owner | Status |
|---|-------|---------|-------|--------|
| 3.1.1 | Meta webhook URL registered and verified (GET verification passes) | P0 | Backend | ⬜ |
| 3.1.2 | Webhook signature validation working (POST with wrong signature = 401) | P0 | Backend | ⬜ |
| 3.1.3 | Send a real test message via production phone number | P0 | Backend | ⬜ |
| 3.1.4 | Receive an inbound message, verify it appears in inbox | P0 | Backend | ⬜ |
| 3.1.5 | Meta access token stored as Railway env var (not hardcoded) | P0 | Backend | ⬜ |
| 3.1.6 | Phone number quality rating webhook handler in place | P1 | Backend | ⬜ |

### 3.2 Clerk Auth

| # | Check | Priority | Owner | Status |
|---|-------|---------|-------|--------|
| 3.2.1 | `CLERK_SECRET_KEY` set in Railway | P0 | Infra | ⬜ |
| 3.2.2 | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` set in Vercel | P0 | Infra | ⬜ |
| 3.2.3 | New user sign-up creates Organization in DB | P0 | Backend | ⬜ |
| 3.2.4 | Clerk webhook endpoint handles `user.created`, `organization.created` | P0 | Backend | ⬜ |
| 3.2.5 | JWT verification uses Clerk JWKS endpoint (not static key) | P0 | Backend | ⬜ |

### 3.3 Stripe

| # | Check | Priority | Owner | Status |
|---|-------|---------|-------|--------|
| 3.3.1 | Stripe live keys set (not test keys) in production | P0 | Infra | ⬜ |
| 3.3.2 | Stripe webhook endpoint registered in Stripe dashboard | P0 | Backend | ⬜ |
| 3.3.3 | Stripe webhook signing secret set in Railway | P0 | Backend | ⬜ |
| 3.3.4 | End-to-end test: checkout → payment → subscription active | P0 | Backend | ⬜ |

### 3.4 Razorpay (India)

| # | Check | Priority | Owner | Status |
|---|-------|---------|-------|--------|
| 3.4.1 | Razorpay live keys set in production | P0 | Infra | ⬜ |
| 3.4.2 | Razorpay webhook secret set | P0 | Backend | ⬜ |
| 3.4.3 | End-to-end test: checkout → UPI payment → subscription active | P0 | Backend | ⬜ |

---

## Section 4: Security

| # | Check | Priority | Owner | Status |
|---|-------|---------|-------|--------|
| 4.1 | All secrets in env vars — zero hardcoded credentials | P0 | All | ⬜ |
| 4.2 | `.env` files not committed to git | P0 | All | ⬜ |
| 4.3 | HTTPS enforced — no plain HTTP in production | P0 | Infra | ⬜ |
| 4.4 | Security headers: `Strict-Transport-Security`, `X-Frame-Options`, `X-Content-Type-Options` | P1 | Backend | ⬜ |
| 4.5 | OWASP ZAP or similar scanner run against staging; no HIGH findings | P0 | Security | ⬜ |
| 4.6 | SQL injection not possible (Prisma parameterized queries only) | P0 | Backend | ⬜ |
| 4.7 | File upload: type validation, size limit (10MB), virus scan or extension allowlist | P1 | Backend | ⬜ |
| 4.8 | Rate limiting: brute-force protection on auth routes | P0 | Backend | ⬜ |
| 4.9 | PII not logged (phone numbers, email, message content not in API logs) | P0 | Backend | ⬜ |
| 4.10 | Tenant data isolation verified: automated RLS test passes | P0 | Backend | ⬜ |

---

## Section 5: Observability

| # | Check | Priority | Owner | Status |
|---|-------|---------|-------|--------|
| 5.1 | Sentry error tracking active; test error visible in dashboard | P1 | Backend | ⬜ |
| 5.2 | Datadog APM traces for all API routes | P1 | Backend | ⬜ |
| 5.3 | PagerDuty alert for API error rate > 1% | P1 | Infra | ⬜ |
| 5.4 | PagerDuty alert for API p95 latency > 500ms | P1 | Infra | ⬜ |
| 5.5 | BullMQ dead letter queue alert | P1 | Backend | ⬜ |
| 5.6 | Railway deploy webhook → Slack `#deployments` channel | P2 | Infra | ⬜ |
| 5.7 | Uptime monitor on `GET /health` (< 1 min detection) | P0 | Infra | ⬜ |

---

## Section 6: Compliance & Legal

| # | Check | Priority | Owner | Status |
|---|-------|---------|-------|--------|
| 6.1 | Privacy policy URL set and accessible | P0 | Legal | ⬜ |
| 6.2 | Terms of service URL set and accessible | P0 | Legal | ⬜ |
| 6.3 | GDPR: contact deletion purges all PII | P0 | Backend | ⬜ |
| 6.4 | GDPR: data export endpoint available | P1 | Backend | ⬜ |
| 6.5 | Audit log captures all PII mutation operations | P1 | Backend | ⬜ |
| 6.6 | Meta WhatsApp Business Platform policy compliance reviewed | P0 | Legal | ⬜ |
| 6.7 | India DPDP Act compliance review completed | P1 | Legal | ⬜ |

---

## Section 7: Functional Parity (Blocking Gaps)

| # | Gap | Priority | Status |
|---|-----|---------|--------|
| 7.1 | Razorpay + UPI payment (GAP-008) | P0 | ⬜ |
| 7.2 | Interactive messages — button, list types (GAP-002) | P1 | ⬜ |
| 7.3 | Mark message as read (GAP-003) | P1 | ⬜ |
| 7.4 | Contact labels CRUD (GAP-001) | P1 | ⬜ |
| 7.5 | Campaign pause/resume (GAP-005) | P1 | ⬜ |
| 7.6 | Working hours + away messages (GAP-011) | P1 | ⬜ |
| 7.7 | Contact export CSV (GAP-015) | P1 | ⬜ |
| 7.8 | Bot timing window (GAP-006) | P1 | ⬜ |

---

## Go-Live Score

| Section | Items | Passed | Score |
|---------|-------|--------|-------|
| Infrastructure | 18 | 0 | 0% |
| Application | 22 | 0 | 0% |
| Integrations | 16 | 0 | 0% |
| Security | 10 | 0 | 0% |
| Observability | 7 | 0 | 0% |
| Compliance | 7 | 0 | 0% |
| Functional Parity | 8 | 0 | 0% |
| **TOTAL** | **88** | **0** | **0%** |

**Go-Live Gate: All P0 items passed + overall score ≥ 90%**

---

*Owner: Engineering Lead | Sign-off required from: CTO, Product Lead, Legal*
