# Design: Lead Status Cutover — Sub-project 2b-3 (Flows)

**Date:** 2026-06-20
**Status:** Approved (design)
**Part of:** Contact Settings → Sub-project 2 (Lead Statuses), cutover stage 2b-3 (final consumer before 2c).

**Role:** Migration engineer.

## Context
Flows are the last `lifecycleStage` consumer. The `update_stage` flow action sets a contact's status; its target is stored in `flow_definition` JSON as `config.lifecycleStage` (enum). After this stage, only dead/dev references remain, cleaned up in 2c (drop the column/enum + sweep `csv.ts` and seed scripts).

## Problem
- `apps/api/src/lib/flow-runner.ts` `case "update_stage"`: reads `node.config["lifecycleStage"]` and does `contact.updateMany({ data: { lifecycleStage: stage } })`.
- `apps/web/components/flows/FlowConfigPanel.tsx`: the `update_stage` node config UI is a hardcoded 5-enum "Lifecycle Stage" `<Select>` writing `config.lifecycleStage`.
- `apps/web/components/flows/utils/serialize.ts`: default config for a new `update_stage` node is `{ lifecycleStage: "lead" }`; the node summary reads `str("lifecycleStage")`.
- Persisted `flow_definition` JSON in existing flows contains `update_stage` nodes with `config.lifecycleStage: "<enum>"`.
- UI trigger label `lifecycle_change: "Stage Changed"` (FlowConfigPanel + FlowNodePalette).

## Solution
The `update_stage` action sets `Contact.leadStatusId` from `config.leadStatusId`; the config UI picks a configurable status; persisted flow JSON is migrated (enum→id). The `lifecycle_change` trigger type string is unchanged (it already fires on `leadStatusId` change since 2b-1); only its UI label becomes "Status Changed".

## Scope

### API — `apps/api/src/lib/flow-runner.ts`
Replace the `case "update_stage"` body:
```ts
case "update_stage": {
  const leadStatusId = node.config["leadStatusId"] as string | undefined;
  if (leadStatusId && payload.contactPhone) {
    await prisma.contact.updateMany({
      where: { organizationId: payload.organizationId, phoneNumber: payload.contactPhone },
      data: { leadStatusId },
    });
  }
  break;  // (preserve existing control flow)
}
```
(`updateMany` data accepts the scalar `leadStatusId`. No enum cast. Org-scoped as before.)

### Web — `apps/web/components/flows/FlowConfigPanel.tsx`
- Import + call `useLeadStatuses()`.
- Replace the `update_stage` config block's hardcoded 5-option `<Select>` (value `lifecycleStage`, default `"lead"`) with a `<Select>` whose options come from the hook (`{ value: s.id, label: s.name }`), value `str("leadStatusId")`, `onChange={(v) => set("leadStatusId", v)}`, label "Lead Status". Include a leading blank/`"— Select status —"` option.
- Relabel the trigger map entry `lifecycle_change: "Stage Changed"` → `"Status Changed"`.

### Web — `apps/web/components/flows/utils/serialize.ts`
- Default config: `case "update_stage": return { leadStatusId: "" };`
- Summary: `case "update_stage": return str("leadStatusId") ? "Set status" : "Update Status";` (the value is now an id, so the summary omits it).

### Web — `apps/web/components/flows/FlowNodePalette.tsx`
- Relabel `lifecycle_change: "Stage Changed"` → `"Status Changed"`.

### Migration — rewrite `flow_definition` JSON
A Prisma migration rewriting each flow's `flow_definition.nodes[]`: for nodes where `type = 'update_stage'` and `config` has `lifecycleStage`, set `config.leadStatusId` = the org's seeded status id (enum→name→id) and remove `config.lifecycleStage`. Other nodes/flows unchanged; node order preserved. Uses a correlated scalar subquery (`LIMIT 1`) — no fan-out. Guard: only transform when the mapped id is non-null.

```sql
UPDATE "flows" f
SET "flow_definition" = jsonb_set(
  f."flow_definition", '{nodes}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN node->>'type' = 'update_stage'
             AND node->'config' ? 'lifecycleStage'
             AND (SELECT ls."id" FROM "lead_statuses" ls
                  WHERE ls."organization_id" = f."organization_id"
                    AND ls."name" = CASE node->'config'->>'lifecycleStage'
                      WHEN 'lead' THEN 'New Lead' WHEN 'prospect' THEN 'Qualification'
                      WHEN 'customer' THEN 'Closed Won' WHEN 'loyal' THEN 'Closed Won'
                      WHEN 'churned' THEN 'Closed Lost' END
                  LIMIT 1) IS NOT NULL
        THEN jsonb_set(node, '{config}',
               (node->'config') - 'lifecycleStage'
               || jsonb_build_object('leadStatusId',
                    (SELECT ls."id" FROM "lead_statuses" ls
                     WHERE ls."organization_id" = f."organization_id"
                       AND ls."name" = CASE node->'config'->>'lifecycleStage'
                         WHEN 'lead' THEN 'New Lead' WHEN 'prospect' THEN 'Qualification'
                         WHEN 'customer' THEN 'Closed Won' WHEN 'loyal' THEN 'Closed Won'
                         WHEN 'churned' THEN 'Closed Lost' END
                     LIMIT 1)))
        ELSE node
      END ORDER BY ord
    )
    FROM jsonb_array_elements(f."flow_definition"->'nodes') WITH ORDINALITY AS arr(node, ord)
  )
)
WHERE f."flow_definition" ? 'nodes'
  AND jsonb_typeof(f."flow_definition"->'nodes') = 'array'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(f."flow_definition"->'nodes') n
    WHERE n->>'type' = 'update_stage' AND n->'config' ? 'lifecycleStage'
  );
```
**Synthetic-test before trusting** (the dev DB may have no matching flows): in a rolled-back transaction, insert a flow with an `update_stage` node carrying `config.lifecycleStage:"customer"` + another node, run the rewrite, assert the update_stage node now has `config.leadStatusId` = a Closed Won id, `lifecycleStage` removed, other node + node order intact, and (with a duplicate status name present) exactly one node transformed (no fan-out).

## Out of Scope (2c / dev tooling)
- Drop `Contact.lifecycleStage` column + `LifecycleStage` enum — 2c.
- Dead `apps/api/src/lib/csv.ts` (`generateContactsCsv`, unused) — 2c sweep.
- Seed/debug scripts (`apps/api/scripts/seed-flows*.mjs`, `run-seed-flows.mjs`, `check-last-flow-run.mjs`) — dev tooling; update/remove during 2c sweep.
- The `lifecycle_change` trigger type string — intentionally retained (event id, not the column).

## Error Handling
- `update_stage` with no/empty `leadStatusId` → no-op (same guard as before).
- Migration: only transforms when the mapped id is non-null; unmatched nodes left as-is and surfaced by verification.

## Testing
- **flow-runner:** no isolated unit test exists for the action switch (the worker/engine is integration-style); verify via type-check + the migration's correctness + the existing flow tests staying green. (If a lightweight test is cheap, add one asserting `update_stage` calls `updateMany` with `{ leadStatusId }`.)
- **Migration:** synthetic rolled-back validation (above) + before/after count of flows whose `flow_definition` text contains `"lifecycleStage"` → 0 after.
- **Web:** type-check + build; grep gate (no `lifecycleStage` in `flow-runner.ts`, `FlowConfigPanel.tsx`, `serialize.ts`, `FlowNodePalette.tsx`).
- **Opus final review** (touches engine + persisted JSON migration).

## Success Criteria
Flows set and configure contact status via `leadStatusId`; no production flow code or stored `flow_definition` references `lifecycleStage`; existing `update_stage` nodes migrated to the mapped status id.
