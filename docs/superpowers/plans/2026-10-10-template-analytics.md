# Template Analytics (stage 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/templates/:id/analytics` show correct, useful per-template analytics: a cumulative funnel with rates, a date-range trend, failure reasons, source breakdown, reach and a template card, with proper loading, empty, error and no-permission states.

**Architecture:** Link every template message to its template (`messages.template_id`, `messages.source`, additive migration + backfill + writers), compute analytics from that link in one query module, return an additive response from the existing endpoint, and rebuild the page from small components (recharts is already installed).

**Tech Stack:** Prisma 7 + hand-authored SQL migration, Fastify, TypeScript, Vitest (API and web lib), Cypress component tests (web UI), Next.js, React Query, recharts, Tailwind.

**Spec:** `docs/prd-template-analytics.md` (definitions in section 3 are the contract; do not reinterpret them).

## Global Constraints

- Org scoping: every query filters by `organization_id` from `request.auth` AND by a template looked up in the same org. The route keeps the section gate `templates_access` (`routes/templates.ts:26-31`).
- Migration is additive and hand-authored (local DB is drifted: never run `prisma migrate dev`); folder `20261010000000_message_template_link`. No foreign keys.
- Backfill and any production data change: dry-run by default; `--apply` only after the owner confirms. Never run it as part of this plan's tasks against production.
- API response is additive: legacy keys `sent, delivered, read, failed, readPercentage` stay (with the cumulative meaning of PRD section 3).
- No message bodies or phone numbers in the analytics response.
- Customer-facing text: no "Plivo". Dark mode classes and a 375 px layout are required for the page.
- Tests: API `cd apps/api && pnpm vitest run <path>`; web lib `cd apps/web && pnpm vitest run <path>`; web components are Cypress component specs under `apps/web/cypress/component/` (the web app has no Testing Library/jsdom). `pnpm tsc --noEmit` must stay at 0 errors in both apps.

## Review Focus

- Template with messages only in `sending`/`expired`/`aborted` states: counted per PRD section 3, not dropped.
- Template whose name exists in two languages: backfill must NOT guess (left NULL and reported); new sends carry the exact id.
- Messages of another org with the same template name never appear (org scoping, tested).
- Zero messages in range: rates are `null` and the UI shows "—", never `NaN%` or `0%`.
- API failure / 404 / 403: the page shows an error or permission message, never zeros.
- Range switch and a deleted template (messages keep `template_id` after the template row is gone).

---

## File Structure

- Create `apps/api/prisma/migrations/20261010000000_message_template_link/migration.sql`; modify `apps/api/prisma/schema.prisma` (Message model).
- Modify writers: `apps/api/src/lib/record-outbound.ts`, `apps/api/src/routes/messages.ts`, `apps/api/src/routes/templates.ts` (test-send ~line 551), `apps/api/src/routes/public-api/messages.ts` + `apps/api/src/lib/public-api/template-validation.ts` (`TemplateRow.id`), `apps/api/src/workers/campaign.worker.ts`, `apps/api/src/lib/flow-runner.ts`.
- Create `apps/api/scripts/backfill-message-template-link.ts` (+ pure helper and test).
- Create `apps/api/src/lib/template-analytics.ts` (+ test): all queries and shaping.
- Modify `apps/api/src/routes/templates.ts:169-202` (+ test).
- Create `apps/web/lib/template-analytics.ts` (+ vitest test): fetcher, types, normalizer, CSV builder.
- Create `apps/web/components/templates/analytics/{AnalyticsHeader,SummaryCards,FunnelBars,TrendChart,FailureTable,SourceList,AnalyticsStates}.tsx`; rewrite `apps/web/app/(dashboard)/templates/[id]/analytics/page.tsx`; add `apps/web/cypress/component/TemplateAnalytics.cy.tsx`.
- Create `docs/runbooks/template-analytics-backfill.md`.

---

### Task 1: Migration and schema

**Files:** Create `apps/api/prisma/migrations/20261010000000_message_template_link/migration.sql`; Modify `apps/api/prisma/schema.prisma` (model `Message`, near line ~`@@index([organizationId, direction, status])`).

- [ ] **Step 1: Write the migration**

```sql
-- Link outbound template messages to their template and record where they came from. Additive only, no foreign keys
-- (templates can be deleted; analytics history must survive).
ALTER TABLE "messages" ADD COLUMN "template_id" TEXT;
ALTER TABLE "messages" ADD COLUMN "source" TEXT;
CREATE INDEX "messages_org_template_sent_idx" ON "messages"("organization_id", "template_id", "sent_at");
```

- [ ] **Step 2: Add to the `Message` model**

```prisma
  templateId        String?          @map("template_id") // which template this outbound template message used (no FK: history survives template deletion)
  source            String?          // api | dashboard | campaign | flow | test (NULL = unknown/legacy)
```
and `@@index([organizationId, templateId, sentAt], map: "messages_org_template_sent_idx")`.

- [ ] **Step 3: Verify** `cd apps/api && pnpm prisma validate && pnpm prisma generate && pnpm tsc --noEmit` (0 errors). If Docker is running, apply the SQL to a throwaway `postgres:16` (host port 15432; Windows blocks 55423-56022) and compare with `prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script` for the `messages` table; otherwise state clearly that the SQL was not executed.

- [ ] **Step 4: Commit** `git add apps/api/prisma && git commit -m "feat(api): link messages to templates (template_id, source)"`

---

### Task 2: Writers set `template_id` and `source`

**Files:** the writer files listed in File Structure; tests next to each.

**Interfaces:** `recordOutbound` args gain `templateId?: string | null; source?: string | null`. `TemplateRow` (template-validation.ts) gains `id: string`.

- [ ] **Step 1: Failing tests.** For each writer add one test asserting the created message carries the right values (use the file's existing mock style):
  - dashboard send (`routes/messages.ts` ~362): `message.create` data has `templateId: template.id`, `source: "dashboard"`.
  - test-send (`routes/templates.ts` ~551): `templateId` = the route's template id, `source: "test"`.
  - public API (`routes/public-api/messages.ts`): data has `templateId: <resolved row id>`, `source: "api"`; non-template API messages have neither.
  - campaign worker: for a template campaign `recordOutbound` is called with `templateId: campaign.templateId`, `source: "campaign"`; a text campaign passes neither.
  - flow runner `send_template`: looks up `template.findMany({ where: { organizationId, name, language }, select: { id: true }, take: 2 })`; passes `templateId` only when exactly one row, `source: "flow"`.
  - `recordOutbound` writes both columns when given and leaves them undefined otherwise.
- [ ] **Step 2: Run to see them fail** (`pnpm vitest run` on the touched test files).
- [ ] **Step 3: Implement.**

```ts
// lib/record-outbound.ts: add to RecordOutboundArgs
  templateId?: string | null;
  source?: string | null;
// and in prisma.message.create data:
      templateId: args.templateId ?? null,
      source: args.source ?? null,
```
In `routes/public-api/messages.ts` the template lookup select gains `id: true`; keep the resolved row's id in a variable (`let templateIdForMessage: string | null = null`), and add `...(templateIdForMessage ? { templateId: templateIdForMessage, source: "api" } : { source: "api" })` to the `message.create` data (all API sends get `source: "api"`). Add `id: string` to `TemplateRow` and fix its test fixtures.
- [ ] **Step 4: Run** `cd apps/api && pnpm vitest run src/routes src/lib src/workers` (the 2 known flaky segments tests may fail) and `pnpm tsc --noEmit`.
- [ ] **Step 5: Commit** `feat(api): record template_id and source on outbound template messages`.

---

### Task 3: Backfill script (dry-run by default)

**Files:** Create `apps/api/scripts/backfill-message-template-link.ts` and `apps/api/scripts/backfill-message-template-link.helpers.ts` (+ `.test.ts`).

**Interfaces:** `parseTemplateName(body: string | null): string | null` (JSON `{templateName}` or a plain name with no `{`); `planBackfill(rows, templatesByOrgAndName)` pure function returning `{ updates: Array<{ id, templateId, source }>, ambiguous: number, unmatched: number }`.

- [ ] **Step 1: Failing tests** for the pure functions: JSON body -> name; plain name -> name; invalid/other -> null; a name with exactly one template in the org -> update; the name in two languages -> counted `ambiguous`, no update; no template -> `unmatched`; rows that already have `template_id` are skipped; source rules: row with an `api_message_meta` -> `api`; plain-name body -> `flow`; otherwise `unknown` is NOT written (leave `source` NULL).
- [ ] **Step 2: Run to see them fail.**
- [ ] **Step 3: Implement.** The script reads `DATABASE_PUBLIC_URL ?? DATABASE_URL` from env only (never print it), takes `--org <id>` (optional) and `--apply`; default is a dry run that prints per-org counts (to update / ambiguous / unmatched) and changes nothing; with `--apply` it updates in batches of 500 inside separate short transactions, only rows where `template_id IS NULL`, with `organization_id` in every WHERE; prints a final report. Uses the Prisma client with the pg adapter like `apps/api/src/lib/prisma.ts`; connection closed in `finally`; error output prints only fixed text or the error name.
- [ ] **Step 4: Run** the unit tests and `pnpm typecheck:scripts` (if the script is not covered, extend `tsconfig.scripts.json`).
- [ ] **Step 5: Real-Postgres check (needs Docker).** Seed a throwaway DB with one org, two templates (one name in two languages), messages of each body type; run dry run (no changes), then `--apply`; assert the counts and idempotency (second run updates nothing). Do NOT run against production.
- [ ] **Step 6: Commit** `feat(api): dry-run-first backfill for message template links` and write `docs/runbooks/template-analytics-backfill.md` (usage, what is skipped and why, owner-only steps).

---

### Task 4: Analytics query module

**Files:** Create `apps/api/src/lib/template-analytics.ts` and `template-analytics.test.ts`.

**Interfaces:** `export type AnalyticsRange = "7d" | "30d" | "90d" | "all"`; `export function parseRange(v: unknown): AnalyticsRange | null` (undefined -> `"30d"`); `export async function getTemplateAnalytics(prisma, args: { organizationId: string; template: { id: string; name: string; language: string; category: string; status: string; qualityScore: string | null; lastEditedTime: Date | null; bodyText: string | null }; range: AnalyticsRange; now?: Date }): Promise<TemplateAnalytics>`.

- [ ] **Step 1: Failing tests (pure shaping + SQL arguments).** With a mocked `$queryRaw`:
  - funnel math per PRD section 3: statuses `{sending:1, sent:2, delivered:3, read:4, failed:1, expired:1, aborted:1}` -> `inProgress 1`, `sent 9`, `delivered 7`, `read 4`, `failed 3`; rates `delivery 7/9`, `read 4/7`, `failure 3/12` rounded to 1 decimal percentage; zero denominators -> `null`.
  - range -> `from` date (`7d` = now - 7 days start-of-UTC-day, `all` -> null).
  - failures: grouped rows `{code:'131049', title:'...', n:4, last}` -> `message` is the plain-language text via `errorMessageForCode(plivoErrorFromMeta(131049))`; `code null` -> `"unknown"` with the generic text; `share` sums to 100 +/- rounding; top 10.
  - sources: `NULL` -> `unknown`; sorted by count.
  - every raw query receives `organizationId` and `template.id` as parameters (assert the tagged-template values).
- [ ] **Step 2: Run to see them fail.**
- [ ] **Step 3: Implement** with `Prisma.sql` queries (all include `organization_id = ${organizationId} AND template_id = ${template.id} AND direction = 'outbound' AND content_type = 'template'` and `AND sent_at >= ${from}` when a range is set):

```sql
-- statuses
SELECT status::text AS status, count(*)::int AS n FROM messages WHERE ... GROUP BY status;
-- daily (UTC days)
SELECT to_char(date_trunc('day', sent_at), 'YYYY-MM-DD') AS day,
  count(*) FILTER (WHERE status IN ('sent','delivered','read'))::int AS sent,
  count(*) FILTER (WHERE status IN ('delivered','read'))::int AS delivered,
  count(*) FILTER (WHERE status = 'read')::int AS read,
  count(*) FILTER (WHERE status IN ('failed','expired','aborted'))::int AS failed
FROM messages WHERE ... GROUP BY 1 ORDER BY 1;
-- failures
SELECT delivery_error->>'code' AS code, max(delivery_error->>'title') AS title, count(*)::int AS n, max(sent_at) AS last_seen
FROM messages WHERE ... AND status IN ('failed','expired','aborted') GROUP BY 1 ORDER BY n DESC LIMIT 10;
-- sources
SELECT coalesce(source, 'unknown') AS source, count(*)::int AS n FROM messages WHERE ... GROUP BY 1 ORDER BY n DESC;
-- reach
SELECT count(DISTINCT conversation_id)::int AS recipients, max(sent_at) AS last_sent FROM messages WHERE ...;
```
Fill days with no messages as zero rows between `from` and today (so the chart has a continuous axis); cap the series at 366 days for `all` (use the first/last message day).
- [ ] **Step 4: Run** the tests; run `EXPLAIN` of the statuses query on a seeded throwaway DB if Docker is up and confirm it uses `messages_org_template_sent_idx` (record the output in the report; skip with a note if Docker is down).
- [ ] **Step 5: Commit** `feat(api): template analytics queries`.

---

### Task 5: Route

**Files:** Modify `apps/api/src/routes/templates.ts:169-202`; Test `apps/api/src/routes/templates.test.ts`.

- [ ] **Step 1: Failing tests.** `GET /templates/:id/analytics` returns: 404 for another org's id (the `findFirst` where includes `organizationId`); 400 `INVALID_RANGE` for `range=bogus`; 200 with the response shape of PRD section 5 for `range=7d`; legacy keys present; `attributionNote` present only when the org has template messages with NULL `template_id` for this template's name (cheap count query, optional: if complex, return a static note when the org has any NULL-linked template messages); role without `templates_access` -> 403 from the section hook (existing test pattern).
- [ ] **Step 2: Run to see them fail.**
- [ ] **Step 3: Implement** the handler: look up the template (`organizationId` scoped, 404 as today), `parseRange(request.query.range)` -> 400 on null, call `getTemplateAnalytics`, merge the legacy keys, return `{ data }`. Preview text = template `bodyText` (already extracted at sync).
- [ ] **Step 4: Run** `pnpm vitest run src/routes/templates.test.ts src/lib/template-analytics.test.ts` and tsc.
- [ ] **Step 5: Security check and commit** (every Prisma/raw query carries `organizationId`; no message body or phone number in the response) `feat(api): richer template analytics endpoint`.

---

### Task 6: Web page

**Files:** Create `apps/web/lib/template-analytics.ts` (+ `template-analytics.test.ts`), `apps/web/components/templates/analytics/*.tsx`, `apps/web/cypress/component/TemplateAnalytics.cy.tsx`; Rewrite `apps/web/app/(dashboard)/templates/[id]/analytics/page.tsx`.

- [ ] **Step 1: Failing lib tests (vitest, node):** `normalizeAnalytics` rejects non-object/missing `data` with an `AnalyticsError`, coerces numbers, keeps `null` rates; `toCsv` produces a header row, one row per day, a blank line and the failure table, escapes commas/quotes, and prefixes cells starting with `= + - @` with `'` (CSV formula injection); `fetchTemplateAnalytics(id, range)` maps 403 -> `AnalyticsError("FORBIDDEN")`, 404 -> `NOT_FOUND`, network failure -> `NETWORK`.
- [ ] **Step 2: Failing Cypress component specs** (`TemplateAnalytics.cy.tsx`, stub `fetch` with `cy.intercept` or a provider-level stub like `ApiUsageHistory.cy.tsx`): renders header (name, language, category, status, quality), summary cards with counts and rates, funnel, trend chart container, failure table with plain-language text, source list; range picker changes the request (`range=7d`); zero messages -> "No messages sent with this template yet" and "—" rates; API error -> error text with a Retry button that refetches; 403 -> "You do not have access to template analytics"; failure text containing `<img src=x onerror=alert(1)>` renders as literal text; Export button builds a CSV download.
- [ ] **Step 3: Run to see them fail.**
- [ ] **Step 4: Implement.** Page: `"use client"`, `use(params)`, range from `?range=` (default `30d`) via `useSearchParams`/`router.replace`, `useQuery(["template-analytics", id, range], ..., { retry: false })`; sections per the PRD (Header with back link to `/templates`, refresh and export; SummaryCards: Sent, Delivered, Read, Failed + three rates + unique recipients + last sent; FunnelBars: Sent -> Delivered -> Read with drop-off percentages; TrendChart: recharts `ComposedChart` or stacked bars of the daily series with an accessible table fallback; FailureTable; SourceList; attribution note; states component for loading skeleton / empty / error / forbidden). Follow the Tailwind patterns of `components/settings/api-usage/*` (dark mode classes, `Panel`-style cards). Render every server string as React text only. Status chip colors reuse the templates list styling.
- [ ] **Step 5: Run** `cd apps/web && pnpm vitest run lib/template-analytics.test.ts`, the Cypress component specs (`ELECTRON_RUN_AS_NODE` must be unset to start Cypress), `pnpm tsc --noEmit` (compare against the baseline; `e2e/` has known pre-existing errors) and `pnpm lint`.
- [ ] **Step 6: Commit** `feat(web): template analytics page`.

---

### Task 7: End-to-end check, docs, release checklist

- [ ] **Step 1: Real-Postgres smoke** (Docker, throwaway DB on host port 15432, Redis on 16379 only if needed): seed an org with a template and messages in all statuses, via each writer path where practical, run `getTemplateAnalytics` and the route, assert the PRD acceptance numbers, cross-org isolation (a second org with the same template name sees nothing), range filters, and that a second backfill run is a no-op. Print PASS/FAIL per check; refuse non-local DBs (copy the guards from `apps/api/scripts/smoke-payload-logging.ts`).
- [ ] **Step 2: Docs.** `docs/runbooks/template-analytics-backfill.md` (finalize) and a short section in the PRD "As built".
- [ ] **Step 3: Release checklist (owner-only steps marked):** push `main`; migration runs on deploy; run the backfill dry run against production and read the counts (owner); `--apply` after confirmation (owner); open `/templates/<id>/analytics` for `call_milestone_monitor` and confirm 1 read + 2 failed.
- [ ] **Step 4: Full verification** `cd apps/api && pnpm vitest run` (only the 2 known flaky segments tests may fail), `pnpm tsc --noEmit`, web checks as in Task 6.
- [ ] **Step 5: Commit** `docs: template analytics runbook and as-built notes`.

---

## Self-Review

- Spec coverage: PRD section 3 definitions -> Task 4 tests; section 4 -> Tasks 1-3; section 5 -> Task 5; section 6 -> Tasks 4-5 security checks; section 7 -> Task 7; section 8 acceptance -> Tasks 5-7. Non-goals are in the appendix.
- Types: `TemplateRow.id`, `RecordOutboundArgs.templateId/source`, `AnalyticsRange`, `TemplateAnalytics` are defined in the task that creates them and reused by name afterwards.
- Placeholders: none; places that depend on existing test helpers say to read those files first.
- Ordering: Task 1 -> 2 -> 3 can ship together; Task 4 -> 5 -> 6 need Task 1 only. Backfill (production) happens after deploy, by the owner.

## Appendix: later stages (not in this plan)

- Stage 2: `delivered_at`/`read_at` columns set from the status webhook (time to deliver/read, send-time heatmap), reply linking and rate within 24 h, quick-reply taps, alert banners (failure spike, quality drop, marketing limit 131049).
- Stage 3: Meta template analytics tab (clicks, cost: verify the `template_analytics` fields and the conversation-vs-message product type first), quality-score history snapshots on sync.
