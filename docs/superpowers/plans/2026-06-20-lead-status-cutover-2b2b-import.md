# Lead Status Cutover 2b-2b (CSV Import) Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax. Execute task-by-task with review gates.

**Goal:** Cut CSV import off the `lifecycleStage` enum to the configurable `leadStatus` — resolving CSV status text by name, with a batch-default fallback.

**Architecture:** Worker loads the org's lead statuses into a case-insensitive name→id map; a pure `resolveLeadStatusId` helper maps each row's status text (or batch default) to a `leadStatusId`. The import route + record + job carry `leadStatusId`; `ContactImport.lifecycleStage` becomes nullable `leadStatusId`. Web wizard uses configurable statuses.

**Tech Stack:** Prisma 7 + PostgreSQL 16, Fastify 4 (ESM), BullMQ, Vitest, Next.js 15, Tailwind.

## Global Constraints
- TS strict; no `any`, no implicit returns. No `console.log`. ESM `.js` imports.
- Prisma cmds from `apps/api`; psql user `WBMSG`; Postgres+Redis up.
- Unmatched CSV status text → batch default `leadStatusId` → else null. Never fail a row over a status typo.
- Worker org-scoped (load statuses `where organizationId`). Don't drop `Contact.lifecycle_stage` (that's 2c).

---

### Task 1: Schema — ContactImport.leadStatusId

**Files:** Modify `apps/api/prisma/schema.prisma`; create migration `<ts>_contact_import_lead_status`.

- [ ] **Step 1:** In `schema.prisma`, in `model ContactImport`, replace `lifecycleStage LifecycleStage @map("lifecycle_stage")` with `leadStatusId String? @map("lead_status_id")`.
- [ ] **Step 2:** From `apps/api`: `npx prisma migrate dev --name contact_import_lead_status --create-only`. Confirm the generated SQL adds `lead_status_id` and drops `lifecycle_stage` on `contact_imports` (Prisma generates both from the schema diff). If it only adds, append `ALTER TABLE "contact_imports" DROP COLUMN "lifecycle_stage";`.
- [ ] **Step 3:** Apply: `npx prisma migrate dev` (or `migrate deploy` if dev drift blocks). Then `npx prisma generate`.
- [ ] **Step 4:** `pnpm --filter @WBMSG/api type-check` — NOTE: this will FAIL until Task 2 (route/worker still reference the old field). That is expected; Task 1's gate is just that the migration applies + client regenerates. Verify the column: `docker exec WBMSG_postgres psql -U WBMSG -d WBMSG_dev -c "\d contact_imports" | grep lead_status_id`.
- [ ] **Step 5:** Commit:
```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(db): ContactImport uses leadStatusId instead of lifecycleStage"
```

---

### Task 2: Backend — resolution helper + route + worker

**Files:** Create `apps/api/src/lib/resolve-lead-status.ts` + `resolve-lead-status.test.ts`; modify `apps/api/src/routes/contacts-import.ts`, `apps/api/src/workers/contact-import.worker.ts`.

**Interfaces:** Produces `resolveLeadStatusId(csvText: string | null | undefined, nameToId: Map<string,string>, validIds: Set<string>, batchDefault: string | null): string | null`.

- [ ] **Step 1: Write the failing test** — `apps/api/src/lib/resolve-lead-status.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { resolveLeadStatusId } from "./resolve-lead-status.js";

const nameToId = new Map([["new lead", "ls-new"], ["closed won", "ls-won"]]);
const validIds = new Set(["ls-new", "ls-won", "ls-default"]);

describe("resolveLeadStatusId", () => {
  it("matches CSV text by case-insensitive name", () => {
    expect(resolveLeadStatusId("New Lead", nameToId, validIds, null)).toBe("ls-new");
    expect(resolveLeadStatusId("  closed WON ", nameToId, validIds, null)).toBe("ls-won");
  });
  it("accepts a CSV value that is already a valid id", () => {
    expect(resolveLeadStatusId("ls-won", nameToId, validIds, null)).toBe("ls-won");
  });
  it("falls back to the batch default when CSV text is unmatched", () => {
    expect(resolveLeadStatusId("Nonsense", nameToId, validIds, "ls-default")).toBe("ls-default");
  });
  it("falls back to the batch default when CSV text is empty", () => {
    expect(resolveLeadStatusId("", nameToId, validIds, "ls-default")).toBe("ls-default");
    expect(resolveLeadStatusId(null, nameToId, validIds, "ls-default")).toBe("ls-default");
  });
  it("returns null when nothing matches and no valid default", () => {
    expect(resolveLeadStatusId("Nonsense", nameToId, validIds, null)).toBeNull();
    expect(resolveLeadStatusId("x", nameToId, validIds, "not-a-real-id")).toBeNull();
  });
});
```
- [ ] **Step 2:** Run `pnpm --filter @WBMSG/api exec vitest run src/lib/resolve-lead-status.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement** `apps/api/src/lib/resolve-lead-status.ts`:
```ts
// Resolve a CSV status value (name or id) to a valid leadStatusId, falling back to the batch default.
export function resolveLeadStatusId(
  csvText: string | null | undefined,
  nameToId: Map<string, string>,
  validIds: Set<string>,
  batchDefault: string | null,
): string | null {
  if (csvText) {
    const t = csvText.trim();
    const byName = nameToId.get(t.toLowerCase());
    if (byName) return byName;
    if (validIds.has(t)) return t;
  }
  if (batchDefault && validIds.has(batchDefault)) return batchDefault;
  return null;
}
```
- [ ] **Step 4:** Run the test → PASS (5 tests).
- [ ] **Step 5: Route** `contacts-import.ts`: remove `LifecycleStage` from the `@prisma/client` import. In the request body type + destructure (lines ~213, 219) replace `lifecycleStage: string` with `leadStatusId?: string | null`. In `contactImport.create` (line ~229) replace `lifecycleStage: lifecycleStage as LifecycleStage` with `leadStatusId: leadStatusId ?? null`. In the job payload (line ~241) replace `lifecycleStage` with `leadStatusId`.
- [ ] **Step 6: Worker** `contact-import.worker.ts`:
  - Add import: `import { resolveLeadStatusId } from "../lib/resolve-lead-status.js";`
  - In the job-data type/destructure (lines ~22, ~139) replace `lifecycleStage: string` with `leadStatusId?: string | null` (and rename the destructured var to `batchLeadStatusId`).
  - After the org is known (near the country lookup setup, before the row loop), load statuses once:
    ```ts
    const statusRows = await prisma.leadStatus.findMany({ where: { organizationId }, select: { id: true, name: true } });
    const nameToId = new Map(statusRows.map((s) => [s.name.trim().toLowerCase(), s.id]));
    const validStatusIds = new Set(statusRows.map((s) => s.id));
    ```
    (Use the same `prisma` instance the worker already uses.)
  - In the row loop replace:
    ```ts
    const csvLifecycle = extractField(row, fieldMapping, "lifecycleStage");
    const stage = (csvLifecycle || lifecycleStage) as LifecycleStage;
    ```
    with:
    ```ts
    const csvStatus = extractField(row, fieldMapping, "leadStatusId");
    const leadStatusId = resolveLeadStatusId(csvStatus, nameToId, validStatusIds, batchLeadStatusId ?? null);
    ```
  - In both `toUpdate` `data` and `toCreate` objects, replace `lifecycleStage: stage` with `leadStatusId` (shorthand). Remove the now-unused `LifecycleStage` import.
- [ ] **Step 7:** `pnpm --filter @WBMSG/api exec vitest run src/lib/resolve-lead-status.test.ts` (PASS) and `pnpm --filter @WBMSG/api type-check` (no errors). `grep -n lifecycleStage apps/api/src/routes/contacts-import.ts apps/api/src/workers/contact-import.worker.ts` → empty.
- [ ] **Step 8:** Commit:
```bash
git add apps/api/src/lib/resolve-lead-status.ts apps/api/src/lib/resolve-lead-status.test.ts apps/api/src/routes/contacts-import.ts apps/api/src/workers/contact-import.worker.ts
git commit -m "feat(api): CSV import resolves lead status by name with batch-default fallback"
```

---

### Task 3: Web — wizard + map step + sample CSV (lean/inline)

**Files:** Modify `apps/web/app/(dashboard)/contacts/import/ImportWizard.tsx`, `.../steps/Step2MapFields.tsx`, `apps/api/src/lib/csv.ts`.

- [ ] **Step 1:** `ImportWizard.tsx`: in the state type + initial state, `lifecycleStage: string` (default `"lead"`) → `leadStatusId: string` (default `""`).
- [ ] **Step 2:** `Step2MapFields.tsx`:
  - Import + call `useLeadStatuses()` (`@/hooks/useLeadStatuses`).
  - Auto-map heuristic (line ~25): `if (lower.includes("lifecycle") || lower.includes("stage") || lower.includes("status")) return "leadStatusId";`
  - Mappable target option (line ~208): `<option value="leadStatusId">Lead Status</option>`.
  - Batch dropdown (lines ~238-247): label "Default lead status"; replace the `LIFECYCLE_STAGES.map` `<select>` (bound to `state.lifecycleStage`) with one bound to `state.leadStatusId`, first option `<option value="">— None —</option>` then `leadStatuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>`.
  - POST body (line ~146): `leadStatusId: state.leadStatusId || undefined` (remove `lifecycleStage`).
  - Remove the now-unused `LIFECYCLE_STAGES` constant.
- [ ] **Step 3:** `csv.ts`: if the sample template has a "Lifecycle Stage" header/value, rename to "Lead Status" with example "New Lead". If not present, skip (note in commit).
- [ ] **Step 4:** `pnpm --filter @WBMSG/web type-check` (no errors); `pnpm --filter @WBMSG/web build` (succeeds); `grep -rn "lifecycleStage" apps/web/app/"(dashboard)"/contacts/import` → empty.
- [ ] **Step 5:** Commit:
```bash
git add apps/web/app/"(dashboard)"/contacts/import/ImportWizard.tsx apps/web/app/"(dashboard)"/contacts/import/steps/Step2MapFields.tsx apps/api/src/lib/csv.ts
git commit -m "feat(import): CSV import wizard uses configurable lead status"
```

---

## Self-Review
- Schema → Task 1 ✓; route+worker+resolution (TDD) → Task 2 ✓; web → Task 3 ✓.
- Unmatched→batch-default→null encoded in `resolveLeadStatusId` + tested ✓.
- No `lifecycleStage` left in import code (grep gates Task 2 Step 7, Task 3 Step 4) ✓.
- `Contact.lifecycle_stage` column NOT dropped (2c) ✓.
- Type consistency: `resolveLeadStatusId` signature identical across helper/test/worker; `leadStatusId` field consistent across route body, ContactImport, job, worker.
