# Design: Lead Status Cutover — Sub-project 2b-2a (Segments)

**Date:** 2026-06-19
**Status:** Approved (design)
**Part of:** Contact Settings → Sub-project 2 (Lead Statuses), cutover stage 2b-2a.

**Role framing:** Migration engineer — move a persisted-data consumer off the `lifecycleStage` enum to `leadStatusId`, including a data migration of stored JSON, with no intermediate state referencing the removed concept.

## Context

The cutover removes `lifecycleStage` in stages. 2b-1 moved the interactive contact surfaces. 2b-2 covers the consumers that persist enum values: segments (this spec, 2b-2a) and CSV import (2b-2b). Saved filters were investigated and are NOT a consumer (`saved-filters.ts` never referenced `lifecycleStage`), so they are excluded.

This spec covers **only segments (2b-2a)**.

## Problem

Segments filter contacts by a `lifecycleStage` rule:
- `apps/api/src/lib/segment-evaluator.ts` defines a `FilterRule` variant `{ field: "lifecycleStage"; operator: "equals" | "isNot"; value: string }` and `buildClause` maps it to a `lifecycleStage` Prisma where clause; `EvaluateResult.contacts` selects `lifecycleStage`.
- `apps/web/components/segments/SegmentBuilder.tsx` offers a "Lifecycle stage" field with a hardcoded 5-value enum dropdown.
- Existing segments persist `filters` JSON containing rules like `{ "field": "lifecycleStage", "operator": "equals", "value": "lead" }` — referencing the old enum strings.

## Solution

Switch the segment filter rule from `lifecycleStage` to `leadStatusId` across the evaluator and the builder UI, and data-migrate existing stored `filters` JSON so each `lifecycleStage` rule becomes a `leadStatusId` rule pointing at the org's seeded status (enum→name→id).

## Scope

### API — `apps/api/src/lib/segment-evaluator.ts`
- **FilterRule:** replace the `lifecycleStage` union member with `{ field: "leadStatusId"; operator: "equals" | "isNot"; value: string }` (`value` = a `LeadStatus.id`).
- **buildClause:** replace `case "lifecycleStage"` with `case "leadStatusId"`:
  - `isNot` → `{ NOT: { leadStatusId: rule.value } }`
  - else → `{ leadStatusId: rule.value }`
- **EvaluateResult.contacts:** change the contact shape/select from `lifecycleStage: string | null` to `leadStatus: { name: string; color: string } | null`, selecting `leadStatus: { select: { name: true, color: true } }`. (Consumed by the segment preview list — name + color rendered there.)

### Web — `apps/web/components/segments/SegmentBuilder.tsx`
- The field option labeled "Lifecycle stage" with value `lifecycleStage` becomes label **"Lead Status"** with value `leadStatusId`.
- Operators for `leadStatusId`: `equals` ("is") and `isNot` ("is not") — unchanged set.
- The default rule constructed when the field/rule is added uses `{ field: "leadStatusId", operator: "equals", value: <first status id or ""> }`.
- The value editor for the rule: replace the hardcoded enum `<select>` with a dropdown populated from `useLeadStatuses()` (the hook from 2b-1) — options are `{ id, name }`, value = id.
- The `FilterRule` type mirrored in this file is updated to match the evaluator's new shape.

### Web — `apps/web/app/(dashboard)/contacts/segments/[id]/page.tsx`
- The segment detail page renders each matched contact's status. Replace the `lifecycleStage` Badge (currently colored via a fixed `stageVariant` map) with the contact's `leadStatus` from the evaluate result: render `leadStatus?.name ?? "—"` with a color dot using `style={{ backgroundColor: leadStatus?.color }}`. Update the local contact type to `leadStatus: { name: string; color: string } | null` and drop `lifecycleStage` and the now-unused `stageVariant` map.

### Data Migration — rewrite `segments.filters` JSON

A Prisma migration that rewrites each segment's `filters` JSONB array: any element with `field = 'lifecycleStage'` is transformed to `field = 'leadStatusId'` with `value` set to the org's seeded `LeadStatus.id` for the mapped name; all other elements pass through unchanged and order is preserved.

Mapping (enum value → status name): lead→New Lead, prospect→Qualification, customer→Closed Won, loyal→Closed Won, churned→Closed Lost.

SQL approach (Postgres 16, JSONB with ordinality):

```sql
UPDATE "segments" s
SET "filters" = sub.new_filters
FROM (
  SELECT s2."id" AS sid,
    jsonb_agg(
      CASE
        WHEN elem->>'field' = 'lifecycleStage' AND ls."id" IS NOT NULL
          THEN jsonb_set(jsonb_set(elem, '{field}', '"leadStatusId"'), '{value}', to_jsonb(ls."id"))
        ELSE elem
      END
      ORDER BY ord
    ) AS new_filters
  FROM "segments" s2
  CROSS JOIN LATERAL jsonb_array_elements(s2."filters") WITH ORDINALITY AS arr(elem, ord)
  LEFT JOIN "lead_statuses" ls
    ON ls."organization_id" = s2."organization_id"
    AND ls."name" = CASE elem->>'value'
      WHEN 'lead'     THEN 'New Lead'
      WHEN 'prospect' THEN 'Qualification'
      WHEN 'customer' THEN 'Closed Won'
      WHEN 'loyal'    THEN 'Closed Won'
      WHEN 'churned'  THEN 'Closed Lost'
    END
  WHERE jsonb_typeof(s2."filters") = 'array' AND jsonb_array_length(s2."filters") > 0
  GROUP BY s2."id"
) sub
WHERE s."id" = sub.sid;
```

Notes:
- Segments with an empty/non-array `filters` are excluded by the `WHERE` (nothing to rewrite).
- A `lifecycleStage` rule whose value does not map (no matching seeded status) keeps `field = 'lifecycleStage'` (the `ls.id IS NOT NULL` guard) — the verification step catches any such leftover. With standard seeded data this never occurs.
- The migration is replayable: re-running finds no `lifecycleStage` rules (they are already rewritten) and rebuilds the array identically.

### Verification (in the plan)
- Before: `SELECT count(*) FROM segments WHERE filters::text LIKE '%"lifecycleStage"%';`
- After: the same count must be 0.
- Spot-check one rewritten segment: the rule now has `field: "leadStatusId"` and `value` equal to a real `lead_statuses.id` for that org.

## Out of Scope
- CSV import (`contact-import.worker.ts`, `ImportWizard.tsx`, `Step2MapFields.tsx`, `csv.ts`) — 2b-2b.
- Dropping the `lifecycleStage` column / enum — 2c.
- Saved filters — not a consumer.

## Error Handling
- Evaluator: an unknown/empty `leadStatusId` value yields a Prisma clause that matches nothing (consistent with prior behavior for a bad enum value); no crash.
- Migration: guarded against non-array/empty filters; unmapped values left intact and surfaced by verification.

## Testing
- **Evaluator (vitest, `segment-evaluator.test.ts`):** a `leadStatusId` rule with `equals` builds `{ leadStatusId: value }`; with `isNot` builds `{ NOT: { leadStatusId: value } }`. Update/replace any existing `lifecycleStage` rule test.
- **Migration:** verification counts above (run against dev DB; 0 remaining `lifecycleStage` rules), plus a spot-check of a rewritten segment.
- **Web:** type-check + build.

## Success Criteria
No segment code or stored segment `filters` references `lifecycleStage`; the builder filters by configurable lead status; the segment detail preview shows each contact's lead status (name + color); existing segments evaluate to the same contacts via the mapped `leadStatusId`. Grep gate: no `lifecycleStage` in `segment-evaluator.ts`, `SegmentBuilder.tsx`, or `segments/[id]/page.tsx`.
