# PRD: API usage tracking and statistics (public API)

Status: APPROVED by the owner's brief (2026-10-06); defaults below were chosen by the engineer, change on request. Role: backend architect.

## Problem
Clients now call the public (Plivo-compatible) API at `/v1/Account/{auth_id}/...`. We record nothing about the calls themselves: per message we keep status data (`api_message_meta`), per credential only `last_used_at`. We cannot answer "how many requests did this client make, how many failed, which endpoints, which credential, when", and we have no foundation for future plans, quotas or usage-based billing.

## Goals (from the owner)
1. Total API hits/requests.
2. Successful vs failed requests; error counts.
3. Usage by client (organization) and by API key (credential).
4. Usage by endpoint and by date/time.
5. A basic statistics dashboard for the client (org admins).
6. NO billing, plans or limits now, but the data model must be able to support subscription plans, usage limits and usage-based billing later WITHOUT re-collecting history.

## Non-goals (now)
Plans, quotas, rate-limit changes, invoices, payment, enforcement of any limit, request/response BODY capture, client IP capture, callback-delivery logging, a platform-wide (cross-org) admin dashboard.

## Decisions (defaults chosen by the engineer)
- **What is recorded per request:** metadata only: time, endpoint key, HTTP method, status code, outcome (success / client_error / server_error), error class, duration (ms), org, credential, request id, number of messages accepted. NO bodies, NO IP, NO URL path (the path contains the auth id and message ids), NO phone numbers or text.
- **Two tiers:**
  1. `api_request_logs`: raw per-request rows, short retention (default 30 days, env `API_REQUEST_LOG_RETENTION_DAYS`), used for the recent-requests table, hourly charts and debugging.
  2. `api_usage_daily`: rollup counters per (organization, credential, UTC day, endpoint), kept indefinitely. This is the METERING source of truth for future billing/limits; raw rows can be deleted without losing usage history.
- **Success sampling knob:** env `API_REQUEST_LOG_SUCCESS_SAMPLE_RATE` (0..1, default 1 = log every request). Errors are always logged raw. Rollups always count EVERY request regardless of sampling, so counts stay exact.
- **Days are UTC.** The dashboard labels daily charts "UTC"; hourly charts use the browser's time zone.
- **Endpoint keys** (stable, never contain ids): `message.send` (POST /Message/), `message.list` (GET /Message/), `message.get` (GET /Message/:uuid/), `other` (anything else under the prefix, e.g. 404s). Add new keys when new endpoints ship.
- **Attribution:** requests with valid credentials are attributed to (org, credential). A request that presents an EXISTING credential id but a wrong token is attributed to that credential as an `auth` failure (the client sees their failed logins). Requests whose credential id does not exist, and requests rejected by the pre-auth rate limiter before auth runs, cannot be attributed: they are written to the raw log with null org/credential (platform-level visibility) and NOT counted in any org's rollup or dashboard.
- **Who can see it:** same people as the credentials screen: permission `settings_access@settings_api_key` (admins by default) and `checkPublicApiAccess` allowed (so orgs that are blocked/not allow-listed or with the flag off see nothing).
- **Never affects the API:** recording is fire-and-forget through an in-memory buffer; any failure is swallowed with a safe log line; the response path never waits for the database.

## Data model (additive migration `20261006100000_api_usage_tracking`, hand-authored SQL)
`api_request_logs`
- `id` TEXT PK (uuid), `organization_id` TEXT NULL, `api_key_id` TEXT NULL, `method` TEXT, `endpoint` TEXT, `status_code` INTEGER, `outcome` TEXT (`success`|`client_error`|`server_error`), `error_class` TEXT NULL (`validation`|`auth`|`access`|`not_found`|`rate_limited`|`client`|`server`), `duration_ms` INTEGER, `messages` INTEGER NOT NULL DEFAULT 0, `request_id` TEXT, `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP.
- Indexes: `(organization_id, created_at)`, `(api_key_id, created_at)`, `(created_at)`.

`api_usage_daily` (PRIMARY KEY `(organization_id, api_key_id, day, endpoint)`)
- `organization_id` TEXT NOT NULL, `api_key_id` TEXT NOT NULL, `day` DATE NOT NULL (UTC), `endpoint` TEXT NOT NULL, `requests` INTEGER, `success` INTEGER, `client_errors` INTEGER, `server_errors` INTEGER, `rate_limited` INTEGER, `auth_failures` INTEGER, `messages` INTEGER (messages accepted = the likely billable unit), `duration_ms_sum` BIGINT, `duration_ms_max` INTEGER, `updated_at` TIMESTAMP(3). All counters NOT NULL DEFAULT 0.
- Index `(organization_id, day)`.
- No foreign keys (credentials are soft-revoked, never deleted; history must survive).

Prisma models mirror the tables (`ApiRequestLog`, `ApiUsageDaily`). Use raw SQL (`INSERT ... ON CONFLICT DO UPDATE SET col = table.col + EXCLUDED.col`, `GREATEST` for max) for the rollup upsert; convert BigInt to Number in the service layer.

## Components
1. `apps/api/src/lib/public-api/usage.ts`: `recordApiRequest(event)` (sync, never throws), buffer + flusher (flush every `API_USAGE_FLUSH_MS` default 5000 or at 200 events; cap the buffer at 10 000, dropping the oldest and counting drops), `flushApiUsage()` (also called on shutdown), `endpointKey(method, routeUrl)`, `outcomeFor(status)`, `errorClassFor(status)`. Aggregates the batch in memory per (org, key, day, endpoint) before one upsert statement per group inside a single transaction.
2. Hook in `routes/public-api/index.ts`: an `onResponse` hook inside the public plugin records every response (status from `reply.statusCode`, duration from `reply.elapsedTime`, endpoint from `request.routeOptions.url`, attribution from `request.publicApi` or the new `request.publicApiAttempt`). `routes/public-api/auth.ts` sets `request.publicApiAttempt = { apiKeyId, organizationId }` as soon as it finds the credential row (before the token check) without changing any response. `POST /Message/` sets `request.usageMessages = <number of messages accepted>`.
3. Usage service `lib/public-api/usage-queries.ts`: `getUsageSummary(prisma, organizationId, { from, to, apiKeyId? })` and `listRequests(...)`. This is THE read layer for the dashboard today and for quota checks / billing later. Every query is org-scoped; a given `apiKeyId` must belong to the org.
4. Dashboard API `routes/api-usage.ts` (Clerk auth, prefix `/v1`): `GET /api-usage/summary?range=24h|7d|30d|custom&from=&to=&apiKeyId=` and `GET /api-usage/requests?limit=&cursor=&outcome=&apiKeyId=&endpoint=`. Max range 366 days; `limit` max 100. Response of summary: `{ range:{from,to,granularity}, totals:{requests,success,clientErrors,serverErrors,rateLimited,authFailures,errorRate,messages,avgLatencyMs,maxLatencyMs}, series:[{t,requests,success,errors}] (daily from rollups; hourly from raw logs when the range <= 48 h), byEndpoint:[...], byCredential:[{apiKeyId,name,revoked,lastUsedAt,...totals}], messagesByStatus:{queued,sent,delivered,read,failed,undelivered} (from api_message_meta in range, org-scoped), topFailureReasons:[{code,title,count}] (from messages.delivery_error of API messages, max 5) }`.
5. Cleanup: a daily job deletes raw rows older than the retention in batches (e.g. 5 000 per statement) so it never holds long locks; scheduled only when `PUBLIC_API_ENABLED=true`. Rollups are never deleted.
6. Web: page `/settings/api-usage` ("API Usage"): range selector (24h / 7d / 30d), credential filter, metric cards (Requests, Success rate, Errors, Messages via API, Avg latency), requests chart (recharts: success vs errors), by-endpoint table, by-credential table, messages-by-status and top failure reasons, recent failed requests table. Link from the API Credentials section and an entry in the settings index; both hidden when the API is not available to the org. Empty state explains how to get started.

## Future billing/limits readiness (documented, NOT built)
- `api_usage_daily` is keyed by org/credential/day/endpoint with `requests` and `messages` counters: a monthly or custom billing period is a SQL `SUM` over days; per-credential and per-endpoint pricing is already separable.
- Future tables (not created now): `api_plans` (name, included requests/messages, price, overage rate), `org_api_subscriptions` (org, plan, period start/end, status), `api_usage_limits`/overrides, `api_invoices`. They reference organizations and read from the usage service; no change to the collection path.
- Future enforcement hook: a `checkQuota(orgId)` call in `publicApiAuth` right after `checkPublicApiAccess` (returns 429/403 with a Plivo-style body), reading `getUsageSummary` for the current period. Not implemented now.
- Metering rule to keep forever: one counter increment per HTTP request at response time, in UTC days, independent of sampling.

## Security and privacy
- Org scoping on every read; the credential filter is validated against the org; the raw log and rollups contain no bodies, IPs, paths, tokens, phone numbers or message text.
- Unattributed requests never appear in any org's dashboard.
- Dashboard endpoints are GET-only (read-like for impersonation sessions), gated like the credentials routes; blocked orgs get the same `403 API_NOT_AVAILABLE`.
- The recorder must not log request data; failures log only the error name/code.

## Rollout
- Migration is additive; tables are written only when the public API is on. Rollback = flag off (nothing else depends on the tables).
- Env (documented in `.env.example`): `API_REQUEST_LOG_RETENTION_DAYS=30`, `API_REQUEST_LOG_SUCCESS_SAMPLE_RATE=1`, `API_USAGE_FLUSH_MS=5000`.

## Acceptance criteria
1. Every response from `/v1/Account/...` (success, 4xx, 5xx, 429) produces exactly one counted request for the right org/credential/endpoint/day, and the response is not slowed by recording.
2. Totals in the dashboard equal the sum of the rollups; success + client_errors + server_errors = requests.
3. An org never sees another org's usage; unattributed requests are in no org's numbers.
4. Wrong-token requests against a real credential count as `auth_failures` for that credential.
5. Raw rows older than the retention are deleted; rollups remain.
6. All numbers needed for a future plan/quota/billing (requests, messages, per credential, per endpoint, per day) are queryable from `api_usage_daily` alone.
7. The dashboard page renders correctly for an empty org (no calls yet) and for an org with data; hidden for orgs without API access.
