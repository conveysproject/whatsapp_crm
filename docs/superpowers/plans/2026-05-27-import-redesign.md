# Contact Import Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the 5-step import wizard to 3 steps, and add firstName/lastName/fullName column mapping, batch group assignment, and custom field column mapping.

**Architecture:** Backend gets `batchGroupIds` on `ContactImport` and three new worker field handlers. The shared `DbField` type gains five new values. The frontend wizard collapses from 5 to 3 steps: Upload (file only) → Configure (mapper + batch settings + inline stats) → Import (progress + inline results). Steps 3 (Preview) and 5 (Summary) are deleted; their logic moves inline into Steps 2 and 4 respectively.

**Tech Stack:** Prisma, BullMQ, Redis, SSE, Next.js 15 App Router, React, Vitest, Fastify 4

---

## File Map

| Action | File |
|--------|------|
| Modify | `packages/shared/src/index.ts` |
| Modify | `apps/api/prisma/schema.prisma` |
| Modify | `apps/api/src/routes/contacts-import.ts` |
| Create | `apps/api/src/routes/contacts-import.test.ts` |
| Modify | `apps/api/src/workers/contact-import.worker.ts` |
| Create | `apps/api/src/workers/contact-import.worker.test.ts` |
| Modify | `apps/web/app/(dashboard)/contacts/import/ImportWizard.tsx` |
| Modify | `apps/web/app/(dashboard)/contacts/import/steps/Step1Upload.tsx` |
| Modify | `apps/web/app/(dashboard)/contacts/import/steps/Step2MapFields.tsx` |
| Modify | `apps/web/app/(dashboard)/contacts/import/steps/Step4Progress.tsx` |
| Delete | `apps/web/app/(dashboard)/contacts/import/steps/Step3Preview.tsx` |
| Delete | `apps/web/app/(dashboard)/contacts/import/steps/Step5Summary.tsx` |

---

### Task 1: Extend DbField type in shared package

**Files:**
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Replace the DbField type**

Open `packages/shared/src/index.ts`. Find the existing `DbField` type (currently lines 17–25) and replace it:

```typescript
export type DbField =
  | "fullPhoneNumber"
  | "phoneNumber"
  | "countryCode"
  | "firstName"
  | "lastName"
  | "fullName"
  | "name"
  | "email"
  | "lifecycleStage"
  | "tags"
  | `customField:${string}`
  | "skip";
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm --filter @WBMSG/shared build
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/index.ts
git commit -m "feat(import): extend DbField with firstName, lastName, fullName, customField"
```

---

### Task 2: Add batchGroupIds to ContactImport schema

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Add field to ContactImport model**

Find the `ContactImport` model in `apps/api/prisma/schema.prisma`. Add `batchGroupIds` after the `batchTags` field:

```prisma
  batchTags      String[]
  batchGroupIds  String[]            @default([])
```

- [ ] **Step 2: Push schema and generate client**

```bash
pnpm --filter @WBMSG/api exec prisma db push --accept-data-loss
pnpm --filter @WBMSG/api generate
```

Expected: "Your database is now in sync with your Prisma schema."

- [ ] **Step 3: Create migration file**

Create `apps/api/prisma/migrations/20260527_add_batch_group_ids/migration.sql`:

```sql
ALTER TABLE "contact_imports" ADD COLUMN IF NOT EXISTS "batch_group_ids" TEXT[] NOT NULL DEFAULT '{}';
```

Then mark it applied:

```bash
pnpm --filter @WBMSG/api exec prisma migrate resolve --applied 20260527_add_batch_group_ids
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/
git commit -m "feat(import): add batchGroupIds to ContactImport schema"
```

---

### Task 3: Extend /start route to accept batchGroupIds

**Files:**
- Modify: `apps/api/src/routes/contacts-import.ts`
- Create: `apps/api/src/routes/contacts-import.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/routes/contacts-import.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    contactImport: {
      create: vi.fn().mockResolvedValue({ id: "import-1" }),
      update: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn().mockResolvedValue(null),
    },
  },
}));

vi.mock("../lib/redis.js", () => ({
  redis: { get: vi.fn(), set: vi.fn(), del: vi.fn() },
}));

vi.mock("../lib/queue.js", () => ({
  contactImportQueue: { add: vi.fn().mockResolvedValue({ id: "job-1" }) },
  redisConnection: {},
}));

vi.mock("../plugins/auth.js", () => ({
  default: async (app: ReturnType<typeof Fastify>) => {
    app.decorateRequest("auth", null);
    app.addHook("onRequest", async (req) => {
      (req as unknown as Record<string, unknown>)["auth"] = { organizationId: "org-1", userId: "user-1" };
    });
  },
}));

describe("POST /v1/contacts/import/start", () => {
  it("accepts batchGroupIds and stores them", async () => {
    const { prisma } = await import("../lib/prisma.js");
    const { contactImportQueue } = await import("../lib/queue.js");

    // Build a minimal Fastify app with just the import routes
    const app = Fastify({ logger: false });
    const { contactsImportRoutes } = await import("./contacts-import.js");
    await app.register(contactsImportRoutes, { prefix: "/v1" });

    const res = await app.inject({
      method: "POST",
      url: "/v1/contacts/import/start",
      payload: {
        sessionId: "sess-1",
        fieldMapping: [{ csvColumn: "Phone", dbField: "fullPhoneNumber" }],
        batchTags: ["vip"],
        batchGroupIds: ["group-a", "group-b"],
        lifecycleStage: "lead",
        updateExisting: false,
        totalRows: 100,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(prisma.contactImport.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ batchGroupIds: ["group-a", "group-b"] }),
      })
    );
    expect(contactImportQueue.add).toHaveBeenCalledWith(
      "import",
      expect.objectContaining({ batchGroupIds: ["group-a", "group-b"] })
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @WBMSG/api test contacts-import
```

Expected: FAIL — `batchGroupIds` not in Body type or not stored.

- [ ] **Step 3: Update the route**

In `apps/api/src/routes/contacts-import.ts`, find the `POST /contacts/import/start` handler. Update the `Body` type and destructuring to include `batchGroupIds`:

```typescript
    Body: {
      sessionId: string;
      fieldMapping: FieldMapping;
      batchTags: string[];
      batchGroupIds?: string[];
      lifecycleStage: string;
      updateExisting: boolean;
      totalRows: number;
    };
```

Update destructuring:

```typescript
const { sessionId, fieldMapping, batchTags, batchGroupIds = [], lifecycleStage, updateExisting, totalRows } = request.body;
```

Update `prisma.contactImport.create` data:

```typescript
      data: {
        organizationId,
        status: "pending",
        totalRows,
        fieldMapping: fieldMapping as unknown as Prisma.InputJsonValue,
        batchTags,
        batchGroupIds,
        lifecycleStage: lifecycleStage as LifecycleStage,
        updateExisting,
      },
```

Update the BullMQ `add` call to include `batchGroupIds`:

```typescript
    await contactImportQueue.add("import", {
      importId: importRecord.id,
      sessionId,
      organizationId,
      fieldMapping,
      batchTags,
      batchGroupIds,
      lifecycleStage,
      updateExisting,
    });
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @WBMSG/api test contacts-import
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/contacts-import.ts apps/api/src/routes/contacts-import.test.ts
git commit -m "feat(import): accept batchGroupIds in /start route"
```

---

### Task 4: Extend worker — firstName, lastName, fullName, custom fields

**Files:**
- Modify: `apps/api/src/workers/contact-import.worker.ts`
- Create: `apps/api/src/workers/contact-import.worker.test.ts`

- [ ] **Step 1: Write failing tests for the extraction logic**

Create `apps/api/src/workers/contact-import.worker.test.ts`:

```typescript
import { describe, it, expect } from "vitest";

// We test the pure functions by exporting them — see Step 3 for the exports.
import {
  extractFirstLastName,
  extractCustomFields,
} from "./contact-import.worker.js";

describe("extractFirstLastName", () => {
  it("extracts separate firstName and lastName columns", () => {
    const row = { First: "Jane", Last: "Doe" };
    const mapping = [
      { csvColumn: "First", dbField: "firstName" as const },
      { csvColumn: "Last", dbField: "lastName" as const },
    ];
    const result = extractFirstLastName(row, mapping);
    expect(result).toEqual({ firstName: "Jane", lastName: "Doe", name: "Jane Doe" });
  });

  it("splits fullName on first space", () => {
    const row = { Name: "John Smith Doe" };
    const mapping = [{ csvColumn: "Name", dbField: "fullName" as const }];
    const result = extractFirstLastName(row, mapping);
    expect(result).toEqual({ firstName: "John", lastName: "Smith Doe", name: "John Smith Doe" });
  });

  it("handles fullName with no space", () => {
    const row = { Name: "Priya" };
    const mapping = [{ csvColumn: "Name", dbField: "fullName" as const }];
    const result = extractFirstLastName(row, mapping);
    expect(result).toEqual({ firstName: "Priya", lastName: "", name: "Priya" });
  });

  it("fullName wins over separate firstName/lastName when both mapped", () => {
    const row = { First: "Jane", Last: "Doe", Full: "Alice Wonder" };
    const mapping = [
      { csvColumn: "First", dbField: "firstName" as const },
      { csvColumn: "Last", dbField: "lastName" as const },
      { csvColumn: "Full", dbField: "fullName" as const },
    ];
    const result = extractFirstLastName(row, mapping);
    expect(result).toEqual({ firstName: "Alice", lastName: "Wonder", name: "Alice Wonder" });
  });

  it("returns nulls when no name fields mapped", () => {
    const row = { Phone: "+911234567890" };
    const mapping = [{ csvColumn: "Phone", dbField: "fullPhoneNumber" as const }];
    const result = extractFirstLastName(row, mapping);
    expect(result).toEqual({ firstName: null, lastName: null, name: null });
  });
});

describe("extractCustomFields", () => {
  it("extracts custom field values from matching columns", () => {
    const row = { City: "Mumbai", Plan: "Pro" };
    const mapping = [
      { csvColumn: "City", dbField: "customField:cf-1" as const },
      { csvColumn: "Plan", dbField: "customField:cf-2" as const },
    ];
    const result = extractCustomFields(row, mapping);
    expect(result).toEqual({ "cf-1": "Mumbai", "cf-2": "Pro" });
  });

  it("skips empty custom field values", () => {
    const row = { City: "", Plan: "Pro" };
    const mapping = [
      { csvColumn: "City", dbField: "customField:cf-1" as const },
      { csvColumn: "Plan", dbField: "customField:cf-2" as const },
    ];
    const result = extractCustomFields(row, mapping);
    expect(result).toEqual({ "cf-2": "Pro" });
  });

  it("returns empty object when no custom fields mapped", () => {
    const row = { Phone: "+911234567890" };
    const mapping = [{ csvColumn: "Phone", dbField: "fullPhoneNumber" as const }];
    const result = extractCustomFields(row, mapping);
    expect(result).toEqual({});
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @WBMSG/api test contact-import.worker
```

Expected: FAIL — `extractFirstLastName` and `extractCustomFields` not exported.

- [ ] **Step 3: Add exported pure functions and update worker**

In `apps/api/src/workers/contact-import.worker.ts`:

**a) Update the `ContactImportJob` interface** to add `batchGroupIds`:

```typescript
interface ContactImportJob {
  importId: string;
  sessionId: string;
  organizationId: string;
  fieldMapping: FieldMapping;
  batchTags: string[];
  batchGroupIds: string[];
  lifecycleStage: string;
  updateExisting: boolean;
}
```

**b) Add the two exported pure functions** before `extractPhone` (add at top, after imports):

```typescript
export function extractFirstLastName(
  row: Record<string, string>,
  mapping: FieldMapping
): { firstName: string | null; lastName: string | null; name: string | null } {
  // Apply firstName/lastName first, then fullName overrides both
  let firstName: string | null = null;
  let lastName: string | null = null;
  let name: string | null = null;

  const fnEntry = mapping.find((e) => e.dbField === "firstName");
  const lnEntry = mapping.find((e) => e.dbField === "lastName");
  const fullEntry = mapping.find((e) => e.dbField === "fullName");
  const nameEntry = mapping.find((e) => e.dbField === "name");

  if (fnEntry) firstName = (row[fnEntry.csvColumn] ?? "").trim() || null;
  if (lnEntry) lastName = (row[lnEntry.csvColumn] ?? "").trim() || null;
  if (firstName || lastName) {
    name = `${firstName ?? ""} ${lastName ?? ""}`.trim() || null;
  }

  if (fullEntry) {
    const raw = (row[fullEntry.csvColumn] ?? "").trim();
    if (raw) {
      const spaceIdx = raw.indexOf(" ");
      firstName = spaceIdx >= 0 ? raw.slice(0, spaceIdx) : raw;
      lastName = spaceIdx >= 0 ? raw.slice(spaceIdx + 1) : "";
      name = raw;
    }
  }

  if (!name && nameEntry) {
    name = (row[nameEntry.csvColumn] ?? "").trim() || null;
  }

  return { firstName, lastName, name };
}

export function extractCustomFields(
  row: Record<string, string>,
  mapping: FieldMapping
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const entry of mapping) {
    if (typeof entry.dbField === "string" && entry.dbField.startsWith("customField:")) {
      const id = entry.dbField.slice("customField:".length);
      const value = (row[entry.csvColumn] ?? "").trim();
      if (value) result[id] = value;
    }
  }
  return result;
}
```

**c) Update the destructuring** in the Worker to include `batchGroupIds`:

```typescript
const { importId, sessionId, organizationId, fieldMapping, batchTags, batchGroupIds, lifecycleStage, updateExisting } = job.data;
```

**d) Replace the per-row name/field extraction block** inside the `for (const { phone, row } of validRows)` loop. Find:

```typescript
          const tags = mergeTagsUnion(extractField(row, fieldMapping, "tags"), batchTags);
          const name = extractField(row, fieldMapping, "name") ?? null;
          const email = extractField(row, fieldMapping, "email") ?? null;
          const csvLifecycle = extractField(row, fieldMapping, "lifecycleStage");
          const stage = (csvLifecycle || lifecycleStage) as LifecycleStage;
          const countryRaw = extractField(row, fieldMapping, "country");
          const countryId = countryRaw ? (countryLookup.get(countryRaw.toLowerCase()) ?? null) : null;

          if (existingId && updateExisting) {
            toUpdate.push({ id: existingId, phone, data: { name, email, lifecycleStage: stage, tags, ...(countryId !== null && { countryId }) } });
          } else if (!existingId) {
            toCreate.push({ organizationId, phoneNumber: phone, name, email, lifecycleStage: stage, tags, ...(countryId !== null && { countryId }) });
```

Replace with:

```typescript
          const tags = mergeTagsUnion(extractField(row, fieldMapping, "tags"), batchTags);
          const { firstName, lastName, name } = extractFirstLastName(row, fieldMapping);
          const email = extractField(row, fieldMapping, "email") ?? null;
          const csvLifecycle = extractField(row, fieldMapping, "lifecycleStage");
          const stage = (csvLifecycle || lifecycleStage) as LifecycleStage;
          const countryRaw = extractField(row, fieldMapping, "country");
          const countryId = countryRaw ? (countryLookup.get(countryRaw.toLowerCase()) ?? null) : null;
          const customFields = extractCustomFields(row, fieldMapping);
          const customFieldsValue = Object.keys(customFields).length > 0
            ? customFields as unknown as Prisma.InputJsonValue
            : undefined;

          if (existingId && updateExisting) {
            toUpdate.push({
              id: existingId, phone,
              data: { firstName, lastName, name, email, lifecycleStage: stage, tags, ...(countryId !== null && { countryId }), ...(customFieldsValue !== undefined && { customFields: customFieldsValue }) },
            });
          } else if (!existingId) {
            toCreate.push({
              organizationId, phoneNumber: phone, firstName, lastName, name, email, lifecycleStage: stage, tags,
              ...(countryId !== null && { countryId }),
              ...(customFieldsValue !== undefined && { customFields: customFieldsValue }),
            });
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @WBMSG/api test contact-import.worker
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/workers/contact-import.worker.ts apps/api/src/workers/contact-import.worker.test.ts
git commit -m "feat(import): extract firstName/lastName/fullName and custom fields in worker"
```

---

### Task 5: Extend worker — batch group assignment

**Files:**
- Modify: `apps/api/src/workers/contact-import.worker.ts`
- Modify: `apps/api/src/workers/contact-import.worker.test.ts`

- [ ] **Step 1: Add failing test for group assignment**

Add to `apps/api/src/workers/contact-import.worker.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { assignBatchGroups } from "./contact-import.worker.js";

// Mock prisma for group assignment test
const mockCreateMany = vi.fn().mockResolvedValue({ count: 2 });
const mockPrisma = {
  groupContact: { createMany: mockCreateMany },
} as unknown as import("@prisma/client").PrismaClient;

describe("assignBatchGroups", () => {
  it("creates groupContact records for each contact × group pair", async () => {
    await assignBatchGroups(mockPrisma, ["contact-1", "contact-2"], ["group-a"]);
    expect(mockCreateMany).toHaveBeenCalledWith({
      data: [
        { contactId: "contact-1", contactGroupId: "group-a" },
        { contactId: "contact-2", contactGroupId: "group-a" },
      ],
      skipDuplicates: true,
    });
  });

  it("does nothing when batchGroupIds is empty", async () => {
    mockCreateMany.mockClear();
    await assignBatchGroups(mockPrisma, ["contact-1"], []);
    expect(mockCreateMany).not.toHaveBeenCalled();
  });

  it("does nothing when contactIds is empty", async () => {
    mockCreateMany.mockClear();
    await assignBatchGroups(mockPrisma, [], ["group-a"]);
    expect(mockCreateMany).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @WBMSG/api test contact-import.worker
```

Expected: FAIL — `assignBatchGroups` not exported.

- [ ] **Step 3: Add exported function and wire into worker**

**a) Export `assignBatchGroups`** — add after `extractCustomFields` in the worker file:

```typescript
export async function assignBatchGroups(
  db: typeof prisma,
  contactIds: string[],
  batchGroupIds: string[]
): Promise<void> {
  if (batchGroupIds.length === 0 || contactIds.length === 0) return;
  const pairs = contactIds.flatMap((contactId) =>
    batchGroupIds.map((contactGroupId) => ({ contactId, contactGroupId }))
  );
  await db.groupContact.createMany({ data: pairs, skipDuplicates: true });
}
```

**b) After the `toCreate` / `toUpdate` processing block**, after the `for (const { id, data } of toUpdate)` loop, add a group assignment step. Find the end of the `if (validRows.length)` block and add before the closing brace:

```typescript
        // Batch group assignment — fetch IDs of all contacts in this batch
        if (batchGroupIds.length > 0) {
          const batchContacts = await prisma.contact.findMany({
            where: { organizationId, phoneNumber: { in: validRows.map((r) => r.phone) } },
            select: { id: true },
          });
          await assignBatchGroups(prisma, batchContacts.map((c) => c.id), batchGroupIds);
        }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @WBMSG/api test contact-import.worker
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/workers/contact-import.worker.ts apps/api/src/workers/contact-import.worker.test.ts
git commit -m "feat(import): assign batch groups after each worker batch"
```

---

### Task 6: Collapse ImportWizard to 3 steps

**Files:**
- Modify: `apps/web/app/(dashboard)/contacts/import/ImportWizard.tsx`

- [ ] **Step 1: Rewrite ImportWizard.tsx**

Replace the entire file content:

```typescript
"use client";

import { JSX, createContext, useContext, useState } from "react";
import type { FieldMapping, ImportAnalysisResult, ImportProgress } from "@WBMSG/shared";
import { Step1Upload } from "./steps/Step1Upload";
import { Step2MapFields } from "./steps/Step2MapFields";
import { Step4Progress } from "./steps/Step4Progress";

export interface WizardState {
  step: 1 | 2 | 3;
  sessionId: string | null;
  columns: string[];
  sampleRows: Record<string, string>[];
  mapping: FieldMapping;
  batchTags: string[];
  batchGroupIds: string[];
  lifecycleStage: string;
  analysisResult: ImportAnalysisResult | null;
  updateExisting: boolean;
  importJobId: string | null;
  importToken: string | null;
  totalRows: number;
  importSummary: ImportProgress | null;
}

interface WizardContextValue {
  state: WizardState;
  setState: (patch: Partial<WizardState>) => void;
  nextStep: () => void;
  prevStep: () => void;
  reset: () => void;
}

const WizardContext = createContext<WizardContextValue | null>(null);

export function useWizard(): WizardContextValue {
  const ctx = useContext(WizardContext);
  if (!ctx) throw new Error("useWizard must be used inside ImportWizard");
  return ctx;
}

const INITIAL_STATE: WizardState = {
  step: 1,
  sessionId: null,
  columns: [],
  sampleRows: [],
  mapping: [],
  batchTags: [],
  batchGroupIds: [],
  lifecycleStage: "lead",
  analysisResult: null,
  updateExisting: true,
  importJobId: null,
  importToken: null,
  totalRows: 0,
  importSummary: null,
};

const STEP_LABELS = ["Upload", "Configure", "Import"] as const;

export function ImportWizard(): JSX.Element {
  const [state, setStateRaw] = useState<WizardState>(INITIAL_STATE);

  function setState(patch: Partial<WizardState>) {
    setStateRaw((prev) => ({ ...prev, ...patch }));
  }

  function nextStep() {
    setStateRaw((prev) => ({ ...prev, step: Math.min(prev.step + 1, 3) as WizardState["step"] }));
  }

  function prevStep() {
    setStateRaw((prev) => ({ ...prev, step: Math.max(prev.step - 1, 1) as WizardState["step"] }));
  }

  function reset() {
    setStateRaw(INITIAL_STATE);
  }

  const stepComponents: Record<WizardState["step"], JSX.Element> = {
    1: <Step1Upload />,
    2: <Step2MapFields />,
    3: <Step4Progress />,
  };

  return (
    <WizardContext.Provider value={{ state, setState, nextStep, prevStep, reset }}>
      <div className="max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Import Contacts</h1>
          <nav className="mt-4 flex items-center gap-0 flex-wrap">
            {STEP_LABELS.map((label, idx) => {
              const stepNum = (idx + 1) as WizardState["step"];
              const isActive = state.step === stepNum;
              const isDone = state.step > stepNum;
              return (
                <div key={label} className="flex items-center">
                  <div className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full ${isActive ? "bg-brand-600 text-white font-medium" : isDone ? "text-brand-600" : "text-gray-400"}`}>
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${isActive ? "bg-white text-brand-600" : isDone ? "bg-brand-600 text-white" : "bg-gray-200 text-gray-500"}`}>
                      {isDone ? "✓" : stepNum}
                    </span>
                    {label}
                  </div>
                  {idx < STEP_LABELS.length - 1 && <div className="w-6 h-px bg-gray-200 mx-1" />}
                </div>
              );
            })}
          </nav>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          {stepComponents[state.step]}
        </div>
      </div>
    </WizardContext.Provider>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
pnpm --filter @WBMSG/web type-check 2>&1 | head -30
```

Expected: no new errors (Step3Preview/Step5Summary still exist so imports are fine temporarily).

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/(dashboard)/contacts/import/ImportWizard.tsx"
git commit -m "feat(import): collapse wizard to 3 steps, add batchGroupIds to state"
```

---

### Task 7: Strip batch settings from Step1Upload

**Files:**
- Modify: `apps/web/app/(dashboard)/contacts/import/steps/Step1Upload.tsx`

- [ ] **Step 1: Rewrite Step1Upload.tsx — file upload only**

Replace the entire file:

```typescript
"use client";

import { JSX, useRef, useState, DragEvent, ChangeEvent } from "react";
import { useAuth } from "@clerk/nextjs";
import { useWizard } from "../ImportWizard";
import { Button } from "@/components/ui/Button";

export function Step1Upload(): JSX.Element {
  const { state, setState, nextStep } = useWizard();
  const { getToken } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setUploadedFileName(null);
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Only .csv files are accepted.");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setError("File exceeds the 50 MB limit.");
      return;
    }
    setUploading(true);
    try {
      const token = await getToken();
      if (state.sessionId) {
        await fetch(`${process.env["NEXT_PUBLIC_API_URL"]}/v1/contacts/import/session/${state.sessionId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token ?? ""}` },
        }).catch(() => undefined);
      }
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${process.env["NEXT_PUBLIC_API_URL"]}/v1/contacts/import/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token ?? ""}` },
        body: form,
      });
      if (!res.ok) {
        setError("Upload failed. Please check your file and try again.");
        return;
      }
      const body = await res.json() as { data: { sessionId: string; columns: string[]; sampleRows: Record<string, string>[] } };
      setState({ sessionId: body.data.sessionId, columns: body.data.columns, sampleRows: body.data.sampleRows });
      setUploadedFileName(file.name);
    } catch {
      setError("An unexpected error occurred.");
    } finally {
      setUploading(false);
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  }

  function onInputChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 space-y-1">
        <p className="font-medium">Upload instructions</p>
        <ul className="list-disc list-inside space-y-0.5 text-blue-700">
          <li>Max 50 MB allowed (up to 500,000 contacts)</li>
          <li>CSV must include a phone number column (full international format, or separate number + country code columns)</li>
          <li>Duplicate phone numbers in the file: only the first row is imported</li>
          <li>You will configure lifecycle stage, tags, and groups in the next step</li>
        </ul>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-xl border-2 border-dashed p-10 text-center transition-colors ${dragging ? "border-brand-500 bg-brand-50" : "border-gray-300 hover:border-brand-400 hover:bg-gray-50"}`}
      >
        <p className="text-sm text-gray-600">Drag &amp; drop your CSV here, or <span className="text-brand-600 font-medium">browse files</span></p>
        <p className="mt-1 text-xs text-gray-400">.csv only · max 50 MB</p>
        <input ref={inputRef} type="file" accept=".csv" className="hidden" onChange={onInputChange} />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {uploading && <p className="text-sm text-gray-500 animate-pulse">Uploading and parsing file…</p>}

      {uploadedFileName && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 flex items-center justify-between gap-4">
          <p className="text-sm text-green-800">
            <span className="font-medium">{uploadedFileName}</span> — {state.columns.length} columns detected.
          </p>
          <Button onClick={nextStep}>Next</Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "apps/web/app/(dashboard)/contacts/import/steps/Step1Upload.tsx"
git commit -m "feat(import): Step1 — file upload only, move batch settings to Step2"
```

---

### Task 8: Rewrite Step2MapFields as Configure step

**Files:**
- Modify: `apps/web/app/(dashboard)/contacts/import/steps/Step2MapFields.tsx`

- [ ] **Step 1: Replace the entire file**

```typescript
"use client";

import { JSX, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useWizard } from "../ImportWizard";
import { TagInput } from "@/components/contacts/TagInput";
import { Button } from "@/components/ui/Button";
import type { DbField, FieldMappingEntry } from "@WBMSG/shared";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";
const LIFECYCLE_STAGES = ["lead", "prospect", "customer", "loyal", "churned"] as const;

interface GroupOption { id: string; title: string }
interface CustomFieldMeta { id: string; inputName: string; isRequired: boolean }

function autoSuggest(col: string): DbField {
  const lower = col.toLowerCase().replace(/[\s_-]/g, "");
  if (lower.includes("fullphone") || (lower.includes("phone") && lower.includes("full"))) return "fullPhoneNumber";
  if (lower.includes("countrycode") || lower === "cc" || lower === "isd") return "countryCode";
  if (lower.includes("phone") || lower.includes("mobile") || lower.includes("whatsapp")) return "phoneNumber";
  if (lower === "firstname" || lower === "fname") return "firstName";
  if (lower === "lastname" || lower === "lname" || lower === "surname") return "lastName";
  if (lower === "name" || lower === "fullname" || lower === "contactname") return "fullName";
  if (lower.includes("email") || lower.includes("mail")) return "email";
  if (lower.includes("lifecycle") || lower.includes("stage")) return "lifecycleStage";
  if (lower.includes("tag")) return "tags";
  return "skip";
}

function validateMapping(mapping: FieldMappingEntry[]): string | null {
  const hasFull = mapping.some((e) => e.dbField === "fullPhoneNumber");
  const hasPhone = mapping.some((e) => e.dbField === "phoneNumber");
  const hasCC = mapping.some((e) => e.dbField === "countryCode");
  if (!hasFull && !hasPhone) return "Map at least one phone column to continue.";
  if (hasPhone && !hasCC) return hasFull
    ? "Remove the Phone Number mapping or also map Country Code."
    : "Country Code column is required when Phone Number is mapped.";
  if (hasCC && !hasPhone) return hasFull
    ? "Remove the Country Code mapping or also map Phone Number."
    : "Phone Number column is required when Country Code is mapped.";
  return null;
}

function getRequiredNotMapped(mapping: FieldMappingEntry[], customFields: CustomFieldMeta[]): string[] {
  const mappedIds = new Set(
    mapping
      .filter((e) => (e.dbField as string).startsWith("customField:"))
      .map((e) => (e.dbField as string).slice("customField:".length))
  );
  return customFields.filter((cf) => cf.isRequired && !mappedIds.has(cf.id)).map((cf) => cf.inputName);
}

export function Step2MapFields(): JSX.Element {
  const { state, setState, nextStep, prevStep } = useWizard();
  const { getToken } = useAuth();
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [customFields, setCustomFields] = useState<CustomFieldMeta[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (state.mapping.length === 0 && state.columns.length > 0) {
      setState({ mapping: state.columns.map((col) => ({ csvColumn: col, dbField: autoSuggest(col) })) });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void (async () => {
      const token = await getToken();
      const headers = { Authorization: `Bearer ${token ?? ""}` };
      const [groupsRes, cfRes] = await Promise.all([
        fetch(`${API_URL}/v1/contact-groups?archived=false`, { headers }),
        fetch(`${API_URL}/v1/contacts/custom-fields`, { headers }),
      ]);
      if (groupsRes.ok) {
        const body = await groupsRes.json() as { data: GroupOption[] };
        setGroups(body.data);
      }
      if (cfRes.ok) {
        const body = await cfRes.json() as { data: CustomFieldMeta[] };
        setCustomFields(body.data);
      }
    })();
  }, [getToken]);

  function updateMapping(csvColumn: string, dbField: DbField) {
    setState({
      mapping: state.mapping.map((e) => e.csvColumn === csvColumn ? { ...e, dbField } : e),
      analysisResult: null,
    });
  }

  const validationError = validateMapping(state.mapping);
  const requiredNotMapped = getRequiredNotMapped(state.mapping, customFields);
  const hasAnalysis = state.analysisResult !== null;
  const result = state.analysisResult;

  async function handlePreview() {
    if (validationError) return;
    setAnalyzing(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/contacts/import/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
        body: JSON.stringify({ sessionId: state.sessionId, fieldMapping: state.mapping }),
      });
      if (res.status === 404) {
        setState({ step: 1, sessionId: null, columns: [], sampleRows: [], mapping: [], analysisResult: null });
        return;
      }
      if (!res.ok) { setError("Analysis failed. Please try again."); return; }
      const body = await res.json() as { data: { totalRows: number; newContacts: number; duplicatesInCsv: number; existingInDb: number } };
      setState({ analysisResult: body.data, totalRows: body.data.totalRows });
    } catch {
      setError("An unexpected error occurred.");
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleStartImport() {
    if (!state.analysisResult) return;
    setStarting(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/contacts/import/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
        body: JSON.stringify({
          sessionId: state.sessionId,
          fieldMapping: state.mapping,
          batchTags: state.batchTags,
          batchGroupIds: state.batchGroupIds,
          lifecycleStage: state.lifecycleStage,
          updateExisting: state.updateExisting,
          totalRows: state.totalRows,
        }),
      });
      if (res.status === 404) {
        setState({ step: 1, sessionId: null, columns: [], sampleRows: [], mapping: [], analysisResult: null });
        return;
      }
      if (!res.ok) { setError("Could not start import. Please try again."); return; }
      const body = await res.json() as { data: { importJobId: string; importToken: string } };
      setState({ importJobId: body.data.importJobId, importToken: body.data.importToken });
      nextStep();
    } catch {
      setError("An unexpected error occurred.");
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-gray-900">Configure import</h2>
        <p className="text-sm text-gray-500 mt-1">Map your CSV columns, then set batch options before importing.</p>
      </div>

      {requiredNotMapped.length > 0 && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
          Required fields not mapped: <strong>{requiredNotMapped.join(", ")}</strong> — contacts will be imported without these values.
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
              <th className="pb-2 pr-4">CSV Column</th>
              <th className="pb-2 pr-4">Maps to</th>
              <th className="pb-2">Sample value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {state.mapping.map((entry) => (
              <tr key={entry.csvColumn}>
                <td className="py-2 pr-4 font-mono text-gray-700 text-xs">{entry.csvColumn}</td>
                <td className="py-2 pr-4">
                  <select
                    value={entry.dbField}
                    onChange={(e) => updateMapping(entry.csvColumn, e.target.value as DbField)}
                    className="rounded-md border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <optgroup label="Identity">
                      <option value="firstName">First Name</option>
                      <option value="lastName">Last Name</option>
                      <option value="fullName">Full Name (auto-split)</option>
                      <option value="fullPhoneNumber">Full Phone Number</option>
                      <option value="phoneNumber">Phone Number</option>
                      <option value="email">Email</option>
                    </optgroup>
                    <optgroup label="Contact Info">
                      <option value="countryCode">Country Code</option>
                      <option value="lifecycleStage">Lifecycle Stage</option>
                      <option value="tags">Tags</option>
                    </optgroup>
                    {customFields.length > 0 && (
                      <optgroup label="Custom Fields">
                        {customFields.map((cf) => (
                          <option key={cf.id} value={`customField:${cf.id}`}>
                            {cf.inputName}{cf.isRequired ? " *" : ""}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    <option value="skip">— Skip —</option>
                  </select>
                </td>
                <td className="py-2 text-gray-400 text-xs truncate max-w-[180px]">
                  {state.sampleRows[0]?.[entry.csvColumn] ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {validationError && <p className="text-sm text-amber-600">{validationError}</p>}

      <div className="border-t border-gray-200 pt-5 space-y-4">
        <h3 className="text-sm font-medium text-gray-900">Batch settings</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Lifecycle stage</label>
            <select
              value={state.lifecycleStage}
              onChange={(e) => setState({ lifecycleStage: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {LIFECYCLE_STAGES.map((s) => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Add tags to all contacts</label>
            <TagInput tags={state.batchTags} onChange={(tags) => setState({ batchTags: tags })} />
          </div>
        </div>

        {groups.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Add to groups</label>
            <div className="flex flex-wrap gap-2">
              {groups.map((g) => {
                const selected = state.batchGroupIds.includes(g.id);
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => {
                      const next = selected
                        ? state.batchGroupIds.filter((id) => id !== g.id)
                        : [...state.batchGroupIds, g.id];
                      setState({ batchGroupIds: next });
                    }}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      selected
                        ? "border-brand-600 bg-brand-50 text-brand-700"
                        : "border-gray-300 bg-white text-gray-600 hover:border-gray-400"
                    }`}
                  >
                    {g.title}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <label className="flex items-center gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={state.updateExisting}
            onChange={(e) => setState({ updateExisting: e.target.checked })}
            className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
          />
          <span className="text-sm text-gray-700">Update existing contacts with data from this CSV</span>
        </label>
      </div>

      {result && (
        <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 text-sm text-gray-700 flex items-center gap-4 flex-wrap">
          <span><strong>{result.newContacts.toLocaleString()}</strong> new</span>
          <span className="text-gray-300">·</span>
          <span><strong>{result.duplicatesInCsv.toLocaleString()}</strong> duplicates in file</span>
          <span className="text-gray-300">·</span>
          <span>
            <strong>{result.existingInDb.toLocaleString()}</strong>{" "}
            {state.updateExisting ? "will update" : "will skip (existing)"}
          </span>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center justify-between pt-2">
        <Button variant="secondary" onClick={() => { setState({ analysisResult: null }); prevStep(); }} disabled={analyzing || starting}>
          Back
        </Button>
        <div className="flex items-center gap-3">
          {!hasAnalysis && (
            <Button onClick={() => { void handlePreview(); }} disabled={!!validationError || analyzing}>
              {analyzing ? "Analysing…" : "Preview"}
            </Button>
          )}
          {hasAnalysis && (
            <>
              <button
                type="button"
                onClick={() => { void handlePreview(); }}
                disabled={analyzing}
                className="text-sm text-brand-600 hover:underline disabled:opacity-50"
              >
                {analyzing ? "Re-analysing…" : "Re-analyse"}
              </button>
              <Button onClick={() => { void handleStartImport(); }} disabled={starting}>
                {starting ? "Starting…" : "Start Import"}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
pnpm --filter @WBMSG/web type-check 2>&1 | head -30
```

Expected: no errors on this file.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/(dashboard)/contacts/import/steps/Step2MapFields.tsx"
git commit -m "feat(import): Step2 Configure — mapper with optgroups, batch groups, inline preview stats"
```

---

### Task 9: Step4Progress — inline results, delete Step3 and Step5

**Files:**
- Modify: `apps/web/app/(dashboard)/contacts/import/steps/Step4Progress.tsx`
- Delete: `apps/web/app/(dashboard)/contacts/import/steps/Step3Preview.tsx`
- Delete: `apps/web/app/(dashboard)/contacts/import/steps/Step5Summary.tsx`

- [ ] **Step 1: Replace Step4Progress to show inline results on completion**

Replace the entire file:

```typescript
"use client";

import { JSX, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useWizard } from "../ImportWizard";
import { Button } from "@/components/ui/Button";
import type { ImportProgress } from "@WBMSG/shared";

export function Step4Progress(): JSX.Element {
  const { state, reset } = useWizard();
  const router = useRouter();
  const [progress, setProgress] = useState<ImportProgress>({
    processed: 0,
    total: state.totalRows,
    created: 0,
    updated: 0,
    skipped: 0,
    status: "pending",
  });
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);
  const latestProgressRef = useRef(progress);

  useEffect(() => {
    if (!state.importJobId) return;
    let es: EventSource | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let finished = false;

    function connect() {
      es = new EventSource(
        `${process.env["NEXT_PUBLIC_API_URL"]}/v1/contacts/import/${state.importJobId}/progress?token=${encodeURIComponent(state.importToken ?? "")}`
      );

      es.onmessage = (event: MessageEvent<string>) => {
        const data = JSON.parse(event.data) as Partial<ImportProgress> & { event?: string; status?: string };
        if (data.event === "done" || data.status === "completed" || data.status === "failed") {
          finished = true;
          es?.close();
          const isFailed = data.status === "failed";
          if (!isFailed) {
            const final = { ...latestProgressRef.current, ...data } as ImportProgress;
            setProgress({ ...final, status: "completed" });
          }
          setFailed(isFailed);
          setDone(true);
          return;
        }
        setProgress((prev) => {
          const next = { ...prev, ...data } as ImportProgress;
          latestProgressRef.current = next;
          return next;
        });
      };

      es.onerror = () => {
        es?.close();
        if (!finished) {
          reconnectTimeout = setTimeout(connect, 2000);
        }
      };
    }

    connect();

    return () => {
      finished = true;
      es?.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.importJobId]);

  const percent = progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0;
  const totalActioned = progress.created + progress.updated;
  const allSkipped = done && !failed && totalActioned === 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-gray-900">
          {done && !failed ? "Import complete" : failed ? "Import failed" : "Importing contacts…"}
        </h2>
        {!done && <p className="text-sm text-gray-500 mt-1">Keep this page open. Large files may take a few minutes.</p>}
      </div>

      {/* Progress bar — frozen when done */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm text-gray-600">
          <span>{progress.processed.toLocaleString()} of {progress.total.toLocaleString()} rows processed</span>
          <span className="font-medium">{percent}%</span>
        </div>
        <div className="h-3 rounded-full bg-gray-200 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ease-out ${failed ? "bg-red-500" : "bg-brand-600"}`}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {/* Live counters */}
      <div className="grid grid-cols-3 gap-3 text-center text-sm">
        <div className="rounded-lg border border-gray-100 bg-green-50 p-3">
          <p className="text-xl font-bold text-green-700">{progress.created.toLocaleString()}</p>
          <p className="text-gray-500 text-xs mt-0.5">Created</p>
        </div>
        <div className="rounded-lg border border-gray-100 bg-blue-50 p-3">
          <p className="text-xl font-bold text-blue-700">{progress.updated.toLocaleString()}</p>
          <p className="text-gray-500 text-xs mt-0.5">Updated</p>
        </div>
        <div className="rounded-lg border border-gray-100 p-3">
          <p className="text-xl font-bold text-gray-400">{progress.skipped.toLocaleString()}</p>
          <p className="text-gray-500 text-xs mt-0.5">Skipped</p>
        </div>
      </div>

      {/* Inline results after completion */}
      {done && !failed && (
        <div className="border-t border-gray-200 pt-5 space-y-4">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center ${allSkipped ? "bg-amber-100" : "bg-green-100"}`}>
            <span className={`text-xl font-bold ${allSkipped ? "text-amber-600" : "text-green-600"}`}>
              {allSkipped ? "!" : "✓"}
            </span>
          </div>
          <p className="text-sm text-gray-600">
            {allSkipped
              ? "No contacts were imported — all rows were skipped or had invalid phone numbers."
              : "Your contacts have been imported successfully."}
          </p>
          <div className="flex gap-3">
            <Button onClick={() => router.push("/contacts")}>View Contacts</Button>
            <Button variant="secondary" onClick={reset}>Import Another File</Button>
          </div>
        </div>
      )}

      {failed && (
        <div className="border-t border-gray-200 pt-5">
          <p className="text-sm text-gray-500">An error occurred during processing. Please try again or contact support.</p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Delete Step3Preview.tsx and Step5Summary.tsx**

```bash
rm "apps/web/app/(dashboard)/contacts/import/steps/Step3Preview.tsx"
rm "apps/web/app/(dashboard)/contacts/import/steps/Step5Summary.tsx"
```

- [ ] **Step 3: Verify TypeScript and no broken imports**

```bash
pnpm --filter @WBMSG/web type-check 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/(dashboard)/contacts/import/steps/Step4Progress.tsx"
git rm "apps/web/app/(dashboard)/contacts/import/steps/Step3Preview.tsx"
git rm "apps/web/app/(dashboard)/contacts/import/steps/Step5Summary.tsx"
git commit -m "feat(import): Step3 Import — inline results on completion, remove Step3Preview and Step5Summary"
```

---

### Task 10: Final type-check, test run, and push

- [ ] **Step 1: Run all API tests**

```bash
pnpm --filter @WBMSG/api test
```

Expected: all pass except the pre-existing `analytics.test.ts` timeout.

- [ ] **Step 2: Run full type-check**

```bash
pnpm type-check
```

Expected: no errors.

- [ ] **Step 3: Push to deploy**

```bash
git push origin main
```

Vercel deploys automatically on push — import wizard will be live in ~1 minute.
