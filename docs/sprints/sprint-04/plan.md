# Sprint 4 — Implementation Plan

> Full task details are in the batch plan: `docs/superpowers/plans/2026-04-27-sprint-planning-batch-2.md`
> Tasks 8–14 cover Sprint 4.

## Pre-conditions
- Sprint 3 complete and merged
- Local Postgres + Redis + Meilisearch running: `docker compose up -d`
- Prisma migration from Sprint 3 applied

## Task Summary

| # | Task | Key files |
|---|---|---|
| 8 | Complete Prisma schema (contacts, companies, deals, pipelines, templates, campaigns, flows, teams, api_keys, webhooks) | `apps/api/prisma/schema.prisma` |
| 9 | Run migration + generate | `apps/api/prisma/migrations/` |
| 10 | Swagger OpenAPI plugin | `apps/api/src/plugins/swagger.ts` |
| 11 | Contacts CRUD routes + search | `apps/api/src/routes/contacts.ts`, `apps/api/src/routes/contacts.test.ts` |
| 12 | Companies CRUD routes | `apps/api/src/routes/companies.ts` |
| 13 | Meilisearch client + contacts indexing | `apps/api/src/lib/search.ts`, `packages/shared/src/index.ts` |
| 14 | Type-check + lint | All packages |

## Test Checklist

- [ ] `pnpm --filter @trustcrm/api test` — all pass (contacts.test, pagination.test, webhooks.test, health.test)
- [ ] `pnpm type-check` — no errors across all packages
- [ ] `pnpm lint` — no errors
- [ ] Manual: `GET /docs` returns Swagger UI
- [ ] Manual: `POST /v1/contacts` → contact created → `GET /v1/contacts/search?q=<name>` returns it

## Deployment / Environment Notes

Add to `.env` (copy from `.env.example`):
```
MEILISEARCH_URL=http://localhost:7700
MEILISEARCH_MASTER_KEY=
```

Run migration after schema is written:
```bash
cd apps/api
pnpm exec prisma migrate dev --name add_contacts_companies_deals_templates_flows
pnpm exec prisma generate
```

Meilisearch runs automatically via Docker Compose on port 7700 with no auth key required locally.
