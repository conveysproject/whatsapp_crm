# Lead Status Cutover 2b-2a (Segments) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Switch segment filtering from the `lifecycleStage` enum to the configurable `leadStatusId`, across the evaluator, the builder UI, the segment detail preview, and a data migration of existing stored segment filters.

**Architecture:** The segment `FilterRule` `lifecycleStage` variant becomes a `leadStatusId` variant; the evaluator builds a `leadStatusId` Prisma clause and the evaluate result carries the `leadStatus` relation. The builder + detail page use the 2b-1 `useLeadStatuses` hook. A Prisma JSONB migration rewrites persisted segment `filters` from enum strings to status ids.

**Tech Stack:** Prisma 7 + PostgreSQL 16 (JSONB), Fastify 4 (ESM), Vitest, Next.js 15 / React 18, @tanstack/react-query, Tailwind.

## Global Constraints

- TypeScript strict — no `any`, no implicit returns. No `console.log`. ESM `.js` imports in API.
- Prisma commands run from `apps/api` (where `prisma.config.js` lives), not repo root. Local Postgres `WBMSG_postgres` + Redis `WBMSG_redis` must be up (`docker compose up -d`).
- Enum→status-name map: lead→New Lead, prospect→Qualification, customer→Closed Won, loyal→Closed Won, churned→Closed Lost.
- Web data-driven status colors use inline `style={{ backgroundColor }}`; all other styling Tailwind.
- Reuse `useLeadStatuses()` from `@/hooks/useLeadStatuses` (returns `{ data: { id, name, color }[]; isLoading }`).
- Do NOT drop the `lifecycleStage` column/enum (that is 2c). After this work, no segment code or stored segment `filters` references `lifecycleStage`.

---

### Task 1: Evaluator — leadStatusId rule

**Files:**
- Modify: `apps/api/src/lib/segment-evaluator.ts`
- Modify: `apps/api/src/lib/segment-evaluator.test.ts`

**Interfaces:**
- Produces: `FilterRule` with member `{ field: "leadStatusId"; operator: "equals" | "isNot"; value: string }`; `EvaluateResult.contacts[]` shape `{ id, firstName, lastName, phoneNumber, leadStatus: { name: string; color: string } | null }`.

- [ ] **Step 1: Update the failing tests**

In `apps/api/src/lib/segment-evaluator.test.ts`, replace the two `lifecycleStage` rule usages with `leadStatusId`, and update the mock contact shape. Replace the first test and the "any" test's first rule:

```ts
  it("returns count and contacts for leadStatusId equals", async () => {
    const { evaluateSegment } = await import("./segment-evaluator.js");
    mockFindMany.mockResolvedValue([
      { id: "c1", firstName: "Ravi", lastName: "Kumar", phoneNumber: "+919000000001", leadStatus: { name: "New Lead", color: "#F97316" } },
    ]);
    const result = await evaluateSegment(mockPrisma, "org-1", [
      { field: "leadStatusId", operator: "equals", value: "ls-1" },
    ], "all");
    expect(result.count).toBe(1);
    expect(result.contacts[0].phoneNumber).toBe("+919000000001");
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ AND: [{ leadStatusId: "ls-1" }] }),
    }));
  });

  it("builds a NOT clause for leadStatusId isNot", async () => {
    const { evaluateSegment } = await import("./segment-evaluator.js");
    mockFindMany.mockResolvedValue([]);
    await evaluateSegment(mockPrisma, "org-1", [
      { field: "leadStatusId", operator: "isNot", value: "ls-9" },
    ], "all");
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ AND: [{ NOT: { leadStatusId: "ls-9" } }] }),
    }));
  });
```

In the "uses OR clause when match is any" test, change its first rule from `{ field: "lifecycleStage", operator: "equals", value: "lead" }` to `{ field: "leadStatusId", operator: "equals", value: "ls-1" }`. Search the rest of the file for any other `lifecycleStage` usage and switch it to `leadStatusId` with a `value` of `"ls-1"`.

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `pnpm --filter @WBMSG/api exec vitest run src/lib/segment-evaluator.test.ts`
Expected: FAIL (evaluator still keys on `lifecycleStage`; `leadStatusId` falls through).

- [ ] **Step 3: Update the FilterRule type**

In `segment-evaluator.ts`, replace this union member (line ~7):
```ts
  | { field: "lifecycleStage"; operator: "equals" | "isNot"; value: string }
```
with:
```ts
  | { field: "leadStatusId"; operator: "equals" | "isNot"; value: string }
```

- [ ] **Step 4: Update buildClause**

Replace the `case "lifecycleStage"` block (lines ~40-42):
```ts
    case "lifecycleStage":
      if (rule.operator === "isNot") return { NOT: { lifecycleStage: rule.value } };
      return { lifecycleStage: rule.value };
```
with:
```ts
    case "leadStatusId":
      if (rule.operator === "isNot") return { NOT: { leadStatusId: rule.value } };
      return { leadStatusId: rule.value };
```

- [ ] **Step 5: Update EvaluateResult shape + select**

In the `EvaluateResult` interface (lines ~18-24), replace `lifecycleStage: string | null;` with `leadStatus: { name: string; color: string } | null;`. In the `findMany` `select` (lines ~97-103), replace `lifecycleStage: true,` with `leadStatus: { select: { name: true, color: true } },`.

- [ ] **Step 6: Run the tests to confirm they pass**

Run: `pnpm --filter @WBMSG/api exec vitest run src/lib/segment-evaluator.test.ts`
Expected: PASS.

- [ ] **Step 7: Type-check + grep**

Run: `pnpm --filter @WBMSG/api type-check` (no errors)
Run: `grep -n "lifecycleStage" apps/api/src/lib/segment-evaluator.ts` (no output)

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/lib/segment-evaluator.ts apps/api/src/lib/segment-evaluator.test.ts
git commit -m "feat(api): segment evaluator filters by leadStatusId"
```

---

### Task 2: SegmentBuilder + segment detail page

**Files:**
- Modify: `apps/web/components/segments/SegmentBuilder.tsx`
- Modify: `apps/web/app/(dashboard)/contacts/segments/[id]/page.tsx`

**Interfaces:**
- Consumes: `useLeadStatuses()`; evaluate result contacts now carry `leadStatus: { name, color } | null`.

- [ ] **Step 1: Update the FilterRule type in SegmentBuilder**

In `SegmentBuilder.tsx`, in the local `FilterRule` type (line ~15), replace:
```tsx
  | { field: "lifecycleStage"; operator: "equals" | "isNot"; value: string }
```
with:
```tsx
  | { field: "leadStatusId"; operator: "equals" | "isNot"; value: string }
```

- [ ] **Step 2: Update the field option + operators + default rule**

- In the field group "Status" options (line ~38-39), change `{ value: "lifecycleStage", label: "Lifecycle stage" }` to `{ value: "leadStatusId", label: "Lead Status" }`.
- In the operators helper (line ~73-74), change `if (field === "lifecycleStage")` to `if (field === "leadStatusId")` (keep the same `[{ value: "equals", label: "is" }, { value: "isNot", label: "is not" }]`).
- In the default-rule builder (line ~114-115), change:
```tsx
  if (field === "lifecycleStage")
    return { field: "lifecycleStage", operator: "equals", value: "lead" };
```
to:
```tsx
  if (field === "leadStatusId")
    return { field: "leadStatusId", operator: "equals", value: "" };
```
- In the "add rule" default (line ~283), change `{ field: "lifecycleStage", operator: "equals", value: "lead" }` to `{ field: "leadStatusId", operator: "equals", value: "" }`.

- [ ] **Step 3: Replace the value editor dropdown**

At the top of the value-editor component (the function around line 130 that takes `{ rule, customFields, onChange }`), add the hook call: `const { data: leadStatuses } = useLeadStatuses();` (import it: `import { useLeadStatuses } from "@/hooks/useLeadStatuses";`). Replace the `if (rule.field === "lifecycleStage") { ... }` block (lines ~139-151) with:
```tsx
  if (rule.field === "leadStatusId") {
    return (
      <select
        className={selectClass}
        value={rule.value}
        onChange={(e) => onChange({ value: e.target.value } as Partial<FilterRule>)}
      >
        <option value="">— Select status —</option>
        {leadStatuses.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
    );
  }
```

- [ ] **Step 4: Update the segment detail preview**

In `apps/web/app/(dashboard)/contacts/segments/[id]/page.tsx`:
- In the local contact type (line ~18), replace `lifecycleStage: string | null;` with `leadStatus: { name: string; color: string } | null;`.
- Replace the status cell (lines ~152-155) that renders the `lifecycleStage` Badge with:
```tsx
                  {c.leadStatus ? (
                    <span className="inline-flex items-center gap-1.5 text-sm text-gray-700">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.leadStatus.color }} />
                      {c.leadStatus.name}
                    </span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
```
- Remove the now-unused `stageVariant` map and the `Badge` import if it is no longer used elsewhere in the file (check first).

- [ ] **Step 5: Type-check + build + grep gate**

Run: `pnpm --filter @WBMSG/web type-check` (no errors)
Run: `pnpm --filter @WBMSG/web build` (succeeds)
Run: `grep -rn "lifecycleStage" apps/web/components/segments/SegmentBuilder.tsx apps/web/app/"(dashboard)"/contacts/segments` (no output)

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/segments/SegmentBuilder.tsx apps/web/app/"(dashboard)"/contacts/segments/"[id]"/page.tsx
git commit -m "feat(segments): builder and detail preview use lead status"
```

---

### Task 3: Migrate persisted segment filters JSON

**Files:**
- Create (generated, then edited): `apps/api/prisma/migrations/<ts>_migrate_segment_lifecycle_filters/migration.sql`

**Interfaces:**
- Produces: every stored `segments.filters` rule with `field: "lifecycleStage"` rewritten to `field: "leadStatusId"` with `value` = the org's mapped `LeadStatus.id`.

- [ ] **Step 1: Record the before-count**

From `apps/api`, run:
`docker exec WBMSG_postgres psql -U WBMSG -d WBMSG_dev -c "SELECT count(*) FROM segments WHERE filters::text LIKE '%\"lifecycleStage\"%';"`
Record the number (the rows the migration must rewrite). If the dev DB has none, the migration is still required for production correctness.

- [ ] **Step 2: Create an empty migration**

From `apps/api`, run: `npx prisma migrate dev --name migrate_segment_lifecycle_filters --create-only`
Expected: a new migration folder with an empty `migration.sql` (schema unchanged).

- [ ] **Step 3: Write the JSONB rewrite SQL**

Replace the generated `migration.sql` contents with:

```sql
-- Rewrite segment filter rules: field 'lifecycleStage' (enum value) -> 'leadStatusId' (status id)
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

- [ ] **Step 4: Apply the migration**

From `apps/api`, run: `npx prisma migrate dev` (or `npx prisma migrate deploy` if dev drift blocks `dev`).
Expected: applies with no SQL error.

- [ ] **Step 5: Verify zero remaining lifecycleStage rules**

From `apps/api`, run:
`docker exec WBMSG_postgres psql -U WBMSG -d WBMSG_dev -c "SELECT count(*) FROM segments WHERE filters::text LIKE '%\"lifecycleStage\"%';"`
Expected: **0**. If the before-count (Step 1) was > 0, also spot-check one segment:
`docker exec WBMSG_postgres psql -U WBMSG -d WBMSG_dev -c "SELECT id, filters FROM segments WHERE filters::text LIKE '%leadStatusId%' LIMIT 1;"`
and confirm the rewritten rule's `value` matches a real `lead_statuses.id` for that segment's org. Record both results in the report.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/migrations
git commit -m "feat(db): migrate segment filter rules from lifecycleStage to leadStatusId"
```

---

## Self-Review

**Spec coverage:**
- Evaluator FilterRule + buildClause + EvaluateResult → Task 1 ✓
- SegmentBuilder field/operators/default/value-editor → Task 2 ✓
- Segment detail page badge → status name+color → Task 2 ✓
- JSONB migration of stored filters + verification → Task 3 ✓
- Grep gates (no lifecycleStage in the 3 files) → Task 1 Step 7, Task 2 Step 5 ✓
- lifecycleStage column NOT dropped → no task drops it ✓
- Saved filters excluded → not in any task ✓

**Placeholder scan:** none — evaluator/UI edits carry exact code anchored to current lines; migration SQL is concrete; verification commands have expected output.

**Type consistency:** `leadStatusId` rule shape identical in evaluator (Task 1) and SegmentBuilder (Task 2). `EvaluateResult.contacts[].leadStatus { name, color }` (Task 1) matches the detail page's local type and render (Task 2). `useLeadStatuses` return `{ id, name, color }` consumed correctly. Migration target field `leadStatusId` matches the evaluator/UI rule field.

**Ordering note:** Task 1 (evaluator) and Task 2 (UI) land the code that understands `leadStatusId`; Task 3 migrates stored data to match. Within the branch the three commits merge atomically, so there is no production window where data and code disagree.
