# Sprint 7 — Implementation Plan

> Full task details are in the batch plan: `docs/superpowers/plans/2026-04-27-sprint-planning-batch-3.md`
> Tasks 1–2 cover Sprint 7.

## Pre-conditions
- Sprint 4 complete and merged (`GET/POST/PATCH/DELETE /v1/contacts` working)
- Sprint 5 complete and merged (web UI components, contacts list page)
- Local environment running: `docker compose up -d` + API + web dev servers

## Task Summary

| # | Task | Key files |
|---|---|---|
| 1 | CSV import + export API | `apps/api/src/lib/csv.ts`, `apps/api/src/routes/contacts.ts`, `apps/api/src/index.ts` |
| 2 | Contact detail page + form + tag input | `apps/web/components/contacts/`, `apps/web/app/(dashboard)/contacts/[id]/page.tsx` |
| — | Companies list + detail pages | `apps/web/app/(dashboard)/companies/` (same pattern as contacts — reference Task 2) |

## Test Checklist

- [ ] `pnpm --filter @trustcrm/api test` — all pass including updated `contacts.test.ts` (export + import tests)
- [ ] `pnpm type-check` — no errors
- [ ] `pnpm lint` — no errors
- [ ] Manual: Upload `contacts.csv` → `/v1/contacts/import` → response shows `{ created: N, skipped: 0 }`
- [ ] Manual: `GET /v1/contacts/export` downloads `contacts.csv` — open in Excel, verify columns

## Deployment / Environment Notes

No new env vars required.

CSV file format (required headers):
```
phoneNumber,name,email,lifecycleStage,tags
+919000000001,Alice Kumar,alice@example.com,lead,vip;new
+919000000002,Bob Singh,,prospect,
```

Import endpoint: `POST /v1/contacts/import` with `Content-Type: multipart/form-data`, field name `file`.
