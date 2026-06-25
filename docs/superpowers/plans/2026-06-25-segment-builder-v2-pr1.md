# Segment Builder V2 — PR1: UI + Tags + Fields

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat SegmentBuilder with a tab-based UI (Tags / Fields tabs) matching Interakt's UX, update the FilterRule type with a `type` discriminant, and add a `whatsappOptedOnly` toggle to segments.

**Architecture:** New `FilterRule` union type uses `type: "tags" | "fields" | "events"` as discriminant. Old saved rules (no `type` field) are coerced at read time in the evaluator — no destructive DB migration. A new `Dropdown` component (Radix `DropdownMenu`) replaces all `<select>` elements in the builder. Events tab ships as a visual placeholder in PR1; functionality added in PR2.

**Tech Stack:** Fastify 4, Prisma 7, Next.js 15 App Router, React 18, Tailwind CSS, `@radix-ui/react-dropdown-menu` (already installed), Vitest

## Global Constraints

- API: ESM-only — use `.js` extensions in all imports even for `.ts` source files
- TypeScript strict mode — no `any`, no implicit returns
- No `console.log` — use Fastify logger (`request.log`) or omit
- Named exports only — no default exports in new files
- All Prisma queries must include `organizationId` in `where` clauses
- Commits follow Conventional Commits: `feat(scope):`, `fix(scope):`, `chore(scope):`
- Branch from `develop`

---

## File Map

**Modified (API):**
- `apps/api/src/lib/segment-evaluator.ts` — new FilterRule types, backward compat coercion, new operators, whatsappOptedOnly support
- `apps/api/src/lib/segment-evaluator.test.ts` — add tests for new type format and operators
- `apps/api/src/routes/segments.ts` — accept `whatsappOptedOnly` in PATCH body
- `apps/api/src/routes/segments.test.ts` — test whatsappOptedOnly PATCH
- `apps/api/src/routes/contacts.ts` — add `GET /v1/contacts/tags` endpoint
- `apps/api/src/routes/contacts.test.ts` — test tags endpoint
- `apps/api/prisma/schema.prisma` — add `whatsappOptedOnly` to `Segment` model

**Created (web):**
- `apps/web/components/segments/types.ts` — shared frontend FilterRule types
- `apps/web/components/segments/Dropdown.tsx` — custom styled dropdown (Radix DropdownMenu)
- `apps/web/components/segments/SegmentBuilderV2.tsx` — new builder component

**Modified (web):**
- `apps/web/app/(dashboard)/contacts/segments/[id]/page.tsx` — swap to SegmentBuilderV2 + whatsappOptedOnly toggle
- `apps/web/app/(dashboard)/contacts/segments/page.tsx` — "New Segment" opens Save Segment modal

---

## Task 1: Update FilterRule type and evaluator

**Files:**
- Modify: `apps/api/src/lib/segment-evaluator.ts`
- Modify: `apps/api/src/lib/segment-evaluator.test.ts`

**Interfaces:**
- Produces: `TagsRule`, `FieldsRule`, `EventsRule`, `FilterRule`, `MatchMode`, `evaluateSegment(prisma, orgId, filters, match, whatsappOptedOnly?)` — used by Tasks 2, 3, and all consumers

- [ ] **Step 1: Write failing tests for new type format and new operators**

Add to `apps/api/src/lib/segment-evaluator.test.ts` (keep existing tests — they test backward compat of old format):

```ts
describe("evaluateSegment — new type format", () => {
  it("evaluates TagsRule { type: 'tags', operator: 'is' }", async () => {
    const { evaluateSegment } = await import("./segment-evaluator.js");
    mockFindMany.mockResolvedValue([]);
    await evaluateSegment(mockPrisma, "org-1", [
      { type: "tags", operator: "is", value: "VIP" },
    ], "all");
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ AND: [{ tags: { has: "VIP" } }] }),
    }));
  });

  it("evaluates TagsRule { type: 'tags', operator: 'isNot' }", async () => {
    const { evaluateSegment } = await import("./segment-evaluator.js");
    mockFindMany.mockResolvedValue([]);
    await evaluateSegment(mockPrisma, "org-1", [
      { type: "tags", operator: "isNot", value: "spam" },
    ], "all");
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ AND: [{ NOT: { tags: { has: "spam" } } }] }),
    }));
  });

  it("evaluates FieldsRule text 'is' operator", async () => {
    const { evaluateSegment } = await import("./segment-evaluator.js");
    mockFindMany.mockResolvedValue([]);
    await evaluateSegment(mockPrisma, "org-1", [
      { type: "fields", field: "firstName", operator: "is", value: "Ravi" },
    ], "all");
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ AND: [{ firstName: { equals: "Ravi", mode: "insensitive" } }] }),
    }));
  });

  it("evaluates FieldsRule text 'isNot' operator", async () => {
    const { evaluateSegment } = await import("./segment-evaluator.js");
    mockFindMany.mockResolvedValue([]);
    await evaluateSegment(mockPrisma, "org-1", [
      { type: "fields", field: "firstName", operator: "isNot", value: "Bot" },
    ], "all");
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        AND: [{ NOT: { firstName: { equals: "Bot", mode: "insensitive" } } }],
      }),
    }));
  });

  it("evaluates FieldsRule text 'doesNotContain' operator", async () => {
    const { evaluateSegment } = await import("./segment-evaluator.js");
    mockFindMany.mockResolvedValue([]);
    await evaluateSegment(mockPrisma, "org-1", [
      { type: "fields", field: "email", operator: "doesNotContain", value: "@spam" },
    ], "all");
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        AND: [{ NOT: { email: { contains: "@spam", mode: "insensitive" } } }],
      }),
    }));
  });

  it("evaluates FieldsRule text 'hasAnyValue' operator", async () => {
    const { evaluateSegment } = await import("./segment-evaluator.js");
    mockFindMany.mockResolvedValue([]);
    await evaluateSegment(mockPrisma, "org-1", [
      { type: "fields", field: "email", operator: "hasAnyValue" },
    ], "all");
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ AND: [{ NOT: { email: null } }] }),
    }));
  });

  it("evaluates FieldsRule date 'lessThanDaysAgo' operator", async () => {
    const { evaluateSegment } = await import("./segment-evaluator.js");
    mockFindMany.mockResolvedValue([]);
    const before = Date.now();
    await evaluateSegment(mockPrisma, "org-1", [
      { type: "fields", field: "createdAt", operator: "lessThanDaysAgo", value: "7" },
    ], "all");
    const after = Date.now();
    const call = mockFindMany.mock.calls[0][0];
    const gte: Date = call.where.AND[0].createdAt.gte;
    expect(gte.getTime()).toBeGreaterThanOrEqual(before - 7 * 86400000 - 1000);
    expect(gte.getTime()).toBeLessThanOrEqual(after - 7 * 86400000 + 1000);
  });

  it("applies whatsappOptedOnly implicit clause", async () => {
    const { evaluateSegment } = await import("./segment-evaluator.js");
    mockFindMany.mockResolvedValue([]);
    await evaluateSegment(mockPrisma, "org-1", [], "all", true);
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ whatsappOptOut: false }),
    }));
  });

  it("backward compat: old format tags rule still works", async () => {
    const { evaluateSegment } = await import("./segment-evaluator.js");
    mockFindMany.mockResolvedValue([]);
    await evaluateSegment(mockPrisma, "org-1", [
      { field: "tags", operator: "contains", value: "VIP" } as never,
    ], "all");
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ AND: [{ tags: { has: "VIP" } }] }),
    }));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @WBMSG/api test -- --reporter=verbose segment-evaluator
```

Expected: multiple failures — `TagsRule`, `isNot`, `doesNotContain`, `hasAnyValue`, `lessThanDaysAgo`, `whatsappOptedOnly` not handled.

- [ ] **Step 3: Replace `segment-evaluator.ts` with updated implementation**

Replace the entire file `apps/api/src/lib/segment-evaluator.ts`:

```ts
import type { PrismaClient } from "@prisma/client";

export type MatchMode = "all" | "any";

// ── New discriminated union ───────────────────────────────────────────────────

export type TagsRule = {
  type: "tags";
  operator: "is" | "isNot";
  value: string;
};

export type FieldsRule = {
  type: "fields";
  field: string;
  operator: string;
  value?: string;
  valueTo?: string;
  customFieldId?: string;
};

export type EventSubCondition = {
  property: string;
  operator: "is" | "isNot" | "contains" | "doesNotContain" | "isEmpty" | "hasAnyValue";
  value?: string;
};

export type EventsRule = {
  type: "events";
  action: "hasDone";
  eventName: string;
  subConditions: EventSubCondition[];
  subMatch: "and" | "or";
};

export type FilterRule = TagsRule | FieldsRule | EventsRule;

export interface EvaluateResult {
  count: number;
  contacts: Array<{
    id: string;
    firstName: string | null;
    lastName: string | null;
    phoneNumber: string;
    leadStatus: { name: string; color: string } | null;
  }>;
}

// ── Backward compat coercion ──────────────────────────────────────────────────

function normalizeRule(raw: unknown): FilterRule {
  const r = raw as Record<string, unknown>;
  if (r["type"]) return raw as FilterRule;
  // old format — has `field` but no `type`
  if (r["field"] === "tags") {
    const op = r["operator"] === "doesNotContain" ? "isNot" : "is";
    return { type: "tags", operator: op, value: (r["value"] as string) ?? "" };
  }
  return {
    type: "fields",
    field: r["field"] as string,
    operator: r["operator"] as string,
    value: r["value"] as string | undefined,
    valueTo: r["valueTo"] as string | undefined,
    customFieldId: r["customFieldId"] as string | undefined,
  };
}

// ── Clause builders ───────────────────────────────────────────────────────────

function buildTagsClause(rule: TagsRule): Record<string, unknown> {
  if (rule.operator === "isNot") return { NOT: { tags: { has: rule.value } } };
  return { tags: { has: rule.value } };
}

function buildTextClause(col: string, operator: string, value?: string): Record<string, unknown> {
  switch (operator) {
    case "is":
    case "equals":
      return { [col]: { equals: value, mode: "insensitive" } };
    case "isNot":
      return { NOT: { [col]: { equals: value, mode: "insensitive" } } };
    case "contains":
      return { [col]: { contains: value, mode: "insensitive" } };
    case "doesNotContain":
      return { NOT: { [col]: { contains: value, mode: "insensitive" } } };
    case "startsWith":
      return { [col]: { startsWith: value, mode: "insensitive" } };
    case "isEmpty":
      return { [col]: null };
    case "isNotEmpty":
    case "hasAnyValue":
      return { NOT: { [col]: null } };
    default:
      return { [col]: { equals: value, mode: "insensitive" } };
  }
}

function buildDateClause(col: string, operator: string, value?: string, valueTo?: string): Record<string, unknown> {
  const now = new Date();
  switch (operator) {
    case "lessThanDaysAgo": {
      const days = parseInt(value ?? "0", 10);
      const cutoff = new Date(now.getTime() - days * 86400000);
      return { [col]: { gte: cutoff } };
    }
    case "moreThanDaysAgo": {
      const days = parseInt(value ?? "0", 10);
      const cutoff = new Date(now.getTime() - days * 86400000);
      return { [col]: { lte: cutoff } };
    }
    case "after":
      return { [col]: { gte: new Date(value!) } };
    case "before":
      return { [col]: { lte: new Date(value!) } };
    case "on": {
      const d = new Date(value!);
      const start = new Date(d); start.setHours(0, 0, 0, 0);
      const end = new Date(d); end.setHours(23, 59, 59, 999);
      return { [col]: { gte: start, lte: end } };
    }
    case "between":
      return { [col]: { gte: new Date(value!), lte: new Date(valueTo!) } };
    case "isEmpty":
      return { [col]: null };
    case "hasAnyValue":
      return { NOT: { [col]: null } };
    default:
      return { [col]: { gte: new Date(value!) } };
  }
}

function buildFieldsClause(rule: FieldsRule): Record<string, unknown> {
  const { field, operator, value, valueTo, customFieldId } = rule;

  if (["firstName", "lastName", "email", "phoneNumber"].includes(field)) {
    return buildTextClause(field, operator, value);
  }

  switch (field) {
    case "leadStatusId":
      if (operator === "isNot") return { NOT: { leadStatusId: value } };
      return { leadStatusId: value };

    case "countryCode":
    case "languageCode":
      if (operator === "isNot") return { NOT: { [field]: value } };
      return { [field]: value };

    case "assignedUserId":
      if (operator === "isEmpty") return { assignedUserId: null };
      if (operator === "isNot") return { NOT: { assignedUserId: value } };
      return { assignedUserId: value };

    case "groups":
      if (operator === "notMemberOf") return { NOT: { groupContacts: { some: { contactGroupId: value } } } };
      return { groupContacts: { some: { contactGroupId: value } } };

    case "whatsappOptOut":
      return { whatsappOptOut: operator === "isTrue" || operator === "is true" };

    case "disableBot":
      return { disableBot: operator === "isTrue" || operator === "is true" };

    case "createdAt":
      return buildDateClause("createdAt", operator, value, valueTo);

    case "lastMessageAt": {
      const clause = buildDateClause("lastMessageAt", operator, value, valueTo);
      if (operator === "isEmpty") return { conversations: { none: {} } };
      return { conversations: { some: { lastMessageAt: (clause["lastMessageAt"] as Record<string, unknown>) } } };
    }

    case "customField": {
      if (operator === "isEmpty") return { NOT: { customFieldValues: { some: { fieldId: customFieldId } } } };
      const valClause = operator === "contains"
        ? { contains: value, mode: "insensitive" }
        : { equals: value };
      return { customFieldValues: { some: { fieldId: customFieldId, fieldValue: valClause } } };
    }

    default:
      return {};
  }
}

function buildClause(rule: FilterRule): Record<string, unknown> {
  switch (rule.type) {
    case "tags":    return buildTagsClause(rule);
    case "fields":  return buildFieldsClause(rule);
    case "events":  return {}; // handled in PR2
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function evaluateSegment(
  prisma: PrismaClient,
  organizationId: string,
  filters: FilterRule[],
  match: MatchMode = "all",
  whatsappOptedOnly = false
): Promise<EvaluateResult> {
  const normalized = filters.map(normalizeRule);
  const clauses = normalized
    .filter((r) => r.type !== "events")
    .map(buildClause)
    .filter((c) => Object.keys(c).length > 0);

  const matchKey = match === "any" ? "OR" : "AND";

  const contacts = await prisma.contact.findMany({
    where: {
      organizationId,
      deletedAt: null,
      ...(whatsappOptedOnly ? { whatsappOptOut: false } : {}),
      ...(clauses.length > 0 ? { [matchKey]: clauses } : {}),
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phoneNumber: true,
      leadStatus: { select: { name: true, color: true } },
    },
  });

  return { count: contacts.length, contacts };
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @WBMSG/api test -- --reporter=verbose segment-evaluator
```

Expected: all tests pass including existing ones.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/segment-evaluator.ts apps/api/src/lib/segment-evaluator.test.ts
git commit -m "feat(segments): new FilterRule type discriminant + backward compat coercion"
```

---

## Task 2: DB migration — whatsappOptedOnly + segments route

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Modify: `apps/api/src/routes/segments.ts`
- Modify: `apps/api/src/routes/segments.test.ts`

**Interfaces:**
- Produces: `PATCH /v1/segments/:id` accepts `{ whatsappOptedOnly?: boolean }` in body

- [ ] **Step 1: Add field to Prisma schema**

In `apps/api/prisma/schema.prisma`, find the `Segment` model and add one line after `match`:

```prisma
model Segment {
  id                String           @id @default(uuid())
  organizationId    String           @map("organization_id")
  name              String
  filters           Json             @default("[]")
  match             String           @default("all")
  whatsappOptedOnly Boolean          @default(false) @map("whatsapp_opted_only")
  createdAt         DateTime         @default(now()) @map("created_at")
  updatedAt         DateTime         @updatedAt @map("updated_at")
  contacts          SegmentContact[]
  campaigns         CampaignSegment[]

  @@index([organizationId])
  @@map("segments")
}
```

- [ ] **Step 2: Run migration**

```bash
npx prisma migrate dev --name add_segment_whatsapp_opted_only
```

Expected: migration file created in `apps/api/prisma/migrations/`, client regenerated.

- [ ] **Step 3: Write failing test for PATCH whatsappOptedOnly**

Add to `apps/api/src/routes/segments.test.ts`:

```ts
describe("PATCH /v1/segments/:id — whatsappOptedOnly", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("persists whatsappOptedOnly when patched", async () => {
    mockPrisma.segment.findFirst.mockResolvedValue({
      id: "seg-1", organizationId: "org-1", name: "VIP", filters: [], match: "all", whatsappOptedOnly: false,
    });
    mockPrisma.segment.update.mockResolvedValue({
      id: "seg-1", organizationId: "org-1", name: "VIP", filters: [], match: "all", whatsappOptedOnly: true,
    });
    const res = await app.inject({
      method: "PATCH",
      url: "/v1/segments/seg-1",
      payload: { whatsappOptedOnly: true },
    });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.segment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ whatsappOptedOnly: true }),
      })
    );
  });
});
```

- [ ] **Step 4: Run to verify failure**

```bash
pnpm --filter @WBMSG/api test -- --reporter=verbose segments.test
```

Expected: FAIL — `whatsappOptedOnly` not handled in PATCH.

- [ ] **Step 5: Update PATCH handler in `segments.ts`**

Modify the `SegmentBody` interface and PATCH handler:

```ts
interface SegmentBody {
  name: string;
  filters: FilterRule[];
  match?: MatchMode;
  whatsappOptedOnly?: boolean;
}
```

In the PATCH handler's `data` object, add:
```ts
...(request.body.whatsappOptedOnly !== undefined ? { whatsappOptedOnly: request.body.whatsappOptedOnly } : {}),
```

Also update `POST /v1/segments/:id/evaluate` to pass `whatsappOptedOnly`:

```ts
const result = await evaluateSegment(
  fastify.prisma,
  organizationId,
  segment.filters as unknown as FilterRule[],
  (segment.match as MatchMode) ?? "all",
  (segment as { whatsappOptedOnly?: boolean }).whatsappOptedOnly ?? false
);
```

- [ ] **Step 6: Run tests**

```bash
pnpm --filter @WBMSG/api test -- --reporter=verbose segments.test
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations apps/api/src/routes/segments.ts apps/api/src/routes/segments.test.ts
git commit -m "feat(segments): add whatsappOptedOnly field and PATCH support"
```

---

## Task 3: GET /v1/contacts/tags endpoint

**Files:**
- Modify: `apps/api/src/routes/contacts.ts`
- Modify: `apps/api/src/routes/contacts.test.ts`

**Interfaces:**
- Produces: `GET /v1/contacts/tags` → `{ data: string[] }` sorted alphabetically

- [ ] **Step 1: Write failing test**

Add to `apps/api/src/routes/contacts.test.ts` (use the existing `buildApp` and `mockPrisma` pattern in that file):

```ts
describe("GET /v1/contacts/tags", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns deduplicated sorted tags for org", async () => {
    mockPrisma.contact.findMany.mockResolvedValue([
      { tags: ["VIP", "customer"] },
      { tags: ["VIP", "prospect"] },
      { tags: [] },
    ]);
    const res = await app.inject({ method: "GET", url: "/v1/contacts/tags" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: string[] }>();
    expect(body.data).toEqual(["VIP", "customer", "prospect"]);
  });

  it("returns empty array when no tags exist", async () => {
    mockPrisma.contact.findMany.mockResolvedValue([{ tags: [] }, { tags: [] }]);
    const res = await app.inject({ method: "GET", url: "/v1/contacts/tags" });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: string[] }>().data).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
pnpm --filter @WBMSG/api test -- --reporter=verbose contacts.test
```

Expected: FAIL — route not found (404).

- [ ] **Step 3: Add route to `contacts.ts`**

Find a logical place near the top of the route registrations (before parameterised routes like `GET /contacts/:id`) and add:

```ts
fastify.get("/contacts/tags", async (request, reply) => {
  const { organizationId } = request.auth;
  const rows = await fastify.prisma.contact.findMany({
    where: { organizationId, deletedAt: null },
    select: { tags: true },
  });
  const tagSet = new Set<string>();
  for (const row of rows) {
    for (const tag of row.tags) tagSet.add(tag);
  }
  return reply.send({ data: Array.from(tagSet).sort() });
});
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @WBMSG/api test -- --reporter=verbose contacts.test
```

Expected: new tests pass, no regressions.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/contacts.ts apps/api/src/routes/contacts.test.ts
git commit -m "feat(contacts): add GET /v1/contacts/tags endpoint"
```

---

## Task 4: Custom Dropdown component

**Files:**
- Create: `apps/web/components/segments/Dropdown.tsx`

**Interfaces:**
- Produces: `Dropdown` component, `DropdownOption` type — consumed by SegmentBuilderV2 (Task 5)

- [ ] **Step 1: Create `Dropdown.tsx`**

Create `apps/web/components/segments/Dropdown.tsx`:

```tsx
"use client";

import { useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, Check } from "lucide-react";

export interface DropdownOption {
  value: string;
  label: string;
}

interface DropdownProps {
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchable?: boolean;
  className?: string;
  disabled?: boolean;
}

export function Dropdown({
  options,
  value,
  onChange,
  placeholder = "Select...",
  searchable = false,
  className = "",
  disabled = false,
}: DropdownProps): React.JSX.Element {
  const [search, setSearch] = useState("");
  const selected = options.find((o) => o.value === value);
  const filtered = searchable
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  return (
    <DropdownMenu.Root onOpenChange={(open) => { if (!open) setSearch(""); }}>
      <DropdownMenu.Trigger
        disabled={disabled}
        className={`flex min-w-[120px] items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      >
        <span className="truncate text-left">{selected?.label ?? <span className="text-gray-400">{placeholder}</span>}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-500" />
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="z-50 min-w-[8rem] overflow-hidden rounded-lg border border-gray-200 bg-white p-1 shadow-lg animate-in fade-in-0 zoom-in-95"
          sideOffset={4}
          align="start"
        >
          {searchable && (
            <div className="px-2 pb-1 pt-1">
              <input
                autoFocus
                className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand-500"
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
              />
            </div>
          )}

          {filtered.map((o) => (
            <DropdownMenu.Item
              key={o.value}
              className="flex cursor-pointer items-center justify-between rounded-md px-3 py-2 text-sm text-gray-800 outline-none hover:bg-green-50 focus:bg-green-50 data-[highlighted]:bg-green-50"
              onSelect={() => onChange(o.value)}
            >
              <span>{o.label}</span>
              {o.value === value && <Check className="h-3.5 w-3.5 text-green-700" />}
            </DropdownMenu.Item>
          ))}

          {filtered.length === 0 && (
            <div className="px-3 py-2 text-xs text-gray-400">No results</div>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm --filter @WBMSG/web type-check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/segments/Dropdown.tsx
git commit -m "feat(segments): add custom Dropdown component (Radix DropdownMenu)"
```

---

## Task 5: SegmentBuilderV2 component

**Files:**
- Create: `apps/web/components/segments/types.ts`
- Create: `apps/web/components/segments/SegmentBuilderV2.tsx`

**Interfaces:**
- Produces: `SegmentBuilderV2` component with props `{ initial?, match?, whatsappOptedOnly?, onChange, onMatchChange?, onWhatsappOptedOnlyChange? }`
- Produces: exports `FilterRule`, `MatchMode` types (re-used by pages)

- [ ] **Step 1: Create `types.ts`**

Create `apps/web/components/segments/types.ts`:

```ts
export type MatchMode = "all" | "any";

export type TagsRule = {
  type: "tags";
  operator: "is" | "isNot";
  value: string;
};

export type FieldsRule = {
  type: "fields";
  field: string;
  operator: string;
  value?: string;
  valueTo?: string;
  customFieldId?: string;
};

export type EventSubCondition = {
  property: string;
  operator: "is" | "isNot" | "contains" | "doesNotContain" | "isEmpty" | "hasAnyValue";
  value?: string;
};

export type EventsRule = {
  type: "events";
  action: "hasDone";
  eventName: string;
  subConditions: EventSubCondition[];
  subMatch: "and" | "or";
};

export type FilterRule = TagsRule | FieldsRule | EventsRule;
export type FilterTab = "tags" | "fields" | "events";

export interface RowState {
  id: string;
  tab: FilterTab;
  rule: FilterRule;
}
```

- [ ] **Step 2: Create `SegmentBuilderV2.tsx`**

Create `apps/web/components/segments/SegmentBuilderV2.tsx`:

```tsx
"use client";

import { JSX, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { Trash2, PlusCircle } from "lucide-react";
import { Dropdown, type DropdownOption } from "./Dropdown";
import type { FilterRule, FilterTab, FieldsRule, MatchMode, RowState, TagsRule } from "./types";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

// ── Field config ──────────────────────────────────────────────────────────────

type FieldType = "text" | "date" | "boolean" | "status" | "user" | "group" | "customField";

interface FieldConfig { field: string; label: string; fieldType: FieldType }

const FIELD_CONFIGS: FieldConfig[] = [
  { field: "firstName",    label: "First Name",        fieldType: "text" },
  { field: "lastName",     label: "Last Name",         fieldType: "text" },
  { field: "email",        label: "Email",             fieldType: "text" },
  { field: "phoneNumber",  label: "Phone Number",      fieldType: "text" },
  { field: "leadStatusId", label: "Status",            fieldType: "status" },
  { field: "createdAt",    label: "Creation Date",     fieldType: "date" },
  { field: "lastMessageAt",label: "Last Message Date", fieldType: "date" },
  { field: "whatsappOptOut",label: "WhatsApp Opt-out", fieldType: "boolean" },
  { field: "disableBot",   label: "Bot Disabled",      fieldType: "boolean" },
  { field: "countryCode",  label: "Country",           fieldType: "text" },
  { field: "languageCode", label: "Language",          fieldType: "text" },
  { field: "assignedUserId",label: "Assigned User",    fieldType: "user" },
  { field: "groups",       label: "Groups",            fieldType: "group" },
];

const FIELD_OPTIONS: DropdownOption[] = FIELD_CONFIGS.map((f) => ({ value: f.field, label: f.label }));

function getFieldType(field: string): FieldType {
  return FIELD_CONFIGS.find((f) => f.field === field)?.fieldType ?? "text";
}

// ── Operator config ───────────────────────────────────────────────────────────

const TEXT_OPERATORS: DropdownOption[] = [
  { value: "is",             label: "Is" },
  { value: "isNot",          label: "Is not" },
  { value: "contains",       label: "Contains" },
  { value: "doesNotContain", label: "Does not contain" },
  { value: "isEmpty",        label: "Is empty" },
  { value: "hasAnyValue",    label: "Has any value" },
];

const DATE_OPERATORS: DropdownOption[] = [
  { value: "lessThanDaysAgo",  label: "Less than X days ago" },
  { value: "moreThanDaysAgo",  label: "More than X days ago" },
  { value: "after",            label: "After" },
  { value: "on",               label: "On" },
  { value: "before",           label: "Before" },
  { value: "isEmpty",          label: "Is empty" },
  { value: "hasAnyValue",      label: "Has any value" },
];

const BOOLEAN_OPERATORS: DropdownOption[] = [
  { value: "isTrue",      label: "Is true" },
  { value: "isFalse",     label: "Is false" },
  { value: "isEmpty",     label: "Is empty" },
  { value: "hasAnyValue", label: "Has any value" },
];

const STATUS_OPERATORS: DropdownOption[] = [{ value: "is", label: "Is" }];
const USER_GROUP_OPERATORS: DropdownOption[] = [
  { value: "is",      label: "Is" },
  { value: "isNot",   label: "Is not" },
  { value: "isEmpty", label: "Is empty" },
];

function getOperators(field: string): DropdownOption[] {
  const ft = getFieldType(field);
  switch (ft) {
    case "text":                 return TEXT_OPERATORS;
    case "date":                 return DATE_OPERATORS;
    case "boolean":              return BOOLEAN_OPERATORS;
    case "status":               return STATUS_OPERATORS;
    case "user": case "group":   return USER_GROUP_OPERATORS;
    case "customField":          return TEXT_OPERATORS;
    default:                     return TEXT_OPERATORS;
  }
}

function needsValue(field: string, operator: string): boolean {
  return !["isEmpty", "hasAnyValue", "isTrue", "isFalse"].includes(operator);
}

function isDateDaysOperator(operator: string): boolean {
  return operator === "lessThanDaysAgo" || operator === "moreThanDaysAgo";
}

function defaultRule(tab: FilterTab): FilterRule {
  if (tab === "tags") return { type: "tags", operator: "is", value: "" };
  if (tab === "events") return { type: "events", action: "hasDone", eventName: "", subConditions: [], subMatch: "and" };
  return { type: "fields", field: "firstName", operator: "is", value: "" };
}

function tabFromRule(rule: FilterRule): FilterTab {
  return rule.type as FilterTab;
}

// ── Tab switcher ──────────────────────────────────────────────────────────────

function TabSwitcher({ active, onChange }: { active: FilterTab; onChange: (t: FilterTab) => void }): JSX.Element {
  const tabs: FilterTab[] = ["tags", "fields", "events"];
  return (
    <div className="flex rounded-full border border-gray-200 bg-gray-50 p-0.5 w-fit">
      {tabs.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(t)}
          className={`rounded-full px-4 py-1 text-sm font-medium transition-colors capitalize ${
            active === t
              ? "bg-[#1D4B3E] text-white shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          {t.charAt(0).toUpperCase() + t.slice(1)}
        </button>
      ))}
    </div>
  );
}

// ── Tags row content ──────────────────────────────────────────────────────────

function TagsRowContent({
  rule,
  tags,
  onChange,
}: {
  rule: TagsRule;
  tags: DropdownOption[];
  onChange: (r: TagsRule) => void;
}): JSX.Element {
  const operatorOptions: DropdownOption[] = [
    { value: "is", label: "Is" },
    { value: "isNot", label: "Is Not" },
  ];
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <Dropdown
        options={operatorOptions}
        value={rule.operator}
        onChange={(v) => onChange({ ...rule, operator: v as TagsRule["operator"] })}
        className="w-28"
      />
      <span className="text-gray-300 text-lg">·········</span>
      <Dropdown
        options={tags}
        value={rule.value}
        onChange={(v) => onChange({ ...rule, value: v })}
        placeholder="Select a Tag"
        searchable
        className="w-56"
      />
    </div>
  );
}

// ── Fields row content ────────────────────────────────────────────────────────

function FieldsRowContent({
  rule,
  customFields,
  leadStatuses,
  onChange,
}: {
  rule: FieldsRule;
  customFields: DropdownOption[];
  leadStatuses: DropdownOption[];
  onChange: (r: FieldsRule) => void;
}): JSX.Element {
  const allFieldOptions: DropdownOption[] = [
    ...FIELD_OPTIONS,
    ...customFields.map((cf) => ({ value: `customField:${cf.value}`, label: cf.label })),
  ];

  const fieldValue = rule.field === "customField" && rule.customFieldId
    ? `customField:${rule.customFieldId}`
    : rule.field;

  function handleFieldChange(raw: string): void {
    if (raw.startsWith("customField:")) {
      const customFieldId = raw.slice("customField:".length);
      onChange({ type: "fields", field: "customField", operator: "is", customFieldId, value: "" });
    } else {
      const ops = getOperators(raw);
      onChange({ type: "fields", field: raw, operator: ops[0].value, value: "" });
    }
  }

  const operators = getOperators(rule.field);
  const ft = getFieldType(rule.field);
  const showValue = needsValue(rule.field, rule.operator);

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <Dropdown
        options={allFieldOptions}
        value={fieldValue}
        onChange={handleFieldChange}
        placeholder="Select a Field"
        className="w-48"
      />
      <span className="text-gray-300 text-lg">·········</span>
      <Dropdown
        options={operators}
        value={rule.operator}
        onChange={(v) => onChange({ ...rule, operator: v, value: "" })}
        className="w-44"
      />
      {showValue && (
        <>
          <span className="text-gray-300 text-lg">·········</span>
          {ft === "status" ? (
            <Dropdown
              options={leadStatuses}
              value={rule.value ?? ""}
              onChange={(v) => onChange({ ...rule, value: v })}
              placeholder="Select Status"
              className="w-48"
            />
          ) : ft === "date" && !isDateDaysOperator(rule.operator) ? (
            <input
              type="date"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              value={rule.value ?? ""}
              onChange={(e) => onChange({ ...rule, value: e.target.value })}
            />
          ) : (
            <input
              type={isDateDaysOperator(rule.operator) ? "number" : "text"}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 w-40"
              placeholder={isDateDaysOperator(rule.operator) ? "Days" : "Enter a value"}
              value={rule.value ?? ""}
              onChange={(e) => onChange({ ...rule, value: e.target.value })}
            />
          )}
          {isDateDaysOperator(rule.operator) && (
            <span className="text-sm text-gray-500">days ago</span>
          )}
        </>
      )}
    </div>
  );
}

// ── Events placeholder ────────────────────────────────────────────────────────

function EventsPlaceholder(): JSX.Element {
  return (
    <div className="rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-400 text-center">
      Event-based filtering coming soon
    </div>
  );
}

// ── Row connector (AND / OR) ──────────────────────────────────────────────────

function RowConnector({ match, onChange }: { match: MatchMode; onChange: (m: MatchMode) => void }): JSX.Element {
  return (
    <div className="flex items-center justify-start py-1 pl-4">
      <div className="flex items-center gap-px">
        <div className="w-px h-4 bg-gray-300" />
      </div>
      <Dropdown
        options={[{ value: "all", label: "AND" }, { value: "any", label: "OR" }]}
        value={match}
        onChange={(v) => onChange(v as MatchMode)}
        className="w-24 border-gray-200 text-xs"
      />
      <div className="w-px h-4 bg-gray-300" />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface SegmentBuilderV2Props {
  initial?: FilterRule[];
  match?: MatchMode;
  whatsappOptedOnly?: boolean;
  onChange: (filters: FilterRule[]) => void;
  onMatchChange?: (match: MatchMode) => void;
  onWhatsappOptedOnlyChange?: (value: boolean) => void;
}

export function SegmentBuilderV2({
  initial = [],
  match = "all",
  whatsappOptedOnly = false,
  onChange,
  onMatchChange,
  onWhatsappOptedOnlyChange,
}: SegmentBuilderV2Props): JSX.Element {
  const { getToken } = useAuth();
  const [rows, setRows] = useState<RowState[]>(
    () => initial.map((rule) => ({ id: crypto.randomUUID(), tab: tabFromRule(rule), rule }))
  );
  const [tags, setTags] = useState<DropdownOption[]>([]);
  const [leadStatuses, setLeadStatuses] = useState<DropdownOption[]>([]);
  const [customFields, setCustomFields] = useState<DropdownOption[]>([]);

  useEffect(() => {
    void (async () => {
      const token = await getToken();
      const headers = { Authorization: `Bearer ${token ?? ""}` };
      const [tagsRes, statusRes, cfRes] = await Promise.all([
        fetch(`${API_URL}/v1/contacts/tags`, { headers }),
        fetch(`${API_URL}/v1/contacts/lead-statuses`, { headers }),
        fetch(`${API_URL}/v1/contacts/custom-fields`, { headers }),
      ]);
      if (tagsRes.ok) {
        const body = (await tagsRes.json()) as { data: string[] };
        setTags(body.data.map((t) => ({ value: t, label: t })));
      }
      if (statusRes.ok) {
        const body = (await statusRes.json()) as { data: Array<{ id: string; name: string }> };
        setLeadStatuses(body.data.map((s) => ({ value: s.id, label: s.name })));
      }
      if (cfRes.ok) {
        const body = (await cfRes.json()) as { data: Array<{ id: string; inputName: string }> };
        setCustomFields(body.data.map((cf) => ({ value: cf.id, label: cf.inputName })));
      }
    })();
  }, [getToken]);

  useEffect(() => {
    setRows(initial.map((rule) => ({ id: crypto.randomUUID(), tab: tabFromRule(rule), rule })));
  }, [initial]);

  function updateRow(index: number, rule: FilterRule): void {
    const next = rows.map((r, i) => (i === index ? { ...r, rule } : r));
    setRows(next);
    onChange(next.map((r) => r.rule));
  }

  function changeTab(index: number, tab: FilterTab): void {
    const rule = defaultRule(tab);
    const next = rows.map((r, i) => (i === index ? { ...r, tab, rule } : r));
    setRows(next);
    onChange(next.map((r) => r.rule));
  }

  function addRow(): void {
    const rule = defaultRule("fields");
    const next = [...rows, { id: crypto.randomUUID(), tab: "fields" as FilterTab, rule }];
    setRows(next);
    onChange(next.map((r) => r.rule));
  }

  function removeRow(index: number): void {
    const next = rows.filter((_, i) => i !== index);
    setRows(next);
    onChange(next.map((r) => r.rule));
  }

  return (
    <div className="space-y-1">
      <p className="text-sm font-medium text-gray-700 mb-3">Filter Contacts by</p>

      {rows.map((row, i) => (
        <div key={row.id}>
          <div className="rounded-xl border border-gray-200 bg-white p-4 relative">
            {/* Delete */}
            <button
              type="button"
              onClick={() => removeRow(i)}
              className="absolute top-3 right-3 text-red-400 hover:text-red-600"
              aria-label="Remove condition"
            >
              <Trash2 className="h-4 w-4" />
            </button>

            {/* Tab switcher */}
            <div className="mb-3">
              <TabSwitcher active={row.tab} onChange={(t) => changeTab(i, t)} />
            </div>

            {/* Row content */}
            {row.tab === "tags" && (
              <TagsRowContent
                rule={row.rule as TagsRule}
                tags={tags}
                onChange={(r) => updateRow(i, r)}
              />
            )}
            {row.tab === "fields" && (
              <FieldsRowContent
                rule={row.rule as import("./types").FieldsRule}
                customFields={customFields}
                leadStatuses={leadStatuses}
                onChange={(r) => updateRow(i, r)}
              />
            )}
            {row.tab === "events" && <EventsPlaceholder />}
          </div>

          {/* Connector between rows */}
          {i < rows.length - 1 && (
            <RowConnector match={match} onChange={(m) => onMatchChange?.(m)} />
          )}
        </div>
      ))}

      {/* Add condition */}
      <button
        type="button"
        onClick={addRow}
        className="flex items-center gap-2 text-sm text-[#1D4B3E] hover:text-green-700 mt-3"
      >
        <PlusCircle className="h-5 w-5" />
        Add Condition
      </button>

      {/* WhatsApp opted toggle */}
      <div className="mt-4 flex items-center gap-3 rounded-lg bg-gray-50 border border-gray-200 px-4 py-3">
        <button
          type="button"
          role="switch"
          aria-checked={whatsappOptedOnly}
          onClick={() => onWhatsappOptedOnlyChange?.(!whatsappOptedOnly)}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 ${
            whatsappOptedOnly ? "bg-[#1D4B3E]" : "bg-gray-200"
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${
              whatsappOptedOnly ? "translate-x-4" : "translate-x-0"
            }`}
          />
        </button>
        <span className="text-sm text-gray-700">
          Only include customers whose &apos;WhatsApp opted&apos; is true
        </span>
        <span className="rounded-full bg-[#1D4B3E] px-2 py-0.5 text-xs font-medium text-white">
          Recommended
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm --filter @WBMSG/web type-check
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/segments/types.ts apps/web/components/segments/SegmentBuilderV2.tsx
git commit -m "feat(segments): add SegmentBuilderV2 component with tab-based UI"
```

---

## Task 6: Wire up pages

**Files:**
- Modify: `apps/web/app/(dashboard)/contacts/segments/[id]/page.tsx`
- Modify: `apps/web/app/(dashboard)/contacts/segments/page.tsx`

**Interfaces:**
- Consumes: `SegmentBuilderV2`, `FilterRule`, `MatchMode` from `@/components/segments/SegmentBuilderV2`

- [ ] **Step 1: Update `SegmentDetailPage`**

Replace the entire file `apps/web/app/(dashboard)/contacts/segments/[id]/page.tsx`:

```tsx
"use client";

import { JSX, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { SegmentBuilderV2 } from "@/components/segments/SegmentBuilderV2";
import type { FilterRule, MatchMode } from "@/components/segments/types";
import { Button } from "@/components/ui/Button";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface ContactPreview {
  id: string;
  firstName: string | null;
  lastName: string | null;
  phoneNumber: string;
  leadStatus: { name: string; color: string } | null;
}

interface Segment {
  id: string;
  name: string;
  filters: FilterRule[];
  match: MatchMode;
  whatsappOptedOnly: boolean;
}

export default function SegmentDetailPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const { getToken } = useAuth();
  const [segment, setSegment] = useState<Segment | null>(null);
  const [filters, setFilters] = useState<FilterRule[]>([]);
  const [match, setMatch] = useState<MatchMode>("all");
  const [whatsappOptedOnly, setWhatsappOptedOnly] = useState(false);
  const [contacts, setContacts] = useState<ContactPreview[]>([]);
  const [matchCount, setMatchCount] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/segments/${id}`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (cancelled) return;
      if (res.ok) {
        const s = (await res.json() as { data: Segment }).data;
        setSegment(s);
        setFilters(s.filters);
        setMatch(s.match ?? "all");
        setWhatsappOptedOnly(s.whatsappOptedOnly ?? false);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id, getToken]);

  async function handleSave(): Promise<void> {
    setSaving(true);
    try {
      const token = await getToken();
      const patchRes = await fetch(`${API_URL}/v1/segments/${id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({ filters, match, whatsappOptedOnly }),
      });
      if (!patchRes.ok) return;
      setSegment((await patchRes.json() as { data: Segment }).data);
      const evalRes = await fetch(`${API_URL}/v1/segments/${id}/evaluate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (evalRes.ok) {
        const result = (await evalRes.json() as { data: { count: number; contacts: ContactPreview[] } }).data;
        setMatchCount(result.count);
        setContacts(result.contacts);
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="animate-pulse h-40 bg-gray-100 rounded-xl" />;
  if (!segment) return <p className="text-gray-500">Segment not found.</p>;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/contacts/segments" className="text-sm text-gray-500 hover:text-gray-700">← Segments</Link>
        <h1 className="text-2xl font-semibold text-gray-900">{segment.name}</h1>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <SegmentBuilderV2
          initial={filters}
          match={match}
          whatsappOptedOnly={whatsappOptedOnly}
          onChange={setFilters}
          onMatchChange={setMatch}
          onWhatsappOptedOnlyChange={setWhatsappOptedOnly}
        />
        <div className="flex items-center gap-3 pt-2">
          <Button onClick={() => { void handleSave(); }} disabled={saving}>
            {saving ? "Saving…" : "Save Segment"}
          </Button>
          {matchCount !== null && (
            <span className="text-sm text-green-700 font-medium">
              {matchCount} contact{matchCount !== 1 ? "s" : ""} match this segment
            </span>
          )}
        </div>
      </div>

      {/* Matching contacts table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="font-medium text-gray-800">
            Matching Contacts {matchCount !== null ? `(${matchCount})` : ""}
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
            {contacts.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-gray-400">
                  {matchCount === null ? "Save filters to see matching contacts." : "No contacts match this segment."}
                </td>
              </tr>
            ) : contacts.map((c) => (
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
    </div>
  );
}
```

- [ ] **Step 2: Update `SegmentsPage` — add Save Segment modal**

Replace the entire file `apps/web/app/(dashboard)/contacts/segments/page.tsx`:

```tsx
"use client";

import { JSX, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { canAccess } from "@/lib/can";
import { PermissionGate } from "@/components/PermissionGate";
import { SegmentBuilderV2 } from "@/components/segments/SegmentBuilderV2";
import type { FilterRule, MatchMode } from "@/components/segments/types";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface Segment {
  id: string;
  name: string;
  filters: FilterRule[];
  match: MatchMode;
  whatsappOptedOnly: boolean;
}

export default function SegmentsPage(): JSX.Element {
  const { getToken } = useAuth();
  const { user } = useCurrentUser();
  const canManage = canAccess(user, "contacts_access");
  const qc = useQueryClient();

  const [modalOpen, setModalOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newFilters, setNewFilters] = useState<FilterRule[]>([]);
  const [newMatch, setNewMatch] = useState<MatchMode>("all");
  const [newWhatsappOptedOnly, setNewWhatsappOptedOnly] = useState(false);

  const { data: segments = [], isLoading } = useQuery<Segment[]>({
    queryKey: ["segments"],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/segments`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (!res.ok) return [];
      return (await res.json() as { data: Segment[] }).data;
    },
  });

  const createSegment = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/segments`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, filters: newFilters, match: newMatch, whatsappOptedOnly: newWhatsappOptedOnly }),
      });
      if (!res.ok) throw new Error("Failed to create segment");
      return res.json();
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["segments"] });
      setModalOpen(false);
      setNewName("");
      setNewFilters([]);
      setNewMatch("all");
      setNewWhatsappOptedOnly(false);
    },
  });

  return (
    <PermissionGate permission="contacts_access">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-gray-900">Segments</h1>
          {canManage && (
            <Button onClick={() => setModalOpen(true)}>+ Create New Segment</Button>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-card divide-y divide-gray-100">
          {isLoading ? (
            <p className="px-4 py-8 text-center text-sm text-gray-400">Loading…</p>
          ) : segments.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-400">No segments yet. Create one to target contacts in campaigns.</p>
          ) : segments.map((s) => (
            <div key={s.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium text-gray-900">{s.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {s.filters.length} filter{s.filters.length !== 1 ? "s" : ""} · {s.match === "any" ? "ANY" : "ALL"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="blue">{s.filters.length} rules</Badge>
                <Link href={`/contacts/segments/${s.id}`} className="text-sm text-brand-600 hover:underline">
                  Edit
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Save Segment modal */}
      <Dialog.Root open={modalOpen} onOpenChange={setModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/40 z-40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-xl focus:outline-none max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <Dialog.Title className="text-lg font-semibold text-gray-900">Save Segment</Dialog.Title>
              <Dialog.Close className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </Dialog.Close>
            </div>

            <div className="mb-4">
              <input
                autoFocus
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="Segment name (e.g. All VIP Contacts)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>

            <SegmentBuilderV2
              initial={newFilters}
              match={newMatch}
              whatsappOptedOnly={newWhatsappOptedOnly}
              onChange={setNewFilters}
              onMatchChange={setNewMatch}
              onWhatsappOptedOnlyChange={setNewWhatsappOptedOnly}
            />

            <div className="mt-6 flex justify-end">
              <Button
                onClick={() => createSegment.mutate()}
                disabled={!newName.trim() || createSegment.isPending}
              >
                {createSegment.isPending ? "Saving…" : "Save Segment"}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </PermissionGate>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm --filter @WBMSG/web type-check
```

Expected: no errors.

- [ ] **Step 4: Run full test suite**

```bash
pnpm --filter @WBMSG/api test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/\(dashboard\)/contacts/segments/
git commit -m "feat(segments): wire SegmentBuilderV2 into segment detail and list pages"
```

---

## Done — PR1 Checklist

- [ ] `evaluateSegment` handles new `type`-discriminated rules and new operators
- [ ] Old-format rules (no `type` field) still evaluate correctly
- [ ] `whatsappOptedOnly` toggle persisted and applied in evaluation
- [ ] `GET /v1/contacts/tags` returns deduplicated sorted tag list
- [ ] `SegmentBuilderV2` renders Tags and Fields tabs with custom Dropdown
- [ ] AND/OR connector changes global match mode across all rows
- [ ] Save Segment modal opens from Segments list page
- [ ] All API tests pass: `pnpm --filter @WBMSG/api test`
- [ ] TypeScript clean: `pnpm --filter @WBMSG/web type-check`
