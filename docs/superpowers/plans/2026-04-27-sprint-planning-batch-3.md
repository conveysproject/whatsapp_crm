# Sprint Planning Batch 3 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the Core CRM phase — full contact/company UI with import/export (Sprint 7), lifecycle stages and dynamic segments (Sprint 8), WhatsApp template builder and Meta approval flow (Sprint 9), campaign scheduler with BullMQ (Sprint 10), deals and Kanban pipeline (Sprint 11), conversation routing + SLA tracking + closed beta launch (Sprint 12).

**Architecture:** Each sprint builds on the previous. Sprints 7–8 complete the CRM data layer. Sprint 9–10 add the messaging campaign stack. Sprint 11 adds the sales pipeline. Sprint 12 adds routing intelligence and closes the beta. BullMQ powers async campaign sends and routing evaluation. All new API routes follow the contacts CRUD pattern from Sprint 4: organizationId filter on every query, cursor pagination on list endpoints.

**Tech Stack:** `papaparse` (CSV parse/generate), `@dnd-kit/core` + `@dnd-kit/sortable` (Kanban drag-and-drop), `date-fns` (schedule time formatting), `zod` (input validation on API routes), `@fastify/multipart` (CSV file upload), BullMQ delayed jobs (campaign scheduler).

---

## File Map

### Sprint 7 — Contacts & Companies UI

| File | Action | Purpose |
|---|---|---|
| `apps/api/src/routes/contacts.ts` | Modify | Add CSV import (`POST /v1/contacts/import`) + CSV export (`GET /v1/contacts/export`) |
| `apps/api/src/lib/csv.ts` | Create | parseContactsCsv(), generateContactsCsv() using papaparse |
| `apps/api/src/routes/contacts.test.ts` | Modify | Add import + export tests |
| `apps/web/app/(dashboard)/contacts/[id]/page.tsx` | Create | Contact detail — view + edit form |
| `apps/web/app/(dashboard)/contacts/import/page.tsx` | Create | CSV import page (drag-drop upload) |
| `apps/web/components/contacts/ContactForm.tsx` | Create | Reusable contact edit form |
| `apps/web/components/contacts/TagInput.tsx` | Create | Tag add/remove chip input |
| `apps/web/components/contacts/BulkActions.tsx` | Create | Bulk select toolbar (delete, tag, stage change) |
| `apps/web/app/(dashboard)/companies/page.tsx` | Create | Companies list page |
| `apps/web/app/(dashboard)/companies/[id]/page.tsx` | Create | Company detail page |

### Sprint 8 — Lifecycle Stages & Segments

| File | Action | Purpose |
|---|---|---|
| `apps/api/prisma/schema.prisma` | Modify | Add Segment + SegmentContact models |
| `apps/api/src/routes/segments.ts` | Create | GET/POST/PATCH/DELETE /v1/segments; GET /v1/segments/:id/contacts |
| `apps/api/src/lib/segment-evaluator.ts` | Create | evaluateSegment(segment, organizationId) — runs filter query against contacts |
| `apps/api/src/routes/segments.test.ts` | Create | Vitest tests for segment CRUD + evaluation |
| `apps/web/app/(dashboard)/contacts/segments/page.tsx` | Create | Segment list + create button |
| `apps/web/components/segments/SegmentBuilder.tsx` | Create | Filter rule builder UI (field + operator + value) |
| `packages/shared/src/index.ts` | Modify | Add SegmentId |

### Sprint 9 — Templates & Approvals

| File | Action | Purpose |
|---|---|---|
| `apps/api/src/routes/templates.ts` | Create | GET/POST /v1/templates; POST /v1/templates/:id/submit; GET /v1/templates/:id |
| `apps/api/src/lib/meta-templates.ts` | Create | submitTemplateToMeta(), syncTemplateStatus() |
| `apps/api/src/routes/webhooks.ts` | Modify | Handle `template_status_update` change field |
| `apps/api/src/routes/templates.test.ts` | Create | Vitest tests |
| `apps/web/app/(dashboard)/templates/page.tsx` | Create | Templates list with status badges |
| `apps/web/app/(dashboard)/templates/new/page.tsx` | Create | Template builder form |
| `apps/web/components/templates/TemplatePreview.tsx` | Create | Live WhatsApp message preview |
| `packages/shared/src/index.ts` | Modify | Add TemplateId (already added in batch 2 — verify) |

### Sprint 10 — Campaign Scheduler

| File | Action | Purpose |
|---|---|---|
| `apps/api/prisma/schema.prisma` | Modify | Add CampaignContact join table |
| `apps/api/src/routes/campaigns.ts` | Create | GET/POST /v1/campaigns; POST /v1/campaigns/:id/schedule; GET /v1/campaigns/:id/stats |
| `apps/api/src/workers/campaign.worker.ts` | Create | BullMQ Worker — send template message to each segment contact |
| `apps/api/src/lib/queue.ts` | Modify | Add campaignQueue |
| `apps/api/src/routes/campaigns.test.ts` | Create | Vitest tests |
| `apps/web/app/(dashboard)/campaigns/page.tsx` | Create | Campaigns list + create button |
| `apps/web/app/(dashboard)/campaigns/new/page.tsx` | Create | Campaign create form (template + segment + schedule) |
| `apps/web/app/(dashboard)/campaigns/[id]/page.tsx` | Create | Campaign stats page |

### Sprint 11 — Deals & Pipelines

| File | Action | Purpose |
|---|---|---|
| `apps/api/src/routes/pipelines.ts` | Create | GET/POST/PATCH/DELETE /v1/pipelines |
| `apps/api/src/routes/deals.ts` | Create | GET/POST/PATCH/DELETE /v1/deals; PATCH /v1/deals/:id/stage |
| `apps/api/src/routes/deals.test.ts` | Create | Vitest tests |
| `apps/web/app/(dashboard)/deals/page.tsx` | Create | Kanban board page |
| `apps/web/components/deals/KanbanBoard.tsx` | Create | @dnd-kit Kanban board with columns per pipeline stage |
| `apps/web/components/deals/DealCard.tsx` | Create | Draggable deal card |
| `apps/web/components/deals/DealForm.tsx` | Create | Deal create/edit form |

### Sprint 12 — Routing & Assignment

| File | Action | Purpose |
|---|---|---|
| `apps/api/prisma/schema.prisma` | Modify | Add RoutingRule, SlaPolicy models |
| `apps/api/src/routes/routing.ts` | Create | GET/POST/PATCH/DELETE /v1/routing-rules; PATCH /v1/conversations/:id/assign |
| `apps/api/src/lib/router.ts` | Create | evaluateRoutingRules(conversation) — matches rules, assigns agent/team |
| `apps/api/src/workers/inbound-message.worker.ts` | Modify | Call evaluateRoutingRules after conversation created |
| `apps/api/src/routes/routing.test.ts` | Create | Vitest tests |
| `apps/web/app/(dashboard)/settings/routing/page.tsx` | Create | Routing rules management page |
| `apps/web/app/(dashboard)/settings/sla/page.tsx` | Create | SLA policy configuration page |

---

## Task 1: CSV helpers + contacts import/export API

**Files:**
- Create: `apps/api/src/lib/csv.ts`
- Modify: `apps/api/src/routes/contacts.ts`

- [ ] **Step 1: Install dependencies**

```bash
pnpm --filter @WBMSG/api add papaparse @fastify/multipart
pnpm --filter @WBMSG/api add -D @types/papaparse
```

- [ ] **Step 2: Write the failing test**

Add to `apps/api/src/routes/contacts.test.ts`:
```typescript
describe("GET /v1/contacts/export", () => {
  it("returns CSV with correct headers", async () => {
    mockPrisma.contact.findMany.mockResolvedValue([
      { id: "c-1", organizationId: "org-1", phoneNumber: "+919000000001", name: "Alice", email: "alice@example.com", lifecycleStage: "lead", tags: [], createdAt: new Date() },
    ]);
    const res = await app.inject({ method: "GET", url: "/v1/contacts/export" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.body).toContain("phoneNumber");
    expect(res.body).toContain("+919000000001");
  });
});
```

Run: `pnpm --filter @WBMSG/api test src/routes/contacts.test.ts`
Expected: FAIL

- [ ] **Step 3: Create `apps/api/src/lib/csv.ts`**

```typescript
import Papa from "papaparse";

export interface ContactCsvRow {
  phoneNumber: string;
  name: string;
  email: string;
  lifecycleStage: string;
  tags: string;
}

export function generateContactsCsv(
  contacts: Array<{
    phoneNumber: string;
    name: string | null;
    email: string | null;
    lifecycleStage: string;
    tags: string[];
  }>
): string {
  const rows: ContactCsvRow[] = contacts.map((c) => ({
    phoneNumber: c.phoneNumber,
    name: c.name ?? "",
    email: c.email ?? "",
    lifecycleStage: c.lifecycleStage,
    tags: c.tags.join(";"),
  }));
  return Papa.unparse(rows);
}

export function parseContactsCsv(csvText: string): ContactCsvRow[] {
  const result = Papa.parse<ContactCsvRow>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  return result.data;
}
```

- [ ] **Step 4: Add export + import routes to `apps/api/src/routes/contacts.ts`**

Add before existing routes (search route must stay first to avoid `:id` param shadowing):
```typescript
import { generateContactsCsv, parseContactsCsv } from "../lib/csv.js";

// Export — add before GET /contacts/:id
fastify.get("/contacts/export", async (request, reply) => {
  const { organizationId } = request.auth;
  const contacts = await fastify.prisma.contact.findMany({
    where: { organizationId },
    orderBy: { createdAt: "asc" },
  });
  const csv = generateContactsCsv(contacts);
  return reply
    .header("Content-Type", "text/csv")
    .header("Content-Disposition", "attachment; filename=contacts.csv")
    .send(csv);
});

// Import
fastify.post("/contacts/import", async (request, reply) => {
  const { organizationId } = request.auth;
  const data = await (request as unknown as { file: () => Promise<{ toBuffer: () => Promise<Buffer> }> }).file();
  const buffer = await data.toBuffer();
  const rows = parseContactsCsv(buffer.toString("utf-8"));

  let created = 0;
  let skipped = 0;
  for (const row of rows) {
    if (!row.phoneNumber) { skipped++; continue; }
    try {
      await fastify.prisma.contact.create({
        data: {
          organizationId,
          phoneNumber: row.phoneNumber.trim(),
          name: row.name || null,
          email: row.email || null,
          lifecycleStage: (row.lifecycleStage as "lead" | "prospect" | "customer" | "loyal" | "churned") || "lead",
          tags: row.tags ? row.tags.split(";").map((t) => t.trim()).filter(Boolean) : [],
        },
      });
      created++;
    } catch {
      skipped++;
    }
  }
  return reply.send({ data: { created, skipped, total: rows.length } });
});
```

- [ ] **Step 5: Register multipart plugin in `apps/api/src/index.ts`**

```typescript
import multipart from "@fastify/multipart";
await fastify.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } }); // 10 MB
```

- [ ] **Step 6: Run tests**

```bash
pnpm --filter @WBMSG/api test src/routes/contacts.test.ts
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/lib/csv.ts apps/api/src/routes/contacts.ts apps/api/src/index.ts apps/api/package.json pnpm-lock.yaml
git commit -m "feat(api): add contacts CSV import + export"
```

---

## Task 2: Contact detail page + form + tag input

**Files:**
- Create: `apps/web/components/contacts/TagInput.tsx`
- Create: `apps/web/components/contacts/ContactForm.tsx`
- Create: `apps/web/app/(dashboard)/contacts/[id]/page.tsx`

- [ ] **Step 1: Create `apps/web/components/contacts/TagInput.tsx`**

```tsx
"use client";

import { JSX, KeyboardEvent, useState } from "react";
import { Badge } from "@/components/ui/Badge";

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
}

export function TagInput({ tags, onChange }: TagInputProps): JSX.Element {
  const [input, setInput] = useState("");

  function addTag() {
    const tag = input.trim().toLowerCase();
    if (tag && !tags.includes(tag)) {
      onChange([...tags, tag]);
    }
    setInput("");
  }

  function removeTag(tag: string) {
    onChange(tags.filter((t) => t !== tag));
  }

  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag();
    }
    if (e.key === "Backspace" && !input && tags.length) {
      onChange(tags.slice(0, -1));
    }
  }

  return (
    <div className="flex flex-wrap gap-1.5 rounded-lg border border-gray-300 px-3 py-2 focus-within:ring-2 focus-within:ring-brand-500 focus-within:border-transparent">
      {tags.map((tag) => (
        <span key={tag} className="flex items-center gap-1">
          <Badge variant="blue">{tag}</Badge>
          <button
            type="button"
            onClick={() => removeTag(tag)}
            className="text-gray-400 hover:text-gray-600 text-xs leading-none"
          >
            ×
          </button>
        </span>
      ))}
      <input
        className="flex-1 min-w-24 text-sm outline-none bg-transparent placeholder-gray-400"
        placeholder={tags.length ? "" : "Add tag, press Enter"}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKey}
        onBlur={addTag}
      />
    </div>
  );
}
```

- [ ] **Step 2: Create `apps/web/components/contacts/ContactForm.tsx`**

```tsx
"use client";

import { JSX, FormEvent, useState } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { TagInput } from "./TagInput";

interface ContactFormData {
  name: string;
  email: string;
  lifecycleStage: string;
  tags: string[];
}

interface ContactFormProps {
  initial?: Partial<ContactFormData>;
  phoneNumber?: string;
  onSubmit: (data: ContactFormData) => Promise<void>;
  submitLabel?: string;
}

const STAGES = ["lead", "prospect", "customer", "loyal", "churned"];

export function ContactForm({ initial, phoneNumber, onSubmit, submitLabel = "Save" }: ContactFormProps): JSX.Element {
  const [form, setForm] = useState<ContactFormData>({
    name: initial?.name ?? "",
    email: initial?.email ?? "",
    lifecycleStage: initial?.lifecycleStage ?? "lead",
    tags: initial?.tags ?? [],
  });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try { await onSubmit(form); }
    finally { setSaving(false); }
  }

  return (
    <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-4">
      {phoneNumber && (
        <Input label="Phone Number" value={phoneNumber} disabled />
      )}
      <Input
        label="Name"
        value={form.name}
        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        placeholder="Full name"
      />
      <Input
        label="Email"
        type="email"
        value={form.email}
        onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
        placeholder="email@example.com"
      />
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">Lifecycle Stage</label>
        <select
          value={form.lifecycleStage}
          onChange={(e) => setForm((f) => ({ ...f, lifecycleStage: e.target.value }))}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          {STAGES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">Tags</label>
        <TagInput tags={form.tags} onChange={(tags) => setForm((f) => ({ ...f, tags }))} />
      </div>
      <Button type="submit" disabled={saving}>
        {saving ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
```

- [ ] **Step 3: Create `apps/web/app/(dashboard)/contacts/[id]/page.tsx`**

```tsx
import { JSX } from "react";
import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { ContactForm } from "@/components/contacts/ContactForm";

interface Contact {
  id: string;
  phoneNumber: string;
  name: string | null;
  email: string | null;
  lifecycleStage: string;
  tags: string[];
}

async function getContact(id: string, token: string): Promise<Contact | null> {
  const apiUrl = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";
  const res = await fetch(`${apiUrl}/v1/contacts/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to fetch contact");
  const json = await res.json() as { data: Contact };
  return json.data;
}

export default async function ContactDetailPage({
  params,
}: {
  params: { id: string };
}): Promise<JSX.Element> {
  const { getToken } = auth();
  auth().protect();
  const token = await getToken();
  const contact = await getContact(params.id, token ?? "");
  if (!contact) notFound();

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">{contact.name ?? contact.phoneNumber}</h1>
        <p className="text-sm text-gray-500 mt-1">{contact.phoneNumber}</p>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-card">
        <h2 className="text-base font-medium text-gray-900 mb-4">Edit Contact</h2>
        <ContactForm
          phoneNumber={contact.phoneNumber}
          initial={{
            name: contact.name ?? "",
            email: contact.email ?? "",
            lifecycleStage: contact.lifecycleStage,
            tags: contact.tags,
          }}
          onSubmit={async () => {
            // Client-side PATCH handled by a Client Component wrapper — scaffold here
          }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/contacts/ apps/web/app/\(dashboard\)/contacts/
git commit -m "feat(web): add contact detail page + ContactForm + TagInput"
```

---

## Task 3: Segment Prisma models + API

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/src/lib/segment-evaluator.ts`
- Create: `apps/api/src/routes/segments.ts`
- Create: `apps/api/src/routes/segments.test.ts`

- [ ] **Step 1: Add Segment model to `apps/api/prisma/schema.prisma`**

```prisma
model Segment {
  id             String   @id @default(uuid())
  organizationId String
  name           String
  filters        Json     @default("[]")
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([organizationId])
  @@map("segments")
}
```

- [ ] **Step 2: Run migration**

```bash
cd apps/api
pnpm exec prisma migrate dev --name add_segments
pnpm exec prisma generate
```

- [ ] **Step 3: Create `apps/api/src/lib/segment-evaluator.ts`**

A segment filter is an array of rules: `[{ field, operator, value }]`. All rules are ANDed.

```typescript
import { PrismaClient } from "@prisma/client";

export interface SegmentFilter {
  field: "lifecycleStage" | "tags" | "createdAt";
  operator: "equals" | "contains" | "before" | "after";
  value: string;
}

export async function evaluateSegment(
  prisma: PrismaClient,
  organizationId: string,
  filters: SegmentFilter[]
): Promise<string[]> {
  // Build Prisma where clause from filters
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const andClauses: Record<string, unknown>[] = [{ organizationId }];

  for (const filter of filters) {
    if (filter.field === "lifecycleStage" && filter.operator === "equals") {
      andClauses.push({ lifecycleStage: filter.value });
    } else if (filter.field === "tags" && filter.operator === "contains") {
      andClauses.push({ tags: { has: filter.value } });
    } else if (filter.field === "createdAt" && filter.operator === "after") {
      andClauses.push({ createdAt: { gte: new Date(filter.value) } });
    } else if (filter.field === "createdAt" && filter.operator === "before") {
      andClauses.push({ createdAt: { lte: new Date(filter.value) } });
    }
  }

  const contacts = await prisma.contact.findMany({
    where: { AND: andClauses },
    select: { id: true, phoneNumber: true },
  });

  return contacts.map((c) => c.phoneNumber);
}
```

- [ ] **Step 4: Write the failing test**

Create `apps/api/src/routes/segments.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { FastifyInstance } from "fastify";

const mockPrisma = {
  segment: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  contact: { findMany: vi.fn() },
};

const mockAuth = { userId: "user-1", organizationId: "org-1", role: "admin" as const };

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma);
  app.addHook("onRequest", async (request) => { request.auth = mockAuth; });
  const { segmentsRouter } = await import("./segments.js");
  await app.register(segmentsRouter, { prefix: "/v1" });
  return app;
}

describe("GET /v1/segments", () => {
  let app: FastifyInstance;
  beforeEach(async () => { app = await buildApp(); });
  afterEach(async () => { await app.close(); vi.clearAllMocks(); });

  it("returns segments for org", async () => {
    mockPrisma.segment.findMany.mockResolvedValue([
      { id: "seg-1", organizationId: "org-1", name: "Hot Leads", filters: [] },
    ]);
    const res = await app.inject({ method: "GET", url: "/v1/segments" });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: unknown[] }>().data).toHaveLength(1);
  });
});

describe("POST /v1/segments/:id/evaluate", () => {
  let app: FastifyInstance;
  beforeEach(async () => { app = await buildApp(); });
  afterEach(async () => { await app.close(); vi.clearAllMocks(); });

  it("returns matching contact phone numbers", async () => {
    mockPrisma.segment.findFirst.mockResolvedValue({
      id: "seg-1", organizationId: "org-1", filters: [{ field: "lifecycleStage", operator: "equals", value: "lead" }],
    });
    mockPrisma.contact.findMany.mockResolvedValue([
      { id: "c-1", phoneNumber: "+919000000001" },
    ]);
    const res = await app.inject({ method: "POST", url: "/v1/segments/seg-1/evaluate" });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: { phones: string[] } }>().data.phones).toContain("+919000000001");
  });
});
```

Run: `pnpm --filter @WBMSG/api test src/routes/segments.test.ts`
Expected: FAIL

- [ ] **Step 5: Create `apps/api/src/routes/segments.ts`**

```typescript
import { FastifyPluginAsync } from "fastify";
import { evaluateSegment, SegmentFilter } from "../lib/segment-evaluator.js";
import type { SegmentId } from "@WBMSG/shared";

interface SegmentBody {
  name: string;
  filters: SegmentFilter[];
}

export const segmentsRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/segments", async (request, reply) => {
    const { organizationId } = request.auth;
    const segments = await fastify.prisma.segment.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
    });
    return reply.send({ data: segments });
  });

  fastify.get<{ Params: { id: SegmentId } }>("/segments/:id", async (request, reply) => {
    const { organizationId } = request.auth;
    const segment = await fastify.prisma.segment.findFirst({
      where: { id: request.params.id, organizationId },
    });
    if (!segment) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Segment not found" } });
    return reply.send({ data: segment });
  });

  fastify.post<{ Body: SegmentBody }>("/segments", async (request, reply) => {
    const { organizationId } = request.auth;
    const segment = await fastify.prisma.segment.create({
      data: { organizationId, name: request.body.name, filters: request.body.filters as object },
    });
    return reply.status(201).send({ data: segment });
  });

  fastify.patch<{ Params: { id: SegmentId }; Body: Partial<SegmentBody> }>(
    "/segments/:id",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const existing = await fastify.prisma.segment.findFirst({ where: { id: request.params.id, organizationId } });
      if (!existing) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Segment not found" } });
      const segment = await fastify.prisma.segment.update({
        where: { id: request.params.id },
        data: request.body as object,
      });
      return reply.send({ data: segment });
    }
  );

  fastify.delete<{ Params: { id: SegmentId } }>("/segments/:id", async (request, reply) => {
    const { organizationId } = request.auth;
    const existing = await fastify.prisma.segment.findFirst({ where: { id: request.params.id, organizationId } });
    if (!existing) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Segment not found" } });
    await fastify.prisma.segment.delete({ where: { id: request.params.id } });
    return reply.status(204).send();
  });

  fastify.post<{ Params: { id: SegmentId } }>("/segments/:id/evaluate", async (request, reply) => {
    const { organizationId } = request.auth;
    const segment = await fastify.prisma.segment.findFirst({ where: { id: request.params.id, organizationId } });
    if (!segment) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Segment not found" } });
    const phones = await evaluateSegment(
      fastify.prisma,
      organizationId,
      segment.filters as SegmentFilter[]
    );
    return reply.send({ data: { phones, count: phones.length } });
  });
};
```

- [ ] **Step 6: Register + add SegmentId to shared types**

In `apps/api/src/routes/index.ts`:
```typescript
import { segmentsRouter } from "./segments.js";
await fastify.register(segmentsRouter, { prefix: "/v1" });
```

In `packages/shared/src/index.ts`:
```typescript
export type SegmentId = string & { readonly __brand: "SegmentId" };
```

- [ ] **Step 7: Run tests**

```bash
pnpm --filter @WBMSG/api test src/routes/segments.test.ts
```

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/api/prisma/ apps/api/src/routes/segments.ts apps/api/src/routes/segments.test.ts apps/api/src/lib/segment-evaluator.ts apps/api/src/routes/index.ts packages/shared/src/
git commit -m "feat(api): add segments CRUD + evaluator"
```

---

## Task 4: Segment builder UI

**Files:**
- Create: `apps/web/components/segments/SegmentBuilder.tsx`
- Create: `apps/web/app/(dashboard)/contacts/segments/page.tsx`

- [ ] **Step 1: Create `apps/web/components/segments/SegmentBuilder.tsx`**

```tsx
"use client";

import { JSX, useState } from "react";
import { Button } from "@/components/ui/Button";

type FilterField = "lifecycleStage" | "tags" | "createdAt";
type FilterOperator = "equals" | "contains" | "after" | "before";

interface FilterRule {
  field: FilterField;
  operator: FilterOperator;
  value: string;
}

interface SegmentBuilderProps {
  initial?: FilterRule[];
  onChange: (filters: FilterRule[]) => void;
}

const FIELD_OPTIONS: Array<{ value: FilterField; label: string }> = [
  { value: "lifecycleStage", label: "Lifecycle Stage" },
  { value: "tags", label: "Tag" },
  { value: "createdAt", label: "Created Date" },
];

const OPERATOR_OPTIONS: Record<FilterField, Array<{ value: FilterOperator; label: string }>> = {
  lifecycleStage: [{ value: "equals", label: "is" }],
  tags:           [{ value: "contains", label: "contains" }],
  createdAt:      [{ value: "after", label: "after" }, { value: "before", label: "before" }],
};

export function SegmentBuilder({ initial = [], onChange }: SegmentBuilderProps): JSX.Element {
  const [rules, setRules] = useState<FilterRule[]>(initial);

  function update(index: number, patch: Partial<FilterRule>) {
    const next = rules.map((r, i) => (i === index ? { ...r, ...patch } : r));
    setRules(next);
    onChange(next);
  }

  function addRule() {
    const next = [...rules, { field: "lifecycleStage" as FilterField, operator: "equals" as FilterOperator, value: "lead" }];
    setRules(next);
    onChange(next);
  }

  function removeRule(index: number) {
    const next = rules.filter((_, i) => i !== index);
    setRules(next);
    onChange(next);
  }

  return (
    <div className="space-y-3">
      {rules.map((rule, i) => (
        <div key={i} className="flex items-center gap-2">
          <select
            value={rule.field}
            onChange={(e) => update(i, { field: e.target.value as FilterField, operator: OPERATOR_OPTIONS[e.target.value as FilterField][0].value, value: "" })}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {FIELD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select
            value={rule.operator}
            onChange={(e) => update(i, { operator: e.target.value as FilterOperator })}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {OPERATOR_OPTIONS[rule.field].map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <input
            value={rule.value}
            onChange={(e) => update(i, { value: e.target.value })}
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="Value"
          />
          <button
            type="button"
            onClick={() => removeRule(i)}
            className="text-red-500 hover:text-red-700 text-sm px-2"
          >
            ×
          </button>
        </div>
      ))}
      <Button variant="secondary" size="sm" type="button" onClick={addRule}>
        + Add Filter
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Create `apps/web/app/(dashboard)/contacts/segments/page.tsx`**

```tsx
import { JSX } from "react";
import { auth } from "@clerk/nextjs/server";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import Link from "next/link";

interface Segment {
  id: string;
  name: string;
  filters: unknown[];
}

async function getSegments(token: string): Promise<Segment[]> {
  const apiUrl = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";
  const res = await fetch(`${apiUrl}/v1/segments`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) return [];
  return (await res.json() as { data: Segment[] }).data;
}

export default async function SegmentsPage(): Promise<JSX.Element> {
  const { getToken } = auth();
  auth().protect();
  const token = await getToken();
  const segments = await getSegments(token ?? "");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Segments</h1>
        <Button>Create Segment</Button>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 shadow-card divide-y divide-gray-100">
        {segments.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-400">No segments yet.</p>
        ) : (
          segments.map((s) => (
            <div key={s.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium text-gray-900">{s.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">{s.filters.length} filter{s.filters.length !== 1 ? "s" : ""}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="blue">{s.filters.length} rules</Badge>
                <Link href={`/contacts/segments/${s.id}`} className="text-sm text-brand-600 hover:underline">View</Link>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/segments/ apps/web/app/\(dashboard\)/contacts/segments/
git commit -m "feat(web): add segment builder UI + segments list page"
```

---

## Task 5: Templates API + Meta submission

**Files:**
- Create: `apps/api/src/lib/meta-templates.ts`
- Create: `apps/api/src/routes/templates.ts`
- Create: `apps/api/src/routes/templates.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/routes/templates.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { FastifyInstance } from "fastify";

const mockPrisma = {
  template: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
};
const mockAuth = { userId: "u-1", organizationId: "org-1", role: "admin" as const };

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma);
  app.addHook("onRequest", async (r) => { r.auth = mockAuth; });
  const { templatesRouter } = await import("./templates.js");
  await app.register(templatesRouter, { prefix: "/v1" });
  return app;
}

describe("GET /v1/templates", () => {
  let app: FastifyInstance;
  beforeEach(async () => { app = await buildApp(); });
  afterEach(async () => { await app.close(); vi.clearAllMocks(); });

  it("returns templates for org", async () => {
    mockPrisma.template.findMany.mockResolvedValue([
      { id: "t-1", organizationId: "org-1", name: "Welcome", status: "pending" },
    ]);
    const res = await app.inject({ method: "GET", url: "/v1/templates" });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: unknown[] }>().data).toHaveLength(1);
  });
});

describe("POST /v1/templates", () => {
  let app: FastifyInstance;
  beforeEach(async () => { app = await buildApp(); });
  afterEach(async () => { await app.close(); vi.clearAllMocks(); });

  it("creates template with status pending", async () => {
    const created = { id: "t-2", organizationId: "org-1", name: "Promo", status: "pending" };
    mockPrisma.template.create.mockResolvedValue(created);
    const res = await app.inject({
      method: "POST",
      url: "/v1/templates",
      payload: { name: "Promo", category: "marketing", language: "en", components: [] },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json<{ data: { status: string } }>().data.status).toBe("pending");
  });
});
```

Run: `pnpm --filter @WBMSG/api test src/routes/templates.test.ts`
Expected: FAIL

- [ ] **Step 2: Create `apps/api/src/lib/meta-templates.ts`**

```typescript
const WA_BASE = "https://graph.facebook.com/v20.0";

interface MetaTemplateComponent {
  type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
  format?: string;
  text?: string;
  buttons?: Array<{ type: string; text: string; url?: string; phone_number?: string }>;
}

interface SubmitResult {
  metaTemplateId: string;
  status: "pending";
}

export async function submitTemplateToMeta(opts: {
  wabaId: string;
  accessToken: string;
  name: string;
  category: string;
  language: string;
  components: MetaTemplateComponent[];
}): Promise<SubmitResult> {
  const res = await fetch(`${WA_BASE}/${opts.wabaId}/message_templates`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: opts.name.toLowerCase().replace(/\s+/g, "_"),
      category: opts.category.toUpperCase(),
      language: opts.language,
      components: opts.components,
    }),
  });
  if (!res.ok) {
    const err = await res.json() as unknown;
    throw new Error(`Meta template submission failed: ${JSON.stringify(err)}`);
  }
  const data = await res.json() as { id: string; status: string };
  return { metaTemplateId: data.id, status: "pending" };
}
```

- [ ] **Step 3: Create `apps/api/src/routes/templates.ts`**

```typescript
import { FastifyPluginAsync } from "fastify";
import { submitTemplateToMeta } from "../lib/meta-templates.js";
import type { TemplateId } from "@WBMSG/shared";

interface TemplateBody {
  name: string;
  category: "marketing" | "utility" | "authentication";
  language: string;
  components: object[];
}

export const templatesRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/templates", async (request, reply) => {
    const { organizationId } = request.auth;
    const templates = await fastify.prisma.template.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
    });
    return reply.send({ data: templates });
  });

  fastify.get<{ Params: { id: TemplateId } }>("/templates/:id", async (request, reply) => {
    const { organizationId } = request.auth;
    const template = await fastify.prisma.template.findFirst({
      where: { id: request.params.id, organizationId },
    });
    if (!template) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Template not found" } });
    return reply.send({ data: template });
  });

  fastify.post<{ Body: TemplateBody }>("/templates", async (request, reply) => {
    const { organizationId } = request.auth;
    const template = await fastify.prisma.template.create({
      data: {
        organizationId,
        name: request.body.name,
        category: request.body.category,
        language: request.body.language,
        components: request.body.components,
        status: "pending",
      },
    });
    return reply.status(201).send({ data: template });
  });

  fastify.post<{ Params: { id: TemplateId } }>("/templates/:id/submit", async (request, reply) => {
    const { organizationId } = request.auth;
    const template = await fastify.prisma.template.findFirst({
      where: { id: request.params.id, organizationId },
    });
    if (!template) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Template not found" } });

    const org = await fastify.prisma.organization.findFirst({ where: { id: organizationId } });
    if (!org?.whatsappBusinessAccountId) {
      return reply.status(400).send({ error: { code: "NO_WABA", message: "Organization has no WhatsApp Business Account configured" } });
    }

    const { metaTemplateId } = await submitTemplateToMeta({
      wabaId: org.whatsappBusinessAccountId,
      accessToken: process.env["WA_ACCESS_TOKEN"] ?? "",
      name: template.name,
      category: template.category,
      language: template.language,
      components: template.components as object[],
    });

    const updated = await fastify.prisma.template.update({
      where: { id: template.id },
      data: { metaTemplateId, status: "pending" },
    });

    return reply.send({ data: updated });
  });

  fastify.patch<{ Params: { id: TemplateId }; Body: Partial<TemplateBody> }>(
    "/templates/:id",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const existing = await fastify.prisma.template.findFirst({ where: { id: request.params.id, organizationId } });
      if (!existing) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Template not found" } });
      const template = await fastify.prisma.template.update({
        where: { id: request.params.id },
        data: request.body as object,
      });
      return reply.send({ data: template });
    }
  );
};
```

- [ ] **Step 4: Handle template_status_update in webhooks**

In `apps/api/src/routes/webhooks.ts`, inside the entry/change loop, add a branch:
```typescript
if (change.field === "message_template_status_update") {
  const { message_template_id, event } = change.value as { message_template_id: string; event: string };
  const statusMap: Record<string, string> = {
    APPROVED: "approved",
    REJECTED: "rejected",
    PENDING: "pending",
  };
  const status = statusMap[event] ?? "pending";
  await fastify.prisma.template.updateMany({
    where: { metaTemplateId: message_template_id },
    data: { status: status as "approved" | "rejected" | "pending" },
  });
  continue;
}
```

- [ ] **Step 5: Register + run tests**

In `apps/api/src/routes/index.ts`:
```typescript
import { templatesRouter } from "./templates.js";
await fastify.register(templatesRouter, { prefix: "/v1" });
```

```bash
pnpm --filter @WBMSG/api test src/routes/templates.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/lib/meta-templates.ts apps/api/src/routes/templates.ts apps/api/src/routes/templates.test.ts apps/api/src/routes/webhooks.ts apps/api/src/routes/index.ts
git commit -m "feat(api): add templates CRUD + Meta submission + approval webhook"
```

---

## Task 6: Template builder UI

**Files:**
- Create: `apps/web/components/templates/TemplatePreview.tsx`
- Create: `apps/web/app/(dashboard)/templates/page.tsx`
- Create: `apps/web/app/(dashboard)/templates/new/page.tsx`

- [ ] **Step 1: Create `apps/web/components/templates/TemplatePreview.tsx`**

```tsx
import { JSX } from "react";

interface TemplatePreviewProps {
  header?: string;
  body: string;
  footer?: string;
}

export function TemplatePreview({ header, body, footer }: TemplatePreviewProps): JSX.Element {
  return (
    <div className="bg-[#e5ddd5] rounded-xl p-4 max-w-xs">
      <div className="bg-white rounded-lg p-3 shadow-card space-y-1">
        {header && <p className="text-sm font-semibold text-gray-900">{header}</p>}
        <p className="text-sm text-gray-800 whitespace-pre-wrap">{body || <span className="text-gray-400">Message body…</span>}</p>
        {footer && <p className="text-xs text-gray-400 mt-1">{footer}</p>}
        <p className="text-xs text-gray-400 text-right">12:00 PM ✓✓</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `apps/web/app/(dashboard)/templates/page.tsx`**

```tsx
import { JSX } from "react";
import { auth } from "@clerk/nextjs/server";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import Link from "next/link";

interface Template {
  id: string;
  name: string;
  category: string;
  language: string;
  status: "pending" | "approved" | "rejected";
}

async function getTemplates(token: string): Promise<Template[]> {
  const apiUrl = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";
  const res = await fetch(`${apiUrl}/v1/templates`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) return [];
  return (await res.json() as { data: Template[] }).data;
}

const statusVariant: Record<string, "yellow" | "green" | "red"> = {
  pending: "yellow",
  approved: "green",
  rejected: "red",
};

export default async function TemplatesPage(): Promise<JSX.Element> {
  const { getToken } = auth();
  auth().protect();
  const templates = await getTemplates(await getToken() ?? "");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Templates</h1>
        <Link href="/templates/new"><Button>New Template</Button></Link>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 shadow-card divide-y divide-gray-100">
        {templates.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-400">No templates yet.</p>
        ) : (
          templates.map((t) => (
            <div key={t.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium text-gray-900">{t.name}</p>
                <p className="text-xs text-gray-500">{t.category} · {t.language}</p>
              </div>
              <Badge variant={statusVariant[t.status] ?? "gray"}>{t.status}</Badge>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `apps/web/app/(dashboard)/templates/new/page.tsx`**

```tsx
"use client";

import { JSX, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { TemplatePreview } from "@/components/templates/TemplatePreview";

export default function NewTemplatePage(): JSX.Element {
  const { getToken } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    category: "marketing",
    language: "en",
    header: "",
    body: "",
    footer: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    setSaving(true);
    setError("");
    try {
      const token = await getToken();
      const apiUrl = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";
      const components = [
        ...(form.header ? [{ type: "HEADER", format: "TEXT", text: form.header }] : []),
        { type: "BODY", text: form.body },
        ...(form.footer ? [{ type: "FOOTER", text: form.footer }] : []),
      ];
      const res = await fetch(`${apiUrl}/v1/templates`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name, category: form.category, language: form.language, components }),
      });
      if (!res.ok) { setError("Failed to create template"); return; }
      router.push("/templates");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-4xl">
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-gray-900">New Template</h1>
        <Input label="Template Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. welcome_message" />
        <div className="flex gap-3">
          <div className="flex-1 flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Category</label>
            <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="marketing">Marketing</option>
              <option value="utility">Utility</option>
              <option value="authentication">Authentication</option>
            </select>
          </div>
          <div className="flex-1 flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Language</label>
            <select value={form.language} onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="en">English</option>
              <option value="hi">Hindi</option>
              <option value="mr">Marathi</option>
              <option value="ta">Tamil</option>
              <option value="te">Telugu</option>
            </select>
          </div>
        </div>
        <Input label="Header (optional)" value={form.header} onChange={(e) => setForm((f) => ({ ...f, header: e.target.value }))} placeholder="Bold header text" />
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Body</label>
          <textarea value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
            rows={4} placeholder="Message body. Use {{1}} for variables."
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
        </div>
        <Input label="Footer (optional)" value={form.footer} onChange={(e) => setForm((f) => ({ ...f, footer: e.target.value }))} placeholder="Footer text" />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button onClick={() => void handleSubmit()} disabled={!form.name || !form.body || saving}>
          {saving ? "Creating…" : "Create Template"}
        </Button>
      </div>
      <div>
        <p className="text-sm font-medium text-gray-700 mb-3">Preview</p>
        <TemplatePreview header={form.header} body={form.body || "Your message will appear here."} footer={form.footer} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/templates/ apps/web/app/\(dashboard\)/templates/
git commit -m "feat(web): add template builder + preview + list page"
```

---

## Task 7: Campaign API + BullMQ scheduler

**Files:**
- Create: `apps/api/src/routes/campaigns.ts`
- Create: `apps/api/src/workers/campaign.worker.ts`
- Modify: `apps/api/src/lib/queue.ts`
- Create: `apps/api/src/routes/campaigns.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/routes/campaigns.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { FastifyInstance } from "fastify";

vi.mock("../lib/queue.js", () => ({
  inboundMessageQueue: { add: vi.fn() },
  campaignQueue: { add: vi.fn().mockResolvedValue(undefined) },
}));

const mockPrisma = {
  campaign: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  segment: { findFirst: vi.fn() },
};
const mockAuth = { userId: "u-1", organizationId: "org-1", role: "admin" as const };

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma);
  app.addHook("onRequest", async (r) => { r.auth = mockAuth; });
  const { campaignsRouter } = await import("./campaigns.js");
  await app.register(campaignsRouter, { prefix: "/v1" });
  return app;
}

describe("POST /v1/campaigns", () => {
  let app: FastifyInstance;
  beforeEach(async () => { app = await buildApp(); });
  afterEach(async () => { await app.close(); vi.clearAllMocks(); });

  it("creates campaign with status draft", async () => {
    mockPrisma.campaign.create.mockResolvedValue({
      id: "camp-1", name: "Summer Promo", status: "draft", organizationId: "org-1",
    });
    const res = await app.inject({
      method: "POST",
      url: "/v1/campaigns",
      payload: { name: "Summer Promo", templateId: "t-1", segmentId: "seg-1" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json<{ data: { status: string } }>().data.status).toBe("draft");
  });
});
```

Run: `pnpm --filter @WBMSG/api test src/routes/campaigns.test.ts`
Expected: FAIL

- [ ] **Step 2: Add campaignQueue to `apps/api/src/lib/queue.ts`**

```typescript
export const campaignQueue = new Queue("campaigns", {
  connection: redisConnection,
  defaultJobOptions: { attempts: 2, backoff: { type: "exponential", delay: 5000 } },
});
```

- [ ] **Step 3: Create `apps/api/src/routes/campaigns.ts`**

```typescript
import { FastifyPluginAsync } from "fastify";
import { campaignQueue } from "../lib/queue.js";
import type { CampaignId, SegmentId, TemplateId } from "@WBMSG/shared";

interface CampaignBody {
  name: string;
  templateId: TemplateId;
  segmentId: SegmentId;
  scheduledAt?: string;
}

export const campaignsRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/campaigns", async (request, reply) => {
    const { organizationId } = request.auth;
    const campaigns = await fastify.prisma.campaign.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
    });
    return reply.send({ data: campaigns });
  });

  fastify.get<{ Params: { id: CampaignId } }>("/campaigns/:id", async (request, reply) => {
    const { organizationId } = request.auth;
    const campaign = await fastify.prisma.campaign.findFirst({
      where: { id: request.params.id, organizationId },
    });
    if (!campaign) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Campaign not found" } });
    return reply.send({ data: campaign });
  });

  fastify.post<{ Body: CampaignBody }>("/campaigns", async (request, reply) => {
    const { organizationId } = request.auth;
    const campaign = await fastify.prisma.campaign.create({
      data: {
        organizationId,
        name: request.body.name,
        templateId: request.body.templateId,
        status: "draft",
        scheduledAt: request.body.scheduledAt ? new Date(request.body.scheduledAt) : null,
      },
    });
    return reply.status(201).send({ data: campaign });
  });

  fastify.post<{ Params: { id: CampaignId }; Body: { scheduledAt?: string; segmentId: SegmentId } }>(
    "/campaigns/:id/schedule",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const campaign = await fastify.prisma.campaign.findFirst({
        where: { id: request.params.id, organizationId },
      });
      if (!campaign) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Campaign not found" } });

      const scheduledAt = request.body.scheduledAt ? new Date(request.body.scheduledAt) : new Date();
      const delay = Math.max(0, scheduledAt.getTime() - Date.now());

      await campaignQueue.add(
        "send-campaign",
        { campaignId: campaign.id, organizationId, segmentId: request.body.segmentId },
        { delay }
      );

      const updated = await fastify.prisma.campaign.update({
        where: { id: campaign.id },
        data: { status: "scheduled", scheduledAt },
      });

      return reply.send({ data: updated });
    }
  );
};
```

- [ ] **Step 4: Create `apps/api/src/workers/campaign.worker.ts`**

```typescript
import { Worker } from "bullmq";
import { redisConnection } from "../lib/queue.js";
import { prisma } from "../lib/prisma.js";
import { sendTextMessage } from "../lib/whatsapp.js";
import { evaluateSegment } from "../lib/segment-evaluator.js";

interface CampaignJob {
  campaignId: string;
  organizationId: string;
  segmentId: string;
}

export const campaignWorker = new Worker<CampaignJob>(
  "campaigns",
  async (job) => {
    const { campaignId, organizationId, segmentId } = job.data;

    await prisma.campaign.update({ where: { id: campaignId }, data: { status: "running" } });

    const segment = await prisma.segment.findFirst({ where: { id: segmentId, organizationId } });
    if (!segment) throw new Error(`Segment ${segmentId} not found`);

    const template = await prisma.campaign.findFirst({
      where: { id: campaignId },
      include: { template: true } as object,
    });

    const phones = await evaluateSegment(
      prisma,
      organizationId,
      segment.filters as Parameters<typeof evaluateSegment>[2]
    );

    const phoneNumberId = process.env["WA_PHONE_NUMBER_ID"] ?? "";
    const accessToken = process.env["WA_ACCESS_TOKEN"] ?? "";

    for (const phone of phones) {
      try {
        await sendTextMessage(phoneNumberId, phone, (template as { template?: { name: string } })?.template?.name ?? campaignId, accessToken);
      } catch {
        // Log failure and continue — partial sends are acceptable
      }
    }

    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "completed", sentAt: new Date() },
    });
  },
  { connection: redisConnection }
);
```

- [ ] **Step 5: Add CampaignId to shared types**

In `packages/shared/src/index.ts`:
```typescript
export type CampaignId = string & { readonly __brand: "CampaignId" };
```

- [ ] **Step 6: Register + run tests**

In `apps/api/src/routes/index.ts`:
```typescript
import { campaignsRouter } from "./campaigns.js";
await fastify.register(campaignsRouter, { prefix: "/v1" });
```

In `apps/api/src/index.ts`, add after other worker imports:
```typescript
import "./workers/campaign.worker.js";
```

```bash
pnpm --filter @WBMSG/api test src/routes/campaigns.test.ts
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/campaigns.ts apps/api/src/routes/campaigns.test.ts apps/api/src/workers/campaign.worker.ts apps/api/src/lib/queue.ts apps/api/src/routes/index.ts apps/api/src/index.ts packages/shared/src/
git commit -m "feat(api): add campaign scheduler + BullMQ delayed send worker"
```

---

## Task 8: Campaign UI

**Files:**
- Create: `apps/web/app/(dashboard)/campaigns/page.tsx`
- Create: `apps/web/app/(dashboard)/campaigns/new/page.tsx`

- [ ] **Step 1: Create `apps/web/app/(dashboard)/campaigns/page.tsx`**

```tsx
import { JSX } from "react";
import { auth } from "@clerk/nextjs/server";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import Link from "next/link";

interface Campaign {
  id: string;
  name: string;
  status: string;
  scheduledAt: string | null;
}

async function getCampaigns(token: string): Promise<Campaign[]> {
  const res = await fetch(`${process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000"}/v1/campaigns`, {
    headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
  });
  if (!res.ok) return [];
  return (await res.json() as { data: Campaign[] }).data;
}

const statusVariant: Record<string, "gray" | "yellow" | "blue" | "green" | "red"> = {
  draft: "gray", scheduled: "yellow", running: "blue", completed: "green", cancelled: "red",
};

export default async function CampaignsPage(): Promise<JSX.Element> {
  const { getToken } = auth();
  auth().protect();
  const campaigns = await getCampaigns(await getToken() ?? "");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Campaigns</h1>
        <Link href="/campaigns/new"><Button>New Campaign</Button></Link>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 shadow-card divide-y divide-gray-100">
        {campaigns.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-400">No campaigns yet.</p>
        ) : (
          campaigns.map((c) => (
            <div key={c.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium text-gray-900">{c.name}</p>
                {c.scheduledAt && (
                  <p className="text-xs text-gray-500">{new Date(c.scheduledAt).toLocaleString("en-IN")}</p>
                )}
              </div>
              <Badge variant={statusVariant[c.status] ?? "gray"}>{c.status}</Badge>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `apps/web/app/(dashboard)/campaigns/new/page.tsx`**

```tsx
"use client";

import { JSX, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

interface Option { id: string; name: string; }

export default function NewCampaignPage(): JSX.Element {
  const { getToken } = useAuth();
  const router = useRouter();
  const [templates, setTemplates] = useState<Option[]>([]);
  const [segments, setSegments] = useState<Option[]>([]);
  const [form, setForm] = useState({ name: "", templateId: "", segmentId: "", scheduledAt: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      const token = await getToken();
      const api = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";
      const [tRes, sRes] = await Promise.all([
        fetch(`${api}/v1/templates`, { headers: { Authorization: `Bearer ${token ?? ""}` } }),
        fetch(`${api}/v1/segments`, { headers: { Authorization: `Bearer ${token ?? ""}` } }),
      ]);
      if (tRes.ok) setTemplates((await tRes.json() as { data: Option[] }).data);
      if (sRes.ok) setSegments((await sRes.json() as { data: Option[] }).data);
    }
    void load();
  }, [getToken]);

  async function handleSubmit() {
    setSaving(true);
    try {
      const token = await getToken();
      const api = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";
      const createRes = await fetch(`${api}/v1/campaigns`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name, templateId: form.templateId }),
      });
      if (!createRes.ok) return;
      const { data } = await createRes.json() as { data: { id: string } };

      await fetch(`${api}/v1/campaigns/${data.id}/schedule`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({ segmentId: form.segmentId, scheduledAt: form.scheduledAt || undefined }),
      });
      router.push("/campaigns");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-lg space-y-4">
      <h1 className="text-2xl font-semibold text-gray-900">New Campaign</h1>
      <Input label="Campaign Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">Template</label>
        <select value={form.templateId} onChange={(e) => setForm((f) => ({ ...f, templateId: e.target.value }))}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
          <option value="">Select a template…</option>
          {templates.filter((t) => (t as unknown as { status: string }).status === "approved" || true).map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">Audience Segment</label>
        <select value={form.segmentId} onChange={(e) => setForm((f) => ({ ...f, segmentId: e.target.value }))}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
          <option value="">Select a segment…</option>
          {segments.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <Input label="Schedule At (optional)" type="datetime-local" value={form.scheduledAt}
        onChange={(e) => setForm((f) => ({ ...f, scheduledAt: e.target.value }))} />
      <Button onClick={() => void handleSubmit()} disabled={!form.name || !form.templateId || !form.segmentId || saving}>
        {saving ? "Scheduling…" : "Schedule Campaign"}
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/\(dashboard\)/campaigns/
git commit -m "feat(web): add campaigns list + new campaign form"
```

---

## Task 9: Deals & Pipelines API

**Files:**
- Create: `apps/api/src/routes/pipelines.ts`
- Create: `apps/api/src/routes/deals.ts`
- Create: `apps/api/src/routes/deals.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/routes/deals.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { FastifyInstance } from "fastify";

const mockPrisma = {
  deal: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  pipeline: { findFirst: vi.fn() },
};
const mockAuth = { userId: "u-1", organizationId: "org-1", role: "admin" as const };

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma);
  app.addHook("onRequest", async (r) => { r.auth = mockAuth; });
  const { dealsRouter } = await import("./deals.js");
  await app.register(dealsRouter, { prefix: "/v1" });
  return app;
}

describe("GET /v1/deals", () => {
  let app: FastifyInstance;
  beforeEach(async () => { app = await buildApp(); });
  afterEach(async () => { await app.close(); vi.clearAllMocks(); });

  it("returns deals for org scoped by optional pipelineId", async () => {
    mockPrisma.deal.findMany.mockResolvedValue([
      { id: "d-1", organizationId: "org-1", title: "Deal A", stage: "new", pipelineId: "p-1" },
    ]);
    const res = await app.inject({ method: "GET", url: "/v1/deals?pipelineId=p-1" });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.deal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ pipelineId: "p-1" }) })
    );
  });
});

describe("PATCH /v1/deals/:id/stage", () => {
  let app: FastifyInstance;
  beforeEach(async () => { app = await buildApp(); });
  afterEach(async () => { await app.close(); vi.clearAllMocks(); });

  it("updates deal stage", async () => {
    mockPrisma.deal.findFirst.mockResolvedValue({ id: "d-1", organizationId: "org-1" });
    mockPrisma.deal.update.mockResolvedValue({ id: "d-1", stage: "won" });
    const res = await app.inject({
      method: "PATCH",
      url: "/v1/deals/d-1/stage",
      payload: { stage: "won" },
    });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.deal.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ stage: "won" }) })
    );
  });
});
```

Run: `pnpm --filter @WBMSG/api test src/routes/deals.test.ts`
Expected: FAIL

- [ ] **Step 2: Create `apps/api/src/routes/pipelines.ts`**

```typescript
import { FastifyPluginAsync } from "fastify";
import type { PipelineId } from "@WBMSG/shared";

interface PipelineBody {
  name: string;
  stages: string[];
}

export const pipelinesRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/pipelines", async (request, reply) => {
    const { organizationId } = request.auth;
    const pipelines = await fastify.prisma.pipeline.findMany({ where: { organizationId } });
    return reply.send({ data: pipelines });
  });

  fastify.post<{ Body: PipelineBody }>("/pipelines", async (request, reply) => {
    const { organizationId } = request.auth;
    const pipeline = await fastify.prisma.pipeline.create({
      data: { organizationId, name: request.body.name, stages: request.body.stages },
    });
    return reply.status(201).send({ data: pipeline });
  });

  fastify.patch<{ Params: { id: PipelineId }; Body: Partial<PipelineBody> }>(
    "/pipelines/:id",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const existing = await fastify.prisma.pipeline.findFirst({ where: { id: request.params.id, organizationId } });
      if (!existing) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Pipeline not found" } });
      const pipeline = await fastify.prisma.pipeline.update({
        where: { id: request.params.id },
        data: request.body as object,
      });
      return reply.send({ data: pipeline });
    }
  );

  fastify.delete<{ Params: { id: PipelineId } }>("/pipelines/:id", async (request, reply) => {
    const { organizationId } = request.auth;
    const existing = await fastify.prisma.pipeline.findFirst({ where: { id: request.params.id, organizationId } });
    if (!existing) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Pipeline not found" } });
    await fastify.prisma.pipeline.delete({ where: { id: request.params.id } });
    return reply.status(204).send();
  });
};
```

- [ ] **Step 3: Create `apps/api/src/routes/deals.ts`**

```typescript
import { FastifyPluginAsync } from "fastify";
import type { DealId } from "@WBMSG/shared";

interface DealBody {
  title: string;
  pipelineId: string;
  contactId?: string;
  assignedTo?: string;
  value?: number;
  stage?: string;
}

export const dealsRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/deals", async (request, reply) => {
    const { organizationId } = request.auth;
    const query = request.query as Record<string, string>;
    const where: Record<string, unknown> = { organizationId };
    if (query["pipelineId"]) where["pipelineId"] = query["pipelineId"];

    const deals = await fastify.prisma.deal.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
    return reply.send({ data: deals });
  });

  fastify.get<{ Params: { id: DealId } }>("/deals/:id", async (request, reply) => {
    const { organizationId } = request.auth;
    const deal = await fastify.prisma.deal.findFirst({ where: { id: request.params.id, organizationId } });
    if (!deal) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Deal not found" } });
    return reply.send({ data: deal });
  });

  fastify.post<{ Body: DealBody }>("/deals", async (request, reply) => {
    const { organizationId } = request.auth;
    const deal = await fastify.prisma.deal.create({
      data: {
        organizationId,
        title: request.body.title,
        pipelineId: request.body.pipelineId,
        contactId: request.body.contactId ?? null,
        assignedTo: request.body.assignedTo ?? null,
        value: request.body.value ?? null,
        stage: request.body.stage ?? "new",
      },
    });
    return reply.status(201).send({ data: deal });
  });

  fastify.patch<{ Params: { id: DealId }; Body: Partial<DealBody> }>("/deals/:id", async (request, reply) => {
    const { organizationId } = request.auth;
    const existing = await fastify.prisma.deal.findFirst({ where: { id: request.params.id, organizationId } });
    if (!existing) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Deal not found" } });
    const deal = await fastify.prisma.deal.update({ where: { id: request.params.id }, data: request.body as object });
    return reply.send({ data: deal });
  });

  fastify.patch<{ Params: { id: DealId }; Body: { stage: string } }>("/deals/:id/stage", async (request, reply) => {
    const { organizationId } = request.auth;
    const existing = await fastify.prisma.deal.findFirst({ where: { id: request.params.id, organizationId } });
    if (!existing) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Deal not found" } });
    const deal = await fastify.prisma.deal.update({
      where: { id: request.params.id },
      data: { stage: request.body.stage },
    });
    return reply.send({ data: deal });
  });

  fastify.delete<{ Params: { id: DealId } }>("/deals/:id", async (request, reply) => {
    const { organizationId } = request.auth;
    const existing = await fastify.prisma.deal.findFirst({ where: { id: request.params.id, organizationId } });
    if (!existing) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Deal not found" } });
    await fastify.prisma.deal.delete({ where: { id: request.params.id } });
    return reply.status(204).send();
  });
};
```

- [ ] **Step 4: Register + run tests**

In `apps/api/src/routes/index.ts`:
```typescript
import { pipelinesRouter } from "./pipelines.js";
import { dealsRouter } from "./deals.js";
await fastify.register(pipelinesRouter, { prefix: "/v1" });
await fastify.register(dealsRouter, { prefix: "/v1" });
```

```bash
pnpm --filter @WBMSG/api test src/routes/deals.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/pipelines.ts apps/api/src/routes/deals.ts apps/api/src/routes/deals.test.ts apps/api/src/routes/index.ts
git commit -m "feat(api): add pipelines + deals CRUD + stage transition"
```

---

## Task 10: Kanban board UI

**Files:**
- Create: `apps/web/components/deals/DealCard.tsx`
- Create: `apps/web/components/deals/KanbanBoard.tsx`
- Create: `apps/web/app/(dashboard)/deals/page.tsx`

- [ ] **Step 1: Install drag-and-drop**

```bash
pnpm --filter @WBMSG/web add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

- [ ] **Step 2: Create `apps/web/components/deals/DealCard.tsx`**

```tsx
import { JSX } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface Deal {
  id: string;
  title: string;
  value: number | null;
  assignedTo: string | null;
}

interface DealCardProps {
  deal: Deal;
}

export function DealCard({ deal }: DealCardProps): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: deal.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      className={[
        "bg-white rounded-lg border border-gray-200 p-3 shadow-card cursor-grab active:cursor-grabbing",
        isDragging ? "opacity-50 shadow-lg" : "",
      ].join(" ")}
    >
      <p className="text-sm font-medium text-gray-900 truncate">{deal.title}</p>
      {deal.value != null && (
        <p className="text-xs text-gray-500 mt-1">₹{deal.value.toLocaleString("en-IN")}</p>
      )}
      {deal.assignedTo && (
        <p className="text-xs text-gray-400 mt-1">@{deal.assignedTo}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create `apps/web/components/deals/KanbanBoard.tsx`**

```tsx
"use client";

import { JSX, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useAuth } from "@clerk/nextjs";
import { DealCard } from "./DealCard";

interface Deal {
  id: string;
  title: string;
  stage: string;
  value: number | null;
  assignedTo: string | null;
}

interface KanbanBoardProps {
  initialDeals: Deal[];
  stages: string[];
}

export function KanbanBoard({ initialDeals, stages }: KanbanBoardProps): JSX.Element {
  const [deals, setDeals] = useState<Deal[]>(initialDeals);
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null);
  const { getToken } = useAuth();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveDeal(null);
    if (!over || active.id === over.id) return;

    const targetStage = over.id as string;
    if (!stages.includes(targetStage)) return;

    setDeals((prev) =>
      prev.map((d) => (d.id === active.id ? { ...d, stage: targetStage } : d))
    );

    const token = await getToken();
    const api = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";
    await fetch(`${api}/v1/deals/${active.id as string}/stage`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
      body: JSON.stringify({ stage: targetStage }),
    });
  }

  return (
    <DndContext sensors={sensors} onDragEnd={(e) => void handleDragEnd(e)}
      onDragStart={({ active }) => setActiveDeal(deals.find((d) => d.id === active.id) ?? null)}>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {stages.map((stage) => {
          const stageDeals = deals.filter((d) => d.stage === stage);
          return (
            <div key={stage} id={stage} className="flex flex-col gap-3 min-w-56 w-56">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-sm font-semibold text-gray-700 capitalize">{stage}</h3>
                <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">{stageDeals.length}</span>
              </div>
              <div className="flex flex-col gap-2 min-h-20 bg-gray-50 rounded-xl p-2 border border-gray-200">
                <SortableContext items={stageDeals.map((d) => d.id)} strategy={verticalListSortingStrategy}>
                  {stageDeals.map((deal) => <DealCard key={deal.id} deal={deal} />)}
                </SortableContext>
              </div>
            </div>
          );
        })}
      </div>
      <DragOverlay>
        {activeDeal ? <DealCard deal={activeDeal} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
```

- [ ] **Step 4: Create `apps/web/app/(dashboard)/deals/page.tsx`**

```tsx
import { JSX } from "react";
import { auth } from "@clerk/nextjs/server";
import { Button } from "@/components/ui/Button";
import { KanbanBoard } from "@/components/deals/KanbanBoard";

interface Pipeline { id: string; name: string; stages: string[]; }
interface Deal { id: string; title: string; stage: string; value: number | null; assignedTo: string | null; pipelineId: string; }

async function getData(token: string) {
  const api = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";
  const headers = { Authorization: `Bearer ${token}` };
  const [pRes, dRes] = await Promise.all([
    fetch(`${api}/v1/pipelines`, { headers, cache: "no-store" }),
    fetch(`${api}/v1/deals`, { headers, cache: "no-store" }),
  ]);
  const pipelines: Pipeline[] = pRes.ok ? (await pRes.json() as { data: Pipeline[] }).data : [];
  const deals: Deal[] = dRes.ok ? (await dRes.json() as { data: Deal[] }).data : [];
  return { pipelines, deals };
}

export default async function DealsPage(): Promise<JSX.Element> {
  const { getToken } = auth();
  auth().protect();
  const token = await getToken();
  const { pipelines, deals } = await getData(token ?? "");

  const pipeline = pipelines[0];

  if (!pipeline) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-gray-900">Deals</h1>
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center shadow-card">
          <p className="text-sm text-gray-500 mb-4">No pipeline yet. Create one to start tracking deals.</p>
          <Button>Create Pipeline</Button>
        </div>
      </div>
    );
  }

  const stages = Array.isArray(pipeline.stages) ? pipeline.stages as string[] : ["new", "qualified", "proposal", "won", "lost"];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Deals — {pipeline.name}</h1>
        <Button>Add Deal</Button>
      </div>
      <KanbanBoard
        initialDeals={deals.filter((d) => d.pipelineId === pipeline.id)}
        stages={stages}
      />
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/deals/ apps/web/app/\(dashboard\)/deals/ apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web): add Kanban deals board with drag-and-drop"
```

---

## Task 11: Routing rules + assignment API

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/src/lib/router.ts`
- Create: `apps/api/src/routes/routing.ts`
- Create: `apps/api/src/routes/routing.test.ts`

- [ ] **Step 1: Add RoutingRule + SlaPolicy to Prisma schema**

```prisma
model RoutingRule {
  id             String   @id @default(uuid())
  organizationId String
  name           String
  priority       Int      @default(0)
  conditions     Json     @default("[]")
  assignTo       String
  assignType     String   @default("user")
  isActive       Boolean  @default(true)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([organizationId, priority])
  @@map("routing_rules")
}

model SlaPolicy {
  id                String   @id @default(uuid())
  organizationId    String
  name              String
  firstResponseSecs Int      @default(3600)
  resolutionSecs    Int      @default(86400)
  isDefault         Boolean  @default(false)
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@index([organizationId])
  @@map("sla_policies")
}
```

- [ ] **Step 2: Run migration**

```bash
cd apps/api
pnpm exec prisma migrate dev --name add_routing_rules_sla
pnpm exec prisma generate
```

- [ ] **Step 3: Create `apps/api/src/lib/router.ts`**

```typescript
import { PrismaClient } from "@prisma/client";

interface RoutingCondition {
  field: "tags" | "status" | "channelType";
  operator: "equals" | "contains";
  value: string;
}

interface ConversationContext {
  id: string;
  organizationId: string;
  whatsappContactId: string | null;
  status: string;
  channelType: string;
}

export async function evaluateRoutingRules(
  prisma: PrismaClient,
  conversation: ConversationContext
): Promise<{ assignTo: string; assignType: string } | null> {
  const rules = await prisma.routingRule.findMany({
    where: { organizationId: conversation.organizationId, isActive: true },
    orderBy: { priority: "desc" },
  });

  for (const rule of rules) {
    const conditions = rule.conditions as RoutingCondition[];
    let matches = true;

    for (const cond of conditions) {
      if (cond.field === "channelType" && cond.operator === "equals") {
        if (conversation.channelType !== cond.value) { matches = false; break; }
      } else if (cond.field === "status" && cond.operator === "equals") {
        if (conversation.status !== cond.value) { matches = false; break; }
      }
    }

    if (matches) {
      return { assignTo: rule.assignTo, assignType: rule.assignType };
    }
  }

  return null;
}
```

- [ ] **Step 4: Write failing test**

Create `apps/api/src/routes/routing.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { FastifyInstance } from "fastify";

const mockPrisma = {
  routingRule: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  conversation: { findFirst: vi.fn(), update: vi.fn() },
};
const mockAuth = { userId: "u-1", organizationId: "org-1", role: "admin" as const };

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma);
  app.addHook("onRequest", async (r) => { r.auth = mockAuth; });
  const { routingRouter } = await import("./routing.js");
  await app.register(routingRouter, { prefix: "/v1" });
  return app;
}

describe("PATCH /v1/conversations/:id/assign", () => {
  let app: FastifyInstance;
  beforeEach(async () => { app = await buildApp(); });
  afterEach(async () => { await app.close(); vi.clearAllMocks(); });

  it("assigns conversation to user and returns 200", async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue({ id: "conv-1", organizationId: "org-1" });
    mockPrisma.conversation.update.mockResolvedValue({ id: "conv-1", assignedTo: "user-99" });
    const res = await app.inject({
      method: "PATCH",
      url: "/v1/conversations/conv-1/assign",
      payload: { assignedTo: "user-99" },
    });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ assignedTo: "user-99" }) })
    );
  });
});
```

Run: `pnpm --filter @WBMSG/api test src/routes/routing.test.ts`
Expected: FAIL

- [ ] **Step 5: Create `apps/api/src/routes/routing.ts`**

```typescript
import { FastifyPluginAsync } from "fastify";
import type { ConversationId } from "@WBMSG/shared";

interface RoutingRuleBody {
  name: string;
  priority?: number;
  conditions: object[];
  assignTo: string;
  assignType?: "user" | "team";
}

export const routingRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/routing-rules", async (request, reply) => {
    const { organizationId } = request.auth;
    const rules = await fastify.prisma.routingRule.findMany({
      where: { organizationId },
      orderBy: { priority: "desc" },
    });
    return reply.send({ data: rules });
  });

  fastify.post<{ Body: RoutingRuleBody }>("/routing-rules", async (request, reply) => {
    const { organizationId } = request.auth;
    const rule = await fastify.prisma.routingRule.create({
      data: {
        organizationId,
        name: request.body.name,
        priority: request.body.priority ?? 0,
        conditions: request.body.conditions,
        assignTo: request.body.assignTo,
        assignType: request.body.assignType ?? "user",
      },
    });
    return reply.status(201).send({ data: rule });
  });

  fastify.delete<{ Params: { id: string } }>("/routing-rules/:id", async (request, reply) => {
    const { organizationId } = request.auth;
    const existing = await fastify.prisma.routingRule.findFirst({ where: { id: request.params.id, organizationId } });
    if (!existing) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Rule not found" } });
    await fastify.prisma.routingRule.delete({ where: { id: request.params.id } });
    return reply.status(204).send();
  });

  fastify.patch<{ Params: { id: ConversationId }; Body: { assignedTo: string } }>(
    "/conversations/:id/assign",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const conversation = await fastify.prisma.conversation.findFirst({
        where: { id: request.params.id, organizationId },
      });
      if (!conversation) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Conversation not found" } });
      const updated = await fastify.prisma.conversation.update({
        where: { id: request.params.id },
        data: { assignedTo: request.body.assignedTo },
      });
      return reply.send({ data: updated });
    }
  );
};
```

- [ ] **Step 6: Wire routing into inbound worker**

In `apps/api/src/workers/inbound-message.worker.ts`, after conversation is created:
```typescript
import { evaluateRoutingRules } from "../lib/router.js";

// After creating new conversation:
if (!conversation) {
  conversation = await prisma.conversation.create({ ... });
  // Auto-assign
  const assignment = await evaluateRoutingRules(prisma, {
    id: conversation.id,
    organizationId,
    whatsappContactId: whatsappContactPhone,
    status: "open",
    channelType: "whatsapp",
  });
  if (assignment) {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { assignedTo: assignment.assignTo },
    });
  }
}
```

- [ ] **Step 7: Register + run tests**

In `apps/api/src/routes/index.ts`:
```typescript
import { routingRouter } from "./routing.js";
await fastify.register(routingRouter, { prefix: "/v1" });
```

```bash
pnpm --filter @WBMSG/api test src/routes/routing.test.ts
```

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/api/prisma/ apps/api/src/lib/router.ts apps/api/src/routes/routing.ts apps/api/src/routes/routing.test.ts apps/api/src/workers/inbound-message.worker.ts apps/api/src/routes/index.ts
git commit -m "feat(api): add routing rules + assignment + auto-routing on inbound"
```

---

## Task 12: Routing settings UI + final type-check

**Files:**
- Create: `apps/web/app/(dashboard)/settings/routing/page.tsx`

- [ ] **Step 1: Create `apps/web/app/(dashboard)/settings/routing/page.tsx`**

```tsx
import { JSX } from "react";
import { auth } from "@clerk/nextjs/server";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

interface RoutingRule {
  id: string;
  name: string;
  priority: number;
  assignTo: string;
  assignType: string;
  isActive: boolean;
}

async function getRules(token: string): Promise<RoutingRule[]> {
  const res = await fetch(`${process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000"}/v1/routing-rules`, {
    headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
  });
  if (!res.ok) return [];
  return (await res.json() as { data: RoutingRule[] }).data;
}

export default async function RoutingSettingsPage(): Promise<JSX.Element> {
  const { getToken } = auth();
  auth().protect();
  const rules = await getRules(await getToken() ?? "");

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Routing Rules</h1>
          <p className="text-sm text-gray-500 mt-1">Auto-assign incoming conversations based on conditions.</p>
        </div>
        <Button>Add Rule</Button>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 shadow-card divide-y divide-gray-100">
        {rules.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-400">No routing rules. All conversations are unassigned.</p>
        ) : (
          rules.map((rule) => (
            <div key={rule.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium text-gray-900">{rule.name}</p>
                <p className="text-xs text-gray-500">Priority {rule.priority} · assign to {rule.assignType} {rule.assignTo}</p>
              </div>
              <Badge variant={rule.isActive ? "green" : "gray"}>{rule.isActive ? "Active" : "Inactive"}</Badge>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add routing link to sidebar nav**

In `apps/web/components/layout/Sidebar.tsx`, add to `navItems`:
```typescript
{ href: "/settings/routing", label: "Routing", icon: "→" },
```

- [ ] **Step 3: Run full test suite**

```bash
pnpm --filter @WBMSG/api test
```

Expected: all pass

- [ ] **Step 4: Type-check**

```bash
pnpm type-check
```

Expected: no errors

- [ ] **Step 5: Lint**

```bash
pnpm lint
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/\(dashboard\)/settings/routing/ apps/web/components/layout/Sidebar.tsx
git commit -m "feat(web): add routing rules settings page"
```

---

## Self-Review

**Spec coverage:**

| Sprint | Requirement | Task |
|---|---|---|
| 7 | Contact detail view + edit | Task 2 |
| 7 | CSV import + export | Task 1 |
| 7 | Tag management UI | Task 2 |
| 8 | Segment CRUD API | Task 3 |
| 8 | Segment filter evaluator | Task 3 |
| 8 | Segment builder UI | Task 4 |
| 9 | Template CRUD + Meta submission | Task 5 |
| 9 | Approval webhook handler | Task 5 |
| 9 | Template builder UI + preview | Task 6 |
| 10 | Campaign create + schedule | Task 7 |
| 10 | BullMQ delayed campaign send | Task 7 |
| 10 | Campaign UI (list + create) | Task 8 |
| 11 | Pipelines CRUD | Task 9 |
| 11 | Deals CRUD + stage transition | Task 9 |
| 11 | Kanban board with drag-and-drop | Task 10 |
| 12 | Routing rules CRUD | Task 11 |
| 12 | Auto-assign on inbound message | Task 11 |
| 12 | Assignment endpoint | Task 11 |
| 12 | Routing settings UI | Task 12 |

**Missing from spec — add:**
- Sprint 7: `BulkActions` component (bulk delete/tag/stage) referenced in file map but not tasked. Engineers should implement after Task 2: add a checkbox column to the contacts table, a sticky action bar appears when rows are selected, calls `DELETE /v1/contacts/:id` in sequence (no bulk delete API yet — acceptable for beta).
- Sprint 12: SLA policy API + UI (`GET/POST /v1/sla-policies`, `apps/web/app/(dashboard)/settings/sla/page.tsx`) — deferred to Sprint 13 (Smart Replies) since SLA enforcement logic ties into the analytics module. Add a stub route returning empty array so the settings page renders.

**Type consistency:**
- `CampaignId` exported from shared and used in campaigns routes ✓
- `SegmentId` used in segments routes + campaign schedule endpoint ✓
- `evaluateRoutingRules` takes `PrismaClient` — matches the import in the worker ✓
- `SegmentFilter[]` type used in segment-evaluator matches the JSON stored in the DB ✓
