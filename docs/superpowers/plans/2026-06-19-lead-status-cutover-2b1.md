# Lead Status Cutover 2b-1 (Interactive Contact Surfaces) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the interactive contact-status surfaces (forms, detail, list filter, export, create/update, AI, trust-score) off the `lifecycleStage` enum to the configurable `leadStatus`, without dropping the column yet.

**Architecture:** API reads/writes `Contact.leadStatusId` and includes the `leadStatus` relation; the contacts list/export filter switches to `?leadStatusId=`. Web forms/filters fetch statuses from `GET /lead-statuses` via a shared `useLeadStatuses` hook. A backfill migration fills any null `leadStatusId`. `lifecycleStage` is left in the DB (read by segments/flows/import until 2b-2/2b-3) but no longer used by these surfaces — no sync.

**Tech Stack:** Prisma 7 + PostgreSQL 16, Fastify 4 (ESM, `.js` imports), Vitest, Next.js 15 / React 18, @tanstack/react-query, Tailwind.

## Global Constraints

- TypeScript strict — no `any`, no implicit returns. No `console.log`. ESM `.js` import extensions in API.
- Every Prisma query org-scoped via `request.auth.organizationId`.
- A `leadStatusId` supplied on create/update MUST be validated to belong to the caller's org (reject unknown/cross-org with 400).
- Web API base `process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000"`; React Query key `lead-statuses` (same key 2a/lead-statuses tab uses).
- `lifecycleStage` is NOT written or read by any Tier-1 surface after this work, and NOT kept in sync. The column/enum stay until 2c.
- Data-driven status colors use inline `style={{ backgroundColor }}`; all other styling Tailwind.
- Prisma commands run from `apps/api` (where `prisma.config.js` lives), not repo root.
- Enum→status backfill map: lead→New Lead, prospect→Qualification, customer→Closed Won, loyal→Closed Won, churned→Closed Lost.

---

### Task 1: Backfill null leadStatusId

**Files:**
- Create (generated, then edited): `apps/api/prisma/migrations/<ts>_backfill_lead_status_id/migration.sql`

**Interfaces:**
- Produces: every existing contact has a non-null `leadStatusId` (where a lifecycleStage existed).

- [ ] **Step 1: Create an empty migration**

From `apps/api`, run: `npx prisma migrate dev --name backfill_lead_status_id --create-only`
Expected: a new migration folder with an empty (or near-empty) `migration.sql` since the schema is unchanged.

- [ ] **Step 2: Write the backfill SQL**

Replace the contents of the generated `migration.sql` with:

```sql
-- Backfill leadStatusId for any contact still missing it (created between 2a and 2b-1)
UPDATE "contacts" c
SET "lead_status_id" = ls."id"
FROM "lead_statuses" ls
WHERE c."lead_status_id" IS NULL
  AND ls."organization_id" = c."organization_id"
  AND ls."name" = CASE c."lifecycle_stage"::text
    WHEN 'lead'     THEN 'New Lead'
    WHEN 'prospect' THEN 'Qualification'
    WHEN 'customer' THEN 'Closed Won'
    WHEN 'loyal'    THEN 'Closed Won'
    WHEN 'churned'  THEN 'Closed Lost'
  END;
```

- [ ] **Step 3: Apply the migration**

From `apps/api`, run: `npx prisma migrate dev`
Expected: applies with no SQL error. (Pre-existing pending migrations may apply first — that is fine.)

- [ ] **Step 4: Verify no nulls remain for contacts that have a lifecycle_stage**

From `apps/api`, run:
`docker exec WBMSG_postgres psql -U postgres -d WBMSG_dev -c "SELECT count(*) FROM contacts WHERE lead_status_id IS NULL AND deleted_at IS NULL;"`
Expected: prints a count. 0 is ideal; a non-zero count is acceptable only if those rows have no lifecycle_stage (none should, since the column has a default). Record the number in the report.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/migrations
git commit -m "feat(db): backfill leadStatusId for contacts created since 2a"
```

---

### Task 2: contacts.ts API cutover

**Files:**
- Modify: `apps/api/src/routes/contacts.ts`
- Modify: `apps/api/src/routes/contacts.test.ts`

**Interfaces:**
- Consumes: `Contact.leadStatusId`, `leadStatus` relation (from 2a).
- Produces: `?leadStatusId=` filter on GET /contacts and /contacts/export; `leadStatusId` accepted on POST/PATCH; `leadStatus` included in list/get/export responses.

- [ ] **Step 1: Write/adjust failing tests**

In `apps/api/src/routes/contacts.test.ts`, add tests (mirror the existing harness in that file — mocked prisma + `app.inject`). Add a `leadStatus` model to the mock prisma if not present (`leadStatus: { findFirst: vi.fn() }`) and `leadStatusId` handling:

```ts
it("creates a contact with leadStatusId", async () => {
  // arrange: mock contact.create to echo input; leadStatus.findFirst resolves the status in-org
  // act: POST /v1/contacts with { phoneNumber, leadStatusId: "ls-1" }
  // assert: 201 and contact.create called with data including leadStatusId: "ls-1"
});

it("rejects create with a leadStatusId from another org", async () => {
  // arrange: leadStatus.findFirst resolves null (not in org)
  // act: POST /v1/contacts with { phoneNumber, leadStatusId: "bad" }
  // assert: 400
});

it("updates a contact's leadStatusId", async () => {
  // arrange: contact.findFirst resolves existing; leadStatus.findFirst resolves in-org status
  // act: PATCH /v1/contacts/:id with { leadStatusId: "ls-2" }
  // assert: 200 and contact.update called with data including leadStatusId: "ls-2"
});
```

Write the assertions concretely using the file's existing mock style. Remove or update any existing test asserting `lifecycleStage` create/update behavior.

- [ ] **Step 2: Run tests to confirm they fail**

Run: `pnpm --filter @WBMSG/api exec vitest run src/routes/contacts.test.ts`
Expected: the new tests FAIL (leadStatusId not yet handled).

- [ ] **Step 3: Switch the export/list filter to leadStatusId**

In `contacts.ts` `buildExportWhere` (around lines 29 and 69), replace:

```ts
  const lifecycleStages = usp.getAll("lifecycleStage");
```
with
```ts
  const leadStatusIds = usp.getAll("leadStatusId");
```
and replace:
```ts
    ...(lifecycleStages.length > 0 && { lifecycleStage: { in: lifecycleStages as LifecycleStage[] } }),
```
with
```ts
    ...(leadStatusIds.length > 0 && { leadStatusId: { in: leadStatusIds } }),
```
Remove the now-unused `LifecycleStage` import if it is no longer referenced anywhere in the file (check first — it may still be referenced elsewhere; only remove if unused).

- [ ] **Step 4: Add the leadStatus relation to responses + export name**

In the GET /contacts list `findMany` (line ~300) change the `include` to:
```ts
      include: { country: true, leadStatus: { select: { id: true, name: true, color: true } }, groupContacts: { include: { contactGroup: { select: { id: true, title: true } } } } },
```
In the GET /contacts/:id `findFirst` (line ~322) add to its `include`:
```ts
        leadStatus: { select: { id: true, name: true, color: true } },
```
In the export `findMany` (line ~174 `include`) add `leadStatus: { select: { name: true } }`, change the CSV header label (line 183) from `"Lifecycle Stage"` to `"Lead Status"`, and change the row cell (line 196) from `csvEscape(c.lifecycleStage ?? "")` to `csvEscape(c.leadStatus?.name ?? "")`.

- [ ] **Step 5: Accept leadStatusId on create**

Add `leadStatusId?: string;` to the `ContactBody` interface (after line 88). In the POST handler, after destructuring (line ~353) add validation + write:
```ts
      if (request.body.leadStatusId) {
        const ls = await fastify.prisma.leadStatus.findFirst({ where: { id: request.body.leadStatusId, organizationId } });
        if (!ls) return reply.status(400).send({ error: { code: "INVALID_LEAD_STATUS", message: "leadStatusId not found in organization" } });
      }
```
and in the `contact.create` `data` block (after the `disableBot` line, ~366) add:
```ts
          ...(request.body.leadStatusId ? { leadStatusId: request.body.leadStatusId } : {}),
```

- [ ] **Step 6: Accept leadStatusId on update; fire trigger on status change**

In `ContactPatchBody` (line ~96) replace `lifecycleStage?: string;` with `leadStatusId?: string;`. In the PATCH handler, before the `contact.update` (line ~416) add validation:
```ts
      if (request.body.leadStatusId !== undefined && request.body.leadStatusId !== null) {
        const ls = await fastify.prisma.leadStatus.findFirst({ where: { id: request.body.leadStatusId, organizationId } });
        if (!ls) return reply.status(400).send({ error: { code: "INVALID_LEAD_STATUS", message: "leadStatusId not found in organization" } });
      }
```
In the `contact.update` `data` block, replace the `lifecycleStage` line (423) with:
```ts
          ...(request.body.leadStatusId !== undefined ? { leadStatusId: request.body.leadStatusId } : {}),
```
Replace the lifecycle-change trigger block (lines 457-459) with a status-change trigger (keep the same trigger type string `lifecycle_change` so existing flows still fire):
```ts
      if (request.body.leadStatusId !== undefined && request.body.leadStatusId !== existing.leadStatusId) {
        void dispatchFlowTrigger(fastify.prisma, organizationId, "lifecycle_change", dispatchBase);
      }
```

- [ ] **Step 7: Update the /contacts/search select**

In the search endpoint `select` (line ~270) replace `lifecycleStage: true` with `leadStatus: { select: { id: true, name: true, color: true } }`.

- [ ] **Step 8: Run tests + type-check**

Run: `pnpm --filter @WBMSG/api exec vitest run src/routes/contacts.test.ts` (expect PASS)
Run: `pnpm --filter @WBMSG/api type-check` (expect no errors)

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/routes/contacts.ts apps/api/src/routes/contacts.test.ts
git commit -m "feat(api): contacts use leadStatusId for filter/create/update/export/detail"
```

---

### Task 3: AI context + trust-score ML payload

**Files:**
- Modify: `apps/api/src/routes/ai.ts`
- Modify: `apps/api/src/routes/trust-score.ts`

**Interfaces:**
- Consumes: `leadStatus` relation.

- [ ] **Step 1: AI context**

In `ai.ts`, in the contact `select` (line ~156) replace `lifecycleStage: true,` with `leadStatus: { select: { name: true } },`. Then update the place(s) that read `contact.lifecycleStage` to use `contact.leadStatus?.name ?? "—"`. (Search the file for `lifecycleStage` to find the usage in the prompt/context string.)

- [ ] **Step 2: trust-score ML payload**

In `trust-score.ts`, change the contact query that selects `lifecycleStage` to instead include `leadStatus: { select: { name: true } }`, and in the ML POST body (line ~137) change:
```ts
        lifecycle_stage: contact.lifecycleStage,
```
to
```ts
        lifecycle_stage: contact.leadStatus?.name ?? null,
```
(The ML field name `lifecycle_stage` is intentionally unchanged; only the value source changes.)

- [ ] **Step 3: Type-check**

Run: `pnpm --filter @WBMSG/api type-check`
Expected: no errors. Confirm no remaining `lifecycleStage` references in `ai.ts` or `trust-score.ts` (`grep -n lifecycleStage apps/api/src/routes/ai.ts apps/api/src/routes/trust-score.ts` → no output).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/ai.ts apps/api/src/routes/trust-score.ts
git commit -m "feat(api): AI context and trust-score use lead status name"
```

---

### Task 4: Web shared hook + contact forms

**Files:**
- Create: `apps/web/hooks/useLeadStatuses.ts`
- Modify: `apps/web/components/contacts/AddContactModal.tsx`
- Modify: `apps/web/components/contacts/EditContactDrawer.tsx`

**Interfaces:**
- Produces: `useLeadStatuses()` → `{ data: LeadStatusOption[]; isLoading }` where `LeadStatusOption = { id: string; name: string; color: string }`.

- [ ] **Step 1: Create the shared hook**

Create `apps/web/hooks/useLeadStatuses.ts`:

```ts
"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export interface LeadStatusOption {
  id: string;
  name: string;
  color: string;
}

export function useLeadStatuses(): { data: LeadStatusOption[]; isLoading: boolean } {
  const { getToken } = useAuth();
  const { data = [], isLoading } = useQuery<LeadStatusOption[]>({
    queryKey: ["lead-statuses"],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/lead-statuses`, { headers: { Authorization: `Bearer ${token ?? ""}` } });
      if (!res.ok) return [];
      return (await res.json() as { data: LeadStatusOption[] }).data;
    },
  });
  return { data, isLoading };
}
```

- [ ] **Step 2: EditContactDrawer — replace the lifecycle dropdown**

In `EditContactDrawer.tsx`:
- Import the hook: `import { useLeadStatuses } from "@/hooks/useLeadStatuses";` and call it in the component: `const { data: leadStatuses } = useLeadStatuses();`
- In the form state initializer (line ~57) replace `lifecycleStage: contact?.lifecycleStage ?? "lead",` with `leadStatusId: contact?.leadStatusId ?? "",`.
- In the submit payload (line ~170) replace `lifecycleStage: form.lifecycleStage,` with `leadStatusId: form.leadStatusId || undefined,`.
- Replace the `<select>` block (lines 318-326) with a status select bound to the hook:
```tsx
                <select
                  className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white transition-colors"
                  value={form.leadStatusId}
                  onChange={(e) => setForm((f) => ({ ...f, leadStatusId: e.target.value }))}
                >
                  <option value="">— Select status —</option>
                  {leadStatuses.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
```
- If a `LIFECYCLE_STAGES` constant becomes unused after this, remove it and any `lifecycleStage` field from the component's local types.

- [ ] **Step 3: AddContactModal — same dropdown**

In `AddContactModal.tsx`:
- Import + call `useLeadStatuses()`.
- Replace the `lifecycleStage: string` fields in its local interfaces (lines ~15, ~32) with `leadStatusId: string`.
- Wherever it initializes/sends `lifecycleStage`, use `leadStatusId` (default `""`, send `|| undefined`).
- Replace its lifecycle `<select>` with the same status `<select>` shown in Step 2 (bound to `form.leadStatusId` + `leadStatuses`).

- [ ] **Step 4: Type-check + build**

Run: `pnpm --filter @WBMSG/web type-check` (no errors)
Run: `pnpm --filter @WBMSG/web build` (succeeds)

- [ ] **Step 5: Commit**

```bash
git add apps/web/hooks/useLeadStatuses.ts apps/web/components/contacts/AddContactModal.tsx apps/web/components/contacts/EditContactDrawer.tsx
git commit -m "feat(contacts): contact forms use configurable lead status"
```

---

### Task 5: Web contact detail + list filter + export modal

**Files:**
- Modify: `apps/web/app/(dashboard)/contacts/[id]/ContactDetailSidebar.tsx`
- Modify: `apps/web/app/(dashboard)/contacts/[id]/ContactDetailClient.tsx`
- Modify: `apps/web/components/contacts/ContactsClient.tsx`
- Modify: `apps/web/components/contacts/ExportModal.tsx`

**Interfaces:**
- Consumes: `useLeadStatuses` (Task 4); contact responses now carry `leadStatus: { id, name, color }`.

- [ ] **Step 1: Contact detail display**

In `ContactDetailSidebar.tsx` and `ContactDetailClient.tsx`, find where `lifecycleStage` is displayed and replace it with the contact's `leadStatus` — render `leadStatus?.name ?? "—"` and, where a badge/dot is shown, a color dot using `style={{ backgroundColor: leadStatus?.color }}`. Update the local contact type(s) to include `leadStatus?: { id: string; name: string; color: string } | null` and drop the `lifecycleStage` field.

- [ ] **Step 2: Contacts list filter**

In `ContactsClient.tsx`:
- Import + call `useLeadStatuses()`.
- Replace the fixed lifecycle-stage filter options with the fetched statuses; the applied filter must send `leadStatusId` query params (matching the API). Update where each row shows its status to read `contact.leadStatus?.name` with a `style={{ backgroundColor: contact.leadStatus?.color }}` dot.
- Update the component's contact type to include `leadStatus` and drop `lifecycleStage`.

- [ ] **Step 3: Export modal filter**

In `ExportModal.tsx`:
- Import + call `useLeadStatuses()`.
- Rename the `lifecycleStages` state to `leadStatusIds` (and its setter) and render the filter chips from the fetched statuses (label = name, value = id).
- In `buildParams` (line ~35) replace `lifecycleStages.forEach((s) => p.append("lifecycleStage", s));` with `leadStatusIds.forEach((id) => p.append("leadStatusId", id));` and update the `fetchCount`/effect call sites (lines ~127, ~137) and dependency array (line ~130) accordingly.

- [ ] **Step 4: Grep gate — no Tier-1 lifecycleStage references remain**

Run: `grep -rn "lifecycleStage\|lifecycle_stage" apps/web/components/contacts apps/web/app/"(dashboard)"/contacts`
Expected: no output (all Tier-1 web references removed). Import wizard files are NOT in these paths (they are 2b-2), so this gate is clean for 2b-1.

- [ ] **Step 5: Type-check + build**

Run: `pnpm --filter @WBMSG/web type-check` (no errors)
Run: `pnpm --filter @WBMSG/web build` (succeeds)

- [ ] **Step 6: Manual smoke (record in report)**

Add a contact and set its status; edit it; filter the contacts list by status; export with a status filter; open a contact's detail — all show/use configurable statuses with color dots.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/"(dashboard)"/contacts/"[id]"/ContactDetailSidebar.tsx apps/web/app/"(dashboard)"/contacts/"[id]"/ContactDetailClient.tsx apps/web/components/contacts/ContactsClient.tsx apps/web/components/contacts/ExportModal.tsx
git commit -m "feat(contacts): detail, list filter, and export use lead status"
```

---

## Self-Review

**Spec coverage:**
- contacts.ts filter/create/update/export/detail → Task 2 ✓
- ai.ts + trust-score.ts (incl. ML value-source note) → Task 3 ✓
- Add/Edit forms dropdown from /lead-statuses → Task 4 ✓
- Contact detail display, list filter, export filter → Task 5 ✓
- Backfill null leadStatusId → Task 1 ✓
- leadStatusId org-validation on create/update → Task 2 (Steps 5, 6) ✓
- No Tier-1 lifecycleStage references remain → Task 5 Step 4 grep gate + Task 3 Step 3 ✓
- Column NOT dropped (out of scope) → no task drops it ✓

**Placeholder scan:** API edits carry exact code; web edits are surgically anchored to current line numbers/snippets with the new code shown. The contacts.test.ts cases (Task 2 Step 1) describe arrange/act/assert with concrete expectations to encode in the file's existing mock style — acceptable because they must conform to that file's harness, which the implementer reads.

**Type consistency:** `LeadStatusOption { id, name, color }` (Task 4 hook) matches the API `leadStatus: { select: { id, name, color } }` includes (Task 2). `leadStatusId` body field consistent across API create/update and web form submit. Trigger type string `lifecycle_change` intentionally preserved. Query key `lead-statuses` consistent with 2a.

**Ordering note:** Task 1 (backfill) is independent; Tasks 2–3 (API) precede the web tasks so the `leadStatus` relation is present in responses before the UI consumes it. Task 4 (hook) precedes Task 5 (which consumes the hook).
