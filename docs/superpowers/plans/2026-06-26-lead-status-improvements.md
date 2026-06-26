# Lead Status Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close three gaps vs Interakt's lead status feature — graceful status deletion (cascade contacts to null), a pipeline/Kanban view toggled on the contacts page, and name validation with an expanded colour palette.

**Architecture:** API changes are isolated to `lead-statuses.ts`; UI changes span the settings tab (delete dialog + validation + swatches) and three new pipeline components wired into `ContactsClient` via a localStorage-persisted view toggle. The pipeline reuses the existing `/contacts` endpoint — no new API routes.

**Tech Stack:** Fastify 4 + Prisma 7 (API); Next.js 15 App Router, React 18, TanStack Query v5, `@dnd-kit/core` (already installed) (Web); Vitest (tests).

## Global Constraints

- Org-scope every Prisma query — `organizationId` must appear in every `where` clause.
- API is ESM-only — use `.js` extensions on all imports even for `.ts` source files.
- No `console.log` in production — use Fastify request logger or pino.
- TypeScript strict mode — no `any`, no implicit returns.
- Named exports only — no default exports in `packages/shared/`.
- Run `pnpm --filter @WBMSG/api test` and `pnpm lint` before committing API changes.
- The existing blocks on `defaultLeadStatusId` config and flow `update_stage` references in the DELETE handler are intentionally kept — do not remove them.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `apps/api/src/routes/lead-statuses.ts` | Modify | DELETE cascade; POST+PATCH name validation |
| `apps/api/src/routes/lead-statuses.test.ts` | Modify | Update DELETE tests; add INVALID_NAME tests |
| `apps/web/app/(dashboard)/settings/contact-settings/tabs/LeadStatusesTab.tsx` | Modify | Delete confirmation dialog |
| `apps/web/app/(dashboard)/settings/contact-settings/tabs/StatusSlideOver.tsx` | Modify | Inline name validation; expand to 10 swatches |
| `apps/web/components/contacts/PipelineCard.tsx` | Create | Draggable contact card for pipeline |
| `apps/web/components/contacts/PipelineColumn.tsx` | Create | Per-column infinite-scroll contact fetch |
| `apps/web/components/contacts/PipelineView.tsx` | Create | Board container with DnD context |
| `apps/web/components/contacts/ContactsClient.tsx` | Modify | List/Pipeline toggle + render PipelineView |

---

## Task 1: API — Graceful Deletion + Name Validation

**Files:**
- Modify: `apps/api/src/routes/lead-statuses.ts`
- Modify: `apps/api/src/routes/lead-statuses.test.ts`

**Interfaces:**
- Produces: `DELETE /v1/lead-statuses/:id` — now cascades contacts to `leadStatusId: null` instead of returning 409 when contacts exist. `POST` and `PATCH` return `400 INVALID_NAME` when name contains characters outside `[a-zA-Z0-9 \-_]`.

---

- [ ] **Step 1: Update the mock object and rewrite the DELETE cascade test**

Open `apps/api/src/routes/lead-statuses.test.ts`.

Add `updateMany: vi.fn()` to the `contact` mock and `mockImplementation` helper for `$transaction`. Replace the two existing DELETE-success/contacts tests with the single cascade test below. The other DELETE tests (403, 404, config-409, flow-409) are unchanged.

```ts
// At the top of the file, update mockPrisma:
const mockPrisma = {
  leadStatus: { findMany: vi.fn(), create: vi.fn(), findFirst: vi.fn(), update: vi.fn(), delete: vi.fn(), aggregate: vi.fn() },
  contact: { count: vi.fn(), updateMany: vi.fn() },
  organization: { findUnique: vi.fn() },
  $queryRaw: vi.fn(),
  $transaction: vi.fn(),
};
```

Remove these two tests entirely:
- `"DELETE returns 409 when contacts reference the status"`
- `"DELETE returns 204 when no contacts reference the status"`

Replace with:

```ts
it("DELETE cascades contacts to null and deletes the status", async () => {
  mockPrisma.leadStatus.findFirst.mockResolvedValue({ id: "s1", organizationId: "org-1" });
  mockPrisma.$transaction.mockImplementation(
    async (fn: (tx: typeof mockPrisma) => Promise<void>) => fn(mockPrisma)
  );
  mockPrisma.contact.updateMany.mockResolvedValue({ count: 3 });
  mockPrisma.leadStatus.delete.mockResolvedValue({ id: "s1" });

  const res = await app.inject({ method: "DELETE", url: "/v1/lead-statuses/s1" });

  expect(res.statusCode).toBe(204);
  expect(mockPrisma.contact.updateMany).toHaveBeenCalledWith({
    where: { organizationId: "org-1", leadStatusId: "s1" },
    data: { leadStatusId: null },
  });
  expect(mockPrisma.leadStatus.delete).toHaveBeenCalledWith({ where: { id: "s1" } });
});
```

- [ ] **Step 2: Add the INVALID_NAME tests for POST and PATCH**

Append these two tests to the `describe` block in `lead-statuses.test.ts`:

```ts
it("POST returns 400 INVALID_NAME when name contains special characters", async () => {
  const res = await app.inject({
    method: "POST",
    url: "/v1/lead-statuses",
    payload: { name: "New@Lead!", color: "#3B82F6" },
  });
  expect(res.statusCode).toBe(400);
  expect(res.json<{ error: { code: string } }>().error.code).toBe("INVALID_NAME");
  expect(mockPrisma.leadStatus.create).not.toHaveBeenCalled();
});

it("PATCH /:id returns 400 INVALID_NAME when name contains special characters", async () => {
  mockPrisma.leadStatus.findFirst.mockResolvedValue({ id: "s1", organizationId: "org-1", name: "Old", color: "#000" });
  const res = await app.inject({
    method: "PATCH",
    url: "/v1/lead-statuses/s1",
    payload: { name: "Bad#Name" },
  });
  expect(res.statusCode).toBe(400);
  expect(res.json<{ error: { code: string } }>().error.code).toBe("INVALID_NAME");
  expect(mockPrisma.leadStatus.update).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Run the tests — expect failures**

```bash
pnpm --filter @WBMSG/api test --reporter=verbose src/routes/lead-statuses.test.ts
```

Expected: 3 failures — the cascade test and both INVALID_NAME tests. All other tests pass. If more than 3 fail, stop and investigate.

- [ ] **Step 4: Implement the DELETE cascade in `lead-statuses.ts`**

Open `apps/api/src/routes/lead-statuses.ts`.

Add the name-validation constant near the top (after the imports):

```ts
const NAME_RE = /[^a-zA-Z0-9 \-_]/;
```

In the DELETE handler, remove lines 100–103 (the `inUse` count + 409 block):

```ts
// DELETE these lines:
const inUse = await fastify.prisma.contact.count({ where: { organizationId, leadStatusId: id } });
if (inUse > 0) {
  return reply.status(409).send({ error: { code: "STATUS_IN_USE", message: "This status is assigned to contacts — reassign them before deleting." } });
}
```

Replace `await fastify.prisma.leadStatus.delete({ where: { id } });` and its surrounding `return` with:

```ts
await fastify.prisma.$transaction(async (tx) => {
  await tx.contact.updateMany({ where: { organizationId, leadStatusId: id }, data: { leadStatusId: null } });
  await tx.leadStatus.delete({ where: { id } });
});
return reply.status(204).send();
```

- [ ] **Step 5: Implement name validation in POST and PATCH**

In the POST handler, after the `name`/`color` empty check and before the `aggregate` call, add:

```ts
if (NAME_RE.test(name.trim())) {
  return reply.status(400).send({ error: { code: "INVALID_NAME", message: "Status names may only contain letters, numbers, spaces, hyphens, and underscores" } });
}
```

In the PATCH handler, after extracting `{ name, color, isClosure }` from `request.body`, add:

```ts
if (name !== undefined && NAME_RE.test(name.trim())) {
  return reply.status(400).send({ error: { code: "INVALID_NAME", message: "Status names may only contain letters, numbers, spaces, hyphens, and underscores" } });
}
```

- [ ] **Step 6: Run all tests — expect all to pass**

```bash
pnpm --filter @WBMSG/api test --reporter=verbose src/routes/lead-statuses.test.ts
```

Expected: all tests pass. Then run the full suite:

```bash
pnpm --filter @WBMSG/api test
```

Expected: no regressions.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/lead-statuses.ts apps/api/src/routes/lead-statuses.test.ts
git commit -m "feat(lead-status): cascade contacts to null on delete; add name validation"
```

---

## Task 2: Settings UI — Delete Confirmation Dialog + Validation + Swatches

**Files:**
- Modify: `apps/web/app/(dashboard)/settings/contact-settings/tabs/LeadStatusesTab.tsx`
- Modify: `apps/web/app/(dashboard)/settings/contact-settings/tabs/StatusSlideOver.tsx`

**Interfaces:**
- Consumes: Task 1's updated `DELETE /v1/lead-statuses/:id` — no longer returns 409 for contacts-in-use, so the `onError` handler in the remove mutation only needs to surface config/flow blocking errors.
- Produces: confirmation dialog before deletion; inline name error in the slide-over; 10-colour swatch grid.

---

- [ ] **Step 1: Add delete confirmation dialog to `LeadStatusesTab.tsx`**

Open `apps/web/app/(dashboard)/settings/contact-settings/tabs/LeadStatusesTab.tsx`.

Add `deleteTarget` state alongside the existing `editing` state:

```ts
const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
```

Update `SortableStatusRow`'s `onDelete` call — change from:
```ts
onDelete={() => remove.mutate(s.id)}
```
to:
```ts
onDelete={() => { setError(null); setDeleteTarget({ id: s.id, name: s.name }); }}
```

Update the `remove` mutation's `onSuccess` to also clear `deleteTarget`:
```ts
onSuccess: () => { setError(null); setDeleteTarget(null); void qc.invalidateQueries({ queryKey: ["lead-statuses"] }); },
```

Add the confirmation dialog just before the closing `</div>` of the component's return:

```tsx
{deleteTarget && (
  <div className="fixed inset-0 z-50 flex items-center justify-center">
    <div className="absolute inset-0 bg-black/40" onClick={() => setDeleteTarget(null)} />
    <div className="relative bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4">
      <h3 className="text-base font-semibold text-gray-900 mb-2">
        Delete &ldquo;{deleteTarget.name}&rdquo;?
      </h3>
      <p className="text-sm text-gray-500 mb-5">
        Contacts using this status will be moved to Unassigned.
      </p>
      <div className="flex gap-3 justify-end">
        <button
          onClick={() => setDeleteTarget(null)}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={() => { remove.mutate(deleteTarget.id); }}
          disabled={remove.isPending}
          className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
        >
          {remove.isPending ? "Deleting…" : "Delete"}
        </button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 2: Expand swatches and add inline name validation to `StatusSlideOver.tsx`**

Open `apps/web/app/(dashboard)/settings/contact-settings/tabs/StatusSlideOver.tsx`.

Replace the `SWATCHES` constant:

```ts
const SWATCHES = [
  "#3B82F6", // blue
  "#22C55E", // green
  "#10B981", // emerald
  "#14B8A6", // teal
  "#8B5CF6", // violet
  "#EC4899", // pink
  "#F97316", // orange
  "#EF4444", // red
  "#FACC15", // yellow
  "#64748B", // slate
] as const;

const NAME_RE = /[^a-zA-Z0-9 \-_]/;
```

Add `nameError` state alongside `name` and `color`:

```ts
const [nameError, setNameError] = useState<string | null>(null);
```

Replace the `name` input element:

```tsx
<input
  value={name}
  onChange={(e) => {
    setName(e.target.value);
    setNameError(NAME_RE.test(e.target.value) ? "Only letters, numbers, spaces, hyphens, and underscores." : null);
  }}
  placeholder="Enter status name"
  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
/>
{nameError && <p className="text-xs text-red-500 mt-1">{nameError}</p>}
```

Update the Save button's `disabled` condition:

```tsx
disabled={saving || !name.trim() || !!nameError}
```

Update the swatch grid — the `flex` container of 5 buttons becomes a 5-column grid to accommodate 10:

```tsx
<div className="grid grid-cols-5 gap-3">
  {SWATCHES.map((sw) => (
    <button
      key={sw}
      type="button"
      onClick={() => setColor(sw)}
      aria-label={`Select colour ${sw}`}
      className={["w-8 h-8 rounded-full transition-transform", color === sw ? "ring-2 ring-offset-2 ring-gray-400 scale-110" : ""].join(" ")}
      style={{ backgroundColor: sw }}
    />
  ))}
</div>
```

- [ ] **Step 3: Manual verification**

Start the dev server: `pnpm dev`

Navigate to Settings → Contact Settings → Lead Statuses.

Verify:
1. Click Delete on any status → confirmation dialog appears with the status name.
2. Click Cancel → dialog closes, status unchanged.
3. Click Delete → status deleted, contacts page shows affected contacts now have no status.
4. Click Add Status → try typing `New@Lead!` → inline error appears, Save is disabled.
5. Type `New Lead` → error clears, Save becomes enabled.
6. Colour picker shows 10 swatches in a 5×2 grid.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/\(dashboard\)/settings/contact-settings/tabs/LeadStatusesTab.tsx
git add apps/web/app/\(dashboard\)/settings/contact-settings/tabs/StatusSlideOver.tsx
git commit -m "feat(lead-status): delete confirmation dialog; name validation; 10 colour swatches"
```

---

## Task 3: Pipeline Components

**Files:**
- Create: `apps/web/components/contacts/PipelineCard.tsx`
- Create: `apps/web/components/contacts/PipelineColumn.tsx`
- Create: `apps/web/components/contacts/PipelineView.tsx`

**Interfaces:**
- Consumes: `GET /v1/contacts?leadStatusId=X&limit=20` (existing endpoint) — returns `{ data: Contact[], pagination: { has_more: boolean, next_cursor: string | null } }`.
- Consumes: `PATCH /v1/contacts/:id` with body `{ leadStatusId: string }` (existing endpoint).
- Produces: `<PipelineView statuses={LeadStatus[]} filters={{ q?: string }} />` — consumed by Task 4.
- Produces: `LeadStatus` type exported from `PipelineColumn.tsx`.
- Produces: `PipelineContact` type exported from `PipelineCard.tsx`.

---

- [ ] **Step 1: Create `PipelineCard.tsx`**

Create `apps/web/components/contacts/PipelineCard.tsx`:

```tsx
"use client";

import { JSX } from "react";
import { useDraggable } from "@dnd-kit/core";

const AVATAR_PALETTE = [
  "bg-violet-100 text-violet-700",
  "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-cyan-100 text-cyan-700",
  "bg-orange-100 text-orange-700",
  "bg-pink-100 text-pink-700",
];

function avatarColor(seed: string): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) & 0xffff;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length]!;
}

export interface PipelineContact {
  id: string;
  firstName: string | null;
  lastName: string | null;
  phoneNumber: string;
  assignedUser?: { id: string; fullName: string } | null;
}

export function PipelineCard({
  contact,
  statusId,
}: {
  contact: PipelineContact;
  statusId: string;
}): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: contact.id,
    data: { statusId, contact },
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  const name =
    [contact.firstName, contact.lastName].filter(Boolean).join(" ") ||
    contact.phoneNumber.slice(-4);
  const initials = (
    (contact.firstName?.trim()[0] ?? "") + (contact.lastName?.trim()[0] ?? "")
  ).toUpperCase() || contact.phoneNumber.slice(-2);
  const assignedInitials = contact.assignedUser
    ? contact.assignedUser.fullName
        .split(" ")
        .map((w) => w[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={[
        "bg-white rounded-lg border border-gray-200 p-3 cursor-grab select-none",
        isDragging
          ? "opacity-50 shadow-lg"
          : "shadow-sm hover:shadow-md transition-shadow",
      ].join(" ")}
    >
      <div className="flex items-start gap-2.5">
        <div
          className={[
            "w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0",
            avatarColor(contact.id),
          ].join(" ")}
        >
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{name}</p>
          <p className="text-xs text-gray-500 mt-0.5 truncate">{contact.phoneNumber}</p>
        </div>
        {assignedInitials && (
          <div className="w-6 h-6 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center text-[10px] font-semibold shrink-0">
            {assignedInitials}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `PipelineColumn.tsx`**

Create `apps/web/components/contacts/PipelineColumn.tsx`:

```tsx
"use client";

import { JSX } from "react";
import { useAuth } from "@clerk/nextjs";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useDroppable } from "@dnd-kit/core";
import { clientFetch } from "@/lib/client-fetch";
import { PipelineCard, type PipelineContact } from "./PipelineCard";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export interface LeadStatus {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
}

export interface ColumnFilters {
  q?: string;
}

interface ContactsPage {
  data: PipelineContact[];
  pagination: { has_more: boolean; next_cursor: string | null };
}

export function PipelineColumn({
  status,
  filters,
}: {
  status: LeadStatus;
  filters: ColumnFilters;
}): JSX.Element {
  const { getToken } = useAuth();

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useInfiniteQuery<ContactsPage>({
      queryKey: ["pipeline-column", status.id, filters],
      queryFn: async ({ pageParam }) => {
        const token = await getToken();
        const params = new URLSearchParams({ leadStatusId: status.id, limit: "20" });
        if (filters.q) params.set("q", filters.q);
        if (pageParam) params.set("cursor", pageParam as string);
        const res = await clientFetch(
          `${API_URL}/v1/contacts?${params.toString()}`,
          { token: token ?? "", silent: true }
        );
        if (!res.ok) {
          return { data: [], pagination: { has_more: false, next_cursor: null } };
        }
        return res.json() as Promise<ContactsPage>;
      },
      initialPageParam: null as string | null,
      getNextPageParam: (lastPage) => lastPage.pagination.next_cursor ?? undefined,
    });

  const contacts = data?.pages.flatMap((p) => p.data) ?? [];
  const totalLoaded = contacts.length;
  const countLabel = totalLoaded + (hasNextPage ? "+" : "");

  const { setNodeRef, isOver } = useDroppable({ id: status.id });

  return (
    <div className="flex flex-col w-72 shrink-0">
      <div className="flex items-center gap-2 px-1 mb-3">
        <span
          className="w-3 h-3 rounded-full shrink-0"
          style={{ backgroundColor: status.color }}
        />
        <span className="text-sm font-semibold text-gray-800 truncate">{status.name}</span>
        <span className="ml-auto text-xs font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full">
          {countLabel}
        </span>
      </div>

      <div
        ref={setNodeRef}
        className={[
          "flex-1 flex flex-col gap-2 min-h-[120px] rounded-xl p-2 transition-colors",
          isOver
            ? "bg-emerald-50 border-2 border-emerald-300 border-dashed"
            : "bg-gray-100/60",
        ].join(" ")}
      >
        {isLoading ? (
          <p className="text-xs text-gray-400 text-center py-6">Loading…</p>
        ) : contacts.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-6">No contacts</p>
        ) : (
          contacts.map((c) => (
            <PipelineCard key={c.id} contact={c} statusId={status.id} />
          ))
        )}
      </div>

      {hasNextPage && (
        <button
          onClick={() => void fetchNextPage()}
          disabled={isFetchingNextPage}
          className="mt-2 text-xs text-emerald-600 hover:text-emerald-800 font-medium text-center py-1 disabled:opacity-50"
        >
          {isFetchingNextPage ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create `PipelineView.tsx`**

Create `apps/web/components/contacts/PipelineView.tsx`:

```tsx
"use client";

import { JSX, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useAuth } from "@clerk/nextjs";
import { useQueryClient } from "@tanstack/react-query";
import { clientFetch } from "@/lib/client-fetch";
import { PipelineColumn, type LeadStatus, type ColumnFilters } from "./PipelineColumn";
import { PipelineCard, type PipelineContact } from "./PipelineCard";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export function PipelineView({
  statuses,
  filters,
}: {
  statuses: LeadStatus[];
  filters: ColumnFilters;
}): JSX.Element {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const [activeContact, setActiveContact] = useState<PipelineContact | null>(null);
  const [activeStatusId, setActiveStatusId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  function handleDragStart(event: DragStartEvent) {
    const d = event.active.data.current as { statusId: string; contact: PipelineContact };
    setActiveContact(d.contact);
    setActiveStatusId(d.statusId);
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveContact(null);
    setActiveStatusId(null);
    if (!over) return;

    const sourceStatusId = (active.data.current as { statusId: string }).statusId;
    const destStatusId = over.id as string;
    if (sourceStatusId === destStatusId) return;

    const contactId = active.id as string;
    const token = await getToken();
    const res = await clientFetch(`${API_URL}/v1/contacts/${contactId}`, {
      method: "PATCH",
      token: token ?? "",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadStatusId: destStatusId }),
    });
    if (!res.ok) return;

    await Promise.all([
      qc.invalidateQueries({ queryKey: ["pipeline-column", sourceStatusId] }),
      qc.invalidateQueries({ queryKey: ["pipeline-column", destStatusId] }),
    ]);
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={(e) => { void handleDragEnd(e); }}
    >
      <div className="flex gap-4 overflow-x-auto pb-6 px-1 pt-2">
        {statuses.map((status) => (
          <PipelineColumn key={status.id} status={status} filters={filters} />
        ))}
      </div>
      <DragOverlay>
        {activeContact && activeStatusId ? (
          <PipelineCard contact={activeContact} statusId={activeStatusId} />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
```

- [ ] **Step 4: Manual verification of components in isolation**

Start the dev server: `pnpm dev`

Temporarily import and render `<PipelineView>` with hardcoded statuses in the contacts page to verify:
1. Columns render with correct colour dots and status names.
2. Cards show initials avatar, name, phone.
3. Drag a card — ghost appears, card opacity drops.
4. Drop card in a different column — card moves, both columns refresh.
5. "Load more" appears when a column has more than 20 contacts; clicking it appends cards.

Remove the temporary hardcoded render before committing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/contacts/PipelineCard.tsx
git add apps/web/components/contacts/PipelineColumn.tsx
git add apps/web/components/contacts/PipelineView.tsx
git commit -m "feat(pipeline): add PipelineCard, PipelineColumn, PipelineView components"
```

---

## Task 4: View Toggle in ContactsClient

**Files:**
- Modify: `apps/web/components/contacts/ContactsClient.tsx`

**Interfaces:**
- Consumes: `PipelineView` from Task 3 — `<PipelineView statuses={LeadStatus[]} filters={{ q?: string }} />`
- Consumes: `GET /v1/lead-statuses` — `{ data: LeadStatus[] }` ordered by `sortOrder`.
- Consumes: `LeadStatus` type from `./PipelineColumn`.

---

- [ ] **Step 1: Add imports and lead-statuses query to `ContactsClient.tsx`**

Add imports at the top of `apps/web/components/contacts/ContactsClient.tsx`:

```ts
import { PipelineView } from "./PipelineView";
import type { LeadStatus } from "./PipelineColumn";
```

Inside the `ContactsClient` function body, alongside the existing `useQuery` hooks, add:

```ts
const [viewMode, setViewMode] = useState<"list" | "pipeline">(() => {
  if (typeof window === "undefined") return "list";
  return (localStorage.getItem("wbmsg-contacts-view") as "list" | "pipeline") ?? "list";
});

const { data: leadStatuses = [] } = useQuery<LeadStatus[]>({
  queryKey: ["lead-statuses"],
  queryFn: async () => {
    const token = await getToken();
    const res = await clientFetch(`${API_URL}/v1/lead-statuses`, {
      token: token ?? "",
      silent: true,
    });
    if (!res.ok) return [];
    return (await res.json() as { data: LeadStatus[] }).data;
  },
  staleTime: 60_000,
});
```

- [ ] **Step 2: Add the List/Pipeline toggle to the header**

In the JSX, find the header `<div className="flex items-center gap-2 shrink-0">` that wraps the Export / Import / Delete buttons.

Add the toggle as the **first** child of that flex container (before Export):

```tsx
{/* View toggle */}
<div className="flex rounded-lg border border-gray-200 overflow-hidden shadow-sm">
  <button
    onClick={() => { setViewMode("list"); localStorage.setItem("wbmsg-contacts-view", "list"); }}
    className={[
      "h-9 px-3.5 text-sm font-medium transition-colors",
      viewMode === "list"
        ? "bg-emerald-600 text-white"
        : "bg-white text-gray-700 hover:bg-gray-50",
    ].join(" ")}
  >
    List
  </button>
  <button
    onClick={() => { setViewMode("pipeline"); localStorage.setItem("wbmsg-contacts-view", "pipeline"); }}
    className={[
      "h-9 px-3.5 text-sm font-medium border-l border-gray-200 transition-colors",
      viewMode === "pipeline"
        ? "bg-emerald-600 text-white"
        : "bg-white text-gray-700 hover:bg-gray-50",
    ].join(" ")}
  >
    Pipeline
  </button>
</div>
```

- [ ] **Step 3: Conditionally render PipelineView vs the existing list**

In the JSX, find the existing contact table/list section. Wrap it in a conditional:

```tsx
{viewMode === "pipeline" ? (
  <PipelineView
    statuses={leadStatuses}
    filters={{ q: query.trim() || undefined }}
  />
) : (
  /* existing list table JSX — no changes inside */
  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
    {/* ... existing table content unchanged ... */}
  </div>
)}
```

The outer wrapper `<div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">` that currently wraps the table is the exact element to move inside the list branch.

- [ ] **Step 4: Manual verification — full golden path**

Start the dev server: `pnpm dev` and open `/contacts`.

1. **Toggle persists:** Click Pipeline → refresh the page → Pipeline is still selected.
2. **List toggle:** Click List → table reappears.
3. **Filters carry over:** Type a search term, switch to Pipeline → columns only show contacts matching the search.
4. **Empty state:** Org with no lead statuses → Pipeline shows an empty board (no columns).
5. **Drag status change:** Drag a card from one column to another → PATCH fires, contact's lead status updates, card appears in destination column after re-fetch.
6. **Delete status:** Delete a status from Settings → the column disappears from the pipeline on next visit; affected contacts show no status in list view.

- [ ] **Step 5: Run type check and lint**

```bash
pnpm type-check
pnpm lint
```

Expected: no errors. Fix any TypeScript or lint issues before committing.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/contacts/ContactsClient.tsx
git commit -m "feat(pipeline): add List/Pipeline view toggle to contacts page"
```
