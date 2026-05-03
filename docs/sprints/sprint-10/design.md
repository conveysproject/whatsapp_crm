# Sprint 10 — Campaign Scheduler

## Sprint Goal
Let marketing teams schedule WhatsApp broadcast campaigns to a defined audience segment using an approved template — delivering messages at the right time without requiring engineers to run scripts.

## What We're Building

- **Campaign CRUD API** — `GET/POST /v1/campaigns`. A campaign links a `templateId`, a `segmentId`, and an optional `scheduledAt`. Created with status `draft`.
- **Campaign schedule endpoint** — `POST /v1/campaigns/:id/schedule` with `{ segmentId, scheduledAt? }`. Enqueues a BullMQ delayed job. Sets campaign status to `scheduled`. If `scheduledAt` is omitted, sends immediately (0ms delay).
- **Campaign BullMQ worker** — Processes `send-campaign` jobs: (1) sets campaign `running`, (2) evaluates the segment to get phone numbers, (3) sends each a template message via WhatsApp Cloud API, (4) sets campaign `completed`. Individual send failures are swallowed (the job doesn't fail for per-contact errors) — partial delivery is acceptable for beta.
- **Campaign stats** — Campaign record includes `sentAt`. A future `GET /v1/campaigns/:id/stats` route returns delivery counts (added when message status webhooks are wired to campaign records — Sprint 12).
- **Campaign UI** — `/campaigns` list with status badge. `/campaigns/new` — name, template dropdown (approved only), segment dropdown, optional datetime picker for scheduled send.

## Key Technical Decisions

- **BullMQ delayed jobs over cron** — A campaign's `scheduledAt` translates directly to a BullMQ job `delay` (milliseconds from now). This avoids maintaining a polling loop and survives API server restarts (jobs are persisted in Redis). Cron is only appropriate for recurring schedules — campaigns are one-off sends.
- **Segment evaluation at job run time, not schedule time** — The segment's contacts are computed when the job runs, not when the campaign is scheduled. This means late-added contacts are included if they match the filters by the time the job executes. Trade-off: the count shown at schedule time may differ from actual sends. Acceptable for beta.
- **Per-contact send with no rate-limit awareness** — WhatsApp Cloud API has a messages-per-second limit (80 messages/second per phone number). Sprint 10 sends sequentially without throttling. At 80 msg/s, 10,000 contacts take ~2 minutes. Add rate-limiting (BullMQ rate limiter) in Sprint 22 before GA.
- **No delivery tracking in Sprint 10** — Message status webhooks (delivered/read/failed) from Meta need to be correlated with campaign sends. That correlation table is added in Sprint 12 (Routing & Assignment) alongside the analytics groundwork.

## Dependencies

- **External:** At least one approved template in the templates table; a segment with at least one matching contact
- **Internal:** Sprint 8 complete (segments + evaluator); Sprint 9 complete (templates + approved status); BullMQ + Redis running (from Sprint 3)

## Definition of Done

- [ ] `POST /v1/campaigns` creates campaign with `status: draft`
- [ ] `POST /v1/campaigns/:id/schedule` enqueues a BullMQ job; status → `scheduled`
- [ ] Campaign worker runs: contacts in segment receive the template message on WhatsApp; status → `completed`
- [ ] `/campaigns/new` form submits with template + segment + optional schedule time
- [ ] `/campaigns` list shows status badges updating in real-time (page refresh)
- [ ] `pnpm --filter @WBMSG/api test` — all pass including `campaigns.test.ts`
- [ ] `pnpm type-check` — no errors
- [ ] `pnpm lint` — no errors

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| WhatsApp Cloud API rate limit exceeded on large send | Medium | Medium | Send sequentially — no burst. For >1000 contacts, BullMQ rate limiter added Sprint 22 |
| Campaign worker fails mid-send (crash/timeout) | Medium | Medium | BullMQ retries job from the start (idempotency issue: some contacts receive duplicates). Add a `campaign_contacts` sent-tracker in Sprint 12 |
| Segment evaluates to 0 contacts | Medium | Low | Check before scheduling: `POST /v1/segments/:id/evaluate` returns count 0 → show warning in UI |
| Redis restart loses scheduled jobs | Low | High | Redis AOF persistence enabled in `docker-compose.yml` for staging; production uses ElastiCache with backup |
