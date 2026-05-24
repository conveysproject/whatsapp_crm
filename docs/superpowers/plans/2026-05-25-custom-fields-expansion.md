# Custom Fields Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand `ContactCustomField` with six new metadata columns (fieldKey, description, placeholder, defaultValue, isRequired, isReadOnly) and surface all nine properties in the settings UI and Add Contact modal.

**Architecture:** Schema migration adds columns with sensible defaults; the API POST auto-generates `fieldKey` from the label if omitted; the settings page is rewritten with a full edit-capable form; the Add Contact modal uses the new properties to drive placeholder, default value, required validation, and read-only rendering.

**Tech Stack:** Prisma (schema + migration), Fastify (API route), Next.js 15 App Router (settings page + modal component), React Query, Tailwind CSS.

---

## File Map

| Action | File |
|--------|------|
| Modify | `apps/api/prisma/schema.prisma` |
| Create | `apps/api/prisma/migrations/20260525000000_custom_fields_expansion/migration.sql` |
| Modify | `apps/api/src/routes/custom-fields.ts` |
| Create | `apps/api/src/routes/custom-fields.test.ts` |
| Modify | `apps/web/app/(dashboard)/settings/custom-fields/page.tsx` |
| Modify | `apps/web/components/contacts/AddContactModal.tsx` |

---

## Task 1: Schema — add six columns to ContactCustomField

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260525000000_custom_fields_expansion/migration.sql`

- [ ] **Step 1: Update the Prisma schema**

Replace the existing `ContactCustomField` model block in `apps/api/prisma/schema.prisma`:

```prisma
model ContactCustomField {
  id             String                    @id @default(uuid())
  organizationId String                    @map("organization_id")
  inputName      String                    @map("input_name")
  fieldKey       String                    @map("field_key")
  inputType      String                    @default("text") @map("input_type")
  description    String?
  placeholder    String?
  defaultValue   String?                   @map("default_value")
  isRequired     Boolean                   @default(false) @map("is_required")
  isReadOnly     Boolean                   @default(false) @map("is_read_only")
  isActive       Boolean                   @default(true) @map("is_active")
  createdAt      DateTime                  @default(now()) @map("created_at")
  updatedAt      DateTime                  @updatedAt @map("updated_at")
  values         ContactCustomFieldValue[]

  @@unique([organizationId, fieldKey])
  @@index([organizationId])
  @@map("contact_custom_fields")
}
```

- [ ] **Step 2: Push schema to DB**

```powershell
pnpm --filter @WBMSG/api exec prisma db push --accept-data-loss
```

Expected: `Your database is now in sync with your Prisma schema.`

- [ ] **Step 3: Create the migration file manually**

Create directory and file:
`apps/api/prisma/migrations/20260525000000_custom_fields_expansion/migration.sql`

```sql
-- AlterTable
ALTER TABLE "contact_custom_fields"
  ADD COLUMN IF NOT EXISTS "field_key"     TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "description"   TEXT,
  ADD COLUMN IF NOT EXISTS "placeholder"   TEXT,
  ADD COLUMN IF NOT EXISTS "default_value" TEXT,
  ADD COLUMN IF NOT EXISTS "is_required"   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "is_read_only"  BOOLEAN NOT NULL DEFAULT FALSE;

-- Back-fill field_key from input_name for any pre-existing rows
UPDATE "contact_custom_fields"
SET "field_key" = lower(regexp_replace("input_name", '[^a-zA-Z0-9]+', '_', 'g'))
WHERE "field_key" = '';

ALTER TABLE "contact_custom_fields"
  ALTER COLUMN "field_key" DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "contact_custom_fields_organization_id_field_key_key"
  ON "contact_custom_fields"("organization_id", "field_key");
```

- [ ] **Step 4: Mark migration as applied**

```powershell
pnpm --filter @WBMSG/api exec prisma migrate resolve --applied 20260525000000_custom_fields_expansion
```

Expected: `Migration 20260525000000_custom_fields_expansion marked as applied.`

- [ ] **Step 5: Regenerate Prisma client**

```powershell
pnpm --filter @WBMSG/api generate
```

Expected: `Generated Prisma Client`

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/
git commit -m "feat(api): add fieldKey, description, placeholder, defaultValue, isRequired, isReadOnly to ContactCustomField"
```

---

## Task 2: API — update custom-fields route

**Files:**
- Modify: `apps/api/src/routes/custom-fields.ts`

- [ ] **Step 1: Replace entire file content**

```typescript
import type { FastifyPluginAsync } from "fastify";
import { checkPlanLimit } from "../lib/plan-limits.js";

interface CustomFieldBody {
  inputName: string;
  fieldKey?: string;
  inputType?: string;
  description?: string;
  placeholder?: string;
  defaultValue?: string;
  isRequired?: boolean;
  isReadOnly?: boolean;
}

interface CustomFieldPatchBody extends Partial<CustomFieldBody> {
  isActive?: boolean;
}

function toFieldKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export const customFieldsRouter: FastifyPluginAsync = async (fastify) => {
  // GET /v1/contacts/custom-fields
  // ?all=1 returns inactive fields too (used by settings page)
  fastify.get<{ Querystring: { all?: string } }>(
    "/contacts/custom-fields",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const includeAll = request.query.all === "1";
      const fields = await fastify.prisma.contactCustomField.findMany({
        where: { organizationId, ...(includeAll ? {} : { isActive: true }) },
        orderBy: { createdAt: "asc" },
      });
      return reply.send({ data: fields });
    }
  );

  // POST /v1/contacts/custom-fields
  fastify.post<{ Body: CustomFieldBody }>(
    "/contacts/custom-fields",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const {
        inputName,
        fieldKey,
        inputType = "text",
        description,
        placeholder,
        defaultValue,
        isRequired = false,
        isReadOnly = false,
      } = request.body;

      if (!inputName?.trim()) {
        return reply
          .status(400)
          .send({ error: { code: "MISSING_FIELDS", message: "inputName is required" } });
      }

      const limitCheck = await checkPlanLimit(fastify.prisma, organizationId, "custom_fields");
      if (!limitCheck.allowed) {
        return reply.status(402).send({
          error: {
            code: "PLAN_LIMIT_REACHED",
            message: `Custom field limit of ${limitCheck.limit} reached`,
          },
        });
      }

      const resolvedKey =
        fieldKey?.trim() ? fieldKey.trim() : toFieldKey(inputName);

      const field = await fastify.prisma.contactCustomField.create({
        data: {
          organizationId,
          inputName: inputName.trim(),
          fieldKey: resolvedKey,
          inputType,
          description: description ?? null,
          placeholder: placeholder ?? null,
          defaultValue: defaultValue ?? null,
          isRequired,
          isReadOnly,
        },
      });

      return reply.status(201).send({ data: field });
    }
  );

  // PATCH /v1/contacts/custom-fields/:id
  fastify.patch<{ Params: { id: string }; Body: CustomFieldPatchBody }>(
    "/contacts/custom-fields/:id",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const existing = await fastify.prisma.contactCustomField.findFirst({
        where: { id: request.params.id, organizationId },
      });
      if (!existing) {
        return reply
          .status(404)
          .send({ error: { code: "NOT_FOUND", message: "Custom field not found" } });
      }

      const {
        inputName,
        fieldKey,
        inputType,
        description,
        placeholder,
        defaultValue,
        isRequired,
        isReadOnly,
        isActive,
      } = request.body;

      const updated = await fastify.prisma.contactCustomField.update({
        where: { id: existing.id },
        data: {
          ...(inputName !== undefined ? { inputName: inputName.trim() } : {}),
          ...(fieldKey !== undefined ? { fieldKey: fieldKey.trim() } : {}),
          ...(inputType !== undefined ? { inputType } : {}),
          ...(description !== undefined ? { description } : {}),
          ...(placeholder !== undefined ? { placeholder } : {}),
          ...(defaultValue !== undefined ? { defaultValue } : {}),
          ...(isRequired !== undefined ? { isRequired } : {}),
          ...(isReadOnly !== undefined ? { isReadOnly } : {}),
          ...(isActive !== undefined ? { isActive } : {}),
        },
      });

      return reply.send({ data: updated });
    }
  );

  // DELETE /v1/contacts/custom-fields/:id  (soft-delete via isActive=false)
  fastify.delete<{ Params: { id: string } }>(
    "/contacts/custom-fields/:id",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const field = await fastify.prisma.contactCustomField.findFirst({
        where: { id: request.params.id, organizationId },
      });
      if (!field) {
        return reply
          .status(404)
          .send({ error: { code: "NOT_FOUND", message: "Custom field not found" } });
      }
      await fastify.prisma.contactCustomField.update({
        where: { id: field.id },
        data: { isActive: false },
      });
      return reply.status(204).send();
    }
  );
};
```

- [ ] **Step 2: Type-check the API**

```powershell
pnpm --filter @WBMSG/api type-check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/custom-fields.ts
git commit -m "feat(api): expand custom-fields route with all new fields and ?all=1 query param"
```

---

## Task 3: API tests for custom-fields route

**Files:**
- Create: `apps/api/src/routes/custom-fields.test.ts`

- [ ] **Step 1: Create the test file**

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const mockField = {
  id: "field-1",
  organizationId: "org-1",
  inputName: "Company Size",
  fieldKey: "company_size",
  inputType: "text",
  description: null,
  placeholder: null,
  defaultValue: null,
  isRequired: false,
  isReadOnly: false,
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const mockPrisma = {
  contactCustomField: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn().mockResolvedValue(0),
  },
  vendorSetting: {
    findFirst: vi.fn().mockResolvedValue(null),
  },
};

const mockAuth = {
  userId: "user-1",
  organizationId: "org-1",
  role: "admin" as const,
  permissions: {},
};

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (request) => {
    request.auth = mockAuth;
  });
  const { customFieldsRouter } = await import("./custom-fields.js");
  await app.register(customFieldsRouter, { prefix: "/v1" });
  return app;
}

describe("GET /v1/contacts/custom-fields", () => {
  let app: FastifyInstance;
  beforeEach(async () => { app = await buildApp(); });
  afterEach(async () => { await app.close(); vi.clearAllMocks(); });

  it("returns active fields by default", async () => {
    mockPrisma.contactCustomField.findMany.mockResolvedValue([mockField]);
    const res = await app.inject({ method: "GET", url: "/v1/contacts/custom-fields" });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { data: typeof mockField[] }).data).toHaveLength(1);
    expect(mockPrisma.contactCustomField.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: "org-1", isActive: true } })
    );
  });

  it("returns all fields including inactive when ?all=1", async () => {
    mockPrisma.contactCustomField.findMany.mockResolvedValue([mockField]);
    const res = await app.inject({ method: "GET", url: "/v1/contacts/custom-fields?all=1" });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.contactCustomField.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: "org-1" } })
    );
  });
});

describe("POST /v1/contacts/custom-fields", () => {
  let app: FastifyInstance;
  beforeEach(async () => { app = await buildApp(); });
  afterEach(async () => { await app.close(); vi.clearAllMocks(); });

  it("returns 400 when inputName is missing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/contacts/custom-fields",
      payload: { inputType: "text" },
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: { code: string } }).error.code).toBe("MISSING_FIELDS");
  });

  it("auto-generates fieldKey from inputName when fieldKey is omitted", async () => {
    mockPrisma.contactCustomField.create.mockResolvedValue(mockField);
    const res = await app.inject({
      method: "POST",
      url: "/v1/contacts/custom-fields",
      payload: { inputName: "Company Size", inputType: "text" },
    });
    expect(res.statusCode).toBe(201);
    expect(mockPrisma.contactCustomField.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ fieldKey: "company_size" }),
      })
    );
  });

  it("uses provided fieldKey when given", async () => {
    mockPrisma.contactCustomField.create.mockResolvedValue(mockField);
    const res = await app.inject({
      method: "POST",
      url: "/v1/contacts/custom-fields",
      payload: { inputName: "Company Size", fieldKey: "co_size", inputType: "text" },
    });
    expect(res.statusCode).toBe(201);
    expect(mockPrisma.contactCustomField.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ fieldKey: "co_size" }),
      })
    );
  });

  it("saves description, placeholder, defaultValue, isRequired, isReadOnly", async () => {
    mockPrisma.contactCustomField.create.mockResolvedValue(mockField);
    await app.inject({
      method: "POST",
      url: "/v1/contacts/custom-fields",
      payload: {
        inputName: "Company Size",
        description: "Number of employees",
        placeholder: "e.g. 50",
        defaultValue: "10",
        isRequired: true,
        isReadOnly: false,
      },
    });
    expect(mockPrisma.contactCustomField.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          description: "Number of employees",
          placeholder: "e.g. 50",
          defaultValue: "10",
          isRequired: true,
          isReadOnly: false,
        }),
      })
    );
  });
});

describe("PATCH /v1/contacts/custom-fields/:id", () => {
  let app: FastifyInstance;
  beforeEach(async () => { app = await buildApp(); });
  afterEach(async () => { await app.close(); vi.clearAllMocks(); });

  it("returns 404 for unknown field", async () => {
    mockPrisma.contactCustomField.findFirst.mockResolvedValue(null);
    const res = await app.inject({
      method: "PATCH",
      url: "/v1/contacts/custom-fields/bad-id",
      payload: { inputName: "New Name" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("patches only provided fields", async () => {
    mockPrisma.contactCustomField.findFirst.mockResolvedValue(mockField);
    mockPrisma.contactCustomField.update.mockResolvedValue({ ...mockField, isActive: false });
    const res = await app.inject({
      method: "PATCH",
      url: "/v1/contacts/custom-fields/field-1",
      payload: { isActive: false },
    });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.contactCustomField.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { isActive: false },
      })
    );
  });
});
```

- [ ] **Step 2: Run the tests**

```powershell
pnpm --filter @WBMSG/api test -- --reporter=verbose custom-fields
```

Expected: all tests pass (green).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/custom-fields.test.ts
git commit -m "test(api): add custom-fields route tests for expanded fields"
```

---

## Task 4: Settings page — full rewrite with edit capability

**Files:**
- Modify: `apps/web/app/(dashboard)/settings/custom-fields/page.tsx`

- [ ] **Step 1: Replace entire file content**

```tsx
"use client";

import { JSX, useState, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface CustomField {
  id: string;
  inputName: string;
  fieldKey: string;
  inputType: string;
  description: string | null;
  placeholder: string | null;
  defaultValue: string | null;
  isRequired: boolean;
  isReadOnly: boolean;
  isActive: boolean;
  createdAt: string;
}

interface FieldFormState {
  inputName: string;
  fieldKey: string;
  fieldKeyTouched: boolean;
  inputType: string;
  description: string;
  placeholder: string;
  defaultValue: string;
  isRequired: boolean;
  isReadOnly: boolean;
}

const EMPTY_FORM: FieldFormState = {
  inputName: "",
  fieldKey: "",
  fieldKeyTouched: false,
  inputType: "text",
  description: "",
  placeholder: "",
  defaultValue: "",
  isRequired: false,
  isReadOnly: false,
};

const INPUT_TYPES = [
  { value: "text",           label: "Text" },
  { value: "number",         label: "Number" },
  { value: "email",          label: "Email" },
  { value: "url",            label: "URL" },
  { value: "date",           label: "Date" },
  { value: "time",           label: "Time" },
  { value: "datetime-local", label: "Date and Time" },
  { value: "select",         label: "Select" },
  { value: "boolean",        label: "Boolean" },
] as const;

function toFieldKey(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }): JSX.Element {
  return (
    <label className="flex items-center gap-3 cursor-pointer select-none">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={[
          "relative w-10 h-5 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-1",
          checked ? "bg-brand-600" : "bg-gray-300",
        ].join(" ")}
      >
        <span className={["absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform", checked ? "translate-x-5" : "translate-x-0"].join(" ")} />
      </button>
      <span className="text-sm text-gray-700">{label}</span>
    </label>
  );
}

export default function CustomFieldsPage(): JSX.Element {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  // null = add mode, CustomField = edit mode, undefined = closed
  const [editingField, setEditingField] = useState<CustomField | null | undefined>(undefined);
  const [form, setForm] = useState<FieldFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const { data: fields = [], isLoading } = useQuery<CustomField[]>({
    queryKey: ["custom-fields-all"],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/contacts/custom-fields?all=1`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (!res.ok) return [];
      return (await res.json() as { data: CustomField[] }).data;
    },
  });

  function openAdd() {
    setForm(EMPTY_FORM);
    setFormError(null);
    setEditingField(null);
  }

  function openEdit(f: CustomField) {
    setForm({
      inputName: f.inputName,
      fieldKey: f.fieldKey,
      fieldKeyTouched: true,
      inputType: f.inputType,
      description: f.description ?? "",
      placeholder: f.placeholder ?? "",
      defaultValue: f.defaultValue ?? "",
      isRequired: f.isRequired,
      isReadOnly: f.isReadOnly,
    });
    setFormError(null);
    setEditingField(f);
  }

  function closeModal() {
    setEditingField(undefined);
  }

  // Auto-derive fieldKey from label while user types, unless they've touched it manually
  useEffect(() => {
    if (!form.fieldKeyTouched) {
      setForm((f) => ({ ...f, fieldKey: toFieldKey(f.inputName) }));
    }
  }, [form.inputName, form.fieldKeyTouched]);

  async function handleSave() {
    if (!form.inputName.trim()) { setFormError("Field label is required."); return; }
    if (!form.fieldKey.trim()) { setFormError("Field key is required."); return; }
    setSaving(true);
    setFormError(null);
    const token = await getToken();
    const payload = {
      inputName: form.inputName.trim(),
      fieldKey: form.fieldKey.trim(),
      inputType: form.inputType,
      description: form.description || undefined,
      placeholder: form.placeholder || undefined,
      defaultValue: form.defaultValue || undefined,
      isRequired: form.isRequired,
      isReadOnly: form.isReadOnly,
    };

    const isEdit = editingField !== null && editingField !== undefined;
    const url = isEdit
      ? `${API_URL}/v1/contacts/custom-fields/${editingField.id}`
      : `${API_URL}/v1/contacts/custom-fields`;

    const res = await fetch(url, {
      method: isEdit ? "PATCH" : "POST",
      headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (!res.ok) {
      const json = await res.json() as { error?: { message: string } };
      setFormError(json.error?.message ?? "Failed to save field.");
      return;
    }
    closeModal();
    void queryClient.invalidateQueries({ queryKey: ["custom-fields-all"] });
    void queryClient.invalidateQueries({ queryKey: ["custom-fields"] });
  }

  async function handleToggleActive(f: CustomField) {
    setTogglingId(f.id);
    const token = await getToken();
    await fetch(`${API_URL}/v1/contacts/custom-fields/${f.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !f.isActive }),
    });
    setTogglingId(null);
    void queryClient.invalidateQueries({ queryKey: ["custom-fields-all"] });
    void queryClient.invalidateQueries({ queryKey: ["custom-fields"] });
  }

  const inputCls = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500";

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Custom Fields</h1>
          <p className="text-sm text-gray-500 mt-1">Add custom data fields to contacts.</p>
        </div>
        <button
          onClick={openAdd}
          className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700"
        >
          Add Field
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {isLoading ? (
          <p className="p-6 text-sm text-gray-400 text-center">Loading…</p>
        ) : fields.length === 0 ? (
          <p className="p-8 text-sm text-gray-400 text-center">No custom fields yet.</p>
        ) : (
          fields.map((f) => (
            <div key={f.id} className={["flex items-center gap-4 px-4 py-3", !f.isActive ? "opacity-50" : ""].join(" ")}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-gray-900">{f.inputName}</span>
                  <code className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{f.fieldKey}</code>
                  {f.isRequired && (
                    <span className="text-xs bg-red-50 text-red-600 border border-red-200 px-1.5 py-0.5 rounded">Required</span>
                  )}
                  {f.isReadOnly && (
                    <span className="text-xs bg-yellow-50 text-yellow-700 border border-yellow-200 px-1.5 py-0.5 rounded">Read Only</span>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  {INPUT_TYPES.find((t) => t.value === f.inputType)?.label ?? f.inputType}
                  {f.description ? ` · ${f.description}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <Toggle
                  checked={f.isActive}
                  onChange={() => { if (!togglingId) void handleToggleActive(f); }}
                  label=""
                />
                <button
                  onClick={() => openEdit(f)}
                  className="text-xs text-brand-600 hover:text-brand-800 font-medium"
                >
                  Edit
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add / Edit Modal */}
      {editingField !== undefined && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={closeModal} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingField === null ? "Add Custom Field" : "Edit Custom Field"}
              </h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {/* Label + Key */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-700">Field Label <span className="text-red-500">*</span></label>
                  <input
                    className={inputCls}
                    placeholder="e.g. Company Size"
                    value={form.inputName}
                    onChange={(e) => setForm((f) => ({ ...f, inputName: e.target.value }))}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-700">Field Key <span className="text-red-500">*</span></label>
                  <input
                    className={inputCls}
                    placeholder="company_size"
                    value={form.fieldKey}
                    onChange={(e) => setForm((f) => ({ ...f, fieldKey: e.target.value, fieldKeyTouched: true }))}
                  />
                  <p className="text-xs text-gray-400">Auto-generated · unique per org</p>
                </div>
              </div>

              {/* Type */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-700">Field Type</label>
                <select
                  className={inputCls}
                  value={form.inputType}
                  onChange={(e) => setForm((f) => ({ ...f, inputType: e.target.value }))}
                >
                  {INPUT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              {/* Description */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-700">Description / Help Text</label>
                <input
                  className={inputCls}
                  placeholder="Guidance shown below the field"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>

              {/* Placeholder + Default Value */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-700">Placeholder</label>
                  <input
                    className={inputCls}
                    placeholder="e.g. Enter value…"
                    value={form.placeholder}
                    onChange={(e) => setForm((f) => ({ ...f, placeholder: e.target.value }))}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-700">Default Value</label>
                  <input
                    className={inputCls}
                    placeholder="Pre-filled value"
                    value={form.defaultValue}
                    onChange={(e) => setForm((f) => ({ ...f, defaultValue: e.target.value }))}
                  />
                </div>
              </div>

              {/* Required + Read Only */}
              <div className="flex flex-col gap-3 pt-1">
                <Toggle
                  checked={form.isRequired}
                  onChange={(v) => setForm((f) => ({ ...f, isRequired: v }))}
                  label="Required — contact cannot be saved without this field"
                />
                <Toggle
                  checked={form.isReadOnly}
                  onChange={(v) => setForm((f) => ({ ...f, isReadOnly: v }))}
                  label="Read Only — visible but not editable in the form"
                />
              </div>

              {formError && <p className="text-sm text-red-600">{formError}</p>}
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 shrink-0">
              <button onClick={closeModal} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
                Cancel
              </button>
              <button
                onClick={() => { void handleSave(); }}
                disabled={saving}
                className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save Field"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check the web app**

```powershell
pnpm --filter @WBMSG/web type-check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/(dashboard)/settings/custom-fields/page.tsx
git commit -m "feat(web): custom fields settings page — full form with edit and active toggle"
```

---

## Task 5: Add Contact modal — use new field properties

**Files:**
- Modify: `apps/web/components/contacts/AddContactModal.tsx`

- [ ] **Step 1: Update the `CustomField` interface**

Replace:
```typescript
interface CustomField { id: string; inputName: string; inputType: string }
```
With:
```typescript
interface CustomField {
  id: string;
  inputName: string;
  fieldKey: string;
  inputType: string;
  description: string | null;
  placeholder: string | null;
  defaultValue: string | null;
  isRequired: boolean;
  isReadOnly: boolean;
}
```

- [ ] **Step 2: Add a useEffect to seed default values when custom fields load**

Add this effect after the existing reset effect (the one that watches `open`):

```typescript
useEffect(() => {
  if (customFields.length > 0) {
    setCustomFieldValues((prev) => {
      const next = { ...prev };
      customFields.forEach((cf) => {
        if (!(cf.inputName in next) && cf.defaultValue) {
          next[cf.inputName] = cf.defaultValue;
        }
      });
      return next;
    });
  }
}, [customFields]);
```

- [ ] **Step 3: Add required-field validation in `handleSubmit`**

Inside `handleSubmit`, before `setSaving(true)`, add:

```typescript
const missingRequired = customFields.filter(
  (cf) => cf.isRequired && !customFieldValues[cf.inputName]?.trim()
);
if (missingRequired.length > 0) {
  setError(`Required fields missing: ${missingRequired.map((f) => f.inputName).join(", ")}`);
  return;
}
```

- [ ] **Step 4: Update the custom field input rendering in the JSX**

Replace the existing custom field input block (inside the `customFields.map` in the JSX):

```tsx
{customFields.map((cf) => (
  <div key={cf.id} className="flex flex-col gap-1">
    <label className="text-xs font-medium text-gray-600">
      {cf.inputName}
      {cf.isRequired && <span className="text-red-500 ml-0.5">*</span>}
    </label>
    <input
      type={cf.inputType === "number" ? "number" : cf.inputType === "date" ? "date" : "text"}
      className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
      placeholder={cf.placeholder ?? cf.inputName}
      value={customFieldValues[cf.inputName] ?? ""}
      onChange={(e) => setCustomFieldValues((v) => ({ ...v, [cf.inputName]: e.target.value }))}
      disabled={cf.isReadOnly}
      required={cf.isRequired}
    />
    {cf.description && <p className="text-xs text-gray-400">{cf.description}</p>}
  </div>
))}
```

- [ ] **Step 5: Type-check the web app**

```powershell
pnpm --filter @WBMSG/web type-check
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/contacts/AddContactModal.tsx
git commit -m "feat(web): add contact modal uses custom field placeholder, default value, required, read-only"
```

---

## Self-Review

**Spec coverage:**
- Field Label (`inputName`) — ✅ Task 1 schema, Task 2 API, Task 4 form, Task 5 modal
- Field Key (`fieldKey`) — ✅ Task 1 schema unique constraint, Task 2 auto-gen, Task 4 form with auto-fill
- Field Type — ✅ existing + preserved throughout
- Description / Help Text — ✅ Task 1 schema, Task 2 API, Task 4 form, Task 5 rendered below input
- Placeholder — ✅ Task 1 schema, Task 2 API, Task 4 form, Task 5 applied to input
- Default Value — ✅ Task 1 schema, Task 2 API, Task 4 form, Task 5 seeded in useEffect
- Required — ✅ Task 1 schema, Task 2 API, Task 4 form toggle, Task 5 `*` label + validation
- Read Only — ✅ Task 1 schema, Task 2 API, Task 4 form toggle, Task 5 `disabled` on input
- Active / Inactive — ✅ Task 4 toggle per row (PATCH isActive), `?all=1` endpoint shows inactive

**Type consistency:** `CustomField` interface matches across all files. `toFieldKey` helper is duplicated intentionally (API + settings page + plan slug helper) — each context is self-contained.

**Placeholder scan:** No TBDs or incomplete steps found.
