# Sprint 9 — Implementation Plan

> Full task details are in the batch plan: `docs/superpowers/plans/2026-04-27-sprint-planning-batch-3.md`
> Tasks 5–6 cover Sprint 9.

## Pre-conditions
- Sprint 3 complete (webhook handler, `WA_ACCESS_TOKEN` set)
- Sprint 4 complete (`templates` table in Prisma schema)
- `whatsappBusinessAccountId` stored on at least one `Organization` row (update via Prisma Studio or API)

## Task Summary

| # | Task | Key files |
|---|---|---|
| 5 | Templates API + Meta submission + approval webhook | `apps/api/src/lib/meta-templates.ts`, `apps/api/src/routes/templates.ts`, `apps/api/src/routes/templates.test.ts`, `apps/api/src/routes/webhooks.ts` |
| 6 | Template builder UI + preview + list page | `apps/web/components/templates/TemplatePreview.tsx`, `apps/web/app/(dashboard)/templates/` |

## Test Checklist

- [ ] `pnpm --filter @trustcrm/api test` — all pass including `templates.test.ts`
- [ ] `pnpm type-check` — no errors
- [ ] `pnpm lint` — no errors
- [ ] Manual: Create template via `/templates/new` → appears in `/templates` list with `pending` status
- [ ] Manual: Simulate approval webhook: `POST /v1/webhooks/whatsapp` with `{ object: "whatsapp_business_account", entry: [{ changes: [{ field: "message_template_status_update", value: { message_template_id: "<metaTemplateId>", event: "APPROVED" } }] }] }` → template status → `approved`

## Deployment / Environment Notes

No new env vars (uses existing `WA_ACCESS_TOKEN` and `WA_PHONE_NUMBER_ID`).

Update your test organization's `whatsappBusinessAccountId`:
```bash
# Via Prisma Studio
pnpm --filter @trustcrm/api exec prisma studio
# Or direct SQL
psql $DATABASE_URL -c "UPDATE organizations SET whatsapp_business_account_id = '<your_waba_id>' WHERE id = '<your_org_id>';"
```

Meta template name constraints:
- Lowercase letters, numbers, underscores only (`^[a-z0-9_]+$`)
- Maximum 512 characters
- Must be unique per WABA
