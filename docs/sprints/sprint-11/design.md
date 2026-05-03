# Sprint 11 — Deals & Pipelines

## Sprint Goal
Give sales teams a visual sales pipeline — drag cards between stages, track deal values, associate deals with contacts — turning WBMSG from a messaging tool into a full CRM with opportunity management.

## What We're Building

- **Pipelines API** — `GET/POST/PATCH/DELETE /v1/pipelines`. A pipeline has a `name` and `stages: string[]` (ordered list of stage names). Default stages: `["new", "qualified", "proposal", "won", "lost"]`.
- **Deals API** — `GET/POST/PATCH/DELETE /v1/deals`. A deal has `title`, `pipelineId`, optional `contactId`, `assignedTo`, `value` (Decimal), and `stage` (one of the pipeline's stages). `PATCH /v1/deals/:id/stage` — dedicated endpoint for stage transitions (used by drag-and-drop).
- **Kanban board** — `/deals` page renders a `KanbanBoard` component. Columns = pipeline stages. Cards = deals in that stage. Drag a card to a new column → optimistic UI update → `PATCH /v1/deals/:id/stage` in the background.
- **`@dnd-kit`** — `DndContext` wraps the board. Each column is a `SortableContext`. `DealCard` uses `useSortable`. `DragOverlay` renders the card being dragged at full opacity. `PointerSensor` with an 8px activation distance prevents accidental drags on click.
- **Deal form** — `/deals/new` or a modal — title, pipeline, stage, contact (searchable dropdown), assigned user, value.

## Key Technical Decisions

- **`@dnd-kit` over `react-beautiful-dnd`** — `react-beautiful-dnd` is unmaintained (archived April 2023). `@dnd-kit` is the modern replacement: tree-shakeable, TypeScript-first, accessibility-compliant, no global drag-drop event pollution.
- **Stages as `string[]` on Pipeline, not a normalized table** — Stage names are short strings, rarely changed, and always accessed with the pipeline. A `pipeline_stages` join table adds a round-trip and migration complexity for no benefit at this scale.
- **Optimistic UI for drag-and-drop** — Waiting for the PATCH response before updating the board creates jarring UX (300ms+ latency). Optimistic update (move card immediately, revert on error) is standard for Kanban UIs.
- **`GET /v1/deals?pipelineId=X`** — Scoped by pipeline to support multiple pipelines. The board page always fetches a specific pipeline's deals; no "all deals across all pipelines" view in Sprint 11.
- **`value` stored as Prisma `Decimal`** — Currency values must not use `Float` (floating-point precision errors). `Decimal(15, 2)` maps to `numeric(15,2)` in Postgres — exact arithmetic, INR formatting with `toLocaleString("en-IN")`.

## Dependencies

- **External:** None
- **Internal:** Sprint 4 complete — `deals` and `pipelines` tables in Prisma schema; Sprint 5 complete — UI components available

## Definition of Done

- [ ] `POST /v1/pipelines` creates a pipeline with stages array
- [ ] `POST /v1/deals` creates a deal associated with a pipeline
- [ ] `/deals` page shows Kanban board with columns per stage
- [ ] Dragging a deal card to a different column calls `PATCH /v1/deals/:id/stage` and persists
- [ ] Deal card shows title, value (formatted in INR), assigned user
- [ ] Empty pipeline state (no pipelines) shows "Create Pipeline" prompt
- [ ] `pnpm --filter @WBMSG/api test` — all pass including `deals.test.ts`
- [ ] `pnpm type-check` — no errors
- [ ] `pnpm lint` — no errors

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `@dnd-kit` not compatible with Next.js RSC | Low | High | `KanbanBoard` and `DealCard` are `"use client"` — never used in server components |
| Dragging to pipeline column ID vs. deal ID collision | Medium | Medium | Column droppables use stage names (strings like "won") as IDs; deal IDs are UUIDs — no collision |
| `Decimal` serialized as string by Prisma | Medium | Low | `value` is `Prisma.Decimal` — cast with `.toNumber()` before displaying; convert back on write |
| Large number of deals (1000+) in one column | Low | Low | Limit initial fetch to 200 deals per pipeline; add pagination in Sprint 23 |
