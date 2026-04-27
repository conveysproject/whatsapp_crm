# Sprint 7 — Contacts & Companies

## Sprint Goal
Turn the raw contacts CRUD from Sprint 4 into a full-featured CRM data layer: editable profiles, tag management, CSV bulk import/export, and a companies module — giving agents a complete view of every customer they interact with.

## What We're Building

- **Contact detail page** — `/contacts/:id` — server-rendered contact info with an editable form (name, email, lifecycle stage, tags). PATCH on submit.
- **Tag management** — `TagInput` component: chip-style multi-tag editor (Enter or comma to add, Backspace to remove last). Tags are stored as `String[]` in Postgres.
- **ContactForm** — reusable form used on both create and edit. Covers name, email, lifecycle stage (dropdown), and tags (TagInput). Shared between detail page and a future create modal.
- **CSV Import** — `POST /v1/contacts/import` accepts multipart file upload (via `@fastify/multipart`). `papaparse` parses header row: `phoneNumber`, `name`, `email`, `lifecycleStage`, `tags` (semicolon-delimited). Rows with duplicate phone numbers are skipped (Prisma unique constraint). Returns `{ created, skipped, total }`.
- **CSV Export** — `GET /v1/contacts/export` streams all org contacts as a CSV file with `Content-Disposition: attachment`. Uses `papaparse` `unparse()`.
- **Bulk actions** — Checkbox column on contacts table; sticky action bar appears on selection; supports bulk delete (sequential `DELETE /v1/contacts/:id`), bulk tag (PATCH each), bulk stage change (PATCH each).
- **Companies** — `/companies` list + `/companies/:id` detail. Same CRUD pattern as contacts.

## Key Technical Decisions

- **`papaparse` over custom CSV parser** — Battle-tested, handles quoted fields, BOM, Windows line endings. Zero configuration for header-row CSVs. No alternative considered — it's the standard.
- **`@fastify/multipart` for file upload** — Fastify doesn't parse `multipart/form-data` by default. The plugin provides streaming file access without buffering to disk. We buffer to memory for files ≤10 MB (sufficient for a CSV of 50k contacts ~5 MB).
- **Sequential import over bulk insert** — `prisma.createMany()` with `skipDuplicates: true` would be faster but loses per-row error context. Sequential insert gives accurate `{ created, skipped }` counts and can report partial failures. Switch to `createMany` at scale (Sprint 23).
- **Server Components for detail pages** — The contact detail page fetches fresh data on every visit (SSR, `cache: "no-store"`). The edit form is a Client Component embedded inside the server page to handle submit events.

## Dependencies

- **External:** None
- **Internal:** Sprint 4 complete — contacts CRUD API, Meilisearch contacts index, shared types (`ContactId`, `CompanyId`)

## Definition of Done

- [ ] `/contacts` table links each row to `/contacts/:id`
- [ ] Edit form on `/contacts/:id` saves and shows updated data on reload
- [ ] Tag input adds/removes chips; saved correctly to API
- [ ] `GET /v1/contacts/export` downloads a valid CSV (opens correctly in Excel/Sheets)
- [ ] Upload a CSV via `/contacts/import` page → `{ created, skipped, total }` returned; new contacts appear in list
- [ ] Selecting contacts shows bulk action bar; bulk delete removes them
- [ ] `/companies` list and `/companies/:id` detail page work end-to-end
- [ ] `pnpm type-check` — no errors
- [ ] `pnpm lint` — no errors

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| CSV import with bad encoding (Windows-1252) | Medium | Low | `papaparse` handles most encodings; document that UTF-8 is required |
| `@fastify/multipart` conflicts with body parser | Medium | Medium | Register multipart plugin before route registration; it overrides body parsing only for `multipart/form-data` requests |
| Bulk delete of 1000 contacts times out | Low | Low | Cap bulk selection at 200 rows in UI; show warning above that |
| Tags array stored as `String[]` — Prisma filtering | Low | Low | Use `{ has: "tag" }` operator for tag filters — supported by Postgres `@>` array operator |
