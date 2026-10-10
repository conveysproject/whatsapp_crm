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
`lib/billing/metering.ts` exports `computeDailyUsage(prisma, day)` (pure SQL aggregate: `SELECT organization_id, COUNT(*) FILTER (...) , source breakdown FROM messages WHERE sent_at >= day AND sent_at < day+1 AND direction='outbound' AND status IN (...) AND is_system_message = false GROUP BY organization_id, source`) and `storeDailyUsage(prisma, day, rows, now?)` (UPSERT by `(organization_id, day)`, removes rows of that day without billable messages). A BullMQ job (same pattern as `register-phone.worker.ts`) runs hourly (minute 5) and recomputes **today and yesterday (UTC)**, and a nightly job (00:35 UTC) re-sweeps the **last 5 UTC days** (kept below the 7-day retention minimum) so late status changes are picked up; a manual `scripts/recompute-message-usage.ts` (dry-run by default, `--apply`) can recompute any date range; the dry run shows, per day, what is stored versus recomputed (`stored=` and `delta=`; `n/a` if the table does not exist yet), and the apply output shows what was stored before (`was=`). The job is always on (the owner removed the `BILLING_METERING_ENABLED` flag on 2026-10-11): it only counts, never charges, and is independent of `BILLING_V2_ENABLED`. The send path is untouched.

### 5.3 Admin view
`GET /v1/admin/billing/usage?month=YYYY-MM` (superAdmin only, same gate as other `/admin/*` routes): per organization `{ organizationId, name, planTier, billable, bySource, days: [...] }` sorted by volume, plus totals and percentile summary (p50/p90/p99 of monthly volume) to help choose tiers. Excludes the two internal organizations ("Conveys Information Technology", "Pooyan's Organization") unless `includeInternal=true`. Response contains counts only: no message bodies, phone numbers or customer data. A matching read-only page under `/admin` is a follow-up; the API is enough for now.

### 5.4 What stays out
No `source` backfill, no change to the send routes, no customer-visible numbers (assumed default: admin-only until pricing is announced).

## 6. Security
- Admin route: `role === "superAdmin"` only; no tenant can read another tenant's counts; customers get no new endpoint.
- Job and script touch only `messages` (read) and `message_usage_daily` (write); the script dry-runs by default, reads `DATABASE_URL` from the environment only, prints day keys and counts only (no organization ids), never credentials.
- No PII stored: counts and source labels only.
- Internal organizations excluded from the admin summary by default.

## 7. Rollout and rollback
1. Deploy: the new table and index are created by the migrations and the hourly job starts with the API. (Index build is the only risk, see 5.1.)
2. The hourly job fills today/yesterday; use the recompute script (dry-run, then `--apply` after owner confirmation) to fill the earlier days of the month if wanted (only messages that still exist can be counted; `message-cleanup` deletes old messages, so earlier history may be incomplete).
3. Review the admin endpoint for about a month, then set the free allowance, tiers and cap (Phase 2B).
Rollback: there is no flag any more; revert the commit that starts the worker (`apps/api/src/index.ts`) or stop the job by removing its repeatable jobs in Redis. The table is additive and can stay.

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

Update 2026-10-10: question 7 was approved and run read-only. Result: the `messages` table is about 1 MB (about 367 rows), so question 3 is settled: the plain `CREATE INDEX` in the normal migration is fine. Production has 14 customer organizations, all on Starter, and about one billable message from them this month.

## 11. Deploy checklist

1. Deploy. `start.sh` runs `prisma migrate deploy`, which applies `20261010200000_message_usage_daily` (new table) and `20261010200100_messages_org_sent_idx` (index on `messages`). With a table this small the index builds instantly. Only if `messages` has grown large would the index need to be created out of band first with `CREATE INDEX CONCURRENTLY IF NOT EXISTS "messages_org_sent_at_idx" ON "messages"("organization_id","sent_at")`, followed by `prisma migrate resolve --applied 20261010200100_messages_org_sent_idx`.
2. The job starts with the API (no flag): an hourly job (minute 5) recomputes today and yesterday (UTC), and a nightly job at 00:35 UTC re-sweeps the last 5 UTC days. It needs the new table, so the migration must apply first; `start.sh` runs `prisma migrate deploy` before the app, so it does.
3. Optional backfill of earlier days of the month, from the Railway-linked checkout folder: `cd apps/api && railway run --service Postgres pnpm tsx scripts/recompute-message-usage.ts --from YYYY-MM-DD --to YYYY-MM-DD` is a dry run that writes nothing and shows stored versus recomputed totals per day; add `--apply` only after the owner confirms. The script uses the public database address that `--service Postgres` injects (plain `railway run` uses the unreachable internal address). It counts every organization, including internal ones. Only messages that still exist can be counted, and `message-cleanup` deletes old messages.
4. Read the report as a super admin: `GET /v1/admin/billing/usage?month=YYYY-MM` (add `&includeInternal=true` to include the two internal organizations).
5. Rollback: revert the `index.ts` change that starts the worker (there is no flag). The table and index are additive and can stay.

## 12. Known follow-ups

- Repeated query parameters on the admin endpoint arrive as arrays; behaviour is safe (validation fails) but add an explicit string guard and a test.
- Export the `requireSuperAdmin` helper from `admin.ts` instead of repeating the 403 in `admin-billing.ts`.
- Chunk the organization lookup in the admin endpoint if the number of organizations grows into the thousands.
- If both days fail in one sweep the job still completes; the worker logs an error (`sweep produced no days`) in that case.
- Add a test for `--to` followed by another flag in the recompute script.
- The Phase 1A backfill script now also uses `DATABASE_PUBLIC_URL ?? DATABASE_URL`.

### Before these numbers can drive charges (required for Phase 2B)

- Counts are rebuilt from rows that still exist, so customers can lower billed volume by deleting messages (`DELETE /conversations/:id/history` in `routes/conversations.ts`, and `message-cleanup` deleting by `createdAt` with no server-side minimum for `delete_whatsapp_message_days` in `routes/vendor-settings.ts`). Make billing deletion-proof: an append-only billable-event ledger written when a message first reaches a billable status, or soft delete. Also enforce a server-side retention minimum of at least 7 days.
- Days older than the re-sweep window (5 days) can drift (late Meta failures overcount). Close days (immutable) after N days, or record corrections explicitly.
- The UTC bucketing relies on the database session time zone being UTC; cast explicitly if that ever changes.
- The interactive transaction in `storeDailyUsage` has the default 5 s timeout; set a longer timeout or use `createMany`/`ON CONFLICT` when organizations number in the thousands.
- Internal organizations are excluded by name; consider excluding by id.

### Separate security ticket (pre-existing, not part of this work)

- In `apps/api/src/plugins/auth.ts` the demo-session block checks the raw request URL with `startsWith("/v1/admin")`. The router percent-decodes paths, so an encoded path such as `/v1/%61dmin/...` may reach admin routes in a demo-mode deployment (`IS_DEMO_MODE`; startup refuses it in production). Fix by checking the matched route URL, or by rejecting the demo user in admin handlers.
