# Deals Kanban Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full-featured Deals Kanban board with multiple pipelines, deal creation/editing, deal notes, contact linking, column value totals, and contact profile integration — matching and exceeding WATI's CRM pipeline feature.

**Architecture:** Add a `notes` field to the `Deal` schema → enrich the GET /deals API to include contact name → convert the Deals page from a server component to a client-side React Query page → add modals and a slide-over for deal CRUD — all in existing files where possible, new files only for new components. Contact profile gets a linked-deals section.

**Tech Stack:** Prisma (PostgreSQL), Fastify 4 ESM, Vitest, Next.js 15 App Router, Tailwind, React Query, @dnd-kit (already installed), Clerk (`useAuth`)

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Modify | `apps/api/prisma/schema.prisma` | Add `notes String?` to Deal model |
| Modify | `apps/api/src/routes/deals.ts` | Include contact in GET list/detail, add notes to PATCH |
| Modify | `apps/api/src/routes/deals.test.ts` | Tests for enriched GET and notes PATCH |
| Modify | `apps/web/components/deals/DealCard.tsx` | Currency-agnostic value, show contact name |
| Modify | `apps/web/components/deals/KanbanBoard.tsx` | Column value totals, multiple-pipeline tabs, Add Deal button per column |
| Create | `apps/web/components/deals/AddDealModal.tsx` | Create deal form (title, value, contact search, stage, assigned) |
| Create | `apps/web/components/deals/DealSlideOver.tsx` | Deal detail view/edit + notes |
| Create | `apps/web/components/deals/CreatePipelineModal.tsx` | Create pipeline (name + stages) |
| Modify | `apps/web/app/(dashboard)/deals/page.tsx` | Convert to client + React Query, wire all modals |
| Modify | `apps/web/app/(dashboard)/contacts/[id]/page.tsx` | Add linked deals section |

---

## Task 1: Schema — Add notes to Deal

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Add notes field**

Open `apps/api/prisma/schema.prisma`. Find the `Deal` model. After the `closedAt` field, add:

```prisma
  notes          String?
```

The model should now look like:

```prisma
model Deal {
  id             String    @id @default(uuid())
  organizationId String    @map("organization_id")
  title          String
  value          Decimal?  @db.Decimal(15, 2)
  stage          String    @default("new")
  pipelineId     String    @map("pipeline_id")
  pipeline       Pipeline  @relation(fields: [pipelineId], references: [id])
  contactId      String?   @map("contact_id")
  assignedTo     String?   @map("assigned_to")
  closedAt       DateTime? @map("closed_at")
  notes          String?
  createdAt      DateTime  @default(now()) @map("created_at")
  updatedAt      DateTime  @updatedAt @map("updated_at")

  @@index([organizationId])
  @@index([organizationId, pipelineId])
  @@map("deals")
}
```

- [ ] **Step 2: Push schema and resolve migration**

```bash
pnpm --filter @WBMSG/api exec prisma db push --accept-data-loss
```

Expected: `Your database is now in sync with your Prisma schema.`

Then create the migration file manually:

```bash
mkdir -p apps/api/prisma/migrations/20260531_deal_notes
```

Create `apps/api/prisma/migrations/20260531_deal_notes/migration.sql`:

```sql
ALTER TABLE "deals" ADD COLUMN "notes" TEXT;
```

Then mark it as applied:

```bash
pnpm --filter @WBMSG/api exec prisma migrate resolve --applied 20260531_deal_notes
```

- [ ] **Step 3: Generate client**

```bash
pnpm --filter @WBMSG/api generate
```

Expected: `✔ Generated Prisma Client`

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/
git commit -m "feat(prisma): add notes field to Deal model"
```

---

## Task 2: API — Enrich GET /deals and support notes in PATCH

**Files:**
- Modify: `apps/api/src/routes/deals.ts`
- Modify: `apps/api/src/routes/deals.test.ts`

### Step 2a: Update deals.ts

- [ ] **Step 1: Update the DealBody interface to include notes**

Open `apps/api/src/routes/deals.ts`. Replace the `DealBody` interface:

```typescript
interface DealBody {
  title: string;
  pipelineId: string;
  contactId?: string;
  assignedTo?: string;
  value?: number;
  stage?: string;
  notes?: string;
}
```

- [ ] **Step 2: Enrich GET /deals with contact name**

Find `fastify.get("/deals", ...)`. Replace the `findMany` call:

```typescript
    const deals = await fastify.prisma.deal.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        contact: {
          select: { id: true, firstName: true, lastName: true, phone: true },
        },
      },
    });
```

- [ ] **Step 3: Enrich GET /deals/:id with contact name**

Find `fastify.get<{ Params: { id: DealId } }>("/deals/:id", ...)`. Replace the `findFirst` call:

```typescript
    const deal = await fastify.prisma.deal.findFirst({
      where: { id: request.params.id, organizationId },
      include: {
        contact: {
          select: { id: true, firstName: true, lastName: true, phone: true },
        },
      },
    });
```

- [ ] **Step 4: Add notes to POST /deals**

Find `fastify.post<{ Body: DealBody }>("/deals", ...)`. Update the `create` data block:

```typescript
    const deal = await fastify.prisma.deal.create({
      data: {
        organizationId,
        title: request.body.title,
        pipelineId: request.body.pipelineId,
        contactId: request.body.contactId ?? null,
        assignedTo: request.body.assignedTo ?? null,
        value: request.body.value != null ? request.body.value : null,
        stage: request.body.stage ?? "new",
        notes: request.body.notes ?? null,
      },
    });
```

- [ ] **Step 5: Add notes to PATCH /deals/:id**

Find `fastify.patch<{ Params: { id: DealId }; Body: Partial<DealBody> }>("/deals/:id", ...)`. Update the `update` data block:

```typescript
    const deal = await fastify.prisma.deal.update({
      where: { id: request.params.id },
      data: {
        title: request.body.title,
        contactId: request.body.contactId,
        assignedTo: request.body.assignedTo,
        value: request.body.value,
        stage: request.body.stage,
        notes: request.body.notes,
      },
    });
```

### Step 2b: Update tests

- [ ] **Step 6: Update deals.test.ts**

Open `apps/api/src/routes/deals.test.ts`. In the existing `mockPrisma`, update the `deal` mock to return contact data. Find the mock for `deal.findMany` and update it to return a contact field:

```typescript
mockPrisma.deal.findMany.mockResolvedValue([
  {
    id: "deal-1",
    organizationId: "org-1",
    title: "Big Contract",
    value: 5000,
    stage: "new",
    pipelineId: "pipe-1",
    contactId: "contact-1",
    assignedTo: null,
    notes: null,
    contact: { id: "contact-1", firstName: "Alice", lastName: "Smith", phone: "+14155552671" },
    createdAt: new Date(),
    updatedAt: new Date(),
  },
]);
```

Add a new test block for notes:

```typescript
describe("PATCH /v1/deals/:id with notes", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("updates deal notes", async () => {
    mockPrisma.deal.findFirst.mockResolvedValue({ id: "deal-1", organizationId: "org-1" });
    mockPrisma.deal.update.mockResolvedValue({
      id: "deal-1",
      title: "Big Contract",
      notes: "Called on Monday, follow up Thursday",
    });
    const res = await app.inject({
      method: "PATCH",
      url: "/v1/deals/deal-1",
      payload: { notes: "Called on Monday, follow up Thursday" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: { notes: string } }>().data.notes).toBe("Called on Monday, follow up Thursday");
  });
});
```

- [ ] **Step 7: Run tests**

```bash
pnpm --filter @WBMSG/api test deals
```

Expected: all tests pass

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/routes/deals.ts apps/api/src/routes/deals.test.ts
git commit -m "feat(api): enrich deals with contact name, add notes field support"
```

---

## Task 3: Fix DealCard — currency-agnostic + contact name

**Files:**
- Modify: `apps/web/components/deals/DealCard.tsx`

- [ ] **Step 1: Rewrite DealCard**

Replace the entire content of `apps/web/components/deals/DealCard.tsx`:

```tsx
import { JSX } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface DealContact {
  id: string;
  firstName: string | null;
  lastName: string | null;
  phone: string;
}

export interface Deal {
  id: string;
  title: string;
  value: number | null;
  assignedTo: string | null;
  stage: string;
  notes: string | null;
  contact: DealContact | null;
}

interface DealCardProps {
  deal: Deal;
  onClick?: (deal: Deal) => void;
}

export function DealCard({ deal, onClick }: DealCardProps): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: deal.id,
  });

  const contactName = deal.contact
    ? [deal.contact.firstName, deal.contact.lastName].filter(Boolean).join(" ") || deal.contact.phone
    : null;

  const formattedValue =
    deal.value != null
      ? Number(deal.value).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })
      : null;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onClick={() => onClick?.(deal)}
      className={[
        "bg-white rounded-lg border border-gray-200 p-3 shadow-card cursor-grab active:cursor-grabbing select-none",
        isDragging ? "opacity-50 shadow-lg" : "hover:border-gray-300 hover:shadow-md transition-shadow",
        onClick ? "cursor-pointer" : "",
      ].join(" ")}
    >
      <p className="text-sm font-medium text-gray-900 truncate">{deal.title}</p>
      {contactName && (
        <p className="text-xs text-gray-500 mt-1 truncate">{contactName}</p>
      )}
      {formattedValue && (
        <p className="text-xs font-semibold text-emerald-600 mt-1.5">{formattedValue}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm type-check
```

Expected: no errors (or only pre-existing errors)

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/deals/DealCard.tsx
git commit -m "fix(web): deals card — currency-agnostic value, show contact name"
```

---

## Task 4: AddDealModal component

**Files:**
- Create: `apps/web/components/deals/AddDealModal.tsx`

- [ ] **Step 1: Create AddDealModal**

Create `apps/web/components/deals/AddDealModal.tsx`:

```tsx
"use client";
import { JSX, useState } from "react";
import { useAuth } from "@clerk/nextjs";

interface Contact {
  id: string;
  firstName: string | null;
  lastName: string | null;
  phone: string;
}

interface AddDealModalProps {
  pipelineId: string;
  stages: string[];
  onClose: () => void;
  onCreated: () => void;
  defaultStage?: string;
}

export function AddDealModal({ pipelineId, stages, onClose, onCreated, defaultStage }: AddDealModalProps): JSX.Element {
  const { getToken } = useAuth();
  const api = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [stage, setStage] = useState(defaultStage ?? stages[0] ?? "new");
  const [contactSearch, setContactSearch] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);

  async function searchContacts(q: string) {
    if (q.length < 2) { setContacts([]); return; }
    setSearching(true);
    const token = await getToken();
    const res = await fetch(`${api}/v1/contacts?search=${encodeURIComponent(q)}&limit=8`, {
      headers: { Authorization: `Bearer ${token ?? ""}` },
    });
    if (res.ok) {
      const body = await res.json() as { data: Contact[] };
      setContacts(body.data);
    }
    setSearching(false);
  }

  async function handleSubmit() {
    if (!title.trim()) return;
    setSaving(true);
    const token = await getToken();
    await fetch(`${api}/v1/deals`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        pipelineId,
        stage,
        value: value ? parseFloat(value) : undefined,
        contactId: selectedContact?.id,
        notes: notes.trim() || undefined,
      }),
    });
    setSaving(false);
    onCreated();
    onClose();
  }

  const contactLabel = (c: Contact) =>
    [c.firstName, c.lastName].filter(Boolean).join(" ") || c.phone;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">New Deal</h2>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Deal title *</label>
          <input
            autoFocus
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            placeholder="e.g. Enterprise subscription renewal"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Value</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="0.00"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Stage</label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              value={stage}
              onChange={(e) => setStage(e.target.value)}
            >
              {stages.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Contact</label>
          {selectedContact ? (
            <div className="flex items-center justify-between border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <span>{contactLabel(selectedContact)}</span>
              <button onClick={() => { setSelectedContact(null); setContactSearch(""); }} className="text-gray-400 hover:text-gray-600 text-xs">Remove</button>
            </div>
          ) : (
            <div className="relative">
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="Search contacts..."
                value={contactSearch}
                onChange={(e) => { setContactSearch(e.target.value); void searchContacts(e.target.value); }}
              />
              {contacts.length > 0 && (
                <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-40 overflow-y-auto z-10">
                  {contacts.map((c) => (
                    <button
                      key={c.id}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                      onClick={() => { setSelectedContact(c); setContacts([]); setContactSearch(""); }}
                    >
                      {contactLabel(c)}
                      <span className="text-gray-400 ml-2 text-xs">{c.phone}</span>
                    </button>
                  ))}
                </div>
              )}
              {searching && <p className="text-xs text-gray-400 mt-1">Searching...</p>}
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
          <textarea
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
            rows={2}
            placeholder="Any initial notes..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <div className="flex gap-3 pt-1">
          <button
            onClick={() => void handleSubmit()}
            disabled={!title.trim() || saving}
            className="flex-1 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {saving ? "Creating..." : "Create Deal"}
          </button>
          <button onClick={onClose} className="flex-1 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm type-check
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/deals/AddDealModal.tsx
git commit -m "feat(web): AddDealModal — create deal with title, value, contact, stage, notes"
```

---

## Task 5: DealSlideOver — view and edit deal details

**Files:**
- Create: `apps/web/components/deals/DealSlideOver.tsx`

- [ ] **Step 1: Create DealSlideOver**

Create `apps/web/components/deals/DealSlideOver.tsx`:

```tsx
"use client";
import { JSX, useState, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import type { Deal } from "./DealCard";

interface DealSlideOverProps {
  deal: Deal;
  stages: string[];
  onClose: () => void;
  onUpdated: () => void;
  onDeleted: () => void;
}

export function DealSlideOver({ deal, stages, onClose, onUpdated, onDeleted }: DealSlideOverProps): JSX.Element {
  const { getToken } = useAuth();
  const api = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

  const [title, setTitle] = useState(deal.title);
  const [value, setValue] = useState(deal.value != null ? String(deal.value) : "");
  const [stage, setStage] = useState(deal.stage);
  const [notes, setNotes] = useState(deal.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setTitle(deal.title);
    setValue(deal.value != null ? String(deal.value) : "");
    setStage(deal.stage);
    setNotes(deal.notes ?? "");
  }, [deal]);

  async function handleSave() {
    setSaving(true);
    const token = await getToken();
    await fetch(`${api}/v1/deals/${deal.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        value: value ? parseFloat(value) : null,
        stage,
        notes: notes.trim() || null,
      }),
    });
    setSaving(false);
    onUpdated();
  }

  async function handleDelete() {
    setDeleting(true);
    const token = await getToken();
    await fetch(`${api}/v1/deals/${deal.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token ?? ""}` },
    });
    setDeleting(false);
    onDeleted();
    onClose();
  }

  const contactName = deal.contact
    ? [deal.contact.firstName, deal.contact.lastName].filter(Boolean).join(" ") || deal.contact.phone
    : null;

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full max-w-sm bg-white shadow-2xl z-50 flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-semibold text-gray-900">Deal Details</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {contactName && (
            <p className="text-sm text-gray-500">
              <span className="font-medium text-gray-700">Contact:</span> {contactName}
            </p>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Title</label>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Value</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Stage</label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              value={stage}
              onChange={(e) => setStage(e.target.value)}
            >
              {stages.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
              rows={5}
              placeholder="Add notes about this deal..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

        </div>

        <div className="px-5 py-4 border-t space-y-2">
          <button
            onClick={() => void handleSave()}
            disabled={saving || !title.trim()}
            className="w-full py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
          {confirmDelete ? (
            <div className="flex gap-2">
              <button
                onClick={() => void handleDelete()}
                disabled={deleting}
                className="flex-1 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Yes, Delete"}
              </button>
              <button onClick={() => setConfirmDelete(false)} className="flex-1 py-2 border text-sm rounded-lg hover:bg-gray-50">
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="w-full py-2 border border-red-200 text-red-600 text-sm rounded-lg hover:bg-red-50"
            >
              Delete Deal
            </button>
          )}
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm type-check
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/deals/DealSlideOver.tsx
git commit -m "feat(web): DealSlideOver — view and edit deal details with notes and delete"
```

---

## Task 6: CreatePipelineModal component

**Files:**
- Create: `apps/web/components/deals/CreatePipelineModal.tsx`

- [ ] **Step 1: Create CreatePipelineModal**

Create `apps/web/components/deals/CreatePipelineModal.tsx`:

```tsx
"use client";
import { JSX, useState } from "react";
import { useAuth } from "@clerk/nextjs";

const DEFAULT_STAGES = ["Lead", "Qualified", "Proposal", "Negotiation", "Won", "Lost"];

interface CreatePipelineModalProps {
  onClose: () => void;
  onCreated: () => void;
}

export function CreatePipelineModal({ onClose, onCreated }: CreatePipelineModalProps): JSX.Element {
  const { getToken } = useAuth();
  const api = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

  const [name, setName] = useState("");
  const [stages, setStages] = useState<string[]>(DEFAULT_STAGES);
  const [newStage, setNewStage] = useState("");
  const [saving, setSaving] = useState(false);

  function addStage() {
    const trimmed = newStage.trim();
    if (trimmed && !stages.includes(trimmed)) {
      setStages((prev) => [...prev, trimmed]);
      setNewStage("");
    }
  }

  function removeStage(idx: number) {
    setStages((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleCreate() {
    if (!name.trim() || stages.length === 0) return;
    setSaving(true);
    const token = await getToken();
    await fetch(`${api}/v1/pipelines`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), stages }),
    });
    setSaving(false);
    onCreated();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">Create Pipeline</h2>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Pipeline name *</label>
          <input
            autoFocus
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            placeholder="e.g. Sales, Renewals, Partnerships"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-2">Stages</label>
          <div className="flex flex-wrap gap-2 mb-2">
            {stages.map((s, idx) => (
              <span key={idx} className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded-full">
                {s}
                <button onClick={() => removeStage(idx)} className="text-gray-400 hover:text-gray-600 leading-none">&times;</button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="Add a stage..."
              value={newStage}
              onChange={(e) => setNewStage(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addStage()}
            />
            <button onClick={addStage} className="px-3 py-1.5 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">
              Add
            </button>
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          <button
            onClick={() => void handleCreate()}
            disabled={!name.trim() || stages.length === 0 || saving}
            className="flex-1 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {saving ? "Creating..." : "Create Pipeline"}
          </button>
          <button onClick={onClose} className="flex-1 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm type-check
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/deals/CreatePipelineModal.tsx
git commit -m "feat(web): CreatePipelineModal with customizable stages"
```

---

## Task 7: Upgrade KanbanBoard — column totals + Add Deal per column

**Files:**
- Modify: `apps/web/components/deals/KanbanBoard.tsx`

- [ ] **Step 1: Rewrite KanbanBoard**

Replace the entire content of `apps/web/components/deals/KanbanBoard.tsx`:

```tsx
"use client";

import { JSX, useState, useEffect } from "react";
import {
  DndContext,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useAuth } from "@clerk/nextjs";
import { DealCard, type Deal } from "./DealCard";
import { AddDealModal } from "./AddDealModal";

interface KanbanBoardProps {
  deals: Deal[];
  stages: string[];
  pipelineId: string;
  onMutated: () => void;
}

export function KanbanBoard({ deals: initialDeals, stages, pipelineId, onMutated }: KanbanBoardProps): JSX.Element {
  const [deals, setDeals] = useState<Deal[]>(initialDeals);
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null);
  const [addStage, setAddStage] = useState<string | null>(null);
  const { getToken } = useAuth();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  // Sync local deals when parent React Query refetch delivers new data
  useEffect(() => { setDeals(initialDeals); }, [initialDeals]);

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
    onMutated();
  }

  function stageDeals(stage: string) {
    return deals.filter((d) => d.stage === stage);
  }

  function stageValue(stage: string): number {
    return stageDeals(stage).reduce((sum, d) => sum + (d.value != null ? Number(d.value) : 0), 0);
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        onDragEnd={(e: DragEndEvent) => { void handleDragEnd(e); }}
        onDragStart={({ active }: DragStartEvent) =>
          setActiveDeal(deals.find((d) => d.id === active.id) ?? null)
        }
      >
        <div className="flex gap-4 overflow-x-auto pb-6">
          {stages.map((stage) => {
            const stageDealList = stageDeals(stage);
            const total = stageValue(stage);
            const formattedTotal = total > 0
              ? total.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })
              : null;

            return (
              <div
                key={stage}
                id={stage}
                className="flex flex-col gap-3 min-w-60 w-60 flex-shrink-0"
              >
                <div className="flex items-start justify-between px-1">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 capitalize">{stage}</h3>
                    {formattedTotal && (
                      <p className="text-xs text-gray-400 mt-0.5">{formattedTotal}</p>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5 mt-0.5">
                    {stageDealList.length}
                  </span>
                </div>
                <div className="flex flex-col gap-2 min-h-20 bg-gray-50 rounded-xl p-2 border border-gray-200">
                  <SortableContext
                    items={stageDealList.map((d) => d.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {stageDealList.map((deal) => (
                      <DealCard key={deal.id} deal={deal} />
                    ))}
                  </SortableContext>
                  <button
                    onClick={() => setAddStage(stage)}
                    className="text-xs text-gray-400 hover:text-gray-600 py-1.5 border border-dashed border-gray-300 rounded-lg hover:border-gray-400 hover:bg-white transition-colors"
                  >
                    + Add deal
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <DragOverlay>{activeDeal ? <DealCard deal={activeDeal} /> : null}</DragOverlay>
      </DndContext>

      {addStage && (
        <AddDealModal
          pipelineId={pipelineId}
          stages={stages}
          defaultStage={addStage}
          onClose={() => setAddStage(null)}
          onCreated={() => { setAddStage(null); onMutated(); }}
        />
      )}
    </>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm type-check
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/deals/KanbanBoard.tsx
git commit -m "feat(web): KanbanBoard — column value totals, add-deal-per-column button, onMutated callback"
```

---

## Task 8: Deals page — client with React Query, pipeline tabs, slide-over

**Files:**
- Modify: `apps/web/app/(dashboard)/deals/page.tsx`

- [ ] **Step 1: Rewrite the Deals page as a client component**

Replace the entire content of `apps/web/app/(dashboard)/deals/page.tsx`:

```tsx
"use client";
import { JSX, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/nextjs";
import { KanbanBoard } from "@/components/deals/KanbanBoard";
import { DealSlideOver } from "@/components/deals/DealSlideOver";
import { CreatePipelineModal } from "@/components/deals/CreatePipelineModal";
import { AddDealModal } from "@/components/deals/AddDealModal";
import type { Deal } from "@/components/deals/DealCard";

interface Pipeline {
  id: string;
  name: string;
  stages: string[];
}

export default function DealsPage(): JSX.Element {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const api = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

  const [activePipelineId, setActivePipelineId] = useState<string | null>(null);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [showAddDeal, setShowAddDeal] = useState(false);
  const [showCreatePipeline, setShowCreatePipeline] = useState(false);

  async function authFetch(url: string) {
    const token = await getToken();
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token ?? ""}` } });
    return res.json();
  }

  const { data: pipelinesData } = useQuery<{ data: Pipeline[] }>({
    queryKey: ["pipelines"],
    queryFn: () => authFetch(`${api}/v1/pipelines`),
  });

  const pipelines = pipelinesData?.data ?? [];
  const pipeline = pipelines.find((p) => p.id === activePipelineId) ?? pipelines[0] ?? null;

  const { data: dealsData } = useQuery<{ data: Deal[] }>({
    queryKey: ["deals", pipeline?.id],
    queryFn: () => authFetch(`${api}/v1/deals?pipelineId=${pipeline?.id ?? ""}`),
    enabled: !!pipeline,
  });

  const deals = dealsData?.data ?? [];

  const stages = Array.isArray(pipeline?.stages)
    ? (pipeline.stages as string[])
    : ["Lead", "Qualified", "Proposal", "Negotiation", "Won", "Lost"];

  function invalidate() {
    void qc.invalidateQueries({ queryKey: ["deals"] });
  }

  if (pipelines.length === 0) {
    return (
      <div className="p-8 space-y-4">
        <h1 className="text-2xl font-semibold text-gray-900">Deals</h1>
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center shadow-sm">
          <div className="text-4xl mb-3">📋</div>
          <p className="text-gray-600 font-medium mb-1">No pipeline yet</p>
          <p className="text-sm text-gray-400 mb-5">Create a pipeline to start tracking your deals through stages.</p>
          <button
            onClick={() => setShowCreatePipeline(true)}
            className="px-5 py-2.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700"
          >
            Create Pipeline
          </button>
        </div>
        {showCreatePipeline && (
          <CreatePipelineModal
            onClose={() => setShowCreatePipeline(false)}
            onCreated={() => void qc.invalidateQueries({ queryKey: ["pipelines"] })}
          />
        )}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Deals</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowCreatePipeline(true)}
            className="px-3 py-1.5 border border-gray-300 text-sm rounded-lg hover:bg-gray-50 text-gray-600"
          >
            + Pipeline
          </button>
          {pipeline && (
            <button
              onClick={() => setShowAddDeal(true)}
              className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700"
            >
              Add Deal
            </button>
          )}
        </div>
      </div>

      {/* Pipeline tabs */}
      {pipelines.length > 1 && (
        <div className="flex gap-1 border-b border-gray-200">
          {pipelines.map((p) => (
            <button
              key={p.id}
              onClick={() => setActivePipelineId(p.id)}
              className={[
                "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                (pipeline?.id === p.id)
                  ? "border-green-600 text-green-600"
                  : "border-transparent text-gray-500 hover:text-gray-700",
              ].join(" ")}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}

      {/* Kanban board */}
      {pipeline && (
        <KanbanBoard
          deals={deals}
          stages={stages}
          pipelineId={pipeline.id}
          onMutated={invalidate}
        />
      )}

      {/* Modals */}
      {showAddDeal && pipeline && (
        <AddDealModal
          pipelineId={pipeline.id}
          stages={stages}
          onClose={() => setShowAddDeal(false)}
          onCreated={() => { setShowAddDeal(false); invalidate(); }}
        />
      )}

      {showCreatePipeline && (
        <CreatePipelineModal
          onClose={() => setShowCreatePipeline(false)}
          onCreated={() => void qc.invalidateQueries({ queryKey: ["pipelines"] })}
        />
      )}

      {selectedDeal && pipeline && (
        <DealSlideOver
          deal={selectedDeal}
          stages={stages}
          onClose={() => setSelectedDeal(null)}
          onUpdated={() => { setSelectedDeal(null); invalidate(); }}
          onDeleted={() => { setSelectedDeal(null); invalidate(); }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire DealCard onClick to slide-over in KanbanBoard**

The KanbanBoard needs to accept an `onDealClick` prop and pass it to DealCard. Open `apps/web/components/deals/KanbanBoard.tsx` and add `onDealClick` to props:

```tsx
interface KanbanBoardProps {
  deals: Deal[];
  stages: string[];
  pipelineId: string;
  onMutated: () => void;
  onDealClick?: (deal: Deal) => void;
}
```

Then pass it to each DealCard:

```tsx
{stageDealList.map((deal) => (
  <DealCard key={deal.id} deal={deal} onClick={onDealClick} />
))}
```

And in the DragOverlay:

```tsx
<DragOverlay>{activeDeal ? <DealCard deal={activeDeal} /> : null}</DragOverlay>
```

Then in `apps/web/app/(dashboard)/deals/page.tsx`, pass the prop:

```tsx
<KanbanBoard
  deals={deals}
  stages={stages}
  pipelineId={pipeline.id}
  onMutated={invalidate}
  onDealClick={(deal) => setSelectedDeal(deal)}
/>
```

- [ ] **Step 3: Type-check**

```bash
pnpm type-check
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/\(dashboard\)/deals/page.tsx apps/web/components/deals/KanbanBoard.tsx
git commit -m "feat(web): deals page — React Query, pipeline tabs, add deal, slide-over"
```

---

## Task 9: Contact profile — linked deals section

**Files:**
- Modify: `apps/web/app/(dashboard)/contacts/[id]/page.tsx`

- [ ] **Step 1: Check the current contact detail page structure**

Read `apps/web/app/(dashboard)/contacts/[id]/page.tsx` to understand whether it is a server or client component, and where to add the deals section. Look for where the main content sections end.

- [ ] **Step 2: Add a DealsSection client component inline**

If the contact page is a server component, add a new `"use client"` section component. If it's already a client component, add the deals query directly.

In the contact detail page, add this import at the top:

```tsx
import { ContactDeals } from "@/components/deals/ContactDeals";
```

Then add at the bottom of the contact detail content (after notes, before the closing tags):

```tsx
<ContactDeals contactId={params.id} />
```

- [ ] **Step 3: Create ContactDeals component**

Create `apps/web/components/deals/ContactDeals.tsx`:

```tsx
"use client";
import { JSX } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import type { Deal } from "./DealCard";

interface ContactDealsProps {
  contactId: string;
}

export function ContactDeals({ contactId }: ContactDealsProps): JSX.Element {
  const { getToken } = useAuth();
  const api = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

  const { data } = useQuery<{ data: Deal[] }>({
    queryKey: ["deals", "contact", contactId],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${api}/v1/deals?contactId=${contactId}`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      return res.json() as Promise<{ data: Deal[] }>;
    },
  });

  const deals = data?.data ?? [];

  if (deals.length === 0) {
    return (
      <section className="mt-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Deals</h2>
        <p className="text-sm text-gray-400">No deals linked to this contact.</p>
      </section>
    );
  }

  return (
    <section className="mt-6">
      <h2 className="text-sm font-semibold text-gray-700 mb-3">Deals ({deals.length})</h2>
      <div className="space-y-2">
        {deals.map((deal) => (
          <div key={deal.id} className="flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2.5 bg-white">
            <div>
              <p className="text-sm font-medium text-gray-900">{deal.title}</p>
              <p className="text-xs text-gray-400 capitalize mt-0.5">{deal.stage}</p>
            </div>
            {deal.value != null && (
              <p className="text-sm font-semibold text-emerald-600">
                {Number(deal.value).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Type-check**

```bash
pnpm type-check
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/deals/ContactDeals.tsx apps/web/app/\(dashboard\)/contacts/
git commit -m "feat(web): linked deals section on contact profile"
```

---

## Task 10: Full test run + lint

- [ ] **Step 1: Run all API tests**

```bash
pnpm --filter @WBMSG/api test
```

Expected: all existing tests pass

- [ ] **Step 2: Full type-check**

```bash
pnpm type-check
```

Expected: no errors (pre-existing mobile notification error is allowed)

- [ ] **Step 3: Lint**

```bash
pnpm lint
```

Expected: no new errors

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(deals): full Deals Kanban — pipeline tabs, add/edit/delete deals, notes, contact linking, contact profile section"
```

---

## Acceptance Criteria

- [ ] Deals page loads with React Query (no more SSR-only)
- [ ] Multiple pipelines shown as tabs; clicking a tab switches the board
- [ ] "Create Pipeline" modal opens, lets you name the pipeline and customize stages
- [ ] "Add Deal" button (header) and "+ Add deal" per column both open the Add Deal modal
- [ ] Add Deal modal: title, value (no ₹), stage selector, contact search, notes field
- [ ] Drag-drop between columns updates stage via PATCH /deals/:id/stage
- [ ] Column header shows deal count + total value (locale-formatted, no hardcoded currency symbol)
- [ ] Clicking a deal card opens DealSlideOver with title, value, stage, notes (editable)
- [ ] DealSlideOver save → PATCH /deals/:id; delete → DELETE /deals/:id with confirm step
- [ ] Contact profile page shows linked deals section (empty state or list of deal cards)
- [ ] No `₹` anywhere in the deals UI
