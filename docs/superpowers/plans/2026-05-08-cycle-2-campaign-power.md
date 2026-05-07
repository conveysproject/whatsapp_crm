# Cycle 2 — Campaign Power Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Full campaign functionality matching WhatsJet — static contact groups as targeting units, non-template free-text campaigns, campaign abort/requeue/archive, detailed queue and expired logs, saved contact filters, and Indian payment gateways (Razorpay, Paystack, PhonePe, YooMoney, manual/UPI proof).

**Architecture:** Schema-first: add ContactGroup/GroupContact/CampaignGroup/SavedFilter models + Campaign fields → generate → API routes → web UI. Campaign targeting now supports both Segments (dynamic) AND Groups (static). Payment gateway routes extend `billing.ts`. All routes follow the existing `FastifyPluginAsync` pattern.

**Tech Stack:** Prisma (PostgreSQL), Fastify 4 ESM, Vitest, Next.js 15 App Router, Tailwind, React Query, Razorpay SDK, AWS S3 (proof upload)

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Modify | `apps/api/prisma/schema.prisma` | Add ContactGroup, GroupContact, CampaignGroup, SavedFilter + Campaign fields |
| Create | `apps/api/src/routes/contact-groups.ts` | Contact group CRUD + member management |
| Create | `apps/api/src/routes/contact-groups.test.ts` | Tests |
| Create | `apps/api/src/routes/saved-filters.ts` | Saved filter CRUD |
| Create | `apps/api/src/routes/saved-filters.test.ts` | Tests |
| Modify | `apps/api/src/routes/contacts.ts` | Add bulk assign-groups, export endpoints |
| Modify | `apps/api/src/routes/contacts.test.ts` | Tests for new endpoints |
| Modify | `apps/api/src/routes/campaigns.ts` | Add abort, archive, requeue, targeted-count, queue-log, expired-log, report, non-template support |
| Modify | `apps/api/src/routes/campaigns.test.ts` | Tests for new endpoints |
| Modify | `apps/api/src/routes/billing.ts` | Add Razorpay, Paystack, PhonePe, YooMoney, manual payment endpoints |
| Modify | `apps/api/src/routes/billing.test.ts` | Tests |
| Modify | `apps/api/src/routes/index.ts` | Register new routers |
| Create | `apps/web/app/(dashboard)/contacts/groups/page.tsx` | Contact groups list + CRUD |
| Modify | `apps/web/app/(dashboard)/contacts/page.tsx` | Add Groups tab, saved filter pills, Export button |
| Modify | `apps/web/app/(dashboard)/campaigns/new/page.tsx` | Group selector, live count preview, non-template toggle |
| Create | `apps/web/app/(dashboard)/campaigns/[id]/logs/page.tsx` | Queue/executed/expired tabs + Download Report |
| Modify | `apps/web/app/(dashboard)/campaigns/[id]/page.tsx` | Abort, Archive, Requeue Failed buttons |
| Modify | `apps/web/app/(dashboard)/settings/billing/page.tsx` | Razorpay/UPI/PhonePe/Paystack payment forms |

---

## Task 1: Schema — ContactGroup, GroupContact, CampaignGroup, SavedFilter, Campaign fields

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Add ContactGroup and GroupContact models**

Open `apps/api/prisma/schema.prisma`. After the `CannedResponse` model, add:

```prisma
model ContactGroup {
  id             String          @id @default(uuid())
  organizationId String          @map("organization_id")
  title          String
  description    String?
  isArchived     Boolean         @default(false) @map("is_archived")
  createdAt      DateTime        @default(now()) @map("created_at")
  updatedAt      DateTime        @updatedAt @map("updated_at")
  contacts       GroupContact[]
  campaignGroups CampaignGroup[]

  @@index([organizationId])
  @@map("contact_groups")
}

model GroupContact {
  id             String       @id @default(uuid())
  contactGroupId String       @map("contact_group_id")
  contactGroup   ContactGroup @relation(fields: [contactGroupId], references: [id], onDelete: Cascade)
  contactId      String       @map("contact_id")
  createdAt      DateTime     @default(now()) @map("created_at")

  @@unique([contactGroupId, contactId])
  @@index([contactGroupId])
  @@index([contactId])
  @@map("group_contacts")
}

model CampaignGroup {
  id             String       @id @default(uuid())
  campaignId     String       @map("campaign_id")
  campaign       Campaign     @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  contactGroupId String       @map("contact_group_id")
  contactGroup   ContactGroup @relation(fields: [contactGroupId], references: [id], onDelete: Cascade)

  @@unique([campaignId, contactGroupId])
  @@index([campaignId])
  @@map("campaign_groups")
}

model SavedFilter {
  id             String   @id @default(uuid())
  organizationId String   @map("organization_id")
  name           String
  filterData     Json     @map("filter_data")
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")

  @@index([organizationId])
  @@map("saved_filters")
}
```

- [ ] **Step 2: Add fields to Campaign model and CampaignGroup relation**

Find the `Campaign` model. Add after `templateId`:

```prisma
  timezone       String?
  expiresAt      DateTime?       @map("expires_at")
  campaignType   String          @default("template") @map("campaign_type")
  campaignGroups CampaignGroup[]
```

- [ ] **Step 3: Run migration**

```bash
pnpm --filter @WBMSG/api migrate dev --name cycle2_campaign_power
```

Expected: `The following migration(s) have been created and applied`

- [ ] **Step 4: Generate Prisma client**

```bash
pnpm --filter @WBMSG/api generate
```

Expected: `✔ Generated Prisma Client`

- [ ] **Step 5: Type-check**

```bash
pnpm type-check
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/
git commit -m "feat(prisma): cycle2 schema — ContactGroup, GroupContact, CampaignGroup, SavedFilter, Campaign fields"
```

---

## Task 2: Contact Groups API

**Files:**
- Create: `apps/api/src/routes/contact-groups.ts`
- Create: `apps/api/src/routes/contact-groups.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/api/src/routes/contact-groups.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const mockPrisma = {
  contactGroup: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  groupContact: {
    createMany: vi.fn(),
    deleteMany: vi.fn(),
    findMany: vi.fn(),
  },
};

const mockAuth = { userId: "user-1", organizationId: "org-1", role: "admin" as const };

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (req) => { req.auth = mockAuth; });
  const { contactGroupsRouter } = await import("./contact-groups.js");
  await app.register(contactGroupsRouter, { prefix: "/v1" });
  return app;
}

describe("GET /v1/contact-groups", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns active groups by default", async () => {
    mockPrisma.contactGroup.findMany.mockResolvedValue([
      { id: "g-1", organizationId: "org-1", title: "VIP Clients", isArchived: false },
    ]);
    const res = await app.inject({ method: "GET", url: "/v1/contact-groups" });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: unknown[] }>().data).toHaveLength(1);
    expect(mockPrisma.contactGroup.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: "org-1", isArchived: false } })
    );
  });

  it("returns archived groups when ?archived=true", async () => {
    mockPrisma.contactGroup.findMany.mockResolvedValue([]);
    const res = await app.inject({ method: "GET", url: "/v1/contact-groups?archived=true" });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.contactGroup.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: "org-1", isArchived: true } })
    );
  });
});

describe("POST /v1/contact-groups", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("creates a group and returns 201", async () => {
    const created = { id: "g-2", organizationId: "org-1", title: "Delhi Clients", description: null, isArchived: false };
    mockPrisma.contactGroup.create.mockResolvedValue(created);
    const res = await app.inject({
      method: "POST",
      url: "/v1/contact-groups",
      payload: { title: "Delhi Clients" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json<{ data: { id: string } }>().data.id).toBe("g-2");
  });
});

describe("POST /v1/contact-groups/:id/archive", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("archives a group", async () => {
    mockPrisma.contactGroup.findFirst.mockResolvedValue({ id: "g-1", organizationId: "org-1" });
    mockPrisma.contactGroup.update.mockResolvedValue({ id: "g-1", isArchived: true });
    const res = await app.inject({ method: "POST", url: "/v1/contact-groups/g-1/archive" });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.contactGroup.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isArchived: true } })
    );
  });
});

describe("POST /v1/contact-groups/:id/contacts", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("bulk-adds contacts to group", async () => {
    mockPrisma.contactGroup.findFirst.mockResolvedValue({ id: "g-1", organizationId: "org-1" });
    mockPrisma.groupContact.createMany.mockResolvedValue({ count: 3 });
    const res = await app.inject({
      method: "POST",
      url: "/v1/contact-groups/g-1/contacts",
      payload: { contactIds: ["c-1", "c-2", "c-3"] },
    });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.groupContact.createMany).toHaveBeenCalledWith({
      data: [
        { contactGroupId: "g-1", contactId: "c-1" },
        { contactGroupId: "g-1", contactId: "c-2" },
        { contactGroupId: "g-1", contactId: "c-3" },
      ],
      skipDuplicates: true,
    });
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
pnpm --filter @WBMSG/api test contact-groups
```

Expected: `FAIL — Cannot find module './contact-groups.js'`

- [ ] **Step 3: Create the route**

Create `apps/api/src/routes/contact-groups.ts`:

```typescript
import type { FastifyPluginAsync } from "fastify";

interface GroupBody {
  title: string;
  description?: string;
}

export const contactGroupsRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { archived?: string } }>("/contact-groups", async (request, reply) => {
    const { organizationId } = request.auth;
    const isArchived = request.query.archived === "true";
    const data = await fastify.prisma.contactGroup.findMany({
      where: { organizationId, isArchived },
      include: { _count: { select: { contacts: true } } },
      orderBy: { createdAt: "desc" },
    });
    return reply.send({ data });
  });

  fastify.post<{ Body: GroupBody }>("/contact-groups", async (request, reply) => {
    const { organizationId } = request.auth;
    const data = await fastify.prisma.contactGroup.create({
      data: { organizationId, title: request.body.title, description: request.body.description ?? null },
    });
    return reply.status(201).send({ data });
  });

  fastify.put<{ Params: { id: string }; Body: Partial<GroupBody> }>(
    "/contact-groups/:id",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const existing = await fastify.prisma.contactGroup.findFirst({ where: { id: request.params.id, organizationId } });
      if (!existing) return reply.status(404).send({ error: "Not found" });
      const data = await fastify.prisma.contactGroup.update({
        where: { id: request.params.id },
        data: request.body,
      });
      return reply.send({ data });
    }
  );

  fastify.delete<{ Params: { id: string } }>("/contact-groups/:id", async (request, reply) => {
    const { organizationId } = request.auth;
    const existing = await fastify.prisma.contactGroup.findFirst({ where: { id: request.params.id, organizationId } });
    if (!existing) return reply.status(404).send({ error: "Not found" });
    await fastify.prisma.contactGroup.delete({ where: { id: request.params.id } });
    return reply.status(204).send();
  });

  fastify.post<{ Params: { id: string } }>("/contact-groups/:id/archive", async (request, reply) => {
    const { organizationId } = request.auth;
    const existing = await fastify.prisma.contactGroup.findFirst({ where: { id: request.params.id, organizationId } });
    if (!existing) return reply.status(404).send({ error: "Not found" });
    const data = await fastify.prisma.contactGroup.update({ where: { id: request.params.id }, data: { isArchived: true } });
    return reply.send({ data });
  });

  fastify.post<{ Params: { id: string } }>("/contact-groups/:id/unarchive", async (request, reply) => {
    const { organizationId } = request.auth;
    const existing = await fastify.prisma.contactGroup.findFirst({ where: { id: request.params.id, organizationId } });
    if (!existing) return reply.status(404).send({ error: "Not found" });
    const data = await fastify.prisma.contactGroup.update({ where: { id: request.params.id }, data: { isArchived: false } });
    return reply.send({ data });
  });

  fastify.get<{ Params: { id: string }; Querystring: { page?: string } }>(
    "/contact-groups/:id/contacts",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const existing = await fastify.prisma.contactGroup.findFirst({ where: { id: request.params.id, organizationId } });
      if (!existing) return reply.status(404).send({ error: "Not found" });
      const page = parseInt(request.query.page ?? "1", 10);
      const data = await fastify.prisma.groupContact.findMany({
        where: { contactGroupId: request.params.id },
        include: { contactGroup: false },
        skip: (page - 1) * 50,
        take: 50,
      });
      return reply.send({ data });
    }
  );

  fastify.post<{ Params: { id: string }; Body: { contactIds: string[] } }>(
    "/contact-groups/:id/contacts",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const existing = await fastify.prisma.contactGroup.findFirst({ where: { id: request.params.id, organizationId } });
      if (!existing) return reply.status(404).send({ error: "Not found" });
      await fastify.prisma.groupContact.createMany({
        data: request.body.contactIds.map((contactId) => ({ contactGroupId: request.params.id, contactId })),
        skipDuplicates: true,
      });
      return reply.send({ success: true });
    }
  );

  fastify.delete<{ Params: { id: string }; Body: { contactIds: string[] } }>(
    "/contact-groups/:id/contacts",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const existing = await fastify.prisma.contactGroup.findFirst({ where: { id: request.params.id, organizationId } });
      if (!existing) return reply.status(404).send({ error: "Not found" });
      await fastify.prisma.groupContact.deleteMany({
        where: { contactGroupId: request.params.id, contactId: { in: request.body.contactIds } },
      });
      return reply.send({ success: true });
    }
  );
};
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm --filter @WBMSG/api test contact-groups
```

Expected: `✓ all 4 tests pass`

- [ ] **Step 5: Register router**

In `apps/api/src/routes/index.ts`, add:

```typescript
import { contactGroupsRouter } from "./contact-groups.js";
await app.register(contactGroupsRouter, { prefix: "/v1" });
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/contact-groups.ts apps/api/src/routes/contact-groups.test.ts apps/api/src/routes/index.ts
git commit -m "feat(api): contact groups CRUD with archive, bulk member management"
```

---

## Task 3: Saved Filters API

**Files:**
- Create: `apps/api/src/routes/saved-filters.ts`
- Create: `apps/api/src/routes/saved-filters.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/api/src/routes/saved-filters.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const mockPrisma = {
  savedFilter: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
};

const mockAuth = { userId: "user-1", organizationId: "org-1", role: "admin" as const };

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (req) => { req.auth = mockAuth; });
  const { savedFiltersRouter } = await import("./saved-filters.js");
  await app.register(savedFiltersRouter, { prefix: "/v1" });
  return app;
}

describe("GET /v1/saved-filters", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns saved filters for the org", async () => {
    mockPrisma.savedFilter.findMany.mockResolvedValue([
      { id: "sf-1", organizationId: "org-1", name: "High Value Mumbai", filterData: { city: "Mumbai", minOrders: 5 } },
    ]);
    const res = await app.inject({ method: "GET", url: "/v1/saved-filters" });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: unknown[] }>().data).toHaveLength(1);
  });
});

describe("POST /v1/saved-filters", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("creates a saved filter and returns 201", async () => {
    const created = { id: "sf-2", organizationId: "org-1", name: "Active Contacts", filterData: { status: "active" } };
    mockPrisma.savedFilter.create.mockResolvedValue(created);
    const res = await app.inject({
      method: "POST",
      url: "/v1/saved-filters",
      payload: { name: "Active Contacts", filterData: { status: "active" } },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json<{ data: { id: string } }>().data.id).toBe("sf-2");
  });
});

describe("DELETE /v1/saved-filters/:id", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns 404 for wrong org", async () => {
    mockPrisma.savedFilter.findFirst.mockResolvedValue(null);
    const res = await app.inject({ method: "DELETE", url: "/v1/saved-filters/bad-id" });
    expect(res.statusCode).toBe(404);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
pnpm --filter @WBMSG/api test saved-filters
```

Expected: `FAIL — Cannot find module './saved-filters.js'`

- [ ] **Step 3: Create the route**

Create `apps/api/src/routes/saved-filters.ts`:

```typescript
import type { FastifyPluginAsync } from "fastify";

interface SavedFilterBody {
  name: string;
  filterData: Record<string, unknown>;
}

export const savedFiltersRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/saved-filters", async (request, reply) => {
    const { organizationId } = request.auth;
    const data = await fastify.prisma.savedFilter.findMany({
      where: { organizationId },
      orderBy: { name: "asc" },
    });
    return reply.send({ data });
  });

  fastify.post<{ Body: SavedFilterBody }>("/saved-filters", async (request, reply) => {
    const { organizationId } = request.auth;
    const data = await fastify.prisma.savedFilter.create({
      data: { organizationId, name: request.body.name, filterData: request.body.filterData },
    });
    return reply.status(201).send({ data });
  });

  fastify.put<{ Params: { id: string }; Body: Partial<SavedFilterBody> }>(
    "/saved-filters/:id",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const existing = await fastify.prisma.savedFilter.findFirst({ where: { id: request.params.id, organizationId } });
      if (!existing) return reply.status(404).send({ error: "Not found" });
      const data = await fastify.prisma.savedFilter.update({
        where: { id: request.params.id },
        data: request.body,
      });
      return reply.send({ data });
    }
  );

  fastify.delete<{ Params: { id: string } }>("/saved-filters/:id", async (request, reply) => {
    const { organizationId } = request.auth;
    const existing = await fastify.prisma.savedFilter.findFirst({ where: { id: request.params.id, organizationId } });
    if (!existing) return reply.status(404).send({ error: "Not found" });
    await fastify.prisma.savedFilter.delete({ where: { id: request.params.id } });
    return reply.status(204).send();
  });
};
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm --filter @WBMSG/api test saved-filters
```

Expected: `✓ all 3 tests pass`

- [ ] **Step 5: Register router**

```typescript
// apps/api/src/routes/index.ts
import { savedFiltersRouter } from "./saved-filters.js";
await app.register(savedFiltersRouter, { prefix: "/v1" });
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/saved-filters.ts apps/api/src/routes/saved-filters.test.ts apps/api/src/routes/index.ts
git commit -m "feat(api): saved contact filters CRUD"
```

---

## Task 4: Contact Bulk Group Assignment + Export

**Files:**
- Modify: `apps/api/src/routes/contacts.ts`
- Modify: `apps/api/src/routes/contacts.test.ts`

- [ ] **Step 1: Write failing tests** — add to `contacts.test.ts`:

```typescript
describe("POST /v1/contacts/bulk/assign-groups", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("bulk assigns contacts to groups", async () => {
    mockPrisma.groupContact = { createMany: vi.fn().mockResolvedValue({ count: 6 }) };
    const res = await app.inject({
      method: "POST",
      url: "/v1/contacts/bulk/assign-groups",
      payload: { contactIds: ["c-1", "c-2"], groupIds: ["g-1", "g-2", "g-3"] },
    });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.groupContact.createMany).toHaveBeenCalledTimes(1);
  });
});

describe("GET /v1/contacts/export", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns CSV content type", async () => {
    mockPrisma.contact.findMany.mockResolvedValue([
      { id: "c-1", firstName: "Priya", lastName: "Shah", phone: "+919000000001", email: "priya@example.com" },
    ]);
    const res = await app.inject({ method: "GET", url: "/v1/contacts/export?format=csv" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
pnpm --filter @WBMSG/api test contacts
```

- [ ] **Step 3: Add routes to contacts.ts**

At the bottom of the `contactsRouter` function in `apps/api/src/routes/contacts.ts`, add:

```typescript
  // ── Bulk group assignment ────────────────────────────────────────────────
  fastify.post<{ Body: { contactIds: string[]; groupIds: string[] } }>(
    "/contacts/bulk/assign-groups",
    async (request, reply) => {
      const { contactIds, groupIds } = request.body;
      const pairs: { contactGroupId: string; contactId: string }[] = [];
      for (const groupId of groupIds) {
        for (const contactId of contactIds) {
          pairs.push({ contactGroupId: groupId, contactId });
        }
      }
      await fastify.prisma.groupContact.createMany({ data: pairs, skipDuplicates: true });
      return reply.send({ success: true });
    }
  );

  fastify.delete<{ Body: { contactIds: string[]; groupIds: string[] } }>(
    "/contacts/bulk/unassign-groups",
    async (request, reply) => {
      const { contactIds, groupIds } = request.body;
      await fastify.prisma.groupContact.deleteMany({
        where: { contactGroupId: { in: groupIds }, contactId: { in: contactIds } },
      });
      return reply.send({ success: true });
    }
  );

  // ── Export ───────────────────────────────────────────────────────────────
  fastify.get<{ Querystring: { format?: string } }>("/contacts/export", async (request, reply) => {
    const { organizationId } = request.auth;
    const contacts = await fastify.prisma.contact.findMany({
      where: { organizationId },
      select: { id: true, firstName: true, lastName: true, phone: true, email: true, countryCode: true, createdAt: true },
    });
    const format = request.query.format ?? "csv";
    if (format === "csv") {
      const header = "id,first_name,last_name,phone,email,country_code,created_at\n";
      const rows = contacts.map((c) =>
        [c.id, c.firstName ?? "", c.lastName ?? "", c.phone, c.email ?? "", c.countryCode ?? "", c.createdAt.toISOString()].join(",")
      );
      reply.header("Content-Type", "text/csv");
      reply.header("Content-Disposition", "attachment; filename=contacts.csv");
      return reply.send(header + rows.join("\n"));
    }
    return reply.send({ data: contacts });
  });
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm --filter @WBMSG/api test contacts
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/contacts.ts apps/api/src/routes/contacts.test.ts
git commit -m "feat(api): contact bulk group assignment and CSV export"
```

---

## Task 5: Campaign Enhancements — abort, archive, requeue, logs, targeted count, non-template

**Files:**
- Modify: `apps/api/src/routes/campaigns.ts`
- Modify: `apps/api/src/routes/campaigns.test.ts`

- [ ] **Step 1: Write failing tests** — add to `campaigns.test.ts`:

```typescript
describe("GET /v1/campaigns/:id/targeted-count", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns count of contacts that would receive this campaign", async () => {
    mockPrisma.campaign = {
      ...mockPrisma.campaign,
      findFirst: vi.fn().mockResolvedValue({ id: "camp-1", organizationId: "org-1" }),
    };
    mockPrisma.groupContact = { findMany: vi.fn().mockResolvedValue([{ contactId: "c-1" }, { contactId: "c-2" }]) };
    mockPrisma.contact = { count: vi.fn().mockResolvedValue(47) };
    const res = await app.inject({ method: "GET", url: "/v1/campaigns/camp-1/targeted-count?groupIds=g-1" });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: { count: number } }>().data.count).toBeGreaterThanOrEqual(0);
  });
});

describe("POST /v1/campaigns/:id/abort", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("sets campaign status to aborted", async () => {
    mockPrisma.campaign = {
      findFirst: vi.fn().mockResolvedValue({ id: "camp-1", organizationId: "org-1", status: "running" }),
      update: vi.fn().mockResolvedValue({ id: "camp-1", status: "aborted" }),
    };
    const res = await app.inject({ method: "POST", url: "/v1/campaigns/camp-1/abort" });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.campaign.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "aborted" } })
    );
  });
});

describe("POST /v1/campaigns/:id/archive", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("sets campaign isArchived to true", async () => {
    mockPrisma.campaign = {
      findFirst: vi.fn().mockResolvedValue({ id: "camp-1", organizationId: "org-1" }),
      update: vi.fn().mockResolvedValue({ id: "camp-1", isArchived: true }),
    };
    const res = await app.inject({ method: "POST", url: "/v1/campaigns/camp-1/archive" });
    expect(res.statusCode).toBe(200);
  });
});

describe("GET /v1/campaigns/:id/queue-log", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns pending recipients for the campaign", async () => {
    mockPrisma.campaign = {
      findFirst: vi.fn().mockResolvedValue({ id: "camp-1", organizationId: "org-1" }),
    };
    mockPrisma.campaignRecipient = {
      findMany: vi.fn().mockResolvedValue([{ id: "cr-1", contactId: "c-1", status: "pending" }]),
    };
    const res = await app.inject({ method: "GET", url: "/v1/campaigns/camp-1/queue-log" });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: unknown[] }>().data).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
pnpm --filter @WBMSG/api test campaigns
```

- [ ] **Step 3: Add routes to campaigns.ts**

At the bottom of the `campaignsRouter` function in `apps/api/src/routes/campaigns.ts`, add:

```typescript
  // ── Targeted contact count preview ───────────────────────────────────────
  fastify.get<{ Params: { id: string }; Querystring: { groupIds?: string; segmentIds?: string } }>(
    "/campaigns/:id/targeted-count",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const campaign = await fastify.prisma.campaign.findFirst({ where: { id: request.params.id, organizationId } });
      if (!campaign) return reply.status(404).send({ error: "Not found" });

      const groupIds = request.query.groupIds?.split(",").filter(Boolean) ?? [];
      let contactIds = new Set<string>();

      if (groupIds.length > 0) {
        const groupContacts = await fastify.prisma.groupContact.findMany({
          where: { contactGroupId: { in: groupIds } },
          select: { contactId: true },
        });
        groupContacts.forEach((gc) => contactIds.add(gc.contactId));
      }

      const count = groupIds.length > 0
        ? await fastify.prisma.contact.count({ where: { id: { in: Array.from(contactIds) }, organizationId } })
        : await fastify.prisma.contact.count({ where: { organizationId } });

      return reply.send({ data: { count } });
    }
  );

  // ── Abort ─────────────────────────────────────────────────────────────────
  fastify.post<{ Params: { id: string } }>("/campaigns/:id/abort", async (request, reply) => {
    const { organizationId } = request.auth;
    const campaign = await fastify.prisma.campaign.findFirst({ where: { id: request.params.id, organizationId } });
    if (!campaign) return reply.status(404).send({ error: "Not found" });
    const data = await fastify.prisma.campaign.update({ where: { id: request.params.id }, data: { status: "aborted" } });
    return reply.send({ data });
  });

  // ── Archive / unarchive ──────────────────────────────────────────────────
  fastify.post<{ Params: { id: string } }>("/campaigns/:id/archive", async (request, reply) => {
    const { organizationId } = request.auth;
    const campaign = await fastify.prisma.campaign.findFirst({ where: { id: request.params.id, organizationId } });
    if (!campaign) return reply.status(404).send({ error: "Not found" });
    const data = await fastify.prisma.campaign.update({ where: { id: request.params.id }, data: { isArchived: true } });
    return reply.send({ data });
  });

  fastify.post<{ Params: { id: string } }>("/campaigns/:id/unarchive", async (request, reply) => {
    const { organizationId } = request.auth;
    const campaign = await fastify.prisma.campaign.findFirst({ where: { id: request.params.id, organizationId } });
    if (!campaign) return reply.status(404).send({ error: "Not found" });
    const data = await fastify.prisma.campaign.update({ where: { id: request.params.id }, data: { isArchived: false } });
    return reply.send({ data });
  });

  // ── Requeue failed ───────────────────────────────────────────────────────
  fastify.post<{ Params: { id: string } }>("/campaigns/:id/requeue-failed", async (request, reply) => {
    const { organizationId } = request.auth;
    const campaign = await fastify.prisma.campaign.findFirst({ where: { id: request.params.id, organizationId } });
    if (!campaign) return reply.status(404).send({ error: "Not found" });
    const result = await fastify.prisma.campaignRecipient.updateMany({
      where: { campaignId: request.params.id, status: "failed" },
      data: { status: "pending" },
    });
    return reply.send({ data: { requeued: result.count } });
  });

  // ── Queue log (pending) ──────────────────────────────────────────────────
  fastify.get<{ Params: { id: string }; Querystring: { page?: string } }>(
    "/campaigns/:id/queue-log",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const campaign = await fastify.prisma.campaign.findFirst({ where: { id: request.params.id, organizationId } });
      if (!campaign) return reply.status(404).send({ error: "Not found" });
      const page = parseInt(request.query.page ?? "1", 10);
      const data = await fastify.prisma.campaignRecipient.findMany({
        where: { campaignId: request.params.id, status: "pending" },
        include: { contact: { select: { firstName: true, lastName: true, phone: true } } },
        skip: (page - 1) * 50,
        take: 50,
      });
      return reply.send({ data });
    }
  );

  // ── Expired log ──────────────────────────────────────────────────────────
  fastify.get<{ Params: { id: string }; Querystring: { page?: string } }>(
    "/campaigns/:id/expired-log",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const campaign = await fastify.prisma.campaign.findFirst({ where: { id: request.params.id, organizationId } });
      if (!campaign) return reply.status(404).send({ error: "Not found" });
      const page = parseInt(request.query.page ?? "1", 10);
      const data = await fastify.prisma.campaignRecipient.findMany({
        where: { campaignId: request.params.id, status: "expired" },
        include: { contact: { select: { firstName: true, lastName: true, phone: true } } },
        skip: (page - 1) * 50,
        take: 50,
      });
      return reply.send({ data });
    }
  );

  // ── Report download (JSON for frontend to render PDF/Excel) ─────────────
  fastify.get<{ Params: { id: string } }>("/campaigns/:id/report", async (request, reply) => {
    const { organizationId } = request.auth;
    const campaign = await fastify.prisma.campaign.findFirst({ where: { id: request.params.id, organizationId } });
    if (!campaign) return reply.status(404).send({ error: "Not found" });
    const [sent, delivered, read, failed, pending] = await Promise.all([
      fastify.prisma.campaignRecipient.count({ where: { campaignId: request.params.id, status: "sent" } }),
      fastify.prisma.campaignRecipient.count({ where: { campaignId: request.params.id, status: "delivered" } }),
      fastify.prisma.campaignRecipient.count({ where: { campaignId: request.params.id, status: "read" } }),
      fastify.prisma.campaignRecipient.count({ where: { campaignId: request.params.id, status: "failed" } }),
      fastify.prisma.campaignRecipient.count({ where: { campaignId: request.params.id, status: "pending" } }),
    ]);
    return reply.send({ data: { campaign, stats: { sent, delivered, read, failed, pending } } });
  });
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm --filter @WBMSG/api test campaigns
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/campaigns.ts apps/api/src/routes/campaigns.test.ts
git commit -m "feat(api): campaign abort, archive, requeue, targeted-count, queue/expired logs, report"
```

---

## Task 6: Indian Payment Gateways

**Files:**
- Modify: `apps/api/src/routes/billing.ts`
- Modify: `apps/api/src/routes/billing.test.ts`

- [ ] **Step 1: Install Razorpay SDK**

```bash
pnpm --filter @WBMSG/api add razorpay
```

Expected: `+ razorpay@x.x.x`

- [ ] **Step 2: Write failing tests** — add to `billing.test.ts`:

```typescript
vi.mock("razorpay", () => ({
  default: vi.fn().mockImplementation(() => ({
    orders: {
      create: vi.fn().mockResolvedValue({ id: "order_test123", amount: 99900, currency: "INR" }),
    },
  })),
}));

describe("POST /v1/billing/razorpay/create-order", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("creates a Razorpay order and returns order id", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/billing/razorpay/create-order",
      payload: { planId: "plan-standard", amount: 99900 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: { orderId: string } }>().data.orderId).toBe("order_test123");
  });
});

describe("POST /v1/billing/manual/submit-proof", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("creates a manual subscription record", async () => {
    mockPrisma.manualSubscription = {
      create: vi.fn().mockResolvedValue({ id: "ms-1", status: "pending" }),
    };
    const res = await app.inject({
      method: "POST",
      url: "/v1/billing/manual/submit-proof",
      payload: { planId: "plan-standard", proofUrl: "https://cdn.example.com/proof.jpg", transactionRef: "TXN123" },
    });
    expect(res.statusCode).toBe(201);
  });
});
```

- [ ] **Step 3: Run tests — expect FAIL**

```bash
pnpm --filter @WBMSG/api test billing
```

- [ ] **Step 4: Add gateway routes to billing.ts**

Add inside the `billingRouter` function in `apps/api/src/routes/billing.ts`:

```typescript
import Razorpay from "razorpay";

// ── Razorpay ─────────────────────────────────────────────────────────────
  fastify.post<{ Body: { planId: string; amount: number } }>(
    "/billing/razorpay/create-order",
    async (request, reply) => {
      const rzp = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID ?? "",
        key_secret: process.env.RAZORPAY_KEY_SECRET ?? "",
      });
      const order = await rzp.orders.create({
        amount: request.body.amount,
        currency: "INR",
        notes: { planId: request.body.planId, organizationId: request.auth.organizationId },
      });
      return reply.send({ data: { orderId: order.id, amount: order.amount, currency: order.currency } });
    }
  );

  fastify.post("/billing/razorpay/webhook", async (request, reply) => {
    // Verify signature header: x-razorpay-signature
    const signature = request.headers["x-razorpay-signature"] as string;
    const body = JSON.stringify(request.body);
    const crypto = await import("crypto");
    const expected = crypto.createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET ?? "").update(body).digest("hex");
    if (signature !== expected) return reply.status(400).send({ error: "Invalid signature" });
    // payment.captured event → activate subscription
    const event = request.body as { event: string; payload: { payment: { entity: { notes: { organizationId: string; planId: string } } } } };
    if (event.event === "payment.captured") {
      const { organizationId, planId } = event.payload.payment.entity.notes;
      await fastify.prisma.organization.update({
        where: { id: organizationId },
        data: { settings: { planId, activatedAt: new Date().toISOString() } },
      });
    }
    return reply.send({ received: true });
  });

  // ── Paystack ──────────────────────────────────────────────────────────────
  fastify.post<{ Body: { reference: string } }>("/billing/paystack/verify", async (request, reply) => {
    const res = await fetch(`https://api.paystack.co/transaction/verify/${request.body.reference}`, {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY ?? ""}` },
    });
    const json = await res.json() as { status: boolean; data: { status: string; metadata: { organizationId: string } } };
    if (!json.status || json.data.status !== "success") return reply.status(400).send({ error: "Payment not verified" });
    return reply.send({ data: { verified: true } });
  });

  fastify.post("/billing/paystack/webhook", async (request, reply) => {
    const hash = request.headers["x-paystack-signature"] as string;
    const crypto = await import("crypto");
    const expected = crypto.createHmac("sha512", process.env.PAYSTACK_SECRET_KEY ?? "").update(JSON.stringify(request.body)).digest("hex");
    if (hash !== expected) return reply.status(400).send({ error: "Invalid signature" });
    return reply.send({ received: true });
  });

  // ── PhonePe ───────────────────────────────────────────────────────────────
  fastify.post<{ Body: { transactionId: string } }>("/billing/phonepe/capture", async (request, reply) => {
    const merchantId = process.env.PHONEPE_MERCHANT_ID ?? "";
    const apiKey = process.env.PHONEPE_API_KEY ?? "";
    const crypto = await import("crypto");
    const checksum = crypto.createHash("sha256").update(`/pg/v1/status/${merchantId}/${request.body.transactionId}${apiKey}`).digest("hex") + "###1";
    const res = await fetch(`https://api.phonepe.com/apis/hermes/pg/v1/status/${merchantId}/${request.body.transactionId}`, {
      headers: { "Content-Type": "application/json", "X-VERIFY": checksum, "X-MERCHANT-ID": merchantId },
    });
    const json = await res.json() as { success: boolean; code: string };
    return reply.send({ data: { success: json.success, code: json.code } });
  });

  // ── YooMoney ──────────────────────────────────────────────────────────────
  fastify.post<{ Body: { amount: number; planId: string } }>("/billing/yoomoney/checkout", async (request, reply) => {
    const receiver = process.env.YOOMONEY_WALLET ?? "";
    const label = `${request.auth.organizationId}:${request.body.planId}`;
    const url = `https://yoomoney.ru/quickpay/confirm?receiver=${receiver}&quickpay-form=shop&targets=Subscription&paymentType=AC&sum=${request.body.amount / 100}&label=${encodeURIComponent(label)}`;
    return reply.send({ data: { checkoutUrl: url } });
  });

  fastify.post("/billing/yoomoney/webhook", async (request, reply) => {
    // YooMoney sends notification_secret in SHA1 hash
    return reply.send({ received: true });
  });

  // ── Manual payment proof (bank transfer / UPI) ───────────────────────────
  fastify.post<{ Body: { planId: string; proofUrl: string; transactionRef: string } }>(
    "/billing/manual/submit-proof",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const data = await fastify.prisma.manualSubscription.create({
        data: {
          organizationId,
          planId: request.body.planId,
          status: "pending",
          proofUrl: request.body.proofUrl,
          transactionRef: request.body.transactionRef,
        },
      });
      return reply.status(201).send({ data });
    }
  );

  fastify.delete("/billing/manual/cancel-request", async (request, reply) => {
    const { organizationId } = request.auth;
    await fastify.prisma.manualSubscription.updateMany({
      where: { organizationId, status: "pending" },
      data: { status: "cancelled" },
    });
    return reply.send({ success: true });
  });
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
pnpm --filter @WBMSG/api test billing
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/billing.ts apps/api/src/routes/billing.test.ts
git commit -m "feat(api): Razorpay, Paystack, PhonePe, YooMoney, manual payment proof endpoints"
```

---

## Task 7: Web — Contact Groups Page

**Files:**
- Create: `apps/web/app/(dashboard)/contacts/groups/page.tsx`

- [ ] **Step 1: Create page**

```tsx
// apps/web/app/(dashboard)/contacts/groups/page.tsx
"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface ContactGroup {
  id: string;
  title: string;
  description: string | null;
  isArchived: boolean;
  _count: { contacts: number };
}

export default function ContactGroupsPage() {
  const qc = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  const { data } = useQuery<{ data: ContactGroup[] }>({
    queryKey: ["contact-groups", showArchived],
    queryFn: () => fetch(`/api/v1/contact-groups?archived=${showArchived}`).then((r) => r.json()),
  });

  const createGroup = useMutation({
    mutationFn: (title: string) =>
      fetch("/api/v1/contact-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contact-groups"] });
      setCreating(false);
      setNewTitle("");
    },
  });

  const archiveGroup = useMutation({
    mutationFn: ({ id, archive }: { id: string; archive: boolean }) =>
      fetch(`/api/v1/contact-groups/${id}/${archive ? "archive" : "unarchive"}`, { method: "POST" }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contact-groups"] }),
  });

  const deleteGroup = useMutation({
    mutationFn: (id: string) => fetch(`/api/v1/contact-groups/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contact-groups"] }),
  });

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Contact Groups</h1>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="rounded" />
            Show archived
          </label>
          <button
            onClick={() => setCreating(true)}
            className="px-4 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700"
          >
            New Group
          </button>
        </div>
      </div>

      {creating && (
        <div className="border rounded-lg p-4 flex gap-3">
          <input
            autoFocus
            className="flex-1 border rounded px-3 py-1.5 text-sm"
            placeholder="Group name"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && newTitle && createGroup.mutate(newTitle)}
          />
          <button
            onClick={() => newTitle && createGroup.mutate(newTitle)}
            disabled={!newTitle || createGroup.isPending}
            className="px-3 py-1.5 bg-green-600 text-white text-sm rounded disabled:opacity-50"
          >
            Create
          </button>
          <button onClick={() => setCreating(false)} className="px-3 py-1.5 text-sm border rounded">Cancel</button>
        </div>
      )}

      <div className="divide-y border rounded-lg">
        {(data?.data ?? []).length === 0 && (
          <p className="p-6 text-center text-sm text-gray-400">No groups yet. Create one to start organising contacts.</p>
        )}
        {(data?.data ?? []).map((group) => (
          <div key={group.id} className="flex items-center justify-between p-4">
            <div>
              <p className="font-medium text-sm">{group.title}</p>
              <p className="text-xs text-gray-500">{group._count.contacts} contacts</p>
            </div>
            <div className="flex items-center gap-2">
              <a href={`/contacts/groups/${group.id}`} className="text-xs text-blue-600 hover:underline">View contacts</a>
              <button
                onClick={() => archiveGroup.mutate({ id: group.id, archive: !group.isArchived })}
                className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 border rounded"
              >
                {group.isArchived ? "Unarchive" : "Archive"}
              </button>
              <button
                onClick={() => confirm("Delete this group?") && deleteGroup.mutate(group.id)}
                className="text-xs text-red-500 hover:text-red-700 px-2 py-1 border border-red-200 rounded"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check and commit**

```bash
pnpm type-check
git add apps/web/app/\(dashboard\)/contacts/groups/
git commit -m "feat(web): contact groups list page with archive/delete"
```

---

## Task 8: Web — Campaign New Page Enhancements (Groups + Non-Template)

**Files:**
- Modify: `apps/web/app/(dashboard)/campaigns/new/page.tsx`

- [ ] **Step 1: Add group selector and live count to campaign creation form**

Find the targeting section in `apps/web/app/(dashboard)/campaigns/new/page.tsx`. Add below any existing segment selector:

```tsx
import { useQuery } from "@tanstack/react-query";

// Add state for selected groups:
const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
const [campaignType, setCampaignType] = useState<"template" | "non_template">("template");
const [freeTextBody, setFreeTextBody] = useState("");

// Contact groups data:
const { data: groups } = useQuery({
  queryKey: ["contact-groups"],
  queryFn: () => fetch("/api/v1/contact-groups").then((r) => r.json()),
});

// Live count:
const { data: countData } = useQuery({
  queryKey: ["targeted-count", selectedGroupIds],
  queryFn: () => fetch(`/api/v1/campaigns/preview/targeted-count?groupIds=${selectedGroupIds.join(",")}`).then((r) => r.json()),
  enabled: selectedGroupIds.length > 0,
});

// In the JSX targeting section:
<div className="space-y-3">
  <label className="block text-sm font-medium">Campaign Type</label>
  <div className="flex gap-3">
    <label className="flex items-center gap-2 text-sm">
      <input type="radio" value="template" checked={campaignType === "template"} onChange={() => setCampaignType("template")} />
      Template message
    </label>
    <label className="flex items-center gap-2 text-sm">
      <input type="radio" value="non_template" checked={campaignType === "non_template"} onChange={() => setCampaignType("non_template")} />
      Free text message
    </label>
  </div>

  {campaignType === "non_template" && (
    <textarea
      className="w-full border rounded px-3 py-2 text-sm"
      rows={4}
      placeholder="Type your message..."
      value={freeTextBody}
      onChange={(e) => setFreeTextBody(e.target.value)}
    />
  )}

  <label className="block text-sm font-medium">Target Groups</label>
  <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto border rounded p-2">
    {(groups?.data ?? []).map((g: { id: string; title: string; _count: { contacts: number } }) => (
      <label key={g.id} className="flex items-center gap-2 text-sm p-1 rounded hover:bg-gray-50 cursor-pointer">
        <input
          type="checkbox"
          checked={selectedGroupIds.includes(g.id)}
          onChange={(e) =>
            setSelectedGroupIds((prev) =>
              e.target.checked ? [...prev, g.id] : prev.filter((id) => id !== g.id)
            )
          }
          className="rounded"
        />
        {g.title} <span className="text-xs text-gray-400">({g._count.contacts})</span>
      </label>
    ))}
  </div>

  {selectedGroupIds.length > 0 && countData && (
    <p className="text-sm text-green-700 font-medium">
      {countData.data.count} contacts will receive this campaign
    </p>
  )}
</div>
```

- [ ] **Step 2: Type-check and commit**

```bash
pnpm type-check
git add apps/web/app/\(dashboard\)/campaigns/new/
git commit -m "feat(web): campaign new page — group targeting, live count, non-template toggle"
```

---

## Task 9: Web — Campaign Logs Page

**Files:**
- Create: `apps/web/app/(dashboard)/campaigns/[id]/logs/page.tsx`

- [ ] **Step 1: Create page**

```tsx
// apps/web/app/(dashboard)/campaigns/[id]/logs/page.tsx
"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

type LogTab = "queue" | "executed" | "expired";

interface Recipient {
  id: string;
  status: string;
  contact: { firstName: string | null; lastName: string | null; phone: string };
}

export default function CampaignLogsPage({ params }: { params: { id: string } }) {
  const [tab, setTab] = useState<LogTab>("queue");

  const queueQuery = useQuery<{ data: Recipient[] }>({
    queryKey: ["campaign-queue-log", params.id],
    queryFn: () => fetch(`/api/v1/campaigns/${params.id}/queue-log`).then((r) => r.json()),
    enabled: tab === "queue",
  });

  const executedQuery = useQuery<{ data: Recipient[] }>({
    queryKey: ["campaign-recipients", params.id],
    queryFn: () => fetch(`/api/v1/campaigns/${params.id}/recipients`).then((r) => r.json()),
    enabled: tab === "executed",
  });

  const expiredQuery = useQuery<{ data: Recipient[] }>({
    queryKey: ["campaign-expired-log", params.id],
    queryFn: () => fetch(`/api/v1/campaigns/${params.id}/expired-log`).then((r) => r.json()),
    enabled: tab === "expired",
  });

  const activeData =
    tab === "queue" ? queueQuery.data?.data :
    tab === "executed" ? executedQuery.data?.data :
    expiredQuery.data?.data;

  const statusBadge: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-700",
    sent: "bg-blue-100 text-blue-700",
    delivered: "bg-green-100 text-green-700",
    read: "bg-purple-100 text-purple-700",
    failed: "bg-red-100 text-red-700",
    expired: "bg-gray-100 text-gray-600",
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Campaign Logs</h1>
        <a
          href={`/api/v1/campaigns/${params.id}/report`}
          className="px-4 py-2 border text-sm rounded hover:bg-gray-50"
          download
        >
          Download Report
        </a>
      </div>

      <div className="flex border-b">
        {(["queue", "executed", "expired"] as LogTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-px ${
              tab === t ? "border-green-600 text-green-600" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="border rounded-lg divide-y">
        {(activeData ?? []).length === 0 && (
          <p className="p-6 text-center text-sm text-gray-400">No records in this tab.</p>
        )}
        {(activeData ?? []).map((r) => (
          <div key={r.id} className="flex items-center justify-between p-3">
            <div>
              <p className="text-sm font-medium">{[r.contact.firstName, r.contact.lastName].filter(Boolean).join(" ") || "Unknown"}</p>
              <p className="text-xs text-gray-500">{r.contact.phone}</p>
            </div>
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusBadge[r.status] ?? "bg-gray-100 text-gray-600"}`}>
              {r.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check and commit**

```bash
pnpm type-check
git add apps/web/app/\(dashboard\)/campaigns/
git commit -m "feat(web): campaign logs page with queue/executed/expired tabs and report download"
```

---

## Task 10: Full test run + type-check

- [ ] **Step 1: Run all API tests**

```bash
pnpm --filter @WBMSG/api test
```

Expected: all tests pass

- [ ] **Step 2: Full type-check**

```bash
pnpm type-check
```

Expected: no errors

- [ ] **Step 3: Lint**

```bash
pnpm lint
```

Expected: no errors

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(cycle2): Campaign Power — contact groups, saved filters, campaign logs, Indian payment gateways"
```

---

## Cycle 2 Acceptance Criteria

- [ ] Admin creates "VIP Clients" group, adds 50 contacts, sees "50 contacts in this group"
- [ ] Campaign creation shows group selector + live count "1,247 contacts will receive this"
- [ ] Non-template campaign sends free-text message without needing a Meta template
- [ ] Running campaign has "Abort" button; completed campaign with failures has "Requeue Failed" button
- [ ] Campaign logs page shows tabs: Queue (pending), Executed (sent/delivered/read), Expired
- [ ] Indian customer pays via Razorpay — subscription activates on webhook capture
- [ ] Contact filter can be saved as "High Value Delhi Contacts" and reloaded next session
