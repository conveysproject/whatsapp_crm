# PRD: Dashboard v2 ("Needs attention + outcomes"), Phase 1

Status: DRAFT for owner sign-off (2026-10-10). Page: `/dashboard` (`apps/web/app/(dashboard)/dashboard/page.tsx`). Audience: business owner / admin first. Phase 2 (new timestamps, CSAT, insight cards) is a separate PRD and is out of scope here.

## 1. Problem and evidence

The dashboard reports how busy the account is, not whether it is working or what needs action.

1. **Counts without context.** `MetricCard` supports `trend`/`trendUp` (`components/analytics/MetricCard.tsx:4-5`) but `OrgMetricCards` never passes them (`OrgMetricCards.tsx:26-33`). No card links anywhere.
2. **Nothing tells the user what to do.** SLA, unanswered chats, failed sends, template status and plan limits are not surfaced. Only a small "WhatsApp Connected/Disconnected" pill exists (`dashboard/page.tsx:171-181`).
3. **Misleading numbers.** "Avg First Response" = conversation `createdAt` to the first non-system outbound message, including bot and campaign sends and conversations the business started (`lib/analytics-queries.ts:68-86`). "Messages Today" and `campaignsSentThisMonth` ignore the range and use server-local midnight/month start (`analytics-queries.ts:31-36`). `days` is `parseInt`ed with no validation (`routes/analytics.ts:28`).
4. **Silent failures.** Six independent client fetches after render. The volume chart has no loading/error/empty state (`ConversationChart.tsx:15-25`). `TeamLeaderboard` ignores a 403 from `/analytics/team` (needs `analytics_agent_performance`, `routes/analytics.ts:50-53`) and shows "No activity yet" (`TeamLeaderboard.tsx:41-52`). Errors look different in every widget.
5. **Role gate vs permission model.** Org Overview is gated by `role in (admin, manager, superAdmin)` (`dashboard/page.tsx:163`) while every API route uses permissions (`routes/analytics.ts:18-23`). A custom role with `analytics_access` sees no Org Overview.
6. **Dead click-throughs.** `MyWorkSection` links to `/inbox?filter=assigned`, `?filter=unread`, `?conversation=<id>`, `/contacts?filter=assigned` (`MyWorkSection.tsx:97-111,128`). The inbox page and components contain no `useSearchParams`/`searchParams` handling (grep over `app/(dashboard)/inbox` and `components/inbox`, 2026-10-10), so these params appear to be ignored. Not verified in a browser.
7. **Light mode only, duplicated helpers.** Widgets hard-code `bg-white`/gray text (no `dark:` classes in these components). `formatDuration` is defined in 3 files and `relativeTime` in 2.

## 2. Goals / non-goals

Goals
- A "Needs attention" list that links to the fix.
- KPI cards with change vs the previous period and a click-through.
- One shared range picker (Today / 7d / 30d) and correct timezone handling.
- One dashboard endpoint (one request, one loading/error state) instead of six.
- Permission-based gating and no silent 403s.
- Correct, documented metric definitions.

Non-goals (Phase 2 / later)
- New columns (delivered/read/first-response/resolved timestamps, CSAT, conversation source), time-to-read, SLA compliance %, send-time analysis, insight cards, email digest.
- Deals "won" revenue (no won/lost concept exists, see section 3, D3).
- Cost-per-message view (CreditLedger semantics need their own review).
- Redesign of `/analytics` tabs (they stay as the deep dive).
- Dark mode for the whole app (new dashboard components get `dark:` classes; legacy widgets that remain are not retrofitted).

## 3. Definitions (the contract the numbers follow)

All windows are computed in the viewer's IANA timezone `tz` (query param, validated with `Intl.DateTimeFormat`; invalid -> 400 `INVALID_TZ`; missing -> `UTC`). Range `today` = start of today in `tz` to now. `7d` / `30d` = now minus N x 24h to now. Previous window = the same length immediately before.
Every query is scoped by `organizationId` and excludes soft-deleted contacts (`LIVE_CONTACT`, `analytics-queries.ts:4`) and system messages.

KPI cards (value, previous, deltaPct; deltaPct is null when previous is 0):
- **Open conversations**: snapshot (status `open`), no delta (no history is stored).
- **New conversations**: conversations created in window.
- **New contacts**: contacts created in window, not deleted.
- **Messages**: non-system messages created in window (inbound + outbound shown as a split).
- **First response time**: see D1.
- **Campaigns sent**: campaigns with status `completed` and `sentAt` in window.

Needs-attention items (shown only when count > 0; severity in brackets; each also gated by the permission of the area it links to):
- **WhatsApp disconnected** [critical]: existing `/onboarding/status` `wabaConnected === false`.
- **Unanswered chats** [warning]: conversations with status `open` or `pending`, live contact, `lastInboundAt` older than 60 minutes, and no non-system outbound message created after `lastInboundAt`. Status `bot` is excluded (the bot owns it).
- **SLA at risk** [critical]: conversations `open`/`pending` with an `slaId`, no outbound message yet, and `now > createdAt + firstResponseSecs`. This is a live "overdue now" count, not a historical breach rate.
- **Failed messages (24h)** [warning]: outbound messages with status `failed`/`expired`/`aborted` and `sentAt` in the last 24h.
- **Templates need attention** [warning]: templates with status `rejected`, `paused`, `flagged`, `limit_exceeded` or `disabled`.
- **Plan limit reached / nearly reached** [warning at >= 80%, critical when not allowed]: from the same data as `/billing/usage` (gates), shown only to users with `settings_access@settings_billing`.

Campaign funnel (last completed campaign vs the one before): sent, delivered, read, failed from `campaign_recipients` status. Cumulative definitions: delivered = delivered + played + read; read = read (+ played? see Open question Q5); failed = failed + expired; rates are shares of sent. Denominator 0 -> null.

### D1. First response time (needs an owner decision, section 9 Q1)
Today's number is not a response time. Proposed definition: for conversations created in the window whose first message is inbound, seconds from that first inbound message to the first non-system outbound message, averaged over conversations that have one. Bot vs human cannot be separated from message data: nothing in the API sets `messages.sender_name` (grep of `apps/api/src`, 2026-10-10) and there is no sender-user column. Phase 1 therefore labels the card "Avg time to first reply" (any outbound reply, bot included) and states this in a tooltip. A human-only figure needs Phase 2 data.
Business-hours-aware response time is also Phase 2 (`BusinessHours` exists but its use for analytics is not designed).

### D2. Timezone
There is no organization timezone column (`Organization` has no such field). `VendorSetting` key `bot_timing_timezone` exists but is a bot setting, not a reporting timezone. Phase 1 uses the browser timezone (`Intl.DateTimeFormat().resolvedOptions().timeZone`). Known limit: two users of one org can see different "today" numbers. Owner decision, section 9 Q2.

### D3. Deals
`Pipeline.stages` is a free-form `string[]`; `Deal` has no won/lost flag, only `stage`, `value` (no currency) and `closedAt` (`schema.prisma`, `routes/pipelines.ts:6`). "Revenue won" cannot be defined without assuming a stage name. Phase 1 does NOT show deal revenue. Owner decision, section 9 Q3.

## 4. Architecture fit

- API: new `GET /v1/analytics/dashboard` in `routes/analytics.ts`, queries in a new `lib/dashboard-queries.ts` (keeps `analytics-queries.ts`, 739 lines, from growing). Same section gate (`analytics_access`), same `cacheGet/cacheSet/orgKey` pattern, key includes `range` and `tz` (TTL 60s). Existing endpoints are untouched, so `/analytics` keeps working.
- Per-item permission filtering happens on the server, so the client never receives counts it may not see.
- Web: `dashboard/page.tsx` stays a server component for auth and the user, then renders a client `DashboardView` that fetches once (react-query is already used elsewhere, e.g. the template analytics plan) with one skeleton and one error state with Retry. New components under `components/dashboard/`. Shared `formatDuration`/`relativeTime` move to `lib/format.ts`.
- Gating: web uses `canAccess(user, "analytics_access")` from `lib/can.ts`, not the role list. My Work stays for everyone.
- Charts: recharts (already installed). Click-throughs use existing pages; where a page cannot filter yet, link to the unfiltered page (D4).

### D4. Deep links
The inbox ignores URL params today (finding 6). Phase 1 links go to existing pages without filters, except where Q3b is approved: a small, separate task adds `?filter=unanswered|unread|assigned` and `?conversation=<id>` to the inbox. That also repairs My Work's links.

## 5. Data model and migration

None. Phase 1 reads existing tables only. Indexes used: `messages(conversation_id, sent_at)`, `messages(organization_id, direction, status)`, `conversations(organization_id, status)`. The unanswered query uses a `NOT EXISTS` over messages per candidate conversation; it must be measured (EXPLAIN on a representative org) before release; if slow, add an index in a follow-up (no change shipped blind).

## 6. API contract (additive)

`GET /v1/analytics/dashboard?range=today|7d|30d&tz=<IANA>` (defaults `7d`, `UTC`; invalid -> 400 `INVALID_RANGE` / `INVALID_TZ`):
```
{ data: {
    range, tz, generatedAt,
    attention: [{ key, severity, count, label, href }],      // only count > 0, permission-filtered
    kpis: {
      openConversations: { value },
      newConversations: { value, previous, deltaPct },
      newContacts:      { value, previous, deltaPct },
      messages:         { value, previous, deltaPct, inbound, outbound },
      firstReplySecs:   { value, previous, deltaPct },       // value null when no data
      campaignsSent:    { value, previous, deltaPct }
    },
    campaignFunnel: { current: Funnel | null, previous: Funnel | null }   // Funnel = { id, name, sentAt, sent, delivered, read, failed }
} }
```
Volume chart keeps using `GET /v1/analytics/conversations?days=` (unchanged; `days` clamped to {1..90} as an additive validation fix). No message bodies or phone numbers appear in this response.

## 7. Security

- Org scoping: every query carries `organizationId` from `request.auth`, never from the client. Test per query that another org's rows are not counted.
- RBAC: route requires `analytics_access`; each attention item and the campaign funnel is dropped unless the user also has the area permission (inbox, campaigns, templates, billing sub-permission). Team data is not part of this endpoint.
- Inputs: `range` allow-listed, `tz` validated, no raw interpolation (the one raw SQL uses parameters).
- Server strings (campaign names, labels) render as React text only.
- Cache key includes org, range, tz and the permission-derived item set (so a cached admin view is never served to a restricted user).
- Impersonation: the endpoint is read-only; no change.

## 8. Rollout, rollback, acceptance

- Shipped without a feature flag (decision 2026-10-10: the flag `NEXT_PUBLIC_DASHBOARD_V2` and the old page were removed). Rollback = revert the commit and redeploy the web app. No data change to revert.
- Release checklist: unanswered-query EXPLAIN on prod-size data before relying on the page in production (see docs/runbooks/dashboard-v2.md).

Acceptance criteria
1. An admin sees header, attention list, 6 KPI cards with deltas, campaign funnel, volume chart, My Work, latest activity, all from one dashboard request plus the unchanged chart/my-work/activity endpoints.
2. Each definition in section 3 is unit-tested with fixtures, including 0-denominator -> null and window boundaries in a non-UTC timezone (e.g. Asia/Kolkata, and a DST zone).
3. A user with `analytics_access` but no inbox/campaign/templates/billing permission gets no corresponding items (test).
4. A custom-role user with `analytics_access` sees the overview (test of the web gate).
5. API 500/network failure shows one error with Retry; no widget silently disappears; 403 shows "You do not have access".
6. Dark and light mode render; mobile 360px has no horizontal scroll.
7. Existing analytics tests still pass (known flaky failures excluded).

## 9. Open questions (each with a recommended default)

- **Q1 First response:** accept "Avg time to first reply (bot included)" for Phase 1 and fix it properly in Phase 2? Default: yes.
- **Q2 Timezone:** browser timezone now; add an organization timezone setting in Phase 2? Default: yes.
- **Q3 Deals:** omit revenue until a won/lost definition exists? Default: yes, and in Phase 2 add `won`/`lost` stage designation to pipelines. **Q3b Deep links:** include the small inbox filter task in this release? Default: yes.
- **Q4 Flag:** resolved 2026-10-10: no flag; v2 replaces the old dashboard.
- **Q5 Campaign "read":** does `played` (voice/media) count as read? Default: count `played` as read.
- **Q6 Unanswered threshold:** 60 minutes fixed, or configurable per org? Default: fixed 60 min.
- **Q7 Scope of dark mode:** new components only? Default: yes.

## 10. Risks

- Unanswered query cost on large orgs (mitigated by caching and an EXPLAIN gate).
- Browser-timezone reporting differs between users (documented, Q2).
- "Time to first reply" still includes bots; the label must say so.
- No safety switch: v2 is the only dashboard, so rollback needs a code revert and redeploy.
