# Segment Filter Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand segment filters to all contact fields and add AND/OR match mode with a reworked filter builder UI.

**Architecture:** Add a `match` column to the `Segment` table, rewrite `segment-evaluator.ts` to support a discriminated `FilterRule` union covering all contact fields, update the API routes to persist/return `match`, and rebuild `SegmentBuilder.tsx` with grouped fields, smart operators, and type-aware value inputs.

**Tech Stack:** Prisma, Fastify, Vitest, Next.js 15 App Router, React Query, Tailwind CSS

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `apps/api/prisma/schema.prisma` | Modify | Add `match` column to `Segment` model |
| `apps/api/prisma/migrations/20260527000001_segment_match/migration.sql` | Create | Raw SQL for the migration |
| `apps/api/src/lib/segment-evaluator.ts` | Rewrite | Full `FilterRule` union + AND/OR evaluator |
| `apps/api/src/routes/segments.ts` | Modify | Persist/return `match`, expand evaluate response |
| `apps/api/src/routes/segments.test.ts` | Modify | Update tests for new shapes |
| `apps/web/components/segments/SegmentBuilder.tsx` | Rewrite | Grouped fields, match toggle, smart operators |
| `apps/web/app/(dashboard)/contacts/segments/[id]/page.tsx` | Modify | Pass `match`, use evaluate for contacts, show count |
| `apps/web/app/(dashboard)/contacts/segments/page.tsx` | Modify | Show match mode next to filter count |

---

## Task 1: Add `match` column to Prisma schema and run migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260527000001_segment_match/migration.sql`

- [ ] **Step 1: Add `match` field to the Segment model in schema.prisma**

Find the `model Segment` block (around line 551) and add the `match` field:

```prisma
model Segment {
  id             String           @id @default(uuid())
  organizationId String           @map("organization_id")
  name           String
  filters        Json             @default("[]")
  match          String           @default("all")
  createdAt      DateTime         @default(now()) @map("created_at")
  updatedAt      DateTime         @updatedAt @map("updated_at")
  contacts       SegmentContact[]
  campaigns      CampaignSegment[]

  @@index([organizationId])
  @@map("segments")
}
```

- [ ] **Step 2: Push schema to database**

```bash
pnpm --filter @WBMSG/api exec prisma db push --accept-data-loss
```

Expected: `Your database is now in sync with your Prisma schema.`

- [ ] **Step 3: Create the migration file manually**

Create file `apps/api/prisma/migrations/20260527000001_segment_match/migration.sql`:

```sql
-- AddColumn
ALTER TABLE "segments" ADD COLUMN "match" TEXT NOT NULL DEFAULT 'all';
```

- [ ] **Step 4: Mark migration as applied**

```bash
pnpm --filter @WBMSG/api exec prisma migrate resolve --applied 20260527000001_segment_match
```

Expected: `Migration 20260527000001_segment_match marked as applied.`

- [ ] **Step 5: Regenerate Prisma client**

```bash
pnpm --filter @WBMSG/api generate
```

Expected: `Generated Prisma Client` with no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/
git commit -m "feat(segments): add match column to segments table"
```

---

## Task 2: Rewrite `segment-evaluator.ts` with full FilterRule union

**Files:**
- Rewrite: `apps/api/src/lib/segment-evaluator.ts`

- [ ] **Step 1: Write the failing test first**

Add a new test file `apps/api/src/lib/segment-evaluator.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";

// Mock prisma for unit tests
const mockFindMany = vi.fn();
const mockPrisma = {
  contact: { findMany: mockFindMany },
} as unknown as PrismaClient;

beforeEach(() => { vi.clearAllMocks(); });

describe("evaluateSegment", () => {
  it("returns count and contacts for lifecycleStage equals", async () => {
    const { evaluateSegment } = await import("./segment-evaluator.js");
    mockFindMany.mockResolvedValue([
      { id: "c1", firstName: "Ravi", lastName: "Kumar", phoneNumber: "+919000000001", lifecycleStage: "lead" },
    ]);
    const result = await evaluateSegment(mockPrisma, "org-1", [
      { field: "lifecycleStage", operator: "equals", value: "lead" },
    ], "all");
    expect(result.count).toBe(1);
    expect(result.contacts[0].phoneNumber).toBe("+919000000001");
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ AND: [{ lifecycleStage: "lead" }] }),
    }));
  });

  it("uses OR clause when match is any", async () => {
    const { evaluateSegment } = await import("./segment-evaluator.js");
    mockFindMany.mockResolvedValue([]);
    await evaluateSegment(mockPrisma, "org-1", [
      { field: "lifecycleStage", operator: "equals", value: "lead" },
      { field: "tags", operator: "contains", value: "VIP" },
    ], "any");
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ OR: expect.any(Array) }),
    }));
  });

  it("evaluates tags doesNotContain", async () => {
    const { evaluateSegment } = await import("./segment-evaluator.js");
    mockFindMany.mockResolvedValue([]);
    await evaluateSegment(mockPrisma, "org-1", [
      { field: "tags", operator: "doesNotContain", value: "spam" },
    ], "all");
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ AND: [{ NOT: { tags: { has: "spam" } } }] }),
    }));
  });

  it("evaluates whatsappOptOut isTrue", async () => {
    const { evaluateSegment } = await import("./segment-evaluator.js");
    mockFindMany.mockResolvedValue([]);
    await evaluateSegment(mockPrisma, "org-1", [
      { field: "whatsappOptOut", operator: "isTrue" },
    ], "all");
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ AND: [{ whatsappOptOut: true }] }),
    }));
  });

  it("evaluates createdAt between", async () => {
    const { evaluateSegment } = await import("./segment-evaluator.js");
    mockFindMany.mockResolvedValue([]);
    await evaluateSegment(mockPrisma, "org-1", [
      { field: "createdAt", operator: "between", value: "2024-01-01", valueTo: "2024-12-31" },
    ], "all");
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        AND: [{ createdAt: { gte: new Date("2024-01-01"), lte: new Date("2024-12-31") } }],
      }),
    }));
  });

  it("evaluates customField equals", async () => {
    const { evaluateSegment } = await import("./segment-evaluator.js");
    mockFindMany.mockResolvedValue([]);
    await evaluateSegment(mockPrisma, "org-1", [
      { field: "customField", operator: "equals", customFieldId: "cf-1", value: "Gold" },
    ], "all");
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        AND: [{ customFieldValues: { some: { fieldId: "cf-1", fieldValue: { equals: "Gold" } } } }],
      }),
    }));
  });

  it("returns empty contacts when no filters", async () => {
    const { evaluateSegment } = await import("./segment-evaluator.js");
    mockFindMany.mockResolvedValue([
      { id: "c1", firstName: "A", lastName: null, phoneNumber: "+91900", lifecycleStage: null },
    ]);
    const result = await evaluateSegment(mockPrisma, "org-1", [], "all");
    expect(result.count).toBe(1);
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId: "org-1", deletedAt: null },
    }));
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
pnpm --filter @WBMSG/api test src/lib/segment-evaluator.test.ts
```

Expected: FAIL — `evaluateSegment` is not defined with the new signature.

- [ ] **Step 3: Rewrite `apps/api/src/lib/segment-evaluator.ts`**

```typescript
import type { PrismaClient } from "@prisma/client";

export type MatchMode = "all" | "any";

export type FilterRule =
  | { field: "firstName" | "lastName" | "email" | "phoneNumber"; operator: "contains" | "equals" | "startsWith" | "isEmpty" | "isNotEmpty"; value?: string }
  | { field: "lifecycleStage"; operator: "equals" | "isNot"; value: string }
  | { field: "tags"; operator: "contains" | "doesNotContain"; value: string }
  | { field: "countryCode" | "languageCode"; operator: "equals" | "isNot"; value: string }
  | { field: "companyName"; operator: "contains" | "equals" | "isEmpty" | "isNotEmpty"; value?: string }
  | { field: "assignedUserId"; operator: "equals" | "isNot" | "isEmpty"; value?: string }
  | { field: "groups"; operator: "memberOf" | "notMemberOf"; value: string }
  | { field: "whatsappOptOut" | "disableBot"; operator: "isTrue" | "isFalse" }
  | { field: "createdAt" | "lastMessageAt"; operator: "after" | "before" | "between"; value: string; valueTo?: string }
  | { field: "customField"; operator: "contains" | "equals" | "isEmpty"; customFieldId: string; value?: string };

export interface EvaluateResult {
  count: number;
  contacts: Array<{
    id: string;
    firstName: string | null;
    lastName: string | null;
    phoneNumber: string;
    lifecycleStage: string | null;
  }>;
}

function buildClause(rule: FilterRule): Record<string, unknown> {
  switch (rule.field) {
    case "firstName":
    case "lastName":
    case "email":
    case "phoneNumber": {
      const col = rule.field;
      if (rule.operator === "isEmpty") return { [col]: null };
      if (rule.operator === "isNotEmpty") return { NOT: { [col]: null } };
      if (rule.operator === "contains") return { [col]: { contains: rule.value, mode: "insensitive" } };
      if (rule.operator === "startsWith") return { [col]: { startsWith: rule.value, mode: "insensitive" } };
      return { [col]: { equals: rule.value, mode: "insensitive" } };
    }
    case "lifecycleStage":
      if (rule.operator === "isNot") return { NOT: { lifecycleStage: rule.value } };
      return { lifecycleStage: rule.value };
    case "tags":
      if (rule.operator === "doesNotContain") return { NOT: { tags: { has: rule.value } } };
      return { tags: { has: rule.value } };
    case "countryCode":
    case "languageCode": {
      const col = rule.field;
      if (rule.operator === "isNot") return { NOT: { [col]: rule.value } };
      return { [col]: rule.value };
    }
    case "companyName":
      if (rule.operator === "isEmpty") return { companyId: null };
      if (rule.operator === "isNotEmpty") return { NOT: { companyId: null } };
      if (rule.operator === "contains") return { company: { name: { contains: rule.value, mode: "insensitive" } } };
      return { company: { name: { equals: rule.value, mode: "insensitive" } } };
    case "assignedUserId":
      if (rule.operator === "isEmpty") return { assignedUserId: null };
      if (rule.operator === "isNot") return { NOT: { assignedUserId: rule.value } };
      return { assignedUserId: rule.value };
    case "groups":
      if (rule.operator === "notMemberOf") return { NOT: { groupContacts: { some: { groupId: rule.value } } } };
      return { groupContacts: { some: { groupId: rule.value } } };
    case "whatsappOptOut":
      return { whatsappOptOut: rule.operator === "isTrue" };
    case "disableBot":
      return { disableBot: rule.operator === "isTrue" };
    case "createdAt":
      if (rule.operator === "between") return { createdAt: { gte: new Date(rule.value), lte: new Date(rule.valueTo!) } };
      if (rule.operator === "after") return { createdAt: { gte: new Date(rule.value) } };
      return { createdAt: { lte: new Date(rule.value) } };
    case "lastMessageAt":
      if (rule.operator === "between") return { conversations: { some: { createdAt: { gte: new Date(rule.value), lte: new Date(rule.valueTo!) } } } };
      if (rule.operator === "after") return { conversations: { some: { createdAt: { gte: new Date(rule.value) } } } };
      return { conversations: { some: { createdAt: { lte: new Date(rule.value) } } } };
    case "customField": {
      if (rule.operator === "isEmpty") return { NOT: { customFieldValues: { some: { fieldId: rule.customFieldId } } } };
      const valueClause =
        rule.operator === "contains"
          ? { contains: rule.value, mode: "insensitive" }
          : { equals: rule.value };
      return { customFieldValues: { some: { fieldId: rule.customFieldId, fieldValue: valueClause } } };
    }
  }
}

export async function evaluateSegment(
  prisma: PrismaClient,
  organizationId: string,
  filters: FilterRule[],
  match: MatchMode = "all"
): Promise<EvaluateResult> {
  const clauses = filters.map(buildClause);
  const matchKey = match === "any" ? "OR" : "AND";

  const contacts = await prisma.contact.findMany({
    where: {
      organizationId,
      deletedAt: null,
      ...(clauses.length > 0 ? { [matchKey]: clauses } : {}),
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phoneNumber: true,
      lifecycleStage: true,
    },
  });

  return { count: contacts.length, contacts };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm --filter @WBMSG/api test src/lib/segment-evaluator.test.ts
```

Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/segment-evaluator.ts apps/api/src/lib/segment-evaluator.test.ts
git commit -m "feat(segments): rewrite evaluator with full FilterRule union and AND/OR support"
```

---

## Task 3: Update `segments.ts` routes and tests

**Files:**
- Modify: `apps/api/src/routes/segments.ts`
- Modify: `apps/api/src/routes/segments.test.ts`

- [ ] **Step 1: Rewrite `apps/api/src/routes/segments.ts`**

```typescript
import type { FastifyPluginAsync } from "fastify";
import { evaluateSegment, type FilterRule, type MatchMode } from "../lib/segment-evaluator.js";
import type { SegmentId } from "@WBMSG/shared";

interface SegmentBody {
  name: string;
  filters: FilterRule[];
  match?: MatchMode;
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
    if (!segment) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Segment not found" } });
    }
    return reply.send({ data: segment });
  });

  fastify.post<{ Body: SegmentBody }>("/segments", async (request, reply) => {
    const { organizationId } = request.auth;
    const segment = await fastify.prisma.segment.create({
      data: {
        organizationId,
        name: request.body.name,
        filters: request.body.filters as object,
        match: request.body.match ?? "all",
      },
    });
    return reply.status(201).send({ data: segment });
  });

  fastify.patch<{ Params: { id: SegmentId }; Body: Partial<SegmentBody> }>(
    "/segments/:id",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const existing = await fastify.prisma.segment.findFirst({
        where: { id: request.params.id, organizationId },
      });
      if (!existing) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Segment not found" } });
      }
      const segment = await fastify.prisma.segment.update({
        where: { id: request.params.id },
        data: {
          ...(request.body.name !== undefined ? { name: request.body.name } : {}),
          ...(request.body.filters !== undefined ? { filters: request.body.filters as object } : {}),
          ...(request.body.match !== undefined ? { match: request.body.match } : {}),
        },
      });
      return reply.send({ data: segment });
    }
  );

  fastify.delete<{ Params: { id: SegmentId } }>("/segments/:id", async (request, reply) => {
    const { organizationId } = request.auth;
    const existing = await fastify.prisma.segment.findFirst({
      where: { id: request.params.id, organizationId },
    });
    if (!existing) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Segment not found" } });
    }
    await fastify.prisma.segment.delete({ where: { id: request.params.id } });
    return reply.status(204).send();
  });

  fastify.post<{ Params: { id: SegmentId } }>("/segments/:id/evaluate", async (request, reply) => {
    const { organizationId } = request.auth;
    const segment = await fastify.prisma.segment.findFirst({
      where: { id: request.params.id, organizationId },
    });
    if (!segment) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Segment not found" } });
    }
    const result = await evaluateSegment(
      fastify.prisma,
      organizationId,
      segment.filters as unknown as FilterRule[],
      (segment.match as MatchMode) ?? "all"
    );
    return reply.send({ data: result });
  });
};
```

- [ ] **Step 2: Update `apps/api/src/routes/segments.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

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

const mockAuth = { userId: "user-1", organizationId: "org-1", role: "admin" as const, permissions: {} };

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (request) => { request.auth = mockAuth; });
  const { segmentsRouter } = await import("./segments.js");
  await app.register(segmentsRouter, { prefix: "/v1" });
  return app;
}

describe("GET /v1/segments", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns segments for org", async () => {
    mockPrisma.segment.findMany.mockResolvedValue([
      { id: "seg-1", organizationId: "org-1", name: "Hot Leads", filters: [], match: "all" },
    ]);
    const res = await app.inject({ method: "GET", url: "/v1/segments" });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: unknown[] }>().data).toHaveLength(1);
  });
});

describe("POST /v1/segments", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("creates segment with match field", async () => {
    mockPrisma.segment.create.mockResolvedValue({
      id: "seg-1", organizationId: "org-1", name: "VIP", filters: [], match: "any",
    });
    const res = await app.inject({
      method: "POST",
      url: "/v1/segments",
      payload: { name: "VIP", filters: [], match: "any" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json<{ data: { match: string } }>().data.match).toBe("any");
    expect(mockPrisma.segment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ match: "any" }) })
    );
  });

  it("defaults match to all when not provided", async () => {
    mockPrisma.segment.create.mockResolvedValue({
      id: "seg-2", organizationId: "org-1", name: "New", filters: [], match: "all",
    });
    await app.inject({ method: "POST", url: "/v1/segments", payload: { name: "New", filters: [] } });
    expect(mockPrisma.segment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ match: "all" }) })
    );
  });
});

describe("POST /v1/segments/:id/evaluate", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns count and contacts array", async () => {
    mockPrisma.segment.findFirst.mockResolvedValue({
      id: "seg-1", organizationId: "org-1", match: "all",
      filters: [{ field: "lifecycleStage", operator: "equals", value: "lead" }],
    });
    mockPrisma.contact.findMany.mockResolvedValue([
      { id: "c-1", firstName: "Ravi", lastName: "Kumar", phoneNumber: "+919000000001", lifecycleStage: "lead" },
    ]);
    const res = await app.inject({ method: "POST", url: "/v1/segments/seg-1/evaluate" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: { count: number; contacts: unknown[] } }>();
    expect(body.data.count).toBe(1);
    expect(body.data.contacts).toHaveLength(1);
  });
});

describe("DELETE /v1/segments/:id", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns 404 when segment not in org", async () => {
    mockPrisma.segment.findFirst.mockResolvedValue(null);
    const res = await app.inject({ method: "DELETE", url: "/v1/segments/seg-999" });
    expect(res.statusCode).toBe(404);
  });
});
```

- [ ] **Step 3: Run tests**

```bash
pnpm --filter @WBMSG/api test src/routes/segments.test.ts
```

Expected: All 5 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/segments.ts apps/api/src/routes/segments.test.ts
git commit -m "feat(segments): add match field to routes, expand evaluate response to count+contacts"
```

---

## Task 4: Rewrite `SegmentBuilder.tsx`

**Files:**
- Rewrite: `apps/web/components/segments/SegmentBuilder.tsx`

- [ ] **Step 1: Rewrite the component**

```tsx
"use client";

import { JSX, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { Button } from "@/components/ui/Button";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

// ── Types ────────────────────────────────────────────────────────────────────

export type MatchMode = "all" | "any";

export type FilterRule =
  | { field: "firstName" | "lastName" | "email" | "phoneNumber"; operator: "contains" | "equals" | "startsWith" | "isEmpty" | "isNotEmpty"; value?: string }
  | { field: "lifecycleStage"; operator: "equals" | "isNot"; value: string }
  | { field: "tags"; operator: "contains" | "doesNotContain"; value: string }
  | { field: "countryCode" | "languageCode"; operator: "equals" | "isNot"; value: string }
  | { field: "companyName"; operator: "contains" | "equals" | "isEmpty" | "isNotEmpty"; value?: string }
  | { field: "assignedUserId"; operator: "equals" | "isNot" | "isEmpty"; value?: string }
  | { field: "groups"; operator: "memberOf" | "notMemberOf"; value: string }
  | { field: "whatsappOptOut" | "disableBot"; operator: "isTrue" | "isFalse" }
  | { field: "createdAt" | "lastMessageAt"; operator: "after" | "before" | "between"; value: string; valueTo?: string }
  | { field: "customField"; operator: "contains" | "equals" | "isEmpty"; customFieldId: string; value?: string };

// ── Field groups ─────────────────────────────────────────────────────────────

interface FieldOption { value: string; label: string }
interface FieldGroup { label: string; fields: FieldOption[] }

const STATIC_FIELD_GROUPS: FieldGroup[] = [
  { label: "Identity", fields: [
    { value: "firstName", label: "First name" },
    { value: "lastName", label: "Last name" },
    { value: "email", label: "Email" },
    { value: "phoneNumber", label: "Phone number" },
  ]},
  { label: "Status", fields: [
    { value: "lifecycleStage", label: "Lifecycle stage" },
    { value: "whatsappOptOut", label: "WhatsApp opt-out" },
    { value: "disableBot", label: "Bot disabled" },
  ]},
  { label: "Geography", fields: [
    { value: "countryCode", label: "Country" },
    { value: "languageCode", label: "Language" },
  ]},
  { label: "Organization", fields: [
    { value: "companyName", label: "Company" },
    { value: "assignedUserId", label: "Assigned user" },
    { value: "groups", label: "Groups" },
  ]},
  { label: "Engagement", fields: [
    { value: "createdAt", label: "Created date" },
    { value: "lastMessageAt", label: "Last message date" },
  ]},
  { label: "Tags", fields: [
    { value: "tags", label: "Tags" },
  ]},
];

// ── Operator config ──────────────────────────────────────────────────────────

interface OperatorOption { value: string; label: string }

function getOperators(field: string): OperatorOption[] {
  if (["firstName", "lastName", "email", "phoneNumber"].includes(field))
    return [
      { value: "contains", label: "contains" },
      { value: "equals", label: "equals" },
      { value: "startsWith", label: "starts with" },
      { value: "isEmpty", label: "is empty" },
      { value: "isNotEmpty", label: "is not empty" },
    ];
  if (field === "lifecycleStage")
    return [{ value: "equals", label: "is" }, { value: "isNot", label: "is not" }];
  if (field === "tags")
    return [{ value: "contains", label: "contains" }, { value: "doesNotContain", label: "does not contain" }];
  if (["countryCode", "languageCode"].includes(field))
    return [{ value: "equals", label: "is" }, { value: "isNot", label: "is not" }];
  if (field === "companyName")
    return [
      { value: "contains", label: "contains" },
      { value: "equals", label: "equals" },
      { value: "isEmpty", label: "is empty" },
      { value: "isNotEmpty", label: "is not empty" },
    ];
  if (field === "assignedUserId")
    return [
      { value: "equals", label: "is" },
      { value: "isNot", label: "is not" },
      { value: "isEmpty", label: "is empty" },
    ];
  if (field === "groups")
    return [
      { value: "memberOf", label: "is member of" },
      { value: "notMemberOf", label: "is not member of" },
    ];
  if (["whatsappOptOut", "disableBot"].includes(field))
    return [{ value: "isTrue", label: "is true" }, { value: "isFalse", label: "is false" }];
  if (["createdAt", "lastMessageAt"].includes(field))
    return [
      { value: "after", label: "after" },
      { value: "before", label: "before" },
      { value: "between", label: "between" },
    ];
  // customField fallback
  return [
    { value: "contains", label: "contains" },
    { value: "equals", label: "equals" },
    { value: "isEmpty", label: "is empty" },
  ];
}

function needsValue(operator: string): boolean {
  return !["isEmpty", "isNotEmpty", "isTrue", "isFalse"].includes(operator);
}

function defaultRuleForField(field: string): FilterRule {
  const op = getOperators(field)[0].value;
  if (["whatsappOptOut", "disableBot"].includes(field))
    return { field: field as "whatsappOptOut" | "disableBot", operator: op as "isTrue" | "isFalse" };
  if (field === "lifecycleStage")
    return { field: "lifecycleStage", operator: "equals", value: "lead" };
  if (field === "customField")
    return { field: "customField", operator: "contains", customFieldId: "", value: "" };
  if (["createdAt", "lastMessageAt"].includes(field))
    return { field: field as "createdAt" | "lastMessageAt", operator: "after", value: "" };
  return { field: field as "firstName", operator: op as "contains", value: "" };
}

// ── Value input ──────────────────────────────────────────────────────────────

const selectClass = "rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500";
const inputClass = "flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500";

function ValueInput({
  rule,
  customFields,
  onChange,
}: {
  rule: FilterRule;
  customFields: Array<{ id: string; inputName: string }>;
  onChange: (patch: Partial<FilterRule>) => void;
}): JSX.Element | null {
  if (!needsValue(rule.operator)) return null;

  if (rule.field === "lifecycleStage") {
    return (
      <select
        className={selectClass}
        value={rule.value}
        onChange={(e) => onChange({ value: e.target.value } as Partial<FilterRule>)}
      >
        {["lead", "prospect", "customer", "loyal", "churned"].map((s) => (
          <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
        ))}
      </select>
    );
  }

  if (["createdAt", "lastMessageAt"].includes(rule.field)) {
    const dateRule = rule as { field: string; operator: string; value: string; valueTo?: string };
    return (
      <div className="flex items-center gap-1 flex-1">
        <input
          type="date"
          className={inputClass}
          value={dateRule.value ?? ""}
          onChange={(e) => onChange({ value: e.target.value } as Partial<FilterRule>)}
        />
        {dateRule.operator === "between" && (
          <>
            <span className="text-xs text-gray-500">and</span>
            <input
              type="date"
              className={inputClass}
              value={dateRule.valueTo ?? ""}
              onChange={(e) => onChange({ valueTo: e.target.value } as Partial<FilterRule>)}
            />
          </>
        )}
      </div>
    );
  }

  if (rule.field === "customField") {
    const cf = rule as { field: "customField"; operator: string; customFieldId: string; value?: string };
    return (
      <div className="flex gap-1 flex-1">
        <select
          className={selectClass}
          value={cf.customFieldId}
          onChange={(e) => onChange({ customFieldId: e.target.value } as Partial<FilterRule>)}
        >
          <option value="">Select field…</option>
          {customFields.map((f) => (
            <option key={f.id} value={f.id}>{f.inputName}</option>
          ))}
        </select>
        {cf.operator !== "isEmpty" && (
          <input
            className={inputClass}
            value={cf.value ?? ""}
            onChange={(e) => onChange({ value: e.target.value } as Partial<FilterRule>)}
            placeholder="Value"
          />
        )}
      </div>
    );
  }

  const textRule = rule as { field: string; operator: string; value?: string };
  return (
    <input
      className={inputClass}
      value={textRule.value ?? ""}
      onChange={(e) => onChange({ value: e.target.value } as Partial<FilterRule>)}
      placeholder="Value"
    />
  );
}

// ── Component ────────────────────────────────────────────────────────────────

interface SegmentBuilderProps {
  initial?: FilterRule[];
  match?: MatchMode;
  onChange: (filters: FilterRule[]) => void;
  onMatchChange?: (match: MatchMode) => void;
}

export function SegmentBuilder({
  initial = [],
  match = "all",
  onChange,
  onMatchChange,
}: SegmentBuilderProps): JSX.Element {
  const { getToken } = useAuth();
  const [rules, setRules] = useState<FilterRule[]>(initial);
  const [customFields, setCustomFields] = useState<Array<{ id: string; inputName: string }>>([]);

  useEffect(() => {
    void (async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/contacts/custom-fields`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (res.ok) {
        const body = (await res.json()) as { data: Array<{ id: string; inputName: string }> };
        setCustomFields(body.data);
      }
    })();
  }, [getToken]);

  // Custom fields use "customField:<id>" as option value so each is selectable independently
  const fieldGroups: FieldGroup[] =
    customFields.length > 0
      ? [...STATIC_FIELD_GROUPS, { label: "Custom Fields", fields: customFields.map((cf) => ({ value: `customField:${cf.id}`, label: cf.inputName })) }]
      : STATIC_FIELD_GROUPS;

  function update(index: number, patch: Partial<FilterRule>) {
    const next = rules.map((r, i) => (i === index ? ({ ...r, ...patch } as FilterRule) : r));
    setRules(next);
    onChange(next);
  }

  function changeField(index: number, rawField: string) {
    let base: FilterRule;
    if (rawField.startsWith("customField:")) {
      const customFieldId = rawField.slice("customField:".length);
      base = { field: "customField", operator: "contains", customFieldId, value: "" };
    } else {
      base = defaultRuleForField(rawField);
    }
    const next = rules.map((r, i) => (i === index ? base : r));
    setRules(next);
    onChange(next);
  }

  function addRule() {
    const next = [...rules, { field: "lifecycleStage", operator: "equals", value: "lead" } as FilterRule];
    setRules(next);
    onChange(next);
  }

  function removeRule(index: number) {
    const next = rules.filter((_, i) => i !== index);
    setRules(next);
    onChange(next);
  }

  return (
    <div className="space-y-4">
      {/* Match toggle */}
      <div className="flex items-center gap-2 text-sm text-gray-700">
        <span>Contacts match</span>
        <select
          className="rounded-lg border border-gray-300 px-2 py-1 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-500"
          value={match}
          onChange={(e) => onMatchChange?.(e.target.value as MatchMode)}
        >
          <option value="all">ALL</option>
          <option value="any">ANY</option>
        </select>
        <span>of the following rules</span>
      </div>

      {/* Rules */}
      {rules.map((rule, i) => {
        const ops = getOperators(rule.field);
        return (
          <div key={i} className="flex items-center gap-2">
            {/* Field grouped dropdown — custom fields use "customField:<id>" as their option value */}
            <select
              className={selectClass}
              value={
                rule.field === "customField"
                  ? `customField:${(rule as { field: "customField"; customFieldId: string }).customFieldId}`
                  : rule.field
              }
              onChange={(e) => changeField(i, e.target.value)}
            >
              {fieldGroups.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.fields.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>

            {/* Operator — rule.field is always the canonical type literal (e.g. "customField"), not the dropdown value */}
            <select
              className={selectClass}
              value={rule.operator}
              onChange={(e) => update(i, { operator: e.target.value } as Partial<FilterRule>)}
            >
              {ops.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>

            {/* Value */}
            <ValueInput rule={rule} customFields={customFields} onChange={(patch) => update(i, patch)} />

            {/* Remove */}
            <button
              type="button"
              onClick={() => removeRule(i)}
              className="text-red-500 hover:text-red-700 text-lg px-1 leading-none"
              aria-label="Remove rule"
            >
              ×
            </button>
          </div>
        );
      })}

      <Button variant="secondary" size="sm" type="button" onClick={addRule}>
        + Add Filter
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Run type check**

```bash
pnpm --filter @WBMSG/web exec tsc --noEmit
```

Expected: No errors in `SegmentBuilder.tsx` or its imports. Fix any type errors before proceeding.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/segments/SegmentBuilder.tsx
git commit -m "feat(segments): rebuild SegmentBuilder with grouped fields, match toggle, type-aware inputs"
```

---

## Task 5: Update segment detail page

**Files:**
- Modify: `apps/web/app/(dashboard)/contacts/segments/[id]/page.tsx`

- [ ] **Step 1: Rewrite the page**

```tsx
"use client";

import { JSX, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { SegmentBuilder, type FilterRule, type MatchMode } from "@/components/segments/SegmentBuilder";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface ContactPreview {
  id: string;
  firstName: string | null;
  lastName: string | null;
  phoneNumber: string;
  lifecycleStage: string | null;
}

interface Segment {
  id: string;
  name: string;
  filters: FilterRule[];
  match: MatchMode;
}

const stageVariant: Record<string, "green" | "blue" | "yellow" | "red" | "gray"> = {
  customer: "green", prospect: "blue", lead: "yellow", churned: "red", loyal: "green",
};

export default function SegmentDetailPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const { getToken } = useAuth();
  const [segment, setSegment] = useState<Segment | null>(null);
  const [filters, setFilters] = useState<FilterRule[]>([]);
  const [match, setMatch] = useState<MatchMode>("all");
  const [contacts, setContacts] = useState<ContactPreview[]>([]);
  const [matchCount, setMatchCount] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/segments/${id}`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (res.ok) {
        const s = (await res.json() as { data: Segment }).data;
        setSegment(s);
        setFilters(s.filters);
        setMatch(s.match ?? "all");
      }
      setLoading(false);
    })();
  }, [id, getToken]);

  async function handleSave() {
    setSaving(true);
    try {
      const token = await getToken();
      const patchRes = await fetch(`${API_URL}/v1/segments/${id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({ filters, match }),
      });
      if (patchRes.ok) {
        setSegment((await patchRes.json() as { data: Segment }).data);
      }
      // Evaluate to refresh matching contacts
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
        <h2 className="font-medium text-gray-800">Filters</h2>
        <SegmentBuilder
          initial={filters}
          match={match}
          onChange={setFilters}
          onMatchChange={setMatch}
        />
        <div className="flex items-center gap-3">
          <Button onClick={() => { void handleSave(); }} disabled={saving}>
            {saving ? "Saving…" : "Save Filters"}
          </Button>
          {matchCount !== null && (
            <span className="text-sm text-green-600 font-medium">
              {matchCount} contact{matchCount !== 1 ? "s" : ""} match this segment
            </span>
          )}
        </div>
      </div>

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
              <th className="text-left px-4 py-2 font-medium text-gray-600">Stage</th>
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
                  {c.lifecycleStage ? (
                    <Badge variant={stageVariant[c.lifecycleStage] ?? "gray"}>{c.lifecycleStage}</Badge>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
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

- [ ] **Step 2: Run type check**

```bash
pnpm --filter @WBMSG/web exec tsc --noEmit
```

Expected: No errors. Fix any before proceeding.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/(dashboard)/contacts/segments/[id]/page.tsx"
git commit -m "feat(segments): update detail page with match prop, live count, evaluate-based contacts"
```

---

## Task 6: Update segment list page

**Files:**
- Modify: `apps/web/app/(dashboard)/contacts/segments/page.tsx`

- [ ] **Step 1: Update the `Segment` interface and list item render**

In `apps/web/app/(dashboard)/contacts/segments/page.tsx`, make two targeted changes:

**Change 1** — update the `Segment` interface (around line 13):

```typescript
interface Segment {
  id: string;
  name: string;
  filters: unknown[];
  match: "all" | "any";
}
```

**Change 2** — update the list item sub-text (around line 97), replacing the existing `<p>` that shows filter count:

```tsx
<p className="text-xs text-gray-500 mt-0.5">
  {s.filters.length} filter{s.filters.length !== 1 ? "s" : ""} · {s.match === "any" ? "ANY" : "ALL"}
</p>
```

- [ ] **Step 2: Run type check**

```bash
pnpm --filter @WBMSG/web exec tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/(dashboard)/contacts/segments/page.tsx"
git commit -m "feat(segments): show match mode in segment list"
```

---

## Task 7: Final verification

- [ ] **Step 1: Run all API tests**

```bash
pnpm --filter @WBMSG/api test
```

Expected: All tests pass (skip the known pre-existing `analytics.test.ts` timeout).

- [ ] **Step 2: Run full type-check**

```bash
pnpm type-check
```

Expected: No errors across the monorepo.

- [ ] **Step 3: Run lint**

```bash
pnpm lint
```

Expected: No errors.
