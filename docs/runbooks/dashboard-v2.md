# Runbook: Dashboard v2

Spec: `docs/prd-dashboard-v2.md`. Plan: `docs/superpowers/plans/2026-10-10-dashboard-v2.md`.

## What it is
A new `/dashboard` view (attention list, KPI cards with change vs the previous period, campaign funnel) backed by one endpoint, `GET /v1/analytics/dashboard?range=today|7d|30d&tz=<IANA>` (`apps/api/src/routes/analytics.ts`, queries in `apps/api/src/lib/dashboard-queries.ts`, windows in `dashboard-range.ts`). No schema change, no migration.

## Rollback
- There is no feature flag (removed 2026-10-10): `/dashboard` always renders v2.
- Rollback = revert the merge commit that removed the flag (and, if needed, the Dashboard v2 commits) and redeploy the web app. The API endpoint is additive and harmless when unused.
- Inbox changes: the inbox shows Unread / Assigned-to-me quick-filter chips and honours `?conversation=` / `?filter=` for everyone. Reverting those needs a code revert of the `feat(web): inbox deep links` commits.

## Behaviour to know
- Requires `analytics_access`. Attention items and the campaign funnel are filtered per permission: inbox_access (unanswered, SLA at risk, failed messages), templates_access (templates), campaigns_access (funnel), settings_access@settings_billing (plan usage). Admin and superAdmin see everything.
- Responses are cached 60s per org + range + tz + permission set.
- "Today" uses the viewer's browser timezone (there is no organization timezone). Two users of one org can therefore see different "today" numbers.
- "Avg time to first reply" includes bot replies. A human-only figure needs Phase 2 data (message sender, first-response timestamp).
- Deal revenue is intentionally absent (no won/lost definition on pipelines).
- Inbox deep links: `?conversation=<id>`, `?filter=unread|assigned`. `unanswered` and SLA filters are not implemented, so those attention items link to `/inbox`.
- `days` on the existing `/analytics/*` endpoints is now clamped to 1..90 (a client asking for more than 90 days gets 90).

## Release checklist
1. Run `EXPLAIN (ANALYZE)` of the "unanswered chats" query (`getAttentionCounts`, `apps/api/src/lib/dashboard-queries.ts`) and the first-reply query against production-sized data. This is a production read: get the owner's confirmation first. If slow, open a follow-up for an index; do not add one blind.
2. Confirm `templates` count works on production (it failed only on the drifted local database).
3. After deploy, check light/dark and 360px by eye on the real page.

## Known follow-ups (deferred)
- Org timezone setting, human-only first response, delivered/read timestamps, CSAT, insight cards (Phase 2).
- API-side `unanswered` / SLA inbox filter; empty state for filtered inbox; mark-read on deep link; deep link beyond the fetched list page.
- `PLAN_ENTITIES` is duplicated from `/billing/usage`; export it from one place.
