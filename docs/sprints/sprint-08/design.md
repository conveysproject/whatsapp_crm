# Sprint 8 — Lifecycle Stages & Segments

## Sprint Goal
Give sales and support teams the ability to organize contacts by where they are in the customer journey, and build dynamic audience segments that power campaigns and automation — turning a flat contact list into an actionable CRM.

## What We're Building

- **Lifecycle stage transitions** — `PATCH /v1/contacts/:id` with `{ lifecycleStage }` already exists from Sprint 4. Sprint 8 ensures the web UI surfaces this prominently and records stage-change events (logged to a future `events` table stub).
- **Segment CRUD API** — `GET/POST/PATCH/DELETE /v1/segments`. Each segment has a `name` and `filters: SegmentFilter[]`. Filters are stored as JSONB.
- **Segment evaluator** — `evaluateSegment(prisma, organizationId, filters)` translates the filter array into a Prisma `where` clause and returns matching contact phone numbers. Supported filters: `lifecycleStage equals <value>`, `tags contains <value>`, `createdAt after/before <ISO date>`.
- **`POST /v1/segments/:id/evaluate`** — On-demand evaluation: returns `{ phones: string[], count: number }`. Used by the campaign scheduler to know who to send to.
- **Segment builder UI** — `SegmentBuilder` component: a dynamic list of filter rows (field + operator + value dropdowns). Fully controlled — filters state lives in parent. Validates on submit.
- **Segments list page** — `/contacts/segments` — shows all segments with rule count badge. Links to segment detail.

## Key Technical Decisions

- **JSONB filters over normalized filter rows** — A normalized `segment_filters` table would require joins to evaluate. JSONB is queried once, deserialized, and translated to a Prisma `where` clause in application code. For the filter complexity WBMSG needs (≤10 conditions), this is significantly simpler.
- **Evaluator in application code, not SQL** — Building a dynamic SQL query from JSONB filters risks injection if not done carefully. Application-layer evaluation with Prisma's typed query builder is safer and easier to test.
- **Stateless evaluation (no pre-computed membership)** — Segment membership is computed fresh on each `POST /v1/segments/:id/evaluate` call. Pre-computing and caching membership (e.g., a `segment_contacts` join table) is added in Sprint 10 when campaign send volumes make it necessary.
- **`tags contains` uses Postgres array `has` operator** — Prisma maps `{ tags: { has: "vip" } }` to `tags @> ARRAY['vip']`. This is index-friendly with a GIN index on `tags[]` — add the index in Sprint 23 optimization.

## Dependencies

- **External:** None
- **Internal:** Sprint 4 complete — `contacts` table with `lifecycleStage` and `tags` columns; Sprint 7 complete — tag management UI

## Definition of Done

- [ ] `POST /v1/segments` creates a segment with filters
- [ ] `POST /v1/segments/:id/evaluate` returns phone numbers matching the filters
- [ ] `/contacts/segments` page lists all segments
- [ ] Segment builder UI adds/removes filter rows and POSTs correctly
- [ ] Filter by `lifecycleStage = lead` returns only lead contacts (verified against seeded data)
- [ ] Filter by `tags contains vip` returns contacts tagged `vip`
- [ ] `pnpm --filter @WBMSG/api test` — all pass including `segments.test.ts`
- [ ] `pnpm type-check` — no errors
- [ ] `pnpm lint` — no errors

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Evaluator returns entire contact list when filters array is empty | Medium | High | Guard: if `filters.length === 0`, return empty array (or require at least one filter on create) |
| Large segment evaluation (100k contacts) blocks request thread | Low | Medium | Move `POST /.../evaluate` to a BullMQ job with polling in Sprint 10; cap at 10k rows for beta |
| JSONB filter schema drift | Low | Medium | Validate filter shape in the route before storing (add Zod validation in Sprint 9) |
