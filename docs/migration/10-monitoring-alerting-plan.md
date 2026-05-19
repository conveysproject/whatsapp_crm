# Monitoring & Alerting Plan — TrustCRM

> **Stack:** Sentry + Datadog + PagerDuty | **Date:** 2026-05-18

---

## SLA / SLO Targets

| Metric | SLO Target | Alert Threshold | P0 Threshold |
|--------|-----------|----------------|-------------|
| API Uptime | 99.9% (43min/month downtime) | Uptime < 99.95% | Uptime < 99.5% |
| API p95 Latency (non-campaign) | < 200ms | > 500ms | > 2000ms |
| API p95 Latency (campaign endpoints) | < 500ms | > 1000ms | > 5000ms |
| HTTP 5xx Error Rate | < 0.1% | > 1% | > 5% |
| Webhook Processing Time | < 2s | > 5s | > 10s |
| Campaign Send Throughput | 1000 msg/min | < 500 msg/min | < 100 msg/min |
| Meilisearch Search Latency | < 100ms | > 250ms | > 1000ms |
| BullMQ Queue Depth (campaign) | < 10k | > 50k | > 500k |

---

## Alert Definitions

### P0 — Page Immediately (PagerDuty)

| Alert Name | Condition | Metric Source | Runbook |
|-----------|-----------|--------------|---------|
| API Down | `GET /health` non-200 for > 1 min | Uptime monitor | `docs/runbooks/api-down.md` |
| Error Rate Critical | HTTP 5xx rate > 5% over 5 min | Datadog | `docs/runbooks/error-spike.md` |
| Database Unreachable | Prisma connection error in logs | Sentry | `docs/runbooks/db-down.md` |
| Redis Unreachable | BullMQ connection error | Sentry | `docs/runbooks/redis-down.md` |
| Meta Webhook Backlog | Inbound queue > 10k messages | Datadog | `docs/runbooks/webhook-backlog.md` |
| Auth Service Down | Clerk JWT validation failing for > 2 min | Sentry | `docs/runbooks/auth-down.md` |

### P1 — Notify (Slack + on-call awareness)

| Alert Name | Condition |
|-----------|-----------|
| High Latency | p95 API latency > 500ms for 10 min |
| Campaign Worker Stalled | Campaign job not processed within 5 min of scheduled time |
| BullMQ Dead Letter Queue > 0 | Any job in DLQ |
| Meilisearch Lag | Index update > 60s behind DB write |
| Memory Usage > 80% | Railway container memory |

### P2 — Log Only (Datadog dashboard)

| Alert Name | Condition |
|-----------|-----------|
| Elevated 4xx Rate | > 10% requests returning 4xx |
| Slow Queries | Prisma query > 1000ms |
| Cache Hit Rate Low | Redis hit rate < 70% |
| Contact Import Slow | Import job > 5 min for 1000 rows |

---

## Datadog Dashboards

### Dashboard 1: API Health Overview

**Widgets:**
```
Row 1: KPI tiles
  - Uptime % (last 24h)
  - Request rate (req/min)
  - Error rate (%)
  - p95 latency (ms)

Row 2: Time series
  - HTTP status codes by bucket (2xx/4xx/5xx) over 24h
  - API latency percentiles (p50/p95/p99) over 24h

Row 3: Top errors
  - Top 10 error routes with count
  - Sentry error feed (last 50 events)

Row 4: BullMQ
  - Queue depth by queue name
  - Completed jobs/min
  - Failed jobs count
```

**Datadog query examples:**
```
# Error rate
sum:trace.fastify.request.hits{env:production,http.status_code:5*}.as_rate() /
sum:trace.fastify.request.hits{env:production}.as_rate() * 100

# p95 latency
p95:trace.fastify.request.duration{env:production}

# BullMQ queue depth (from custom metric)
max:bullmq.queue.waiting{env:production} by {queue_name}
```

### Dashboard 2: Campaign Performance

**Widgets:**
- Campaign jobs queued vs processed (time series)
- Messages sent per hour
- Message delivery status breakdown (sent/delivered/read/failed)
- WABA quality rating (from Meta webhook events)
- Campaign error rate by error type

### Dashboard 3: Business Metrics

**Widgets:**
- Active organizations (DAU/WAU)
- New contacts created per day
- Messages sent/received per day
- Campaign success rate
- Subscription MRR (Stripe)
- Failed payments (Stripe)

---

## Logging Standards

### Log Levels

| Level | When to Use |
|-------|-------------|
| ERROR | Unexpected exception; action could not complete |
| WARN | Expected failure; fallback taken (e.g., Meilisearch down, search skipped) |
| INFO | Request lifecycle events; worker job start/complete |
| DEBUG | Verbose internal state (dev only; never in production) |

### Structured Log Format

All logs must be JSON (Fastify default):
```json
{
  "level": "info",
  "time": 1716048000000,
  "pid": 1234,
  "hostname": "railway-container",
  "reqId": "req-abc123",
  "orgId": "org-uuid",
  "userId": "user-uuid",
  "method": "POST",
  "url": "/v1/messages",
  "statusCode": 200,
  "responseTime": 145.3
}
```

### PII Redaction Rules

**NEVER log the following:**
- Phone numbers (`phone`, `wa_id`, `to`)
- Email addresses
- Message content / body text
- Auth tokens, API keys, webhook secrets
- Customer names in error messages

**Fastify redaction config:**
```typescript
// apps/api/src/index.ts
const app = Fastify({
  logger: {
    redact: ['req.headers.authorization', 'body.phone', 'body.message', 'body.content'],
  }
})
```

---

## Sentry Configuration

```typescript
// apps/api/src/plugins/sentry.ts
import * as Sentry from '@sentry/node'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,          // 10% of requests traced
  beforeSend(event) {
    // Strip PII from request data
    if (event.request?.data) {
      delete event.request.data.phone
      delete event.request.data.message
    }
    return event
  },
})
```

**Alert rules in Sentry:**
- New issue detected → Slack `#errors` channel
- Issue regression (fixed then re-appeared) → Slack + email
- High volume issue (> 100 occurrences in 1 hour) → PagerDuty P1

---

## Uptime Monitoring

**External uptime monitor** (Datadog Synthetic or similar):
- Check `GET https://trustcrmapi-production.up.railway.app/health` every 60 seconds
- Check `https://trustcrm-web-conveysproject-7758s-projects.vercel.app` every 5 minutes
- Alert after 2 consecutive failures

**Health check endpoint response:**
```typescript
// apps/api/src/routes/health.ts
app.get('/health', async (req, reply) => {
  const checks = {
    api: 'ok',
    db: await prisma.$queryRaw`SELECT 1`.then(() => 'ok').catch(() => 'error'),
    redis: await redis.ping().then(() => 'ok').catch(() => 'error'),
  }
  const status = Object.values(checks).every(v => v === 'ok') ? 200 : 503
  return reply.code(status).send({ status: status === 200 ? 'ok' : 'degraded', checks })
})
```

---

## Audit Logging

All mutations to sensitive data must write to `ActivityLog` table:

| Event | Logged Fields |
|-------|--------------|
| `contact.create` | orgId, userId, contactId |
| `contact.delete` | orgId, userId, contactId |
| `contact.block` | orgId, userId, contactId |
| `campaign.create` | orgId, userId, campaignId |
| `campaign.send` | orgId, userId, campaignId, recipientCount |
| `user.permissions.update` | orgId, adminUserId, targetUserId, newPermissions |
| `organization.suspend` | superAdminId, orgId |
| `billing.subscription.activate` | orgId, planId, gateway |
| `billing.subscription.cancel` | orgId, planId |

---

## Meta WABA Quality Monitoring

Subscribe to `PHONE_NUMBER_QUALITY_UPDATE` webhook:

```typescript
// In webhook handler
case 'PHONE_NUMBER_QUALITY_UPDATE':
  const { phone_number, current_limit, previous_limit } = payload
  if (current_limit === 'FLAGGED') {
    // Alert: WABA quality flagged — pause campaigns
    await pauseAllCampaignsForPhone(phone_number)
    await sendAlert(`WABA ${phone_number} quality FLAGGED — campaigns paused`)
  }
  if (current_limit === 'DISABLED') {
    // Critical: phone number suspended
    await sendPagerDutyAlert(`WABA ${phone_number} DISABLED by Meta`)
  }
```

---

*Owner: Platform Engineering | Review: Monthly*
