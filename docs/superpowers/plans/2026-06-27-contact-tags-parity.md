# Contact Tags — Full Interakt Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close all tag feature gaps vs Interakt — bulk assign, inbox editing, autocomplete, tag rename, contacts filter UI, and deterministic colored tag pills across all surfaces.

**Architecture:** `Contact.tags String[]` stays as the data model; no schema migration. Color is derived client-side by hashing the tag string to an index in a 10-color Tailwind palette (`apps/web/lib/tag-color.ts`). A new shared `TagCombobox` component (search existing + inline create) replaces all free-text tag inputs. Two new API endpoints handle bulk assign and rename.

**Tech Stack:** Fastify 4, Prisma 7, Next.js 15 App Router, React 18, Tailwind CSS, Clerk (`useAuth`), Vitest

## Global Constraints

- All Prisma queries must include `organizationId` — never query cross-org
- API is ESM-only — `.js` extensions on all imports in `.ts` files
- No `console.log` — use Fastify logger (`request.log`) or pino
- TypeScript strict — no `any`, no implicit returns
- Named exports only in `packages/shared/`
- Commits follow `feat(scope):` / `fix(scope):` Conventional Commits format
- `contacts_bulk_tag` permission gates bulk assign; `settings_tags` gates rename and delete

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `apps/web/lib/tag-color.ts` | Create | Deterministic color from tag string |
| `apps/web/lib/tag-color.test.ts` | Create | Unit tests for above |
| `apps/web/components/contacts/TagCombobox.tsx` | Create | Shared tag input with autocomplete + inline create |
| `apps/api/src/routes/contacts.ts` | Modify | Add `POST /v1/contacts/bulk/assign-tags` |
| `apps/api/src/routes/contacts.test.ts` | Modify | Tests for bulk assign |
| `apps/api/src/routes/labels.ts` | Modify | Add `PATCH /v1/tags/:tag` rename |
| `apps/api/src/routes/labels.test.ts` | Modify | Tests for rename |
| `apps/web/components/contacts/BulkTagModal.tsx` | Create | Modal for bulk tag assignment |
| `apps/web/components/contacts/ContactsClient.tsx` | Modify | Wire bulk modal, add tag filter dropdown, colored pills |
| `apps/web/components/contacts/EditContactDrawer.tsx` | Modify | Replace tag input with TagCombobox, colored pills |
| `apps/web/components/inbox/ContactPanel.tsx` | Modify | Add inline tag editing with TagCombobox |
| `apps/web/app/(dashboard)/settings/labels/LabelsClient.tsx` | Modify | Add inline rename, colored pills |

---

### Task 1: `getTagColor` utility

**Files:**
- Create: `apps/web/lib/tag-color.ts`
- Create: `apps/web/lib/tag-color.test.ts`

**Interfaces:**
- Produces: `getTagColor(tag: string): { bg: string; text: string }` — used by Tasks 4, 5, 6, 7, 8

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/lib/tag-color.test.ts
import { describe, it, expect } from "vitest";
import { getTagColor } from "./tag-color";

describe("getTagColor", () => {
  it("returns an object with bg and text properties", () => {
    const color = getTagColor("premium");
    expect(color).toHaveProperty("bg");
    expect(color).toHaveProperty("text");
  });

  it("returns the same color for the same tag every time", () => {
    expect(getTagColor("vip")).toEqual(getTagColor("vip"));
    expect(getTagColor("lead")).toEqual(getTagColor("lead"));
  });

  it("does not throw on an empty string", () => {
    expect(() => getTagColor("")).not.toThrow();
  });

  it("reaches at least 5 distinct colors across 20 varied inputs", () => {
    const inputs = ["a","b","c","d","e","f","g","h","i","j","k","l","m","n","o","p","q","r","s","t"];
    const bgs = new Set(inputs.map((t) => getTagColor(t).bg));
    expect(bgs.size).toBeGreaterThanOrEqual(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @WBMSG/web vitest run lib/tag-color.test.ts
```

Expected: FAIL — "Cannot find module './tag-color'"

- [ ] **Step 3: Write the implementation**

```ts
// apps/web/lib/tag-color.ts
const PALETTE = [
  { bg: "bg-blue-100",   text: "text-blue-700"   },
  { bg: "bg-green-100",  text: "text-green-700"  },
  { bg: "bg-purple-100", text: "text-purple-700" },
  { bg: "bg-orange-100", text: "text-orange-700" },
  { bg: "bg-pink-100",   text: "text-pink-700"   },
  { bg: "bg-teal-100",   text: "text-teal-700"   },
  { bg: "bg-red-100",    text: "text-red-700"    },
  { bg: "bg-yellow-100", text: "text-yellow-700" },
  { bg: "bg-indigo-100", text: "text-indigo-700" },
  { bg: "bg-cyan-100",   text: "text-cyan-700"   },
] as const;

export function getTagColor(tag: string): { bg: string; text: string } {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash += tag.charCodeAt(i);
  return PALETTE[hash % PALETTE.length]!;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @WBMSG/web vitest run lib/tag-color.test.ts
```

Expected: PASS — 4 tests pass

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/tag-color.ts apps/web/lib/tag-color.test.ts
git commit -m "feat(tags): deterministic tag color utility"
```

---

### Task 2: API — `POST /v1/contacts/bulk/assign-tags`

**Files:**
- Modify: `apps/api/src/routes/contacts.ts` (add endpoint after the existing `DELETE /v1/contacts/bulk`)
- Modify: `apps/api/src/routes/contacts.test.ts`

**Interfaces:**
- Consumes: existing `canAccessSub` from `../lib/permissions.js`, existing `request.auth`
- Produces: `POST /v1/contacts/bulk/assign-tags` → 204 on success, 403 on missing permission

- [ ] **Step 1: Write the failing tests**

Add this `describe` block to `apps/api/src/routes/contacts.test.ts`. The existing `mockPrisma` already has `contact.findMany` and `contact.update` — add nothing extra to the mock object.

```ts
describe("POST /v1/contacts/bulk/assign-tags", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("appends tags to each contact, deduplicating existing", async () => {
    mockPrisma.contact.findMany.mockResolvedValue([
      { id: "c-1", tags: ["vip"] },
      { id: "c-2", tags: [] },
    ]);
    mockPrisma.contact.update.mockResolvedValue({});
    const res = await app.inject({
      method: "POST",
      url: "/v1/contacts/bulk/assign-tags",
      payload: { contactIds: ["c-1", "c-2"], tags: ["vip", "lead"] },
    });
    expect(res.statusCode).toBe(204);
    expect(mockPrisma.contact.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "c-1" }, data: { tags: ["vip", "lead"] } })
    );
    expect(mockPrisma.contact.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "c-2" }, data: { tags: ["vip", "lead"] } })
    );
  });

  it("returns 204 with no updates when tags list is empty", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/contacts/bulk/assign-tags",
      payload: { contactIds: ["c-1"], tags: [] },
    });
    expect(res.statusCode).toBe(204);
    expect(mockPrisma.contact.findMany).not.toHaveBeenCalled();
  });

  it("returns 403 when contacts_bulk_tag sub-permission is missing", async () => {
    // buildApp() uses admin role which bypasses — rebuild as agent without permission
    const restricted = Fastify({ logger: false });
    restricted.decorate("prisma", mockPrisma as unknown as PrismaClient);
    restricted.addHook("onRequest", async (r) => {
      r.auth = { userId: "u-2", organizationId: "org-1", role: "agent" as const, permissions: { contacts_access: "allow" }, teamId: null, teamRole: null };
    });
    const { contactsRouter } = await import("./contacts.js");
    await restricted.register(contactsRouter, { prefix: "/v1" });
    const res = await restricted.inject({
      method: "POST",
      url: "/v1/contacts/bulk/assign-tags",
      payload: { contactIds: ["c-1"], tags: ["vip"] },
    });
    expect(res.statusCode).toBe(403);
    await restricted.close();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @WBMSG/api vitest run routes/contacts.test.ts
```

Expected: the 3 new tests FAIL — "Route POST:/v1/contacts/bulk/assign-tags not found"

- [ ] **Step 3: Add the endpoint to `contacts.ts`**

Locate the `DELETE /contacts/bulk` handler (around line 647). Add the following block **directly above** it:

```ts
// ── Bulk tag assign ───────────────────────────────────────────────────────
fastify.post<{ Body: { contactIds: string[]; tags: string[] } }>(
  "/contacts/bulk/assign-tags",
  async (request, reply) => {
    const { organizationId, role, permissions } = request.auth;
    if (!canAccessSub(role, permissions, "contacts_access", "contacts_bulk_tag")) {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "contacts_bulk_tag permission required" } });
    }
    const { contactIds, tags } = request.body;
    if (!contactIds.length || !tags.length) return reply.status(204).send();

    const contacts = await fastify.prisma.contact.findMany({
      where: { id: { in: contactIds }, organizationId, deletedAt: null },
      select: { id: true, tags: true },
    });

    await Promise.all(
      contacts.map((c) => {
        const merged = Array.from(new Set([...c.tags, ...tags]));
        return fastify.prisma.contact.update({ where: { id: c.id }, data: { tags: merged } });
      }),
    );

    return reply.status(204).send();
  },
);
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @WBMSG/api vitest run routes/contacts.test.ts
```

Expected: all tests PASS (including pre-existing ones)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/contacts.ts apps/api/src/routes/contacts.test.ts
git commit -m "feat(tags): POST /v1/contacts/bulk/assign-tags endpoint"
```

---

### Task 3: API — `PATCH /v1/tags/:tag` (rename)

**Files:**
- Modify: `apps/api/src/routes/labels.ts`
- Modify: `apps/api/src/routes/labels.test.ts`

**Interfaces:**
- Produces: `PATCH /v1/tags/:tag` body `{ newTag: string }` → 204, 400 (missing newTag), 403 (no permission)

- [ ] **Step 1: Write the failing tests**

Add to `apps/api/src/routes/labels.test.ts` — the existing `mockPrisma` already has `contact.findMany` and `contact.update`:

```ts
describe("PATCH /v1/tags/:tag (rename)", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("renames a tag across all contacts in the org", async () => {
    mockPrisma.contact.findMany.mockResolvedValue([
      { id: "c-1", tags: ["vip", "lead"] },
      { id: "c-2", tags: ["vip"] },
    ]);
    mockPrisma.contact.update.mockResolvedValue({});
    const res = await app.inject({
      method: "PATCH",
      url: "/v1/tags/vip",
      payload: { newTag: "premium" },
    });
    expect(res.statusCode).toBe(204);
    expect(mockPrisma.contact.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "c-1" }, data: { tags: ["premium", "lead"] } })
    );
    expect(mockPrisma.contact.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "c-2" }, data: { tags: ["premium"] } })
    );
  });

  it("returns 400 when newTag is missing", async () => {
    const res = await app.inject({ method: "PATCH", url: "/v1/tags/vip", payload: {} });
    expect(res.statusCode).toBe(400);
    expect(mockPrisma.contact.findMany).not.toHaveBeenCalled();
  });

  it("returns 403 when settings_tags sub-permission is missing", async () => {
    const restricted = Fastify({ logger: false });
    restricted.decorate("prisma", mockPrisma as unknown as PrismaClient);
    restricted.addHook("onRequest", async (r) => {
      r.auth = { userId: "u-2", organizationId: "org-1", role: "agent" as const, permissions: { settings_access: "allow" }, teamId: null, teamRole: null };
    });
    const { tagsRouter } = await import("./labels.js");
    await restricted.register(tagsRouter, { prefix: "/v1" });
    const res = await restricted.inject({ method: "PATCH", url: "/v1/tags/vip", payload: { newTag: "premium" } });
    expect(res.statusCode).toBe(403);
    await restricted.close();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @WBMSG/api vitest run routes/labels.test.ts
```

Expected: 3 new tests FAIL — "Route PATCH:/v1/tags/vip not found"

- [ ] **Step 3: Add the endpoint to `labels.ts`**

Add this handler inside `tagsRouter`, directly after the existing `DELETE /tags/:tag` handler:

```ts
fastify.patch<{ Params: { tag: string }; Body: { newTag: string } }>(
  "/tags/:tag",
  async (request, reply) => {
    const { organizationId, role, permissions } = request.auth;
    if (!canAccessSub(role, permissions, "settings_access", "settings_tags")) {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "settings_tags permission required" } });
    }
    const oldTag = decodeURIComponent(request.params.tag);
    const { newTag } = request.body;
    if (!newTag?.trim()) {
      return reply.status(400).send({ error: { code: "INVALID", message: "newTag is required" } });
    }
    const trimmed = newTag.trim().toLowerCase();

    const contacts = await fastify.prisma.contact.findMany({
      where: { organizationId, deletedAt: null, tags: { has: oldTag } },
      select: { id: true, tags: true },
    });

    await Promise.all(
      contacts.map((c) =>
        fastify.prisma.contact.update({
          where: { id: c.id },
          data: { tags: c.tags.map((t) => (t === oldTag ? trimmed : t)) },
        }),
      ),
    );

    return reply.status(204).send();
  },
);
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @WBMSG/api vitest run routes/labels.test.ts
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/labels.ts apps/api/src/routes/labels.test.ts
git commit -m "feat(tags): PATCH /v1/tags/:tag rename endpoint"
```

---

### Task 4: `TagCombobox` shared component

**Files:**
- Create: `apps/web/components/contacts/TagCombobox.tsx`

**Interfaces:**
- Consumes: `getTagColor` from `@/lib/tag-color`, `useAuth` from `@clerk/nextjs`, `GET /v1/contacts/tags`
- Produces: `TagCombobox` component with props `{ tags: string[], onChange: (tags: string[]) => void, placeholder?: string }` — used by Tasks 5, 6, 7

- [ ] **Step 1: Create the component**

```tsx
// apps/web/components/contacts/TagCombobox.tsx
"use client";

import { JSX, KeyboardEvent, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { getTagColor } from "@/lib/tag-color";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface TagComboboxProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}

export function TagCombobox({ tags, onChange, placeholder = "Add tag…" }: TagComboboxProps): JSX.Element {
  const { getToken } = useAuth();
  const [input, setInput] = useState("");
  const [allTags, setAllTags] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void (async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/contacts/tags`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (res.ok) {
        const body = (await res.json()) as { data: string[] };
        setAllTags(body.data);
      }
    })();
  }, [getToken]);

  const filtered = allTags
    .filter((t) => !tags.includes(t) && t.toLowerCase().includes(input.toLowerCase()))
    .slice(0, 8);
  const inputTrimmed = input.trim().toLowerCase();
  const showCreate =
    inputTrimmed.length > 0 &&
    !allTags.some((t) => t.toLowerCase() === inputTrimmed) &&
    !tags.includes(inputTrimmed);
  const options = [...filtered, ...(showCreate ? [`__create__:${inputTrimmed}`] : [])];

  function add(tag: string) {
    const t = tag.trim().toLowerCase();
    if (!t || tags.includes(t)) return;
    onChange([...tags, t]);
    if (!allTags.includes(t)) setAllTags((prev) => [...prev, t]);
    setInput("");
    setOpen(false);
    setHighlighted(0);
  }

  function remove(tag: string) {
    onChange(tags.filter((t) => t !== tag));
  }

  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const opt = options[highlighted];
      if (opt) {
        add(opt.startsWith("__create__:") ? opt.slice(11) : opt);
      } else if (input.trim()) {
        add(input.trim());
      }
    } else if (e.key === "Backspace" && !input && tags.length > 0) {
      remove(tags[tags.length - 1]!);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <div
        className="flex flex-wrap gap-1.5 rounded-lg border border-gray-300 px-3 py-2 focus-within:ring-2 focus-within:ring-brand-500 focus-within:border-transparent cursor-text min-h-[42px]"
        onClick={() => inputRef.current?.focus()}
      >
        {tags.map((tag) => {
          const { bg, text } = getTagColor(tag);
          return (
            <span key={tag} className={`flex items-center gap-1 ${bg} ${text} rounded-full text-xs px-2 py-0.5 shrink-0 font-medium`}>
              {tag}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); remove(tag); }}
                className="hover:opacity-70 leading-none ml-0.5"
              >
                &times;
              </button>
            </span>
          );
        })}
        <input
          ref={inputRef}
          className="flex-1 min-w-[80px] text-sm outline-none bg-transparent placeholder-gray-400"
          placeholder={tags.length === 0 ? placeholder : ""}
          value={input}
          onChange={(e) => { setInput(e.target.value); setOpen(true); setHighlighted(0); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={handleKey}
        />
      </div>

      {open && options.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {options.map((opt, i) => {
            const isCreate = opt.startsWith("__create__:");
            const label = isCreate ? opt.slice(11) : opt;
            const { bg, text } = getTagColor(label);
            return (
              <li
                key={opt}
                onMouseDown={() => add(label)}
                className={`flex items-center gap-2 px-3 py-2 cursor-pointer text-sm transition-colors ${i === highlighted ? "bg-gray-100" : "hover:bg-gray-50"}`}
              >
                {isCreate ? (
                  <>
                    <span className="text-brand-600 font-medium text-xs">+ Create</span>
                    <span className={`${bg} ${text} rounded-full text-xs px-2 py-0.5 font-medium`}>{label}</span>
                  </>
                ) : (
                  <span className={`${bg} ${text} rounded-full text-xs px-2 py-0.5 font-medium`}>{label}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm --filter @WBMSG/web type-check
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/contacts/TagCombobox.tsx
git commit -m "feat(tags): TagCombobox component with autocomplete and inline create"
```

---

### Task 5: `BulkTagModal` + wire ContactsClient

**Files:**
- Create: `apps/web/components/contacts/BulkTagModal.tsx`
- Modify: `apps/web/components/contacts/ContactsClient.tsx`

**Interfaces:**
- Consumes: `TagCombobox` from `./TagCombobox`, `getTagColor` from `@/lib/tag-color`, `POST /v1/contacts/bulk/assign-tags`, `GET /v1/contacts/tags`

- [ ] **Step 1: Create `BulkTagModal.tsx`**

```tsx
// apps/web/components/contacts/BulkTagModal.tsx
"use client";

import { JSX, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { TagCombobox } from "./TagCombobox";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface BulkTagModalProps {
  contactIds: string[];
  onClose: () => void;
  onSuccess: (tags: string[]) => void;
}

export function BulkTagModal({ contactIds, onClose, onSuccess }: BulkTagModalProps): JSX.Element {
  const { getToken } = useAuth();
  const [tags, setTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleConfirm() {
    if (!tags.length) return;
    setSaving(true);
    setError("");
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/contacts/bulk/assign-tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
        body: JSON.stringify({ contactIds, tags }),
      });
      if (!res.ok) throw new Error("Failed");
      onSuccess(tags);
      onClose();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-semibold text-gray-900">
          Assign tags to {contactIds.length} contact{contactIds.length !== 1 ? "s" : ""}
        </h2>
        <TagCombobox tags={tags} onChange={setTags} placeholder="Search or create tags…" />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleConfirm()}
            disabled={saving || tags.length === 0}
            className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "Assigning…" : "Assign Tags"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update `ContactsClient.tsx` — add state, imports, and tag filter**

At the top of the file, add these imports alongside the existing ones:

```ts
import { BulkTagModal } from "./BulkTagModal";
import { getTagColor } from "@/lib/tag-color";
```

Inside `ContactsClient`, add these state variables after the existing `useState` declarations:

```ts
const [showBulkTagModal, setShowBulkTagModal] = useState(false);
const [selectedTag, setSelectedTag] = useState("");
const [availableTags, setAvailableTags] = useState<string[]>([]);
```

Load available tags for the filter dropdown. Add this `useEffect` alongside the existing effects:

```ts
useEffect(() => {
  void (async () => {
    const token = await getToken();
    const res = await fetch(`${API_URL}/v1/contacts/tags`, {
      headers: { Authorization: `Bearer ${token ?? ""}` },
    });
    if (res.ok) {
      const body = (await res.json()) as { data: string[] };
      setAvailableTags(body.data);
    }
  })();
}, [getToken]);
```

- [ ] **Step 3: Update the `search` function and its trigger effect**

Replace the existing `search` useCallback:

```ts
const search = useCallback(async (q: string, tag: string) => {
  const token = await getToken();
  if (!token) return;
  setSearching(true);
  try {
    const url = `${API_URL}/v1/contacts/search?q=${encodeURIComponent(q)}${tag ? `&tag=${encodeURIComponent(tag)}` : ""}`;
    const res = await clientFetch(url, { token, silent: true });
    if (res.ok) setContacts((await res.json() as { data: ContactWithLabels[] }).data);
  } finally { setSearching(false); }
}, [getToken]);
```

Replace the existing `useEffect` that watches `query`:

```ts
useEffect(() => {
  if (debounceRef.current) clearTimeout(debounceRef.current);
  if (!query.trim() && !selectedTag) { setContacts(initialContacts); return; }
  debounceRef.current = setTimeout(() => { void search(query, selectedTag); }, 300);
  return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
}, [query, selectedTag, search, initialContacts]);
```

- [ ] **Step 4: Add the tag filter dropdown to the toolbar**

Locate the toolbar area where the search input is. Add this tag filter dropdown immediately after the search input:

```tsx
{availableTags.length > 0 && (
  <select
    value={selectedTag}
    onChange={(e) => { setSelectedTag(e.target.value); setPage(1); }}
    className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
  >
    <option value="">All tags</option>
    {availableTags.map((t) => (
      <option key={t} value={t}>{t}</option>
    ))}
  </select>
)}
```

- [ ] **Step 5: Wire the "Tag selected" button and add the modal**

Find the existing "Tag selected" button (around line 677). Add `onClick`:

```tsx
{canBulkTag && (
  <button
    onClick={() => setShowBulkTagModal(true)}
    className="flex items-center gap-1.5 text-sm font-medium text-brand-300 hover:text-brand-200 transition-colors"
  >
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
    Tag selected
  </button>
)}
```

Add the modal render at the bottom of the JSX return, before the final closing tag:

```tsx
{showBulkTagModal && (
  <BulkTagModal
    contactIds={[...selectedIds]}
    onClose={() => setShowBulkTagModal(false)}
    onSuccess={(newTags) => {
      setContacts((prev) =>
        prev.map((c) =>
          selectedIds.has(c.id)
            ? { ...c, tags: Array.from(new Set([...(c.tags ?? []), ...newTags])) }
            : c,
        ),
      );
    }}
  />
)}
```

- [ ] **Step 6: Apply colored pills in the tags column**

Find the tag pills in the contacts table (around line 505). Replace with colored version:

```tsx
{isVisible("tags") && (
  <td className="px-4 py-3.5">
    {c.tags && c.tags.length > 0 ? (
      <div className="flex flex-wrap gap-1">
        {c.tags.slice(0, 3).map((tag) => {
          const { bg, text } = getTagColor(tag);
          return (
            <span key={tag} className={`inline-flex items-center h-5 px-2 rounded-full text-[11px] font-medium ${bg} ${text}`}>
              {tag}
            </span>
          );
        })}
        {c.tags.length > 3 && (
          <span className="inline-flex items-center h-5 px-2 rounded-full text-[11px] font-medium bg-gray-100 text-gray-400">
            +{c.tags.length - 3}
          </span>
        )}
      </div>
    ) : <span className="text-gray-300">—</span>}
  </td>
)}
```

- [ ] **Step 7: Type-check**

```bash
pnpm --filter @WBMSG/web type-check
```

Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add apps/web/components/contacts/BulkTagModal.tsx apps/web/components/contacts/ContactsClient.tsx
git commit -m "feat(tags): bulk tag modal, contact list tag filter, colored pills"
```

---

### Task 6: EditContactDrawer — TagCombobox + colors

**Files:**
- Modify: `apps/web/components/contacts/EditContactDrawer.tsx`

**Interfaces:**
- Consumes: `TagCombobox` from `./TagCombobox`, `getTagColor` from `@/lib/tag-color`

- [ ] **Step 1: Update imports**

Add to existing imports at the top of `EditContactDrawer.tsx`:

```ts
import { TagCombobox } from "./TagCombobox";
```

Remove `getTagColor` if not needed for pills here — the TagCombobox handles colored display internally. No separate `getTagColor` import needed.

- [ ] **Step 2: Remove the manual tag state and helpers**

Remove these lines:
- `const [tagInput, setTagInput] = useState("");` (around line 65)
- The `addTag(value: string)` function (around line 168)
- The `removeTag(tag: string)` function (around line 174)

Keep `const [tags, setTags] = useState<string[]>(contact?.tags ?? []);` — this is still needed.

- [ ] **Step 3: Replace the tag input block**

Find the tag input block (around lines 396–419, inside the `isVisible("tags")` guard):

```tsx
{isVisible("tags") && (
  <div className="flex flex-col gap-1">
    <label className="text-xs font-medium text-gray-500">Tags</label>
    <TagCombobox tags={tags} onChange={setTags} />
  </div>
)}
```

This replaces the entire existing block that had the manual input, pills with `removeTag`, and `onBlur` handler.

- [ ] **Step 4: Type-check**

```bash
pnpm --filter @WBMSG/web type-check
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/contacts/EditContactDrawer.tsx
git commit -m "feat(tags): replace tag input with TagCombobox in EditContactDrawer"
```

---

### Task 7: ContactPanel — inline tag editing

**Files:**
- Modify: `apps/web/components/inbox/ContactPanel.tsx`

**Interfaces:**
- Consumes: `TagCombobox` from `@/components/contacts/TagCombobox`, `getTagColor` from `@/lib/tag-color`, `PATCH /v1/contacts/:id`

- [ ] **Step 1: Add imports**

Add to the existing imports at the top of `ContactPanel.tsx`:

```ts
import { TagCombobox } from "@/components/contacts/TagCombobox";
import { getTagColor } from "@/lib/tag-color";
```

- [ ] **Step 2: Add tag editing state**

Inside the `ContactPanel` component, after the existing `useState` declarations:

```ts
const [editingTags, setEditingTags] = useState(false);
const [localTags, setLocalTags] = useState<string[]>([]);
const [savingTags, setSavingTags] = useState(false);
```

Sync `localTags` from `contact` when it loads — add this inside the existing `useEffect` that watches `contact?.id`:

```ts
useEffect(() => {
  if (contact) {
    setNotes(contact.notes ?? "");
    savedNotesRef.current = contact.notes ?? "";
    setLocalTags(contact.tags ?? []);
  }
}, [contact?.id]); // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 3: Add the save handler**

After `handleNotesBlur`, add:

```ts
async function handleSaveTags() {
  setSavingTags(true);
  try {
    const token = await getToken();
    await fetch(`${API_URL}/v1/contacts/${contactId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
      body: JSON.stringify({ tags: localTags }),
    });
    setEditingTags(false);
  } finally {
    setSavingTags(false);
  }
}
```

- [ ] **Step 4: Replace the Tags section**

Find the Tags section (around lines 90–102). Replace it entirely:

```tsx
{/* Tags */}
<div className="px-4 py-3">
  <div className="flex items-center justify-between mb-2">
    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Tags</p>
    {!editingTags && (
      <button
        onClick={() => setEditingTags(true)}
        className="text-xs text-brand-600 hover:text-brand-700 font-medium"
      >
        Edit
      </button>
    )}
  </div>

  {editingTags ? (
    <div className="space-y-2">
      <TagCombobox tags={localTags} onChange={setLocalTags} placeholder="Add tag…" />
      <div className="flex gap-2 justify-end">
        <button
          onClick={() => { setEditingTags(false); setLocalTags(contact?.tags ?? []); }}
          className="text-xs text-gray-500 hover:text-gray-700"
        >
          Cancel
        </button>
        <button
          onClick={() => void handleSaveTags()}
          disabled={savingTags}
          className="text-xs font-medium text-white bg-brand-600 px-3 py-1 rounded-lg hover:bg-brand-700 disabled:opacity-50"
        >
          {savingTags ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  ) : localTags.length > 0 ? (
    <div className="flex flex-wrap gap-1">
      {localTags.map((tag) => {
        const { bg, text } = getTagColor(tag);
        return (
          <span key={tag} className={`inline-flex items-center h-5 px-2 rounded-full text-[11px] font-medium ${bg} ${text}`}>
            {tag}
          </span>
        );
      })}
    </div>
  ) : (
    <p className="text-xs text-gray-400">No tags</p>
  )}
</div>
```

- [ ] **Step 5: Type-check**

```bash
pnpm --filter @WBMSG/web type-check
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/inbox/ContactPanel.tsx
git commit -m "feat(tags): inline tag editing in inbox ContactPanel"
```

---

### Task 8: LabelsClient — inline rename + colored pills

**Files:**
- Modify: `apps/web/app/(dashboard)/settings/labels/LabelsClient.tsx`

**Interfaces:**
- Consumes: `getTagColor` from `@/lib/tag-color`, `PATCH /v1/tags/:tag`

- [ ] **Step 1: Add import**

Add at the top of `LabelsClient.tsx`:

```ts
import { getTagColor } from "@/lib/tag-color";
```

- [ ] **Step 2: Add rename state**

Inside `ManageTagsClient`, after the existing `useState` declarations:

```ts
const [renamingTag, setRenamingTag] = useState<string | null>(null);
const [renameInput, setRenameInput] = useState("");
const [renaming, setRenaming] = useState(false);
```

- [ ] **Step 3: Add the rename handler**

After the existing `deleteSelected` function, add:

```ts
async function handleRename(oldTag: string) {
  const newTag = renameInput.trim().toLowerCase();
  if (!newTag || newTag === oldTag) { setRenamingTag(null); return; }
  setRenaming(true);
  try {
    const token = await getToken();
    const res = await fetch(`${API_URL}/v1/tags/${encodeURIComponent(oldTag)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
      body: JSON.stringify({ newTag }),
    });
    if (res.ok) {
      setTags((prev) => prev.map((t) => (t.tag === oldTag ? { ...t, tag: newTag } : t)));
      setRenamingTag(null);
    }
  } finally {
    setRenaming(false);
  }
}
```

- [ ] **Step 4: Update the tag name cell to support inline rename and colored pills**

Find the `<td>` that renders the tag name pill (around line 149). Replace it:

```tsx
<td className="px-4 py-3">
  {renamingTag === tag ? (
    <div className="flex items-center gap-2">
      <input
        autoFocus
        value={renameInput}
        onChange={(e) => setRenameInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void handleRename(tag);
          if (e.key === "Escape") setRenamingTag(null);
        }}
        className="text-sm border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-emerald-500 w-36"
      />
      <button
        onClick={() => void handleRename(tag)}
        disabled={renaming}
        className="text-xs font-medium text-emerald-600 hover:text-emerald-800 disabled:opacity-50"
      >
        {renaming ? "…" : "Save"}
      </button>
      <button onClick={() => setRenamingTag(null)} className="text-xs text-gray-400 hover:text-gray-600">
        Cancel
      </button>
    </div>
  ) : (
    <button
      onClick={() => { setRenamingTag(tag); setRenameInput(tag); }}
      className="flex items-center gap-1.5 group"
      title="Click to rename"
    >
      {(() => {
        const { bg, text } = getTagColor(tag);
        return (
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${bg} ${text}`}>
            <svg className="w-3 h-3 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
            </svg>
            {tag}
          </span>
        );
      })()}
      <svg className="w-3 h-3 text-gray-300 group-hover:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
      </svg>
    </button>
  )}
</td>
```

- [ ] **Step 5: Type-check**

```bash
pnpm --filter @WBMSG/web type-check
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/(dashboard)/settings/labels/LabelsClient.tsx
git commit -m "feat(tags): inline rename and colored pills in settings labels page"
```

---

## Final Verification

- [ ] Run the full API test suite: `pnpm --filter @WBMSG/api test` — all pass
- [ ] Run the full web test suite: `pnpm --filter @WBMSG/web test` — all pass
- [ ] Run lint: `pnpm lint` — no errors
- [ ] Run type-check: `pnpm type-check` — no errors
