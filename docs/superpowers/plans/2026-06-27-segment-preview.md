# Segment Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Preview" button to the New Segment and Edit Segment pages that evaluates filters and shows matching contacts without creating or modifying any segment record.

**Architecture:** A new read-only `POST /v1/segments/preview` API endpoint accepts filters and calls the existing `evaluateSegment()` lib function (no DB writes). Both segment pages call this endpoint and render results into an existing-style contacts table.

**Tech Stack:** Fastify 4, Vitest, Next.js 15 App Router, React 18, TypeScript strict, TanStack Query not used (pages use raw fetch like the existing segment pages).

## Global Constraints

- TypeScript strict — no `any`, no implicit returns
- ESM `.js` extensions on all API imports
- No `console.log` — use Fastify logger if needed (not needed here)
- Named exports only in `packages/shared/`
- All API routes must be org-scoped via `request.auth.organizationId`
- `Button` variant for secondary actions: `variant="secondary"`
- Run `pnpm --filter @WBMSG/api test` to run API tests; `pnpm --filter @WBMSG/web type-check` for web type check

---

## File Map

| File | Change |
|---|---|
| `apps/api/src/routes/segments.ts` | Add `POST /v1/segments/preview` route |
| `apps/api/src/routes/segments.test.ts` | Add tests for the new route |
| `apps/web/app/(dashboard)/contacts/segments/[id]/page.tsx` | Add Preview button + `handlePreview()` |
| `apps/web/app/(dashboard)/contacts/segments/new/page.tsx` | Add Preview button + `handlePreview()` + contacts table |

---

## Task 1: API — `POST /v1/segments/preview` endpoint

**Files:**
- Modify: `apps/api/src/routes/segments.ts`
- Test: `apps/api/src/routes/segments.test.ts`

**Interfaces:**
- Consumes: `evaluateSegment(prisma, organizationId, filters, match, whatsappOptedOnly)` — already imported
- Produces: `POST /v1/segments/preview` → `{ data: { count: number; contacts: ContactPreview[] } }`

- [ ] **Step 1: Write failing tests**

Add this describe block at the bottom of `apps/api/src/routes/segments.test.ts`:

```typescript
describe("POST /v1/segments/preview", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns count and contacts without touching segment records", async () => {
    mockPrisma.contact.findMany.mockResolvedValue([
      { id: "c-1", firstName: "Alice", lastName: "Smith", phoneNumber: "+1234567890", leadStatus: null },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/v1/segments/preview",
      payload: { filters: [], match: "all", whatsappOptedOnly: false },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: { count: number; contacts: unknown[] } }>();
    expect(body.data.count).toBe(1);
    expect(body.data.contacts).toHaveLength(1);
    expect(mockPrisma.segment.create).not.toHaveBeenCalled();
    expect(mockPrisma.segment.update).not.toHaveBeenCalled();
  });

  it("defaults filters to [] and match to all when body is empty", async () => {
    mockPrisma.contact.findMany.mockResolvedValue([]);
    const res = await app.inject({
      method: "POST",
      url: "/v1/segments/preview",
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: { count: number } }>().data.count).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @WBMSG/api test -- --reporter=verbose segments
```

Expected: 2 new tests FAIL with `404` (route not registered yet).

- [ ] **Step 3: Add the route**

In `apps/api/src/routes/segments.ts`, add the following block **before** the `fastify.get<{ Params: { id: SegmentId } }>("/segments/:id"` route (insert after the closing `});` of `POST /segments` around line 60):

```typescript
  fastify.post<{ Body: { filters?: FilterRule[]; match?: MatchMode; whatsappOptedOnly?: boolean } }>(
    "/segments/preview",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const filters = request.body.filters ?? [];
      const match = request.body.match ?? "all";
      const whatsappOptedOnly = request.body.whatsappOptedOnly ?? false;
      const result = await evaluateSegment(fastify.prisma, organizationId, filters, match, whatsappOptedOnly);
      return reply.send({ data: result });
    },
  );
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @WBMSG/api test -- --reporter=verbose segments
```

Expected: all tests in the segments suite PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/segments.ts apps/api/src/routes/segments.test.ts
git commit -m "feat(segments): add POST /v1/segments/preview read-only endpoint"
```

---

## Task 2: Edit Segment page — Preview button

**Files:**
- Modify: `apps/web/app/(dashboard)/contacts/segments/[id]/page.tsx`

**Interfaces:**
- Consumes: `POST /v1/segments/preview` from Task 1
- Produces: Preview button populates existing `matchCount` and `contacts` state (already rendered by the contacts table below)

- [ ] **Step 1: Add `previewing` state**

In `apps/web/app/(dashboard)/contacts/segments/[id]/page.tsx`, the existing state block (around line 33) currently has:

```typescript
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
```

Change it to:

```typescript
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [loading, setLoading] = useState(true);
```

- [ ] **Step 2: Add `handlePreview()` function**

In the same file, after the closing `}` of `handleSave()` (around line 84), add:

```typescript
  async function handlePreview(): Promise<void> {
    setPreviewing(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/segments/preview`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({ filters, match, whatsappOptedOnly }),
      });
      if (res.ok) {
        const result = (await res.json() as { data: { count: number; contacts: ContactPreview[] } }).data;
        setMatchCount(result.count);
        setContacts(result.contacts);
      }
    } finally {
      setPreviewing(false);
    }
  }
```

- [ ] **Step 3: Add Preview button to the button row**

Find this block (around line 105):

```tsx
        <div className="flex items-center gap-3 pt-2">
          <Button onClick={() => { void handleSave(); }} disabled={saving}>
            {saving ? "Saving…" : "Save Segment"}
          </Button>
          {matchCount !== null && (
```

Replace with:

```tsx
        <div className="flex items-center gap-3 pt-2">
          <Button variant="secondary" onClick={() => { void handlePreview(); }} disabled={previewing || saving}>
            {previewing ? "Previewing…" : "Preview"}
          </Button>
          <Button onClick={() => { void handleSave(); }} disabled={saving || previewing}>
            {saving ? "Saving…" : "Save Segment"}
          </Button>
          {matchCount !== null && (
```

- [ ] **Step 4: Type-check**

```bash
pnpm --filter @WBMSG/web type-check
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(dashboard)/contacts/segments/[id]/page.tsx"
git commit -m "feat(segments): add Preview button to edit segment page"
```

---

## Task 3: New Segment page — Preview button + contacts table

**Files:**
- Modify: `apps/web/app/(dashboard)/contacts/segments/new/page.tsx`

**Interfaces:**
- Consumes: `POST /v1/segments/preview` from Task 1
- Produces: contacts table rendered below the builder card when preview has been run

- [ ] **Step 1: Add imports**

In `apps/web/app/(dashboard)/contacts/segments/new/page.tsx`, the existing imports are:

```typescript
import { JSX, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SegmentBuilderV2 } from "@/components/segments/SegmentBuilderV2";
import type { FilterRule, MatchMode } from "@/components/segments/types";
import { Button } from "@/components/ui/Button";
```

They are already correct — `Link` is already imported and will be used for the contacts table.

- [ ] **Step 2: Add ContactPreview type and new state**

After the `const API_URL = ...` line, add the interface:

```typescript
interface ContactPreview {
  id: string;
  firstName: string | null;
  lastName: string | null;
  phoneNumber: string;
  leadStatus: { name: string; color: string } | null;
}
```

In the component body, the existing state block is:

```typescript
  const [name, setName] = useState("");
  const [filters, setFilters] = useState<FilterRule[]>([]);
  const [match, setMatch] = useState<MatchMode>("all");
  const [whatsappOptedOnly, setWhatsappOptedOnly] = useState(false);
  const [saving, setSaving] = useState(false);
```

Change it to:

```typescript
  const [name, setName] = useState("");
  const [filters, setFilters] = useState<FilterRule[]>([]);
  const [match, setMatch] = useState<MatchMode>("all");
  const [whatsappOptedOnly, setWhatsappOptedOnly] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewContacts, setPreviewContacts] = useState<ContactPreview[]>([]);
```

- [ ] **Step 3: Add `handlePreview()` function**

After the closing `}` of `handleSave()` (around line 39), add:

```typescript
  async function handlePreview(): Promise<void> {
    setPreviewing(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/segments/preview`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({ filters, match, whatsappOptedOnly }),
      });
      if (res.ok) {
        const result = (await res.json() as { data: { count: number; contacts: ContactPreview[] } }).data;
        setPreviewCount(result.count);
        setPreviewContacts(result.contacts);
      }
    } finally {
      setPreviewing(false);
    }
  }
```

- [ ] **Step 4: Add Preview button to the button row**

Find this block (around line 69):

```tsx
        <div className="flex items-center gap-3 pt-2">
          <Button onClick={() => { void handleSave(); }} disabled={!name.trim() || saving}>
            {saving ? "Saving…" : "Save Segment"}
          </Button>
        </div>
```

Replace with:

```tsx
        <div className="flex items-center gap-3 pt-2">
          <Button variant="secondary" onClick={() => { void handlePreview(); }} disabled={previewing || filters.length === 0}>
            {previewing ? "Previewing…" : "Preview"}
          </Button>
          <Button onClick={() => { void handleSave(); }} disabled={!name.trim() || saving}>
            {saving ? "Saving…" : "Save Segment"}
          </Button>
        </div>
```

- [ ] **Step 5: Add contacts table below the builder card**

The JSX currently ends with:

```tsx
    </div>
  );
}
```

Before the final closing `</div>`, add the contacts table after the builder card's closing `</div>`:

```tsx
      </div>

      {previewCount !== null && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="font-medium text-gray-800">
              Matching Contacts ({previewCount})
            </h2>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Name</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Phone</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {previewContacts.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-gray-400">
                    No contacts match these filters.
                  </td>
                </tr>
              ) : previewContacts.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <Link href={`/contacts/${c.id}`} className="font-medium text-gray-900 hover:text-brand-600">
                      {[c.firstName, c.lastName].filter(Boolean).join(" ") || "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-gray-600">{c.phoneNumber}</td>
                  <td className="px-4 py-2">
                    {c.leadStatus ? (
                      <span className="inline-flex items-center gap-1.5 text-sm text-gray-700">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.leadStatus.color }} />
                        {c.leadStatus.name}
                      </span>
                    ) : <span className="text-gray-400">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Type-check**

```bash
pnpm --filter @WBMSG/web type-check
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add "apps/web/app/(dashboard)/contacts/segments/new/page.tsx"
git commit -m "feat(segments): add Preview button and contacts table to new segment page"
```
