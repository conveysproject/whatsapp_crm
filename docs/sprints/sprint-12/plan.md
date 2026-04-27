# Sprint 12 — Implementation Plan

> Full task details are in the batch plan: `docs/superpowers/plans/2026-04-27-sprint-planning-batch-3.md`
> Tasks 11–12 cover Sprint 12.

## Pre-conditions
- Sprints 1–11 complete and merged
- All test suites green: `pnpm test`, `pnpm type-check`, `pnpm lint`
- SRE onboarding scheduled (per team plan)
- 10 beta customer accounts identified and briefed

## Task Summary

| # | Task | Key files |
|---|---|---|
| 11 | Routing rules + SLA models, evaluator, API | `apps/api/prisma/schema.prisma`, `apps/api/src/lib/router.ts`, `apps/api/src/routes/routing.ts`, `apps/api/src/routes/routing.test.ts`, `apps/api/src/workers/inbound-message.worker.ts` |
| 12 | Routing settings UI + final type-check + lint | `apps/web/app/(dashboard)/settings/routing/page.tsx`, `apps/web/components/layout/Sidebar.tsx` |

## Test Checklist

- [ ] `pnpm --filter @trustcrm/api test` — all pass (routing.test, deals.test, campaigns.test, segments.test, templates.test, webhooks.test, contacts.test, organizations.test, health.test)
- [ ] `pnpm type-check` — no errors across all packages
- [ ] `pnpm lint` — no errors
- [ ] Manual: Create routing rule "All WhatsApp → Agent Alice" (channelType equals whatsapp → assignTo: alice-user-id)
- [ ] Manual: Receive inbound WhatsApp message → new conversation created → `assignedTo` set to Alice's user ID
- [ ] Manual: `PATCH /v1/conversations/:id/assign` reassigns to a different agent
- [ ] Manual: `/settings/routing` page renders rule list

## Deployment / Environment Notes

Run migration after schema change:
```bash
cd apps/api
pnpm exec prisma migrate dev --name add_routing_rules_sla
pnpm exec prisma generate
```

No new env vars required.

## Closed Beta Launch Checklist

- [ ] Staging environment reachable at ALB DNS (`terraform output alb_dns_name`)
- [ ] `GET https://<alb>/health` → 200
- [ ] Sentry DSN set; test error appears in Sentry dashboard
- [ ] Datadog agent running; API metrics visible in Datadog
- [ ] Each beta account: org created in Clerk, WABA connected, phone number provisioned, webhook URL pointing to staging
- [ ] Beta users can sign up, receive an inbound message, and reply — end-to-end in production
- [ ] PagerDuty on-call rotation set up for P1/P2 alerts
- [ ] Run `pnpm --filter @trustcrm/api test` on staging after deploy — all pass
