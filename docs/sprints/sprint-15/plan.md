# Sprint 15 — Implementation Plan

> Full task details are in the batch plan: `docs/superpowers/plans/2026-04-28-sprint-planning-batch-4.md`
> Tasks 5–6 cover Sprint 15.

## Pre-conditions
- Sprints 1–14 complete and merged
- All test suites green: `pnpm test`, `pnpm type-check`, `pnpm lint`

## Task Summary

| # | Task | Key files |
|---|---|---|
| 5 | Flow runner + CRUD API + tests | `apps/api/src/lib/flow-runner.ts`, `apps/api/src/routes/flows.ts`, `apps/api/src/routes/flows.test.ts`, `apps/api/prisma/schema.prisma` |
| 6 | FlowCanvas UI (reactflow) | `apps/web/components/flows/FlowCanvas.tsx`, `apps/web/components/flows/nodes/TriggerNode.tsx`, `apps/web/components/flows/nodes/ActionNode.tsx`, `apps/web/app/(dashboard)/flows/page.tsx`, `apps/web/app/(dashboard)/flows/[id]/page.tsx` |

## Test Checklist

- [ ] `pnpm --filter @WBMSG/api test` — all pass including `flows.test.ts`
- [ ] `pnpm type-check` — no errors across all packages
- [ ] `pnpm lint` — no errors
- [ ] Manual: Create a flow with trigger `inbound_message` → action `send_message` → `end`
- [ ] Manual: `POST /v1/flows/:id/test` → returns `{ trace: ["trigger-node-id", "send-message-node-id", "end-node-id"] }`
- [ ] Manual: Send inbound WhatsApp → flow fires → automated reply sent back to sender
- [ ] Manual: `/flows` page lists the flow; click Edit → canvas opens with nodes visible
- [ ] Manual: Drag an ActionNode onto canvas, connect to trigger → Save → reload page, nodes persist

## Deployment / Environment Notes

Run migration after schema change:
```bash
cd apps/api
pnpm exec prisma migrate dev --name add_flows
pnpm exec prisma generate
```

Install new dependency in web app:
```bash
pnpm --filter @WBMSG/web add reactflow
```

No new env vars required.
