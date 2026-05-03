# Sprint 21 — Implementation Plan

> Full task details are in the batch plan: `docs/superpowers/plans/2026-04-28-sprint-planning-batch-5.md`
> Task 5 covers Sprint 21.

## Pre-conditions
- Sprints 1–20 complete and merged
- All test suites green: `pnpm test`, `pnpm type-check`, `pnpm lint`
- Meilisearch running (`docker compose up -d`)

## Task Summary

| # | Task | Key files |
|---|---|---|
| 5 | Unified search API + GlobalSearch UI + advanced contact filters | `apps/api/src/lib/search.ts`, `apps/api/src/routes/search.ts`, `apps/api/src/routes/search.test.ts`, `apps/web/components/layout/GlobalSearch.tsx`, `apps/web/components/layout/TopBar.tsx`, `apps/web/app/(dashboard)/contacts/page.tsx` |

## Test Checklist

- [ ] `pnpm --filter @WBMSG/api test` — all pass including `search.test.ts`
- [ ] `pnpm type-check` — no errors across all packages
- [ ] `pnpm lint` — no errors
- [ ] Manual: Press ⌘K → search palette opens
- [ ] Manual: Type contact name → matching contacts appear within 300 ms
- [ ] Manual: Type partial conversation content → matching conversations appear
- [ ] Manual: Click a result → correct page navigation; palette closes
- [ ] Manual: Contacts page → filter by lifecycle stage "customer" → list narrows to customers only
- [ ] Manual: Filter by tag → contacts with that tag only shown
- [ ] Manual: Share filtered URL → paste in new tab → same filters applied

## Deployment / Environment Notes

No new env vars required. Meilisearch must be running (already in docker-compose).

Conversations index is created automatically on first startup via `lib/search.ts`. If re-indexing existing conversations is needed:
```bash
# Re-index all conversations for an org (run once in dev if index is empty)
cd apps/api
pnpm exec ts-node scripts/reindex-conversations.ts
```
