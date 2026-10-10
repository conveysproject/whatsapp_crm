# PRD: Billing Phase 2A - Message Metering (Shadow Mode, No Charging)

Status: DRAFT for owner review (no code written)
Date: 2026-10-10
Parent: `docs/prd-usage-billing.md` (Phase 2). Builds on Phase 0/1A/1B, all on `main`.
Author role: backend / billing engineer

## 1. Owner decisions that shape this phase

- **A. Only messages are billable.** No charge for seats, contacts, flows, AI bot or API access. Every customer gets every feature. Consequence: the Phase 1B tier table (contacts/seats/feature switches) is not a pricing lever; it stays dormant (flags off) and its "before enforcing" cleanup is not needed.
- **B. Every outbound message counts, whoever sends it** (agent, campaign, automation, API). Nothing is free by source.
- **Default pricing currency:** INR (₹) first, USD second.
- Price model from earlier decisions: monthly free allowance, volume-tiered per-message platform fee, monthly cap, no markup on Meta's charges (Meta bills the customer directly).

## 2. Problem and evidence

We cannot price messages we do not count. Today:

| # | Finding | Evidence |
|---|---------|----------|
| M1 | Messages are never metered; "messages per month" in the plan catalogue is display-only | `lib/stripe.ts:20-25`, `routes/billing.ts` plans handler |
| M2 | Outbound messages are rows in `messages` with `direction`, `status`, `sentAt`, `organizationId`; statuses are `sending, sent, delivered, read, failed, expired, aborted` | `prisma/schema.prisma` `model Message`, `enum MessageStatus` |
| M3 | A `source` column already exists but is set only on template sends (`api`, `dashboard`, `campaign`, `flow`); plain text from agents, bots and most flow steps leave it NULL. Under decision B billing does not need it, only reporting does | `schema.prisma` Message.source, `workers/campaign.worker.ts:304`, `routes/public-api/messages.ts:156`, `routes/messages.ts:362`, `lib/flow-runner.ts:249` |
| M4 | Existing indexes on `messages` do not support "count outbound by org by month": `(organizationId)`, `(organizationId, direction, status)`, `(organizationId, templateId, sentAt)`, conversation indexes | `schema.prisma` Message `@@index` list |
| M5 | A daily-rollup pattern already exists for the public API (`ApiUsageDaily`, flusher, cleanup cron) | `schema.prisma` `model ApiUsageDaily`, `lib/public-api/usage-queries.ts` |
| M6 | No code sets `isSystemMessage: true`; the flag exists in the schema | grep `isSystemMessage: true` in `src` (none) |

Unknown (not verified): size of the `messages` table, real monthly volumes per org, and how many of today's sends are agent-typed vs automated. No production access was used.

## 3. Goals and non-goals

Goals
1. Count billable outbound messages per organization per UTC day and month, accurately and without slowing the send path.
2. Give the owner (super admin) a monthly per-organization view to set the free allowance, rate tiers and cap from real numbers.
3. Keep it independent of the Stripe lifecycle flag so metering can run alone.

Non-goals (later phases): pricing rules, charging, invoices, customer-facing usage screens, `/admin/billing` rate editor, backfilling old messages, per-source billing.

## 4. Billable message definition (assumed defaults, change if wrong)

A message is billable when: `direction = 'outbound'` AND `status IN ('sent','delivered','read')` AND `isSystemMessage = false`. Not billable: inbound, `sending` (in flight), `failed`, `expired`, `aborted`. A message counts on the UTC day of its `sentAt`. Months are UTC calendar months for the shadow period (billing anniversary dates come with charging).
Counts are idempotent aggregates (recomputed, never incremented), so a status change from `sending` to `failed` or a late delivery receipt is corrected automatically on the next run.

## 5. Design

### 5.1 Data model (hand-authored SQL; local DB is drifted so `prisma migrate dev` fails)
New table `message_usage_daily`: `organization_id TEXT`, `day DATE`, `billable_count INTEGER NOT NULL`, `by_source JSONB NOT NULL DEFAULT '{}'` (counts per `source`, key `unknown` for NULL, for reporting only), `computed_at TIMESTAMP(3)`; primary key `(organization_id, day)`; index on `day`. No foreign key to `organizations` (history must survive org deletion, like `api_request_payloads`).
New index on `messages(organization_id, sent_at)` to make the daily aggregation cheap. **Lock risk:** a plain `CREATE INDEX` blocks writes to `messages` while it builds; build time depends on table size (unknown). See open question 3. Prisma migrations cannot run `CREATE INDEX CONCURRENTLY` inside their transaction, so if the table is large the index must be created out of band by the owner during a quiet window, followed by `prisma migrate resolve --applied <name>`.

### 5.2 Rollup job
`lib/billing/metering.ts` exports `computeDailyUsage(prisma, day, orgIds?)` (pure SQL aggregate: `SELECT organization_id, COUNT(*) FILTER (...) , source breakdown FROM messages WHERE sent_at >= day AND sent_at < day+1 AND direction='outbound' AND status IN (...) AND is_system_message = false GROUP BY organization_id, source`) and `upsertDailyUsage(...)` (UPSERT by `(organization_id, day)`). A BullMQ job (same pattern as `register-phone.worker.ts`) runs hourly and recomputes **today and yesterday (UTC)**; a manual `scripts/recompute-message-usage.ts` (dry-run by default, `--apply`) can recompute any date range. Everything is behind a new flag `BILLING_METERING_ENABLED` (exactly `"true"`), independent of `BILLING_V2_ENABLED`. The send path is untouched.

### 5.3 Admin view
`GET /v1/admin/billing/usage?month=YYYY-MM` (superAdmin only, same gate as other `/admin/*` routes): per organization `{ organizationId, name, planTier, billable, bySource, days: [...] }` sorted by volume, plus totals and percentile summary (p50/p90/p99 of monthly volume) to help choose tiers. Excludes the two internal organizations ("Conveys Information Technology", "Pooyan's Organization") unless `includeInternal=true`. Response contains counts only: no message bodies, phone numbers or customer data. A matching read-only page under `/admin` is a follow-up; the API is enough for now.

### 5.4 What stays out
No `source` backfill, no change to the send routes, no customer-visible numbers (assumed default: admin-only until pricing is announced).

## 6. Security
- Admin route: `role === "superAdmin"` only; no tenant can read another tenant's counts; customers get no new endpoint.
- Job and script touch only `messages` (read) and `message_usage_daily` (write); the script dry-runs by default, reads `DATABASE_URL` from the environment only, prints counts and org ids, never credentials.
- No PII stored: counts and source labels only.
- Internal organizations excluded from the admin summary by default.

## 7. Rollout and rollback
1. Deploy with `BILLING_METERING_ENABLED` unset: new table and index exist, nothing runs. (Index build is the only risk, see 5.1.)
2. Set `BILLING_METERING_ENABLED=true`: the hourly job fills today/yesterday; use the recompute script (dry-run, then `--apply` after owner confirmation) to fill the earlier days of the month if wanted (only messages that still exist can be counted; `message-cleanup` deletes old messages, so earlier history may be incomplete).
3. Review the admin endpoint for about a month, then set the free allowance, tiers and cap (Phase 2B).
Rollback: unset the flag; the table is additive and can stay.

## 8. Acceptance criteria
1. For a fixture day, counts equal the number of outbound `sent/delivered/read` non-system messages per org, excluding inbound, `sending`, `failed`, `expired`, `aborted`.
2. Recomputing the same day twice gives identical rows (idempotent); a message that later becomes `failed` is no longer counted after the next run.
3. Messages are bucketed by UTC day of `sentAt`, including boundary cases (23:59:59.999 and 00:00:00).
4. Flag off: no job scheduled, no queries. Flag on: the send path performs no extra queries.
5. Admin endpoint: 403 for non-superAdmin; internal orgs excluded by default; month filter correct; totals and percentiles correct on a fixture.
6. The recompute script does nothing without exactly `--apply`.
7. Every touched API route passes the org-scoping + RBAC audit.

## 9. Test plan
TDD per task. API (Vitest): aggregation SQL via a Prisma `$queryRaw` mock plus a pure function for bucketing and percentile math; upsert idempotency; job wiring behind the flag; admin route RBAC and exclusion; script argument parsing. Known flaky: `segments.test.ts` (2) and sometimes `public-api/index.test.ts` under load.

## 10. Open questions (I assumed the recommended default for 2-7; reply only with changes)

1. **Resolved:** decisions A and B above.
2. Count `sent`, `delivered`, `read`; exclude `failed`, `expired`, `aborted`, in-flight `sending` [as written].
3. **Messages table size and the index:** is a brief write lock acceptable, or should I give you the SQL to run in a quiet window? [Give me the table size (or approve a read-only row-count query) and I will recommend one.]
4. UTC calendar month for the shadow period [yes].
5. No backfill of old messages; counting starts when the job first runs [yes].
6. Numbers visible to super admins only during the shadow month [yes].
7. Read-only production query (row count of `messages`, monthly outbound volume per tier, excluding internal orgs) to size things now instead of waiting a month [still needs your explicit yes].
