# Sprint 12 — Routing & Assignment + Closed Beta Launch

## Sprint Goal
Give team leads full control over how incoming conversations are handled — automatic assignment via routing rules, manual reassignment, SLA tracking — then ship the closed beta to the first 10 customer accounts.

## What We're Building

- **Routing rules** — `RoutingRule` Prisma model: priority-ordered rules with `conditions` (JSONB array) and `assignTo` (user or team ID). `GET/POST/DELETE /v1/routing-rules`. The evaluator runs on new conversation creation in the inbound message worker.
- **`evaluateRoutingRules(prisma, conversation)`** — Iterates rules by descending priority. For each rule, checks all conditions (channel type, status). Returns first matching rule's `{ assignTo, assignType }`. If no rule matches, conversation remains unassigned.
- **Assignment endpoint** — `PATCH /v1/conversations/:id/assign` with `{ assignedTo: userId }`. Available for manual reassignment by agents/managers. Restricted by RBAC: only `admin` and `manager` can assign to other users.
- **SLA policies** — `SlaPolicy` Prisma model: `firstResponseSecs` (default: 3600 = 1 hour), `resolutionSecs` (default: 86400 = 24 hours). Stub GET endpoint returns the default policy. Full SLA enforcement (breach alerts, reports) is deferred to Sprint 17 (Analytics).
- **Routing settings UI** — `/settings/routing` — list of active routing rules with priority, conditions summary, and assigned-to display. "Add Rule" button (form modal in Sprint 13). Delete rule button.
- **Closed beta launch checklist** — Verify all Definition of Done items for Sprints 1–12. Provision 10 customer accounts via Clerk + manual org setup. Monitor Sentry for errors.

## Key Technical Decisions

- **Priority-based rule matching, first-match wins** — Simple, predictable, auditable. An engineer can look at the rules list in priority order and reason about which rule fires. Round-robin and skill-based routing are Sprint 12+ extensions.
- **Auto-routing at inbound message time, not webhook time** — Routing happens inside the BullMQ worker (after the conversation is persisted), not in the webhook handler. This keeps the webhook fast (returns 200 to Meta immediately) and makes routing failures non-blocking.
- **`assignedTo` as a string (Clerk user ID)** — Not a foreign key to the `users` table (which could cascade-delete). Clerk is the source of truth for user existence; we store the ID by value. If a user is deactivated (`isActive: false`), routing rules pointing to them are skipped (check in evaluator).
- **SLA stub in Sprint 12** — The `sla_policies` table is created and a default policy is readable. Actual SLA enforcement (timers, breach detection, escalation) requires the analytics event pipeline from Sprint 17. Shipping a stub now prevents a migration mid-analytics-sprint.
- **Closed beta is invite-only Clerk orgs** — No self-serve signup in Sprint 12. Admin creates each org manually in the admin dashboard (Clerk's built-in org management), provisions the WABA connection, and hands over credentials. Self-serve onboarding is Sprint 24.

## Dependencies

- **External:** 10 beta customer accounts identified; Clerk org management access for admin setup
- **Internal:** All Sprints 1–11 complete; SRE joins team (per team plan, Sprint 12)

## Definition of Done

- [ ] `POST /v1/routing-rules` creates a rule; `GET /v1/routing-rules` returns it
- [ ] Inbound message on a conversation with a matching routing rule → `assignedTo` set on conversation
- [ ] `PATCH /v1/conversations/:id/assign` manually assigns conversation; returns updated record
- [ ] `/settings/routing` page lists rules
- [ ] `GET /v1/sla-policies` returns the default policy (stub)
- [ ] All Sprints 1–11 DoD items verified green
- [ ] Sentry shows no unhandled errors from beta accounts after 48-hour soak
- [ ] `pnpm --filter @trustcrm/api test` — all pass including `routing.test.ts`
- [ ] `pnpm type-check` — no errors
- [ ] `pnpm lint` — no errors

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Routing rule loop (rule assigns to an inactive user) | Medium | Medium | Evaluator checks `users.isActive` before returning assignment; skips to next rule if user inactive |
| Beta customer's WABA not connected on Day 1 | High | Medium | Pre-flight checklist: WABA + phone number + webhook URL confirmed before handing over account |
| Routing rules settings page needs a create form | Medium | Low | "Add Rule" button is a deferred modal (shows "Coming Soon" in Sprint 12 beta); full form in Sprint 13 |
| SRE join delay blocks ops readiness | Low | Medium | Runbook written by Platform pod; SRE reviews on join; no hard dependency on join for beta |
