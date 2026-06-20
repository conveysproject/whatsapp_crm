# Lead Status Cutover 2b-3 (Flows) Implementation Plan

> Steps use checkbox (`- [ ]`) syntax. Executed lean/inline with grep+type-check+build gates, synthetic migration test, and an Opus final review.

**Goal:** Cut the flows `update_stage` action + config off `lifecycleStage` to `leadStatusId`, and migrate persisted `flow_definition` JSON.

## Global Constraints
- TS strict; no `any`, no implicit returns. No new `console.log`. ESM `.js` imports.
- Prisma cmds from `apps/api`; psql user `WBMSG`; Postgres+Redis up.
- Migration: scalar-subquery name→id (no fan-out), order-preserving, only transform when mapped id non-null. Don't drop `Contact.lifecycle_stage` (2c).
- Enum→name map: lead→New Lead, prospect→Qualification, customer→Closed Won, loyal→Closed Won, churned→Closed Lost.

---

### Task 1: flow-runner update_stage action
**File:** `apps/api/src/lib/flow-runner.ts`
- [ ] Replace the `case "update_stage"` body (reads `node.config["lifecycleStage"]`, writes `data: { lifecycleStage: stage as ... }`) with: read `node.config["leadStatusId"] as string | undefined`; if truthy + `payload.contactPhone`, `contact.updateMany({ where: { organizationId, phoneNumber }, data: { leadStatusId } })`. Preserve surrounding control flow (`break;`).
- [ ] `pnpm --filter @WBMSG/api type-check` (clean); `grep -n lifecycleStage apps/api/src/lib/flow-runner.ts` → empty.
- [ ] Commit: `git commit -m "feat(api): flow update_stage action sets leadStatusId"`

---

### Task 2: flow web UI
**Files:** `apps/web/components/flows/FlowConfigPanel.tsx`, `apps/web/components/flows/utils/serialize.ts`, `apps/web/components/flows/FlowNodePalette.tsx`
- [ ] `FlowConfigPanel.tsx`: import + call `useLeadStatuses()`. Replace the `update_stage` config `<Select>` (hardcoded 5 enum options, value `str("lifecycleStage")||"lead"`, `set("lifecycleStage", v)`) with options from the hook (`{ value: s.id, label: s.name }`), value `str("leadStatusId")`, `set("leadStatusId", v)`, leading `{ value: "", label: "— Select status —" }`, label "Lead Status". Relabel trigger map `lifecycle_change: "Stage Changed"` → `"Status Changed"`.
- [ ] `serialize.ts`: default `case "update_stage": return { leadStatusId: "" };`; summary `case "update_stage": return str("leadStatusId") ? "Set status" : "Update Status";`
- [ ] `FlowNodePalette.tsx`: `lifecycle_change: "Stage Changed"` → `"Status Changed"`.
- [ ] `pnpm --filter @WBMSG/web type-check` (clean); `pnpm --filter @WBMSG/web build` (ok); `grep -rn lifecycleStage apps/web/components/flows` → empty.
- [ ] Commit: `git commit -m "feat(flows): update_stage config + labels use lead status"`

---

### Task 3: flow_definition JSON migration
**File:** new migration `<ts>_migrate_flow_update_stage`
- [ ] Record before-count: `docker exec WBMSG_postgres psql -U WBMSG -d WBMSG_dev -c "SELECT count(*) FROM flows WHERE flow_definition::text LIKE '%\"lifecycleStage\"%';"`
- [ ] Create the migration dir + the JSONB rewrite SQL from the spec (scalar-subquery name→id; transform only `update_stage` nodes with a non-null mapped id; preserve order; `jsonb_set(... '{nodes}', jsonb_agg(...))`).
- [ ] **Synthetic-test in a rolled-back txn** (psql `-U WBMSG`): insert a flow with nodes `[{type:'update_stage',config:{lifecycleStage:'customer'}},{type:'send_text',config:{text:'x'}}]` + a duplicate "Closed Won" status; run the rewrite; assert the update_stage node has `config.leadStatusId` = a Closed Won id, no `lifecycleStage`, the send_text node unchanged, node count = 2 (no fan-out). ROLLBACK.
- [ ] Apply: `npx prisma migrate deploy` (dev drift). After-count must be 0.
- [ ] Commit: `git commit -m "feat(db): migrate flow update_stage nodes to leadStatusId"`

---

### Finish
- [ ] Full API suite green; Opus final review of the branch diff; push.

## Self-Review
- flow-runner action → T1; web config/labels → T2; JSON migration (synthetic-tested) → T3 ✓.
- Grep gates ensure no `lifecycleStage` in production flow files ✓.
- `lifecycle_change` trigger string retained; column not dropped (2c) ✓.
- Dead seed/debug scripts + csv.ts deferred to 2c ✓.
