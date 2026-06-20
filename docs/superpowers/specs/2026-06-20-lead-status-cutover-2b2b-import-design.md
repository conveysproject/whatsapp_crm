# Design: Lead Status Cutover — Sub-project 2b-2b (CSV Import)

**Date:** 2026-06-20
**Status:** Approved (design)
**Part of:** Contact Settings → Sub-project 2 (Lead Statuses), cutover stage 2b-2b.

**Role framing:** Full-stack migration engineer. Move CSV import off the `lifecycleStage` enum to the configurable `leadStatus`, including a schema change on the import record and name→id resolution in the worker.

## Context

2a added `LeadStatus` + `Contact.leadStatusId`. 2b-1 cut interactive contact surfaces; 2b-2a cut segments. This stage cuts the CSV import path. After this, the only remaining `lifecycleStage` consumer is flows (2b-3), then 2c drops the column/enum.

## Problem

CSV import writes the `lifecycleStage` enum in three places:
- `ImportWizard.tsx` state `lifecycleStage` (batch default, default `"lead"`).
- `Step2MapFields.tsx`: a batch "Lifecycle stage" dropdown (5 enum values), a mappable target option "Lifecycle Stage", and an auto-map heuristic (column containing "lifecycle"/"stage" → `lifecycleStage`).
- `contacts-import.ts`: writes `ContactImport.lifecycleStage` (a `NOT NULL` enum column) and passes it to the job.
- `contact-import.worker.ts`: `stage = csvLifecycle || batchLifecycle`, written to `Contact.lifecycleStage` on create/update.

## Solution

Resolve a per-row CSV status **by case-insensitive name** to a `leadStatusId`; fall back to a batch-default `leadStatusId` (which may be null). Write `Contact.leadStatusId`. Carry the batch default as `leadStatusId` through the route → `ContactImport` record → job. Migrate the `ContactImport.lifecycleStage` column to a nullable `leadStatusId`.

## Scope

### Schema — `apps/api/prisma/schema.prisma` + migration
- `ContactImport`: replace `lifecycleStage LifecycleStage @map("lifecycle_stage")` with `leadStatusId String? @map("lead_status_id")` (nullable; an audit field — no FK, to avoid blocking on later status deletion, consistent with the record's archival nature).
- Migration: add `lead_status_id` (nullable), drop `lifecycle_stage` from `contact_imports`. (Existing import rows are historical audit records; dropping the old column is acceptable — they are not re-run. No backfill needed.)

### API — `apps/api/src/routes/contacts-import.ts`
- Request body + `ContactImport.create` + job payload: `lifecycleStage` → `leadStatusId?: string | null` (the batch default). Remove the `LifecycleStage` import/cast. Pass `leadStatusId` to the job.

### API — `apps/api/src/workers/contact-import.worker.ts`
- Job data: `lifecycleStage` → `leadStatusId?: string | null`.
- Once per import, load the org's lead statuses into a **case-insensitive name→id map**: `Map(name.toLowerCase() → id)` plus a set of valid ids.
- Per row: `const csvStatusText = extractField(row, fieldMapping, "leadStatusId")` (the mapped status column's text). Resolve:
  ```
  resolvedId =
    (csvStatusText && nameToId.get(csvStatusText.trim().toLowerCase()))   // CSV value by name
    ?? batchLeadStatusId-if-valid                                         // batch default
    ?? null
  ```
  Also accept a csvStatusText that is already a valid id (if `validIds.has(csvStatusText)`), to be forgiving.
- Write `leadStatusId: resolvedId` on create/update; **remove** the `lifecycleStage: stage` fields (the `Contact.lifecycle_stage` column keeps its DB default until 2c).

### Web — `apps/web/app/(dashboard)/contacts/import/ImportWizard.tsx`
- State field `lifecycleStage: string` → `leadStatusId: string` (default `""`).

### Web — `apps/web/app/(dashboard)/contacts/import/steps/Step2MapFields.tsx`
- Import + call `useLeadStatuses()`.
- Batch "Lifecycle stage" dropdown → "Default lead status" dropdown from the hook (value = id; first option `"— None —"` = `""`).
- Mappable target option value `lifecycleStage` "Lifecycle Stage" → `leadStatusId` "Lead Status".
- Auto-map heuristic: a CSV header containing "status" or "stage" (or "lifecycle") → `"leadStatusId"`.
- POST body field `lifecycleStage: state.lifecycleStage` → `leadStatusId: state.leadStatusId || undefined`.
- Remove the now-unused `LIFECYCLE_STAGES` constant.

### Web — `apps/api/src/lib/csv.ts` (sample import template)
- If the sample CSV template includes a "Lifecycle Stage" column header/value, rename it to "Lead Status" with an example status name (e.g. "New Lead"). (Confirm during implementation; skip if not present.)

## Out of Scope
- Flows (`flow-runner.ts`, `FlowConfigPanel.tsx`, `serialize.ts`) — 2b-3.
- Dropping `Contact.lifecycleStage` column + `LifecycleStage` enum — 2c.

## Error Handling
- Unmatched CSV status text → batch default `leadStatusId` (or null). Never fails the row over a status typo.
- An invalid/cross-org batch `leadStatusId` is treated as null (validated against the loaded valid-id set).
- Worker stays org-scoped (loads statuses `where organizationId`).

## Testing
- **Worker unit test (vitest):** the name→id resolution helper — CSV name match (case-insensitive), CSV value already an id, unmatched → batch default, unmatched + no default → null.
- **Migration:** verify `contact_imports.lead_status_id` exists and `lifecycle_stage` is gone.
- **Web:** type-check + build; grep gate (no `lifecycleStage` in the import dir).
- **Opus final review** (touches worker + schema + data).

## Success Criteria
CSV import assigns configurable lead statuses (by name, with batch-default fallback); no import code references `lifecycleStage`; `ContactImport` stores `leadStatusId`.
