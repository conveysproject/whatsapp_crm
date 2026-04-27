# Sprint 13 — Implementation Plan

> Full task details are in the batch plan: `docs/superpowers/plans/2026-04-28-sprint-planning-batch-4.md`
> Tasks 1–3 cover Sprint 13.

## Pre-conditions
- Sprints 1–12 complete and merged
- All test suites green: `pnpm test`, `pnpm type-check`, `pnpm lint`
- `ANTHROPIC_API_KEY` available in local `.env` and staging secrets

## Task Summary

| # | Task | Key files |
|---|---|---|
| 1 | Claude client + AI routes + tests | `apps/api/src/lib/claude.ts`, `apps/api/src/routes/ai.ts`, `apps/api/src/routes/ai.test.ts` |
| 2 | SmartReplies + intent/sentiment UI | `apps/web/components/inbox/SmartReplies.tsx`, `apps/web/components/inbox/MessageBubble.tsx` |
| 3 | Wire SmartReplies into ConversationView | `apps/web/app/(dashboard)/inbox/[id]/page.tsx` |

## Test Checklist

- [ ] `pnpm --filter @trustcrm/api test` — all pass including `ai.test.ts`
- [ ] `pnpm type-check` — no errors across all packages
- [ ] `pnpm lint` — no errors
- [ ] Manual: Open a conversation in the inbox → SmartReplies chips appear below thread
- [ ] Manual: Click a chip → send box populated with suggestion text
- [ ] Manual: `POST /v1/messages/:id/analyze` → response includes `intent` and `sentiment`
- [ ] Manual: Disconnect network → SmartReplies shows nothing (silent failure, inbox still works)

## Deployment / Environment Notes

Add to `.env` (and staging/production secrets):
```
ANTHROPIC_API_KEY=sk-ant-...
```

No new migrations required.

Install new dependency:
```bash
pnpm --filter @trustcrm/api add @anthropic-ai/sdk
```
