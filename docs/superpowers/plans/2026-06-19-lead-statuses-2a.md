# Lead Statuses 2a (Expand + Manage) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Additively introduce an org-configurable `LeadStatus` table + nullable `Contact.leadStatusId`, seed/backfill existing data, and ship a CRUD API and the Lead Statuses settings tab — without touching the existing `lifecycleStage` enum or its consumers.

**Architecture:** A new Prisma model `LeadStatus` and a nullable FK on Contact. A migration seeds 7 default statuses per org and backfills `leadStatusId` from the current enum. A Fastify route exposes CRUD + reorder with `manage_contacts` RBAC and a delete-in-use guard. The web Lead Statuses tab (dnd-kit) replaces its "Coming soon" placeholder. `lifecycleStage` is left fully intact (consumers migrate in 2b).

**Tech Stack:** Prisma 7 + PostgreSQL 16, Fastify 4 (ESM, `.js` import extensions), Vitest, Next.js 15 / React 18, @tanstack/react-query, @dnd-kit, Tailwind.

## Global Constraints

- TypeScript strict — no `any`, no implicit returns.
- API is ESM — use `.js` extensions in imports even for `.ts` sources.
- No `console.log` — use Fastify logger if logging is needed.
- Every Prisma query is org-scoped (`request.auth.organizationId`); never query cross-org.
- Write endpoints guarded by `canAccess(role, permissions, "manage_contacts")` → `403 { error: { code: "FORBIDDEN", message } }`.
- Migrations run from repo root: `npx prisma migrate dev --name <name>` (prisma.config.js points to apps/api). Regenerate client with `npx prisma generate`.
- Seven seed statuses, in this order (sortOrder 0..6): New Lead `#F97316` (isClosure false), Qualification `#22C55E` (false), Needs Analysis `#3B82F6` (false), Proposal `#EC4899` (false), Negotiation `#8B5CF6` (false), Closed Won `#10B981` (true), Closed Lost `#EF4444` (true).
- Enum→status backfill map: lead→New Lead, prospect→Qualification, customer→Closed Won, loyal→Closed Won, churned→Closed Lost.
- Color picker swatches (Add/Edit UI): `#FACC15`, `#F87171`, `#22C55E`, `#EC4899`, `#3B82F6`.
- Web API base: `process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000"`. React Query key: `lead-statuses`.

---

### Task 1: Schema + migration (LeadStatus model, FK, seed + backfill)

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create (generated, then edited): `apps/api/prisma/migrations/<timestamp>_add_lead_statuses/migration.sql`

**Interfaces:**
- Produces: Prisma model `LeadStatus { id, organizationId, name, color, sortOrder, isClosure, createdAt, updatedAt, contacts }`; `Contact.leadStatusId: string | null` + `Contact.leadStatus` relation.

- [ ] **Step 1: Add the model + FK to the schema**

In `apps/api/prisma/schema.prisma`, add this model (place it near the other Contact-related models, e.g. after the `Segment` model):

```prisma
model LeadStatus {
  id             String    @id @default(uuid())
  organizationId String    @map("organization_id")
  name           String
  color          String
  sortOrder      Int       @default(0) @map("sort_order")
  isClosure      Boolean   @default(false) @map("is_closure")
  createdAt      DateTime  @default(now()) @map("created_at")
  updatedAt      DateTime  @updatedAt @map("updated_at")
  contacts       Contact[]

  @@index([organizationId, sortOrder])
  @@map("lead_statuses")
}
```

In the `Contact` model, add these two lines (after the `lifecycleStage` line — keep `lifecycleStage` unchanged):

```prisma
  leadStatusId   String?        @map("lead_status_id")
  leadStatus     LeadStatus?    @relation(fields: [leadStatusId], references: [id])
```

- [ ] **Step 2: Generate the migration without applying**

Run: `npx prisma migrate dev --name add_lead_statuses --create-only`
Expected: a new folder `apps/api/prisma/migrations/<timestamp>_add_lead_statuses/migration.sql` containing `CREATE TABLE "lead_statuses"`, an index, and an `ALTER TABLE "contacts" ADD COLUMN "lead_status_id"` + FK constraint. Do NOT apply yet.

- [ ] **Step 3: Append the seed + backfill SQL**

Append the following to the END of the generated `migration.sql` (Postgres 16; `gen_random_uuid()` is built-in):

```sql
-- Seed 7 default lead statuses for every existing organization
INSERT INTO "lead_statuses" ("id", "organization_id", "name", "color", "sort_order", "is_closure", "created_at", "updated_at")
SELECT gen_random_uuid(), o."id", s.name, s.color, s.sort_order, s.is_closure, now(), now()
FROM "organizations" o
CROSS JOIN (VALUES
  ('New Lead',       '#F97316', 0, false),
  ('Qualification',  '#22C55E', 1, false),
  ('Needs Analysis', '#3B82F6', 2, false),
  ('Proposal',       '#EC4899', 3, false),
  ('Negotiation',    '#8B5CF6', 4, false),
  ('Closed Won',     '#10B981', 5, true),
  ('Closed Lost',    '#EF4444', 6, true)
) AS s(name, color, sort_order, is_closure);

-- Backfill each contact's lead_status_id from its current lifecycle_stage enum
UPDATE "contacts" c
SET "lead_status_id" = ls."id"
FROM "lead_statuses" ls
WHERE ls."organization_id" = c."organization_id"
  AND ls."name" = CASE c."lifecycle_stage"::text
    WHEN 'lead'     THEN 'New Lead'
    WHEN 'prospect' THEN 'Qualification'
    WHEN 'customer' THEN 'Closed Won'
    WHEN 'loyal'    THEN 'Closed Won'
    WHEN 'churned'  THEN 'Closed Lost'
  END;
```

- [ ] **Step 4: Apply the migration and regenerate the client**

Run: `npx prisma migrate dev` (applies the pending migration), then `npx prisma generate`.
Expected: migration applies with no SQL error; client regenerates with `LeadStatus` available.

- [ ] **Step 5: Verify the migration ran (only meaningful if the dev DB has orgs)**

Run: `npx prisma studio` is not needed — instead run this check via the API package:
`node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.leadStatus.count().then(n=>{console.log('lead_statuses rows:',n);return p.$disconnect();})"`
Expected: prints a row count (0 if the dev DB has no orgs — that is acceptable; correctness of seed values is unit-tested in Task 2). No error thrown.

- [ ] **Step 6: Type-check**

Run: `pnpm --filter @WBMSG/api type-check`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(db): add LeadStatus model, contact FK, seed + backfill migration"
```

---

### Task 2: seedLeadStatuses helper + wire into org creation

**Files:**
- Create: `apps/api/src/lib/seed-lead-statuses.ts`
- Create: `apps/api/src/lib/seed-lead-statuses.test.ts`
- Modify: `apps/api/src/routes/clerk-webhook.ts` (after the `organization.created` upsert)
- Modify: `apps/api/src/routes/register.ts` (after the first-time `organization.create`)

**Interfaces:**
- Produces: `export const SEED_LEAD_STATUSES: { name: string; color: string; sortOrder: number; isClosure: boolean }[]`; `export async function seedLeadStatuses(prisma: PrismaClient, organizationId: string): Promise<void>` (idempotent — no-op if the org already has statuses).

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/lib/seed-lead-statuses.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { seedLeadStatuses, SEED_LEAD_STATUSES } from "./seed-lead-statuses.js";

const mockPrisma = {
  leadStatus: { count: vi.fn(), createMany: vi.fn() },
};

beforeEach(() => vi.clearAllMocks());

describe("seedLeadStatuses", () => {
  it("inserts the 7 default statuses for a fresh org", async () => {
    mockPrisma.leadStatus.count.mockResolvedValue(0);
    await seedLeadStatuses(mockPrisma as unknown as PrismaClient, "org-1");
    expect(mockPrisma.leadStatus.createMany).toHaveBeenCalledTimes(1);
    const arg = mockPrisma.leadStatus.createMany.mock.calls[0][0];
    expect(arg.data).toHaveLength(7);
    expect(arg.data[0]).toEqual({ organizationId: "org-1", name: "New Lead", color: "#F97316", sortOrder: 0, isClosure: false });
    expect(arg.data[6]).toEqual({ organizationId: "org-1", name: "Closed Lost", color: "#EF4444", sortOrder: 6, isClosure: true });
  });

  it("is idempotent — skips when statuses already exist", async () => {
    mockPrisma.leadStatus.count.mockResolvedValue(7);
    await seedLeadStatuses(mockPrisma as unknown as PrismaClient, "org-1");
    expect(mockPrisma.leadStatus.createMany).not.toHaveBeenCalled();
  });

  it("SEED_LEAD_STATUSES has the 7 expected names in order", () => {
    expect(SEED_LEAD_STATUSES.map((s) => s.name)).toEqual([
      "New Lead", "Qualification", "Needs Analysis", "Proposal", "Negotiation", "Closed Won", "Closed Lost",
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @WBMSG/api exec vitest run src/lib/seed-lead-statuses.test.ts`
Expected: FAIL — cannot resolve `./seed-lead-statuses.js`.

- [ ] **Step 3: Implement the helper**

Create `apps/api/src/lib/seed-lead-statuses.ts`:

```ts
import type { PrismaClient } from "@prisma/client";

export const SEED_LEAD_STATUSES: { name: string; color: string; sortOrder: number; isClosure: boolean }[] = [
  { name: "New Lead",       color: "#F97316", sortOrder: 0, isClosure: false },
  { name: "Qualification",  color: "#22C55E", sortOrder: 1, isClosure: false },
  { name: "Needs Analysis", color: "#3B82F6", sortOrder: 2, isClosure: false },
  { name: "Proposal",       color: "#EC4899", sortOrder: 3, isClosure: false },
  { name: "Negotiation",    color: "#8B5CF6", sortOrder: 4, isClosure: false },
  { name: "Closed Won",     color: "#10B981", sortOrder: 5, isClosure: true },
  { name: "Closed Lost",    color: "#EF4444", sortOrder: 6, isClosure: true },
];

// Idempotent: seeds the 7 default lead statuses only if the org has none yet.
export async function seedLeadStatuses(prisma: PrismaClient, organizationId: string): Promise<void> {
  const existing = await prisma.leadStatus.count({ where: { organizationId } });
  if (existing > 0) return;
  await prisma.leadStatus.createMany({
    data: SEED_LEAD_STATUSES.map((s) => ({ organizationId, ...s })),
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @WBMSG/api exec vitest run src/lib/seed-lead-statuses.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire into the Clerk webhook**

In `apps/api/src/routes/clerk-webhook.ts`, add the import at the top with the other imports:

```ts
import { seedLeadStatuses } from "../lib/seed-lead-statuses.js";
```

Then, inside the `if (event.type === "organization.created")` block, immediately after the existing `fastify.prisma.organization.upsert({...})` call and before the `fastify.log.info({ orgId: org.id }, ...)` line, add:

```ts
        await seedLeadStatuses(fastify.prisma, org.id);
```

- [ ] **Step 6: Wire into the register route**

In `apps/api/src/routes/register.ts`, add the import at the top with the other imports:

```ts
import { seedLeadStatuses } from "../lib/seed-lead-statuses.js";
```

Then, in the first-time branch, immediately after `organizationId = org.id;`, add:

```ts
        await seedLeadStatuses(fastify.prisma, organizationId);
```

- [ ] **Step 7: Type-check**

Run: `pnpm --filter @WBMSG/api type-check`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/lib/seed-lead-statuses.ts apps/api/src/lib/seed-lead-statuses.test.ts apps/api/src/routes/clerk-webhook.ts apps/api/src/routes/register.ts
git commit -m "feat(api): seed default lead statuses for new organizations"
```

---

### Task 3: lead-statuses CRUD + reorder API

**Files:**
- Create: `apps/api/src/routes/lead-statuses.ts`
- Create: `apps/api/src/routes/lead-statuses.test.ts`
- Modify: `apps/api/src/routes/index.ts` (import + register)

**Interfaces:**
- Consumes: `canAccess` from `../lib/permissions.js`.
- Produces: routes `GET/POST /lead-statuses`, `PATCH/DELETE /lead-statuses/:id`, `PATCH /lead-statuses/reorder`. Exports `leadStatusesRouter: FastifyPluginAsync`.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/routes/lead-statuses.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const mockPrisma = {
  leadStatus: { findMany: vi.fn(), create: vi.fn(), findFirst: vi.fn(), update: vi.fn(), delete: vi.fn(), aggregate: vi.fn() },
  contact: { count: vi.fn() },
  $transaction: vi.fn(),
};

let auth = { userId: "user-1", organizationId: "org-1", role: "admin" as string, permissions: {} as Record<string, string> };

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (req) => { req.auth = auth as typeof req.auth; });
  const { leadStatusesRouter } = await import("./lead-statuses.js");
  await app.register(leadStatusesRouter, { prefix: "/v1" });
  return app;
}

describe("lead-statuses API", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.resetModules(); vi.clearAllMocks();
    auth = { userId: "user-1", organizationId: "org-1", role: "admin", permissions: {} };
    app = await buildApp();
  });
  afterEach(async () => { await app.close(); });

  it("GET lists statuses ordered by sortOrder", async () => {
    mockPrisma.leadStatus.findMany.mockResolvedValue([{ id: "s1", sortOrder: 0 }, { id: "s2", sortOrder: 1 }]);
    const res = await app.inject({ method: "GET", url: "/v1/lead-statuses" });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.leadStatus.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId: "org-1" }, orderBy: { sortOrder: "asc" },
    }));
  });

  it("POST appends with sortOrder = max + 1", async () => {
    mockPrisma.leadStatus.aggregate.mockResolvedValue({ _max: { sortOrder: 4 } });
    mockPrisma.leadStatus.create.mockResolvedValue({ id: "s3", name: "Won", color: "#10B981", sortOrder: 5 });
    const res = await app.inject({ method: "POST", url: "/v1/lead-statuses", payload: { name: "Won", color: "#10B981" } });
    expect(res.statusCode).toBe(201);
    expect(mockPrisma.leadStatus.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ organizationId: "org-1", name: "Won", color: "#10B981", sortOrder: 5 }),
    }));
  });

  it("DELETE returns 409 when contacts reference the status", async () => {
    mockPrisma.leadStatus.findFirst.mockResolvedValue({ id: "s1", organizationId: "org-1" });
    mockPrisma.contact.count.mockResolvedValue(3);
    const res = await app.inject({ method: "DELETE", url: "/v1/lead-statuses/s1" });
    expect(res.statusCode).toBe(409);
    expect(res.json<{ error: { code: string } }>().error.code).toBe("STATUS_IN_USE");
    expect(mockPrisma.leadStatus.delete).not.toHaveBeenCalled();
  });

  it("DELETE returns 204 when no contacts reference the status", async () => {
    mockPrisma.leadStatus.findFirst.mockResolvedValue({ id: "s1", organizationId: "org-1" });
    mockPrisma.contact.count.mockResolvedValue(0);
    const res = await app.inject({ method: "DELETE", url: "/v1/lead-statuses/s1" });
    expect(res.statusCode).toBe(204);
    expect(mockPrisma.leadStatus.delete).toHaveBeenCalledWith({ where: { id: "s1" } });
  });

  it("PATCH /reorder rewrites sortOrder to match the given order", async () => {
    mockPrisma.leadStatus.findMany.mockResolvedValue([{ id: "a" }, { id: "b" }, { id: "c" }]);
    mockPrisma.$transaction.mockResolvedValue([]);
    const res = await app.inject({ method: "PATCH", url: "/v1/lead-statuses/reorder", payload: { orderedIds: ["c", "a", "b"] } });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("POST returns 403 without manage_contacts permission", async () => {
    auth = { userId: "u", organizationId: "org-1", role: "agent", permissions: { some_other: "allow" } };
    app = await buildApp();
    const res = await app.inject({ method: "POST", url: "/v1/lead-statuses", payload: { name: "X", color: "#FACC15" } });
    expect(res.statusCode).toBe(403);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @WBMSG/api exec vitest run src/routes/lead-statuses.test.ts`
Expected: FAIL — cannot resolve `./lead-statuses.js`.

- [ ] **Step 3: Implement the route**

Create `apps/api/src/routes/lead-statuses.ts`:

```ts
import type { FastifyPluginAsync } from "fastify";
import { canAccess } from "../lib/permissions.js";

interface StatusBody {
  name: string;
  color: string;
  isClosure?: boolean;
}

function forbidden(): { error: { code: string; message: string } } {
  return { error: { code: "FORBIDDEN", message: "Permission required: manage_contacts" } };
}

export const leadStatusesRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/lead-statuses", async (request, reply) => {
    const { organizationId } = request.auth;
    const data = await fastify.prisma.leadStatus.findMany({
      where: { organizationId },
      orderBy: { sortOrder: "asc" },
    });
    return reply.send({ data });
  });

  fastify.post<{ Body: StatusBody }>("/lead-statuses", async (request, reply) => {
    const { organizationId, role, permissions } = request.auth;
    if (!canAccess(role, permissions, "manage_contacts")) return reply.status(403).send(forbidden());
    const { name, color, isClosure } = request.body;
    if (!name?.trim() || !color?.trim()) {
      return reply.status(400).send({ error: { code: "MISSING_FIELDS", message: "name and color are required" } });
    }
    const max = await fastify.prisma.leadStatus.aggregate({
      where: { organizationId },
      _max: { sortOrder: true },
    });
    const sortOrder = (max._max.sortOrder ?? -1) + 1;
    const data = await fastify.prisma.leadStatus.create({
      data: { organizationId, name: name.trim(), color: color.trim(), sortOrder, isClosure: isClosure ?? false },
    });
    return reply.status(201).send({ data });
  });

  fastify.patch<{ Params: { id: string }; Body: Partial<StatusBody> }>("/lead-statuses/:id", async (request, reply) => {
    const { organizationId, role, permissions } = request.auth;
    if (!canAccess(role, permissions, "manage_contacts")) return reply.status(403).send(forbidden());
    const existing = await fastify.prisma.leadStatus.findFirst({ where: { id: request.params.id, organizationId } });
    if (!existing) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Lead status not found" } });
    const { name, color, isClosure } = request.body;
    const data = await fastify.prisma.leadStatus.update({
      where: { id: request.params.id },
      data: {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(color !== undefined ? { color: color.trim() } : {}),
        ...(isClosure !== undefined ? { isClosure } : {}),
      },
    });
    return reply.send({ data });
  });

  fastify.delete<{ Params: { id: string } }>("/lead-statuses/:id", async (request, reply) => {
    const { organizationId, role, permissions } = request.auth;
    if (!canAccess(role, permissions, "manage_contacts")) return reply.status(403).send(forbidden());
    const existing = await fastify.prisma.leadStatus.findFirst({ where: { id: request.params.id, organizationId } });
    if (!existing) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Lead status not found" } });
    const inUse = await fastify.prisma.contact.count({ where: { organizationId, leadStatusId: request.params.id } });
    if (inUse > 0) {
      return reply.status(409).send({ error: { code: "STATUS_IN_USE", message: "This status is assigned to contacts — reassign them before deleting." } });
    }
    await fastify.prisma.leadStatus.delete({ where: { id: request.params.id } });
    return reply.status(204).send();
  });

  fastify.patch<{ Body: { orderedIds: string[] } }>("/lead-statuses/reorder", async (request, reply) => {
    const { organizationId, role, permissions } = request.auth;
    if (!canAccess(role, permissions, "manage_contacts")) return reply.status(403).send(forbidden());
    const orderedIds = request.body.orderedIds ?? [];
    const all = await fastify.prisma.leadStatus.findMany({ where: { organizationId }, select: { id: true } });
    const orgIds = new Set(all.map((s) => s.id));
    if (orderedIds.length !== orgIds.size || !orderedIds.every((id) => orgIds.has(id))) {
      return reply.status(400).send({ error: { code: "INVALID_ORDER", message: "orderedIds must contain exactly the org's lead status ids" } });
    }
    await fastify.prisma.$transaction(
      orderedIds.map((id, index) =>
        fastify.prisma.leadStatus.update({ where: { id }, data: { sortOrder: index } })
      )
    );
    return reply.send({ success: true });
  });
};
```

Note: register `/reorder` is declared after `/:id` here; Fastify matches the static `/lead-statuses/reorder` correctly even with the `:id` route present, but to be safe the PATCH `/reorder` and PATCH `/:id` are distinct methods+paths and Fastify's router prioritizes the static segment. No ordering issue.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @WBMSG/api exec vitest run src/routes/lead-statuses.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Register the router**

In `apps/api/src/routes/index.ts`:
- Add the import after the `customFieldsRouter` import (line ~44):

```ts
import { leadStatusesRouter } from "./lead-statuses.js";
```

- Add the registration after the `customFieldsRouter` registration (line ~93):

```ts
  await fastify.register(leadStatusesRouter, { prefix: "/v1" });
```

- [ ] **Step 6: Type-check**

Run: `pnpm --filter @WBMSG/api type-check`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/lead-statuses.ts apps/api/src/routes/lead-statuses.test.ts apps/api/src/routes/index.ts
git commit -m "feat(api): add lead-statuses CRUD + reorder route with RBAC and delete guard"
```

---

### Task 4: Lead Statuses tab — list, add, edit, delete

**Files:**
- Create: `apps/web/app/(dashboard)/settings/contact-fields/tabs/LeadStatusesTab.tsx`
- Create: `apps/web/app/(dashboard)/settings/contact-fields/tabs/StatusSlideOver.tsx`
- Modify: `apps/web/app/(dashboard)/settings/contact-fields/ContactFieldsClient.tsx` (render `LeadStatusesTab` for the `lead-statuses` tab)

**Interfaces:**
- Produces: `LeadStatusesTab` (default export, no props); `StatusSlideOver` (default export).
- Consumes (API): `GET/POST /v1/lead-statuses`, `PATCH/DELETE /v1/lead-statuses/:id`.

- [ ] **Step 1: Create the StatusSlideOver**

Create `apps/web/app/(dashboard)/settings/contact-fields/tabs/StatusSlideOver.tsx`:

```tsx
"use client";

import { JSX, useState } from "react";

const SWATCHES = ["#FACC15", "#F87171", "#22C55E", "#EC4899", "#3B82F6"] as const;

export interface StatusDraft {
  id?: string;
  name: string;
  color: string;
}

export default function StatusSlideOver({
  initial,
  saving,
  onSave,
  onClose,
}: {
  initial: StatusDraft | null;
  saving: boolean;
  onSave: (draft: { name: string; color: string }) => void;
  onClose: () => void;
}): JSX.Element {
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState(initial?.color ?? SWATCHES[0]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white w-full max-w-md h-full shadow-xl flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">{initial?.id ? "Edit Status" : "Add Status"}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Status Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter status name"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Select Colour</label>
            <div className="flex items-center gap-3">
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
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-200">
          <button
            onClick={() => onSave({ name: name.trim(), color })}
            disabled={saving || !name.trim()}
            className="w-full py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

Note: the color swatch `backgroundColor` uses an inline `style` because the hex values are dynamic data, not static Tailwind classes — this is the established pattern for data-driven colors (see `Label` rendering). Layout/spacing remains Tailwind.

- [ ] **Step 2: Create the LeadStatusesTab**

Create `apps/web/app/(dashboard)/settings/contact-fields/tabs/LeadStatusesTab.tsx`:

```tsx
"use client";

import { JSX, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import StatusSlideOver, { type StatusDraft } from "./StatusSlideOver";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface LeadStatus {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  isClosure: boolean;
}

export default function LeadStatusesTab(): JSX.Element {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<StatusDraft | null | undefined>(undefined); // undefined=closed, null=add, draft=edit
  const [error, setError] = useState<string | null>(null);

  const { data: statuses = [], isLoading } = useQuery<LeadStatus[]>({
    queryKey: ["lead-statuses"],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/lead-statuses`, { headers: { Authorization: `Bearer ${token ?? ""}` } });
      if (!res.ok) return [];
      return (await res.json() as { data: LeadStatus[] }).data;
    },
  });

  const save = useMutation({
    mutationFn: async (draft: { name: string; color: string }) => {
      const token = await getToken();
      const isEdit = editing && editing.id;
      const res = await fetch(
        isEdit ? `${API_URL}/v1/lead-statuses/${editing!.id}` : `${API_URL}/v1/lead-statuses`,
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        }
      );
      if (!res.ok) throw new Error("Failed to save status");
    },
    onSuccess: () => { setEditing(undefined); void qc.invalidateQueries({ queryKey: ["lead-statuses"] }); },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/lead-statuses/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token ?? ""}` } });
      if (res.status === 409) throw new Error("This status is assigned to contacts — reassign them before deleting.");
      if (!res.ok) throw new Error("Failed to delete status");
    },
    onSuccess: () => { setError(null); void qc.invalidateQueries({ queryKey: ["lead-statuses"] }); },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => { setError(null); setEditing(null); }}
          className="px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700"
        >
          Add Status
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="grid grid-cols-[1fr_auto] gap-4 px-4 py-3 text-xs font-medium text-gray-500 border-b border-gray-100">
          <span>Status Name</span>
          <span>Colour</span>
        </div>
        {isLoading ? (
          <p className="p-6 text-sm text-gray-400 text-center">Loading…</p>
        ) : statuses.length === 0 ? (
          <p className="p-8 text-sm text-gray-400 text-center">No lead statuses yet.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {statuses.map((s) => (
              <div key={s.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 px-4 py-3">
                <span className="text-sm font-medium text-gray-900">{s.name}</span>
                <span className="w-5 h-5 rounded-full" style={{ backgroundColor: s.color }} />
                <div className="flex items-center gap-3">
                  <button onClick={() => { setError(null); setEditing({ id: s.id, name: s.name, color: s.color }); }} className="text-xs text-emerald-600 hover:text-emerald-800 font-medium">Edit</button>
                  <button onClick={() => remove.mutate(s.id)} className="text-xs text-red-500 hover:text-red-700 font-medium">Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editing !== undefined && (
        <StatusSlideOver
          initial={editing}
          saving={save.isPending}
          onSave={(draft) => save.mutate(draft)}
          onClose={() => setEditing(undefined)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Wire the tab into ContactFieldsClient**

In `apps/web/app/(dashboard)/settings/contact-fields/ContactFieldsClient.tsx`:
- Add the import after the `FieldsTab` import:

```tsx
import LeadStatusesTab from "./tabs/LeadStatusesTab";
```

- Replace the existing tab-body line:

```tsx
      {active === "fields" ? <FieldsTab /> : <ComingSoon label={TABS.find((t) => t.key === active)!.label} />}
```

with:

```tsx
      {active === "fields" ? (
        <FieldsTab />
      ) : active === "lead-statuses" ? (
        <LeadStatusesTab />
      ) : (
        <ComingSoon label={TABS.find((t) => t.key === active)!.label} />
      )}
```

- [ ] **Step 4: Type-check**

Run: `pnpm --filter @WBMSG/web type-check`
Expected: no errors.

- [ ] **Step 5: Build**

Run: `pnpm --filter @WBMSG/web build`
Expected: build succeeds.

- [ ] **Step 6: Manual smoke (record in report)**

Verify on `/settings/contact-fields?tab=lead-statuses`: the 7 seeded statuses list with colored dots; "Add Status" opens the slide-over; save adds a row; edit changes name/color; deleting a status with contacts shows the "assigned to contacts" error; deleting an unused status removes it.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/"(dashboard)"/settings/contact-fields/tabs/LeadStatusesTab.tsx apps/web/app/"(dashboard)"/settings/contact-fields/tabs/StatusSlideOver.tsx apps/web/app/"(dashboard)"/settings/contact-fields/ContactFieldsClient.tsx
git commit -m "feat(settings): add Lead Statuses tab with add/edit/delete"
```

---

### Task 5: Drag-to-reorder lead statuses

**Files:**
- Modify: `apps/web/app/(dashboard)/settings/contact-fields/tabs/LeadStatusesTab.tsx`

**Interfaces:**
- Consumes: `PATCH /v1/lead-statuses/reorder` body `{ orderedIds: string[] }`; `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` (already dependencies).

- [ ] **Step 1: Add a reorder mutation**

In `LeadStatusesTab.tsx`, add this mutation alongside `save` and `remove`:

```tsx
  const reorder = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/lead-statuses/reorder`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds }),
      });
      if (!res.ok) throw new Error("Failed to reorder statuses");
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["lead-statuses"] }),
    onError: (e: Error) => setError(e.message),
  });
```

- [ ] **Step 2: Wrap the list in a dnd-kit sortable context**

Add these imports at the top of `LeadStatusesTab.tsx`:

```tsx
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
```

Create a sortable row component at the bottom of the same file (before or after the default export):

```tsx
function SortableStatusRow({
  status,
  onEdit,
  onDelete,
}: {
  status: LeadStatus;
  onEdit: () => void;
  onDelete: () => void;
}): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: status.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div ref={setNodeRef} style={style} className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-4 px-4 py-3 bg-white">
      <button {...attributes} {...listeners} aria-label="Drag to reorder" className="cursor-grab text-gray-300 hover:text-gray-500">⋮⋮</button>
      <span className="text-sm font-medium text-gray-900">{status.name}</span>
      <span className="w-5 h-5 rounded-full" style={{ backgroundColor: status.color }} />
      <div className="flex items-center gap-3">
        <button onClick={onEdit} className="text-xs text-emerald-600 hover:text-emerald-800 font-medium">Edit</button>
        <button onClick={onDelete} className="text-xs text-red-500 hover:text-red-700 font-medium">Delete</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Replace the static list mapping with the sortable list**

In the rendered list (the `statuses.map(...)` block from Task 4), replace the non-loading, non-empty branch with:

```tsx
          <DndContext
            collisionDetection={closestCenter}
            onDragEnd={(e: DragEndEvent) => {
              const { active, over } = e;
              if (!over || active.id === over.id) return;
              const oldIndex = statuses.findIndex((s) => s.id === active.id);
              const newIndex = statuses.findIndex((s) => s.id === over.id);
              const ordered = arrayMove(statuses, oldIndex, newIndex);
              qc.setQueryData<LeadStatus[]>(["lead-statuses"], ordered);
              reorder.mutate(ordered.map((s) => s.id));
            }}
          >
            <SortableContext items={statuses.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              <div className="divide-y divide-gray-50">
                {statuses.map((s) => (
                  <SortableStatusRow
                    key={s.id}
                    status={s}
                    onEdit={() => { setError(null); setEditing({ id: s.id, name: s.name, color: s.color }); }}
                    onDelete={() => remove.mutate(s.id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
```

(The plain `divide-y` mapping block introduced in Task 4 is now fully replaced by this DndContext block; the header row and loading/empty branches stay as they were.)

- [ ] **Step 4: Type-check**

Run: `pnpm --filter @WBMSG/web type-check`
Expected: no errors.

- [ ] **Step 5: Build**

Run: `pnpm --filter @WBMSG/web build`
Expected: build succeeds.

- [ ] **Step 6: Manual smoke (record in report)**

On the Lead Statuses tab, drag a row by its handle to a new position; the list reorders and persists after a page reload (the `PATCH /reorder` saved the new `sortOrder`).

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/"(dashboard)"/settings/contact-fields/tabs/LeadStatusesTab.tsx
git commit -m "feat(settings): add drag-to-reorder for lead statuses"
```

---

## Self-Review

**Spec coverage:**
- `LeadStatus` model + nullable `Contact.leadStatusId` (additive) → Task 1 ✓
- Seed 7 stages + enum→status backfill migration → Task 1 ✓
- New-org seeding helper wired into clerk-webhook + register → Task 2 ✓
- CRUD API (list/create/update/delete-guarded/reorder) + `manage_contacts` RBAC → Task 3 ✓
- Delete 409 STATUS_IN_USE when contacts reference status → Task 3 ✓
- Lead Statuses tab UI (list, color swatches, add/edit slide-over, delete-409 error) → Task 4 ✓
- dnd-kit drag reorder → Task 5 ✓
- `lifecycleStage` + consumers untouched (additive only) → no task modifies them ✓

**Placeholder scan:** none — every code step contains complete code; the migration SQL is concrete; commands have expected output.

**Type consistency:** `SEED_LEAD_STATUSES`/`seedLeadStatuses` (Task 2) match the migration seed values (Task 1) and the helper signature consumed by clerk-webhook/register. `leadStatusesRouter` (Task 3) registered in index.ts. `LeadStatus` interface fields (`id`,`name`,`color`,`sortOrder`,`isClosure`) consistent across API and web. `StatusDraft`/`StatusSlideOver` props (Task 4) consumed unchanged in Task 5. React Query key `lead-statuses` consistent. Delete error code `STATUS_IN_USE` consistent between API (Task 3) and the web 409 handler (Task 4).

**Known DRY note:** the 7 seed values exist in both the one-time migration SQL (Task 1) and `SEED_LEAD_STATUSES` (Task 2, for new orgs). This duplication is intentional — a historical migration must be self-contained and cannot import application code. The Task 2 unit test pins the TS copy; the values must match the spec's Global Constraints list.
