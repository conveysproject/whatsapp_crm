# Dashboard v2 (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/dashboard` into an owner-focused page: a "Needs attention" list, KPI cards with period-over-period change, a campaign funnel, one shared range/timezone, one request, and permission-based gating.

**Architecture:** One new read-only endpoint `GET /v1/analytics/dashboard` (new `lib/dashboard-queries.ts`, route added to `routes/analytics.ts`) computes everything from existing tables, filtered per permission and cached per org/range/tz/permission-set. The web page keeps a server component for auth and renders a client `DashboardView` that fetches once. Old page stays behind a feature flag for one release.

**Tech Stack:** Fastify + Prisma (raw SQL only with parameters), Vitest, Next.js App Router, React Query, recharts, Tailwind, Cypress component tests.

**Spec:** `docs/prd-dashboard-v2.md` (section 3 definitions are the contract; do not reinterpret them).

## Global Constraints

- No schema change, no migration in this plan.
- Every query carries `organizationId` from `request.auth`; exclude soft-deleted contacts (`LIVE_CONTACT`) and system messages.
- `range` allow-list `today|7d|30d` (default `7d`); `tz` must pass `Intl.DateTimeFormat`, else 400 `INVALID_TZ`; missing -> `UTC`.
- No message bodies or phone numbers in the response.
- New API code in new files; do not grow `analytics-queries.ts`.
- Server strings render as React text only.
- New components support light and dark (`dark:` classes) and work at 360px.
- Commit message trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- DST/zone boundary: "today" in `Asia/Kolkata` and in a DST zone (`America/New_York` on a change day) starts at local midnight, previous window is the same length.
- Zero data: new org returns zeros/nulls, `deltaPct` null when previous is 0, funnel null, no NaN/Infinity.
- Soft-deleted contacts and system messages are not counted anywhere.
- A restricted user (only `analytics_access`) never receives inbox/campaign/template/billing items and never gets another user's cached view.
- A campaign name like `<img src=x onerror=alert(1)>` renders as text.
- Unanswered query: a conversation whose last inbound is 59 min old is excluded, 61 min included; status `bot` excluded; an outbound after the inbound clears it.

---

## File Structure

- Create `apps/api/src/lib/dashboard-range.ts` (+test): `parseRange`, `isValidTz`, `windowFor`.
- Create `apps/api/src/lib/dashboard-queries.ts` (+test): `getDashboardKpis`, `getAttentionCounts`, `getCampaignFunnel`.
- Modify `apps/api/src/routes/analytics.ts`: add route; clamp `days` in existing handlers.
- Modify `apps/api/src/routes/analytics.test.ts`: route tests.
- Create `apps/web/lib/format.ts` (+test): `formatDuration`, `relativeTime`, `formatDelta`.
- Create `apps/web/lib/dashboard.ts` (+test): types, `fetchDashboard`, `normalizeDashboard`.
- Create `apps/web/components/dashboard/{DashboardView,AttentionList,KpiGrid,CampaignFunnel,DashboardStates,RangePicker}.tsx`.
- Modify `apps/web/app/(dashboard)/dashboard/page.tsx` (flag + gating), update importers of the duplicated helpers.
- Modify inbox (Task 8) only if Q3b is approved.
- Create `apps/web/cypress/component/Dashboard.cy.tsx`.

---

### Task 1: Range and timezone windows

**Files:** Create `apps/api/src/lib/dashboard-range.ts`, `apps/api/src/lib/dashboard-range.test.ts`.

**Interfaces:**
- Produces: `type DashRange = "today" | "7d" | "30d"`; `parseRange(v: unknown): DashRange | null` (undefined -> `"7d"`, bad -> null); `isValidTz(tz: string): boolean`; `windowFor(range: DashRange, tz: string, now: Date): { start: Date; end: Date; prevStart: Date; prevEnd: Date }`.

- [ ] **Step 1: Failing tests**
```ts
import { describe, it, expect } from "vitest";
import { parseRange, isValidTz, windowFor } from "./dashboard-range.js";

describe("parseRange", () => {
  it("defaults and validates", () => {
    expect(parseRange(undefined)).toBe("7d");
    expect(parseRange("30d")).toBe("30d");
    expect(parseRange("bogus")).toBeNull();
  });
});
describe("isValidTz", () => {
  it("accepts IANA and rejects junk", () => {
    expect(isValidTz("Asia/Kolkata")).toBe(true);
    expect(isValidTz("Not/AZone")).toBe(false);
    expect(isValidTz("")).toBe(false);
  });
});
describe("windowFor", () => {
  it("today starts at local midnight in Asia/Kolkata (UTC+5:30)", () => {
    const now = new Date("2026-10-10T20:00:00Z"); // 2026-10-11 01:30 IST
    const w = windowFor("today", "Asia/Kolkata", now);
    expect(w.start.toISOString()).toBe("2026-10-10T18:30:00.000Z");
    expect(w.end).toEqual(now);
    expect(w.prevEnd).toEqual(w.start);
    expect(w.end.getTime() - w.start.getTime()).toBe(w.prevEnd.getTime() - w.prevStart.getTime());
  });
  it("today handles a DST change day in America/New_York", () => {
    const now = new Date("2026-11-01T18:00:00Z"); // fall back day, 13:00 EST
    const w = windowFor("today", "America/New_York", now);
    expect(w.start.toISOString()).toBe("2026-11-01T04:00:00.000Z"); // midnight EDT (UTC-4)
  });
  it("7d is now minus 7x24h with an equal previous window", () => {
    const now = new Date("2026-10-10T00:00:00Z");
    const w = windowFor("7d", "UTC", now);
    expect(w.start.toISOString()).toBe("2026-10-03T00:00:00.000Z");
    expect(w.prevStart.toISOString()).toBe("2026-09-26T00:00:00.000Z");
  });
});
```
- [ ] **Step 2: Run** `cd apps/api && pnpm vitest run src/lib/dashboard-range.test.ts` -> FAIL (module missing).
- [ ] **Step 3: Implement**
```ts
export type DashRange = "today" | "7d" | "30d";
const DAYS: Record<Exclude<DashRange, "today">, number> = { "7d": 7, "30d": 30 };

export function parseRange(v: unknown): DashRange | null {
  if (v === undefined) return "7d";
  return v === "today" || v === "7d" || v === "30d" ? v : null;
}

export function isValidTz(tz: string): boolean {
  if (!tz) return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; }
}

// Offset (ms) of `tz` from UTC at instant `at`.
function offsetMs(at: Date, tz: string): number {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(at);
  const g = (t: string): number => Number(p.find((x) => x.type === t)?.value);
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second"));
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

function startOfDayInTz(now: Date, tz: string): Date {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const g = (t: string): number => Number(p.find((x) => x.type === t)?.value);
  const localMidnightAsUtc = Date.UTC(g("year"), g("month") - 1, g("day"));
  // Two-pass correction so the offset is taken at the target instant (DST-safe).
  let guess = new Date(localMidnightAsUtc - offsetMs(now, tz));
  guess = new Date(localMidnightAsUtc - offsetMs(guess, tz));
  return guess;
}

export function windowFor(range: DashRange, tz: string, now: Date): { start: Date; end: Date; prevStart: Date; prevEnd: Date } {
  const start = range === "today" ? startOfDayInTz(now, tz) : new Date(now.getTime() - DAYS[range] * 86_400_000);
  const len = now.getTime() - start.getTime();
  return { start, end: now, prevStart: new Date(start.getTime() - len), prevEnd: start };
}
```
- [ ] **Step 4: Run** the test -> PASS. If the DST case fails, fix `startOfDayInTz` (do not weaken the test).
- [ ] **Step 5: Commit** `feat(api): dashboard range and timezone windows`.

---

### Task 2: KPI queries

**Files:** Create `apps/api/src/lib/dashboard-queries.ts` (KPIs part), `apps/api/src/lib/dashboard-queries.test.ts`.

**Interfaces:**
- Consumes: `windowFor` result from Task 1.
- Produces: `interface Kpi { value: number | null; previous: number | null; deltaPct: number | null }`; `deltaPct(cur: number|null, prev: number|null): number | null` (null if prev is null/0 or cur null; rounded to 1 decimal); `getDashboardKpis(prisma, organizationId, w): Promise<{ openConversations: { value: number }; newConversations: Kpi; newContacts: Kpi; messages: Kpi & { inbound: number; outbound: number }; firstReplySecs: Kpi; campaignsSent: Kpi }>` where `w = ReturnType<typeof windowFor>`.

- [ ] **Step 1: Failing tests** (mock Prisma like `analytics.test.ts`): `deltaPct(10, 0) === null`, `deltaPct(15, 10) === 50`, `deltaPct(5, 10) === -50`; `getDashboardKpis` calls every count with `organizationId: "org-1"` and `contact: { deletedAt: null }`/`isSystemMessage: false`; new org (all zeros) returns `value 0`, `deltaPct null`, `firstReplySecs.value null` (no NaN); first-reply average: conversation created by an inbound at t0 and first outbound at t0+120s, another with 60s -> 90.
- [ ] **Step 2: Run** `pnpm vitest run src/lib/dashboard-queries.test.ts` -> FAIL.
- [ ] **Step 3: Implement.** Use `prisma.conversation.count`, `prisma.contact.count`, `prisma.message.count` (two calls for inbound/outbound, non-system), `prisma.campaign.count`. First reply: `prisma.$queryRaw` with parameters:
```sql
SELECT AVG(EXTRACT(EPOCH FROM (o.first_out - i.first_in)))::float AS secs
FROM (
  SELECT m.conversation_id, MIN(m.created_at) FILTER (WHERE m.direction = 'inbound')  AS first_in,
                            MIN(m.created_at) FILTER (WHERE m.direction = 'outbound') AS first_out
  FROM messages m
  JOIN conversations c ON c.id = m.conversation_id
  JOIN contacts ct ON ct.id = c.contact_id AND ct.deleted_at IS NULL
  WHERE m.organization_id = ${organizationId} AND m.is_system_message = false
    AND c.created_at >= ${start} AND c.created_at < ${end}
  GROUP BY m.conversation_id
) x
WHERE x.first_in IS NOT NULL AND x.first_out IS NOT NULL AND x.first_out >= x.first_in
```
(split into `i`/`o` aliases as needed; keep it parameterised via Prisma tagged template; round result, null when no rows). Verify table/column names against `schema.prisma` `@map` values before writing.
- [ ] **Step 4: Run** tests -> PASS. **Step 5: Commit** `feat(api): dashboard KPI queries`.

---

### Task 3: Needs-attention queries

**Files:** Modify `apps/api/src/lib/dashboard-queries.ts` and its test.

**Interfaces:**
- Produces: `type AttentionKey = "unanswered" | "sla_at_risk" | "failed_messages" | "templates"`; `getAttentionCounts(prisma, organizationId, now: Date, want: Set<AttentionKey>): Promise<Record<AttentionKey, number>>` (queries run only for keys in `want`; others are 0).

- [ ] **Step 1: Failing tests** for the boundaries in Review Focus (59 vs 61 min, `bot` excluded, outbound after inbound clears it, `none requested -> no queries`), SLA at risk (`now > createdAt + firstResponseSecs`, no outbound), failed = `failed|expired|aborted` within 24h and non-system, templates = status in `rejected|paused|flagged|limit_exceeded|disabled`. Each asserts `organizationId` is in the where / SQL params.
- [ ] **Step 2: Run** -> FAIL.
- [ ] **Step 3: Implement.** Unanswered via `$queryRaw` (parameters only):
```sql
SELECT COUNT(*)::int AS n FROM conversations c
JOIN contacts ct ON ct.id = c.contact_id AND ct.deleted_at IS NULL
WHERE c.organization_id = ${organizationId}
  AND c.status IN ('open','pending')
  AND c.last_inbound_at IS NOT NULL AND c.last_inbound_at < ${threshold}
  AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id
                  AND m.direction = 'outbound' AND m.is_system_message = false
                  AND m.created_at > c.last_inbound_at)
```
`threshold = now - 60 min`. SLA at risk: `prisma.conversation.findMany` with `slaId: { not: null }`, status open/pending, live contact, `select: { createdAt, sla: { select: { firstResponseSecs } } }`, plus first-outbound existence via `message.groupBy` on those ids (follow `analytics-queries.ts:204-228`), counted in code. Failed: `prisma.message.count`. Templates: `prisma.template.count`.
- [ ] **Step 4: Run** -> PASS. **Step 5: Commit** `feat(api): dashboard attention queries`.

---

### Task 4: Campaign funnel

**Files:** Modify `apps/api/src/lib/dashboard-queries.ts` and its test.

**Interfaces:**
- Produces: `interface Funnel { id: string; name: string; sentAt: string; sent: number; delivered: number; read: number; failed: number }`; `getCampaignFunnel(prisma, organizationId): Promise<{ current: Funnel | null; previous: Funnel | null }>` (last two `completed` campaigns by `sentAt desc`, `isArchived` ignored).

- [ ] **Step 1: Failing tests:** fewer than 2 campaigns -> previous null; none -> both null; counts: sent = recipients with status `sent|accepted|delivered|played|read` (not pending/cancelled/failed), delivered = `delivered|played|read`, read = `read|played` (PRD Q5 default), failed = `failed|expired`; scoped by `organizationId`.
- [ ] **Step 2: Run** -> FAIL. **Step 3: Implement** with `campaign.findMany({ take: 2 })` and one `campaignRecipient.groupBy({ by: ["campaignId","status"], where: { organizationId, campaignId: { in: ids } }, _count: true })`.
- [ ] **Step 4: Run** -> PASS. **Step 5: Commit** `feat(api): dashboard campaign funnel`.

---

### Task 5: Dashboard route with permission filtering

**Files:** Modify `apps/api/src/routes/analytics.ts`, `apps/api/src/routes/analytics.test.ts`.

**Interfaces:**
- Consumes: Tasks 1-4; `canAccess`, `canAccessSub` from `../lib/permissions.js`; the WhatsApp-connected check used by `/onboarding/status` (read `routes/onboarding.ts` first and reuse its logic via a small shared function if one exists, else query the same field; do not duplicate guessing).
- Produces: `GET /v1/analytics/dashboard` per PRD section 6.

- [ ] **Step 1: Failing tests:** 400 `INVALID_RANGE`, 400 `INVALID_TZ`; 403 without `analytics_access` (section hook); 200 shape for admin with all keys; restricted user (`permissions: { analytics_access: "allow" }`, role `agent`) gets `attention` without unanswered/sla/failed/templates/plan items and `campaignFunnel` null; each queried function receives `organizationId: "org-1"`; cache key differs by range, tz and permission-set; attention items with count 0 are omitted; response contains no `body`/`phoneNumber` fields.
- [ ] **Step 2: Run** `pnpm vitest run src/routes/analytics.test.ts` -> new tests FAIL, old tests still pass.
- [ ] **Step 3: Implement.** Permission map (names from `default-role-permissions.ts`): unanswered/sla -> `inbox_access`; failed messages -> `inbox_access`; templates -> `templates_access`; campaign funnel -> `campaigns_access`; plan usage -> `canAccessSub(..., "settings_access", "settings_billing")`; WhatsApp disconnected -> any user with `analytics_access`. Build `want` from the user's permissions, derive `permSig` (sorted allowed keys joined) and use `orgKey(organizationId, \`analytics:dashboard:${range}:${tz}:${permSig}\`)`, TTL 60s. Each attention item: `{ key, severity, count, label, href }` with hrefs: `/inbox`, `/inbox`, `/messages`, `/templates`, `/settings/billing`, `/settings/whatsapp-account` (D4: no filters yet). Also clamp `days` in `/analytics/overview|conversations|team|campaigns|conversation-status` to 1..90 (NaN -> 30) with a test.
- [ ] **Step 4: Run** the route tests and `pnpm tsc --noEmit` (baseline-compare) -> PASS.
- [ ] **Step 5: Security check and commit** (every query has `organizationId`; permission filtering verified by test) `feat(api): analytics dashboard endpoint`.

---

### Task 6: Web data layer and shared helpers

**Files:** Create `apps/web/lib/format.ts`, `format.test.ts`, `apps/web/lib/dashboard.ts`, `dashboard.test.ts`; modify the three components that define `formatDuration` (`OrgMetricCards.tsx`, `MyWorkSection.tsx`, `TeamLeaderboard.tsx`) and two that define `relativeTime` (`MyWorkSection.tsx`, `ActivityFeed.tsx`) to import from `lib/format.ts`.

**Interfaces:**
- Produces: `formatDuration(secs: number | null): string` ("—" for null/0), `relativeTime(iso: string, now?: number): string`, `formatDelta(pct: number | null): { text: string; up: boolean | null }`; in `dashboard.ts`: `DashboardData` (PRD section 6 shape), `fetchDashboard(getToken, range, tz, signal): Promise<DashboardData>` (throws `DashboardError` with `status`), `normalizeDashboard(raw: unknown): DashboardData` (defaults for missing fields, never throws on a partial body).

- [ ] **Step 1: Failing tests** (vitest): the existing `formatDuration` outputs (`0 -> "—"`, `45 -> "45s"`, `125 -> "2m 5s"`, `3900 -> "1h 5m"`) are preserved; `formatDelta(null)` -> `{ text: "—", up: null }`, `formatDelta(12.5)` -> `{ text: "12.5%", up: true }`; `normalizeDashboard({})` returns empty attention, null funnel and zero KPIs; fetch with `403` throws `DashboardError` status 403.
- [ ] **Step 2: Run** `cd apps/web && pnpm vitest run lib/format.test.ts lib/dashboard.test.ts` -> FAIL.
- [ ] **Step 3: Implement** (move the existing function bodies unchanged into `format.ts`; `fetchDashboard` uses `NEXT_PUBLIC_API_URL` like the other components and sends `Authorization: Bearer`).
- [ ] **Step 4: Run** tests, `pnpm tsc --noEmit` (compare with baseline; `e2e/` has known errors) and `pnpm lint` -> PASS.
- [ ] **Step 5: Commit** `refactor(web): shared format helpers and dashboard data layer`.

---

### Task 7: Dashboard v2 UI behind a flag

**Files:** Create `apps/web/components/dashboard/*` (list in File Structure) and `apps/web/cypress/component/Dashboard.cy.tsx`; modify `apps/web/app/(dashboard)/dashboard/page.tsx`.

**Interfaces:**
- Consumes: `fetchDashboard`, `DashboardData`, `formatDelta`, `formatDuration` (Task 6); `useCurrentUser`, `canAccess` (`lib/can.ts`).
- Produces: `<DashboardView />` (client): range from `?range=` (default `7d`) via `useSearchParams`/`router.replace`; `tz` from `Intl.DateTimeFormat().resolvedOptions().timeZone`; `useQuery(["dashboard", range, tz], ..., { retry: false })`.

- [ ] **Step 1: Failing Cypress component specs** (stub `fetch`/`cy.intercept` like `ApiUsageHistory.cy.tsx`): attention list renders items with severity and links; 0 items -> "All clear" state; KPI cards show value and delta (up green, down red, null "—") and are links; range picker changes the request (`range=today`); loading skeleton; API error -> message with Retry that refetches; 403 -> "You do not have access to the dashboard"; campaign name `<img src=x onerror=alert(1)>` renders as literal text; funnel null -> "No campaigns sent yet" with a Create link; 360px viewport has no horizontal scroll; dark class applied renders without invisible text.
- [ ] **Step 2: Run** Cypress component specs (`ELECTRON_RUN_AS_NODE` must be unset) -> FAIL.
- [ ] **Step 3: Implement.** Layout per PRD (header + RangePicker + disconnected banner when an attention item `whatsapp` is critical; AttentionList; KpiGrid; CampaignFunnel + existing `ConversationChart` (pass `days`); My Work for everyone; `ActivityFeed` shortened). In `page.tsx`: when `process.env.NEXT_PUBLIC_DASHBOARD_V2 === "true"` render the greeting (client component using the browser timezone, fixing the UTC-greeting bug) and `<DashboardView />`, else render the current page unchanged. Gate the org section with `canAccess(user, "analytics_access")`, not the role list. All server strings as React text.
- [ ] **Step 4: Run** Cypress specs, `pnpm vitest run`, `pnpm tsc --noEmit`, `pnpm lint`; open the page locally with the flag on and off (use the `run` skill) and check mobile width and dark mode by eye.
- [ ] **Step 5: Commit** `feat(web): dashboard v2 behind NEXT_PUBLIC_DASHBOARD_V2`.

---

### Task 8 (only if PRD Q3b is approved): Inbox deep links

**Files:** Modify `apps/web/app/(dashboard)/inbox/page.tsx` and `apps/web/components/inbox/ConversationList.tsx` (read both first); add tests.

- [ ] **Step 1:** Read how the inbox selects a conversation and filters today; write a failing test that `?conversation=<id>` selects it and `?filter=unread|assigned|unanswered` applies the matching list filter (filter semantics must reuse the existing inbox filter logic and the `inbox_*` visibility rules in `lib/visibility.ts`; do not widen what a user can see).
- [ ] **Step 2-4:** Implement minimal param handling, run tests, security check (a user cannot open a conversation outside their visibility by passing an id).
- [ ] **Step 5:** Update the Task 5 hrefs for unanswered/SLA to the new filters. Commit `feat(web): inbox deep links`.

---

### Task 9: Verify, document, release notes

- [ ] **Step 1: Security audit** of the touched route: `organizationId` from `request.auth` everywhere, permission filtering tests, cache key includes permission set, no PII fields, raw SQL parameterised.
- [ ] **Step 2: Performance gate:** run `EXPLAIN (ANALYZE)` of the unanswered query against production-sized data only after the owner confirms a read-only prod session (production reads need explicit confirmation); record the timing in the PRD. If slow, open a follow-up for an index; do not ship an index blind.
- [ ] **Step 3:** Run `/check`, `/test-api`, `/test-web` (known flaky: 2 API failures in segments/conversations; Redis-rejection noise). Report any other failure as real.
- [ ] **Step 4:** Write `docs/runbooks/dashboard-v2.md` (flag, definitions summary, rollback, cache TTL). Invoke `superpowers:verification-before-completion`, then finish the branch by merging locally.
- [ ] **Step 5:** Save memory notes (new endpoint, flag, open Phase 2 items).

---

## Self-review

- Spec coverage: header/range/tz (T1, T7), attention (T3, T5, T7), KPIs (T2), funnel (T4), one endpoint (T5), permission gating (T5, T7), definitions (T1-T4), deep links (T8), flag/rollback (T7, T9), non-goals untouched.
- Placeholder scan: SQL table/column names in Task 2 and 3 must be checked against `@map` values when writing (called out in-step); the WhatsApp-connected source is read from `routes/onboarding.ts` before use (called out in Task 5).
- Types: `DashRange`, `Kpi`, `Funnel`, `AttentionKey`, `windowFor` result and `DashboardData` are named identically across tasks.
