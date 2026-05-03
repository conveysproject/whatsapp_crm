# Sprint 4 — Core DB & API Skeleton

## Sprint Goal
Complete the full 32-table PostgreSQL schema and build the canonical CRUD API skeleton — establishing the data model and API patterns every subsequent sprint builds on.

## What We're Building

- **Full Prisma schema** — All remaining tables beyond Sprint 2/3: `contacts`, `companies`, `deals`, `pipelines`, `templates`, `campaigns`, `flows`, `teams`, `api_keys`, `webhooks`. Every table has `organizationId` for multi-tenancy. Enums for lifecycle stages, template statuses, campaign statuses.
- **Contacts CRUD** — `GET /v1/contacts` (cursor-paginated), `GET /v1/contacts/:id`, `POST /v1/contacts`, `PATCH /v1/contacts/:id`, `DELETE /v1/contacts/:id`, `GET /v1/contacts/search` (Meilisearch). Canonical pattern for all other resources.
- **Companies CRUD** — Same pattern as contacts. `GET/POST/PATCH/DELETE /v1/companies`.
- **Cursor-based pagination** — `paginate()` utility shared by all list endpoints. `parsePaginationParams()` extracts `cursor` and `limit` (max 100) from query string.
- **OpenAPI docs** — `@fastify/swagger` + `@fastify/swagger-ui` at `/docs`. Auto-generated from Fastify route schemas.
- **Meilisearch contacts index** — `indexContact()` called after contact create/update. `searchContacts()` used by `GET /v1/contacts/search`. Index settings: searchable by name/phone/email, filterable by organizationId.

## Key Technical Decisions

- **One migration for all remaining tables** — Running migrations one table at a time creates noise in git history and increases risk of partial state. A single `migrate dev --name add_contacts_companies_deals_templates_flows` is cleaner for an initial schema.
- **Cursor over offset pagination** — Offset pagination drifts when rows are inserted between pages. Cursor (`id > cursor`) is stable for a dataset sorted by `id`. Matches the API spec.
- **Contacts as the canonical CRUD pattern** — All future resource routes (deals, templates, campaigns) follow the same structure. Engineers learn the pattern once from contacts.ts.
- **Meilisearch over Postgres full-text search** — Postgres `tsvector` requires manual index setup and query syntax. Meilisearch is already running in Docker Compose and is purpose-built for search-as-you-type UX. The `meilisearch` npm package provides typed queries.
- **Swagger schema deferred** — Fastify route JSON schemas (for input validation and OpenAPI generation) are added in Sprint 4 for contacts only. Other routes get schemas added in the sprint that builds them. This avoids blocking on schema design for all 40+ endpoints upfront.
- **No API key auth in Sprint 4** — The `api_keys` table is created, but middleware to validate `X-API-Key` headers is deferred to Sprint 9 (Marketplace & Integrations). The table needs to exist for FK relationships.

## Dependencies

- **External:** Meilisearch master key (optional locally — Meilisearch OSS has no auth by default)
- **Internal:** Sprint 3 complete — conversations/messages tables exist; BullMQ worker running; Fastify auth preHandler in place

## Definition of Done

- [ ] `cd apps/api && pnpm exec prisma migrate status` — all migrations applied
- [ ] `GET /v1/contacts` returns paginated list scoped to authenticated org
- [ ] `POST /v1/contacts` creates a contact; duplicate phone number in same org returns 409 (Prisma unique constraint)
- [ ] `GET /v1/contacts/search?q=alice` returns Meilisearch results filtered to org
- [ ] `GET /v1/companies` returns paginated list
- [ ] `GET /docs` returns Swagger UI HTML
- [ ] `pnpm --filter @WBMSG/api test` — all pass including `contacts.test.ts`, `pagination.test.ts`
- [ ] `pnpm type-check` — no errors
- [ ] `pnpm lint` — no errors

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Prisma migration conflict with Sprint 3 schema | Low | Medium | Sprint 4 starts from Sprint 3's migrated state; test on clean DB before merge |
| Meilisearch not running locally | Medium | Low | `setupSearchIndexes()` logs a warning but doesn't crash if Meilisearch is unreachable; search endpoint returns empty array |
| Swagger type annotation burden | Low | Low | Start with minimal schemas (just `summary` and `tags`); full JSON schema validation can be layered in later |
| Unique constraint violation on phone number | Medium | Low | Catch Prisma `P2002` error in contacts.ts and return 409; add to route handler in Task 11 |
