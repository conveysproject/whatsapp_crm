# Sprint 16 — Implementation Plan

> Full task details are in the batch plan: `docs/superpowers/plans/2026-04-28-sprint-planning-batch-4.md`
> Task 7 covers Sprint 16.

## Pre-conditions
- Sprints 1–15 complete and merged
- All test suites green: `pnpm test`, `pnpm type-check`, `pnpm lint`
- At least one Flow created and tested (from Sprint 15)

## Task Summary

| # | Task | Key files |
|---|---|---|
| 7 | Chatbot + BotSession models, bot runner, CRUD API, escalation, chatbot settings UI | `apps/api/prisma/schema.prisma`, `apps/api/src/lib/bot-runner.ts`, `apps/api/src/routes/chatbots.ts`, `apps/api/src/routes/chatbots.test.ts`, `apps/api/src/workers/inbound-message.worker.ts`, `apps/web/app/(dashboard)/settings/chatbot/page.tsx` |

## Test Checklist

- [ ] `pnpm --filter @trustcrm/api test` — all pass including `chatbots.test.ts`
- [ ] `pnpm type-check` — no errors across all packages
- [ ] `pnpm lint` — no errors
- [ ] Manual: Create chatbot linked to a "FAQ" flow → activate
- [ ] Manual: Send inbound WhatsApp "Hello" → bot replies with first action node's message
- [ ] Manual: Send trigger phrase for escalation node → `BotSession.isEscalated = true` → next message goes to human agent inbox
- [ ] Manual: Inbox shows `conversation:escalated` banner when bot hands off
- [ ] Manual: `/settings/chatbot` page shows active chatbot + deactivate toggle

## Deployment / Environment Notes

Run migration after schema change:
```bash
cd apps/api
pnpm exec prisma migrate dev --name add_chatbot_bot_session
pnpm exec prisma generate
```

No new env vars required.
