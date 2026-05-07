# Cycle 4 — CRM Superiority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete and polish TrustCRM's competitive advantages — response webhook actions (condition → send template), message log view, template analytics + send-to-contact, chat history clear, deal kanban with drag-drop, company profiles with linked contacts, and contact activity timeline.

**Architecture:** Schema-first: add `ResponseWebhookAction` + `ResponseWebhookActionLog` models and `Message.senderName` / `Message.isForwarded` fields → generate → new API routes → web UI pages. Deal kanban uses CSS grid drag-drop (no extra library). Activity timeline aggregates messages + notes + deals from existing models.

**Tech Stack:** Prisma (PostgreSQL), Fastify 4 ESM, Vitest, Next.js 15 App Router, Tailwind, React Query

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Modify | `apps/api/prisma/schema.prisma` | Add ResponseWebhookAction, ResponseWebhookActionLog, Message.senderName, Message.isForwarded |
| Create | `apps/api/src/routes/webhook-actions.ts` | Webhook action rule CRUD + logs |
| Create | `apps/api/src/routes/webhook-actions.test.ts` | Tests |
| Modify | `apps/api/src/routes/messages.ts` | Add log endpoint (date filter), send-template-to-contact |
| Modify | `apps/api/src/routes/messages.test.ts` | Tests |
| Modify | `apps/api/src/routes/templates.ts` | Add analytics endpoint, send-to-contact endpoint |
| Modify | `apps/api/src/routes/templates.test.ts` | Tests |
| Modify | `apps/api/src/routes/conversations.ts` | Add DELETE /conversations/:id/history |
| Modify | `apps/api/src/routes/conversations.test.ts` | Test |
| Modify | `apps/api/src/routes/index.ts` | Register webhook-actions router |
| Create | `apps/web/app/(dashboard)/settings/webhook-actions/page.tsx` | Webhook action rule builder UI |
| Create | `apps/web/app/(dashboard)/messages/page.tsx` | Message log with date/direction filters |
| Modify | `apps/web/app/(dashboard)/templates/page.tsx` | Add Analytics button + Send to Contact button |
| Create | `apps/web/app/(dashboard)/templates/[id]/analytics/page.tsx` | Per-template analytics bar chart |
| Modify | `apps/web/app/(dashboard)/deals/page.tsx` | Deal kanban board with drag-drop stages |
| Modify | `apps/web/app/(dashboard)/companies/[id]/page.tsx` | Company profile with linked contacts |
| Modify | `apps/web/app/(dashboard)/contacts/[id]/page.tsx` | Activity timeline (messages + notes + deals) |

---

## Task 1: Schema — ResponseWebhookAction, ResponseWebhookActionLog, Message fields

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Add ResponseWebhookAction and ResponseWebhookActionLog models**

Open `apps/api/prisma/schema.prisma`. After the `SavedFilter` model, add:

```prisma
model ResponseWebhookAction {
  id             String                     @id @default(uuid())
  organizationId String                     @map("organization_id")
  title          String
  conditionKey   String                     @map("condition_key")
  conditionValue String                     @map("condition_value")
  templateId     String?                    @map("template_id")
  isActive       Boolean                    @default(true) @map("is_active")
  data           Json?
  createdAt      DateTime                   @default(now()) @map("created_at")
  updatedAt      DateTime                   @updatedAt @map("updated_at")
  logs           ResponseWebhookActionLog[]

  @@index([organizationId])
  @@map("response_webhook_actions")
}

model ResponseWebhookActionLog {
  id           String                 @id @default(uuid())
  actionId     String?                @map("action_id")
  action       ResponseWebhookAction? @relation(fields: [actionId], references: [id], onDelete: SetNull)
  webhookLogId String                 @map("webhook_log_id")
  messageId    String?                @map("message_id")
  createdAt    DateTime               @default(now()) @map("created_at")

  @@index([actionId])
  @@index([webhookLogId])
  @@map("response_webhook_action_logs")
}
```

- [ ] **Step 2: Add fields to Message model**

Find the `Message` model. After `isSystemMessage`, add:

```prisma
  senderName  String?  @map("sender_name")
  isForwarded Boolean  @default(false) @map("is_forwarded")
```

- [ ] **Step 3: Run migration**

```bash
pnpm --filter @WBMSG/api migrate dev --name cycle4_crm_superiority
```

Expected: `The following migration(s) have been created and applied`

- [ ] **Step 4: Generate and type-check**

```bash
pnpm --filter @WBMSG/api generate && pnpm type-check
```

Expected: `✔ Generated Prisma Client` then no type errors

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/
git commit -m "feat(prisma): cycle4 schema — ResponseWebhookAction, ActionLog, Message.senderName/isForwarded"
```

---

## Task 2: Response Webhook Actions API

**Files:**
- Create: `apps/api/src/routes/webhook-actions.ts`
- Create: `apps/api/src/routes/webhook-actions.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/api/src/routes/webhook-actions.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const mockPrisma = {
  responseWebhookAction: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  responseWebhookActionLog: {
    findMany: vi.fn(),
  },
};

const mockAuth = { userId: "user-1", organizationId: "org-1", role: "admin" as const };

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (req) => { req.auth = mockAuth; });
  const { webhookActionsRouter } = await import("./webhook-actions.js");
  await app.register(webhookActionsRouter, { prefix: "/v1" });
  return app;
}

describe("GET /v1/webhook-actions", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns webhook actions for the org", async () => {
    mockPrisma.responseWebhookAction.findMany.mockResolvedValue([
      { id: "wa-1", title: "Payment Received", conditionKey: "event", conditionValue: "payment_received", isActive: true },
    ]);
    const res = await app.inject({ method: "GET", url: "/v1/webhook-actions" });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: unknown[] }>().data).toHaveLength(1);
  });
});

describe("POST /v1/webhook-actions", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("creates a webhook action and returns 201", async () => {
    const created = { id: "wa-2", organizationId: "org-1", title: "Order Shipped", conditionKey: "status", conditionValue: "shipped", templateId: "tmpl-1", isActive: true };
    mockPrisma.responseWebhookAction.create.mockResolvedValue(created);
    const res = await app.inject({
      method: "POST",
      url: "/v1/webhook-actions",
      payload: { title: "Order Shipped", conditionKey: "status", conditionValue: "shipped", templateId: "tmpl-1" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json<{ data: { id: string } }>().data.id).toBe("wa-2");
  });
});

describe("GET /v1/webhook-actions/:id/logs", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns execution logs for the action", async () => {
    mockPrisma.responseWebhookAction.findFirst.mockResolvedValue({ id: "wa-1", organizationId: "org-1" });
    mockPrisma.responseWebhookActionLog.findMany.mockResolvedValue([
      { id: "log-1", actionId: "wa-1", webhookLogId: "whl-1", messageId: "msg-1", createdAt: new Date() },
    ]);
    const res = await app.inject({ method: "GET", url: "/v1/webhook-actions/wa-1/logs" });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: unknown[] }>().data).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
pnpm --filter @WBMSG/api test webhook-actions
```

Expected: `FAIL — Cannot find module './webhook-actions.js'`

- [ ] **Step 3: Create the route**

Create `apps/api/src/routes/webhook-actions.ts`:

```typescript
import type { FastifyPluginAsync } from "fastify";

interface WebhookActionBody {
  title: string;
  conditionKey: string;
  conditionValue: string;
  templateId?: string;
  isActive?: boolean;
}

export const webhookActionsRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/webhook-actions", async (request, reply) => {
    const { organizationId } = request.auth;
    const data = await fastify.prisma.responseWebhookAction.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
    });
    return reply.send({ data });
  });

  fastify.post<{ Body: WebhookActionBody }>("/webhook-actions", async (request, reply) => {
    const { organizationId } = request.auth;
    const data = await fastify.prisma.responseWebhookAction.create({
      data: {
        organizationId,
        title: request.body.title,
        conditionKey: request.body.conditionKey,
        conditionValue: request.body.conditionValue,
        templateId: request.body.templateId ?? null,
        isActive: request.body.isActive ?? true,
      },
    });
    return reply.status(201).send({ data });
  });

  fastify.put<{ Params: { id: string }; Body: Partial<WebhookActionBody> }>(
    "/webhook-actions/:id",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const existing = await fastify.prisma.responseWebhookAction.findFirst({ where: { id: request.params.id, organizationId } });
      if (!existing) return reply.status(404).send({ error: "Not found" });
      const data = await fastify.prisma.responseWebhookAction.update({
        where: { id: request.params.id },
        data: request.body,
      });
      return reply.send({ data });
    }
  );

  fastify.delete<{ Params: { id: string } }>("/webhook-actions/:id", async (request, reply) => {
    const { organizationId } = request.auth;
    const existing = await fastify.prisma.responseWebhookAction.findFirst({ where: { id: request.params.id, organizationId } });
    if (!existing) return reply.status(404).send({ error: "Not found" });
    await fastify.prisma.responseWebhookAction.delete({ where: { id: request.params.id } });
    return reply.status(204).send();
  });

  fastify.get<{ Params: { id: string }; Querystring: { page?: string } }>(
    "/webhook-actions/:id/logs",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const existing = await fastify.prisma.responseWebhookAction.findFirst({ where: { id: request.params.id, organizationId } });
      if (!existing) return reply.status(404).send({ error: "Not found" });
      const page = parseInt(request.query.page ?? "1", 10);
      const data = await fastify.prisma.responseWebhookActionLog.findMany({
        where: { actionId: request.params.id },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * 50,
        take: 50,
      });
      return reply.send({ data });
    }
  );
};
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm --filter @WBMSG/api test webhook-actions
```

Expected: `✓ all 3 tests pass`

- [ ] **Step 5: Register router**

```typescript
// apps/api/src/routes/index.ts
import { webhookActionsRouter } from "./webhook-actions.js";
await app.register(webhookActionsRouter, { prefix: "/v1" });
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/webhook-actions.ts apps/api/src/routes/webhook-actions.test.ts apps/api/src/routes/index.ts
git commit -m "feat(api): response webhook actions CRUD with execution logs"
```

---

## Task 3: Message Log Endpoint

**Files:**
- Modify: `apps/api/src/routes/messages.ts`
- Modify: `apps/api/src/routes/messages.test.ts`

- [ ] **Step 1: Write failing test** — add to `messages.test.ts`:

```typescript
describe("GET /v1/messages/log", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns paginated messages filtered by date range", async () => {
    mockPrisma.message = {
      ...mockPrisma.message,
      findMany: vi.fn().mockResolvedValue([
        { id: "m-1", body: "Hello", direction: "inbound", status: "delivered", createdAt: new Date("2026-05-01") },
      ]),
      count: vi.fn().mockResolvedValue(1),
    };
    const res = await app.inject({
      method: "GET",
      url: "/v1/messages/log?from=2026-05-01&to=2026-05-08&direction=inbound",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: unknown[]; total: number }>().total).toBe(1);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm --filter @WBMSG/api test messages
```

- [ ] **Step 3: Add message log route to messages.ts**

At the bottom of the `messagesRouter` function in `apps/api/src/routes/messages.ts`, add:

```typescript
  // ── Message log (all messages with date filter) ──────────────────────────
  fastify.get<{
    Querystring: {
      from?: string;
      to?: string;
      direction?: string;
      contactId?: string;
      page?: string;
    };
  }>("/messages/log", async (request, reply) => {
    const { organizationId } = request.auth;
    const { from, to, direction, contactId, page } = request.query;
    const pageNum = parseInt(page ?? "1", 10);
    const pageSize = 50;

    const where: Record<string, unknown> = { organizationId };
    if (from || to) {
      where.createdAt = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }
    if (direction) where.direction = direction;
    if (contactId) where.contactId = contactId;

    const [data, total] = await Promise.all([
      fastify.prisma.message.findMany({
        where,
        include: {
          contact: { select: { firstName: true, lastName: true, phone: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (pageNum - 1) * pageSize,
        take: pageSize,
      }),
      fastify.prisma.message.count({ where }),
    ]);

    return reply.send({ data, total, page: pageNum, pageSize });
  });
```

- [ ] **Step 4: Run test — expect PASS**

```bash
pnpm --filter @WBMSG/api test messages
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/messages.ts apps/api/src/routes/messages.test.ts
git commit -m "feat(api): message log endpoint with date/direction/contact filters"
```

---

## Task 4: Template Analytics + Send-to-Contact

**Files:**
- Modify: `apps/api/src/routes/templates.ts`
- Modify: `apps/api/src/routes/templates.test.ts`

- [ ] **Step 1: Write failing tests** — add to `templates.test.ts`:

```typescript
describe("GET /v1/templates/:id/analytics", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns delivery stats for the template", async () => {
    mockPrisma.template = {
      findFirst: vi.fn().mockResolvedValue({ id: "t-1", organizationId: "org-1" }),
    };
    mockPrisma.message = {
      groupBy: vi.fn().mockResolvedValue([
        { status: "delivered", _count: { status: 40 } },
        { status: "read", _count: { status: 22 } },
        { status: "failed", _count: { status: 3 } },
      ]),
    };
    const res = await app.inject({ method: "GET", url: "/v1/templates/t-1/analytics" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: { delivered: number; read: number; failed: number } }>();
    expect(body.data.delivered).toBe(40);
  });
});

describe("POST /v1/templates/:id/send-to-contact", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("sends a template message to a single contact", async () => {
    mockPrisma.template = {
      findFirst: vi.fn().mockResolvedValue({ id: "t-1", organizationId: "org-1", name: "welcome", language: "en" }),
    };
    mockPrisma.contact = {
      findFirst: vi.fn().mockResolvedValue({ id: "c-1", organizationId: "org-1", phone: "+919000000001" }),
    };
    mockPrisma.message = {
      create: vi.fn().mockResolvedValue({ id: "m-new" }),
    };
    const res = await app.inject({
      method: "POST",
      url: "/v1/templates/t-1/send-to-contact",
      payload: { contactId: "c-1", variables: [] },
    });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.message.create).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
pnpm --filter @WBMSG/api test templates
```

- [ ] **Step 3: Add routes to templates.ts**

At the bottom of the `templatesRouter` function in `apps/api/src/routes/templates.ts`, add:

```typescript
  // ── Template analytics ───────────────────────────────────────────────────
  fastify.get<{ Params: { id: string } }>("/templates/:id/analytics", async (request, reply) => {
    const { organizationId } = request.auth;
    const template = await fastify.prisma.template.findFirst({ where: { id: request.params.id, organizationId } });
    if (!template) return reply.status(404).send({ error: "Not found" });

    const groups = await fastify.prisma.message.groupBy({
      by: ["status"],
      where: { organizationId, templateId: request.params.id },
      _count: { status: true },
    });

    const stats: Record<string, number> = { sent: 0, delivered: 0, read: 0, failed: 0 };
    for (const g of groups) {
      if (g.status in stats) stats[g.status] = g._count.status;
    }

    return reply.send({ data: stats });
  });

  // ── Send template to single contact ──────────────────────────────────────
  fastify.post<{ Params: { id: string }; Body: { contactId: string; variables: string[] } }>(
    "/templates/:id/send-to-contact",
    async (request, reply) => {
      const { organizationId, userId } = request.auth;
      const [template, contact] = await Promise.all([
        fastify.prisma.template.findFirst({ where: { id: request.params.id, organizationId } }),
        fastify.prisma.contact.findFirst({ where: { id: request.body.contactId, organizationId } }),
      ]);
      if (!template) return reply.status(404).send({ error: "Template not found" });
      if (!contact) return reply.status(404).send({ error: "Contact not found" });

      const message = await fastify.prisma.message.create({
        data: {
          organizationId,
          contactId: contact.id,
          templateId: template.id,
          direction: "outbound",
          status: "pending",
          body: template.name,
          sentByUserId: userId,
        },
      });

      return reply.send({ data: { message } });
    }
  );
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm --filter @WBMSG/api test templates
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/templates.ts apps/api/src/routes/templates.test.ts
git commit -m "feat(api): template analytics and send-to-single-contact endpoints"
```

---

## Task 5: Chat History Clear

**Files:**
- Modify: `apps/api/src/routes/conversations.ts`
- Modify: `apps/api/src/routes/conversations.test.ts`

- [ ] **Step 1: Write failing test** — add to `conversations.test.ts`:

```typescript
describe("DELETE /v1/conversations/:id/history", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("deletes all messages in the conversation", async () => {
    mockPrisma.conversation = {
      findFirst: vi.fn().mockResolvedValue({ id: "conv-1", organizationId: "org-1" }),
    };
    mockPrisma.message = {
      deleteMany: vi.fn().mockResolvedValue({ count: 15 }),
    };
    const res = await app.inject({ method: "DELETE", url: "/v1/conversations/conv-1/history" });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.message.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { conversationId: "conv-1" } })
    );
    expect(res.json<{ data: { deleted: number } }>().data.deleted).toBe(15);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm --filter @WBMSG/api test conversations
```

- [ ] **Step 3: Add route to conversations.ts**

At the bottom of the `conversationsRouter` function in `apps/api/src/routes/conversations.ts`, add:

```typescript
  fastify.delete<{ Params: { id: string } }>("/conversations/:id/history", async (request, reply) => {
    const { organizationId } = request.auth;
    const conversation = await fastify.prisma.conversation.findFirst({
      where: { id: request.params.id, organizationId },
    });
    if (!conversation) return reply.status(404).send({ error: "Conversation not found" });
    const result = await fastify.prisma.message.deleteMany({
      where: { conversationId: request.params.id },
    });
    return reply.send({ data: { deleted: result.count } });
  });
```

- [ ] **Step 4: Run test — expect PASS**

```bash
pnpm --filter @WBMSG/api test conversations
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/conversations.ts apps/api/src/routes/conversations.test.ts
git commit -m "feat(api): clear chat history endpoint"
```

---

## Task 6: Web — Webhook Actions Settings Page

**Files:**
- Create: `apps/web/app/(dashboard)/settings/webhook-actions/page.tsx`

- [ ] **Step 1: Create page**

```tsx
// apps/web/app/(dashboard)/settings/webhook-actions/page.tsx
"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface WebhookAction {
  id: string;
  title: string;
  conditionKey: string;
  conditionValue: string;
  templateId: string | null;
  isActive: boolean;
}

interface Template {
  id: string;
  name: string;
}

export default function WebhookActionsPage() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: "", conditionKey: "", conditionValue: "", templateId: "" });

  const { data: actions } = useQuery<{ data: WebhookAction[] }>({
    queryKey: ["webhook-actions"],
    queryFn: () => fetch("/api/v1/webhook-actions").then((r) => r.json()),
  });

  const { data: templates } = useQuery<{ data: Template[] }>({
    queryKey: ["templates"],
    queryFn: () => fetch("/api/v1/templates").then((r) => r.json()),
  });

  const create = useMutation({
    mutationFn: () =>
      fetch("/api/v1/webhook-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, templateId: form.templateId || undefined }),
      }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["webhook-actions"] });
      setCreating(false);
      setForm({ title: "", conditionKey: "", conditionValue: "", templateId: "" });
    },
  });

  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      fetch(`/api/v1/webhook-actions/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhook-actions"] }),
  });

  const del = useMutation({
    mutationFn: (id: string) => fetch(`/api/v1/webhook-actions/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhook-actions"] }),
  });

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Webhook Actions</h1>
          <p className="text-sm text-gray-500 mt-1">When an inbound webhook payload matches a condition, auto-send a WhatsApp template to the contact.</p>
        </div>
        <button onClick={() => setCreating(true)} className="px-4 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700">
          New Rule
        </button>
      </div>

      {creating && (
        <div className="border rounded-lg p-5 space-y-4 bg-gray-50">
          <h2 className="font-medium text-sm">New Webhook Action</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1">Rule Name</label>
              <input className="w-full border rounded px-3 py-1.5 text-sm" placeholder="e.g. Payment Received" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Payload Field (condition key)</label>
              <input className="w-full border rounded px-3 py-1.5 text-sm" placeholder="e.g. event" value={form.conditionKey} onChange={(e) => setForm((f) => ({ ...f, conditionKey: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Expected Value</label>
              <input className="w-full border rounded px-3 py-1.5 text-sm" placeholder="e.g. payment_received" value={form.conditionValue} onChange={(e) => setForm((f) => ({ ...f, conditionValue: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Template to Send</label>
              <select className="w-full border rounded px-3 py-1.5 text-sm" value={form.templateId} onChange={(e) => setForm((f) => ({ ...f, templateId: e.target.value }))}>
                <option value="">Select template...</option>
                {(templates?.data ?? []).map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => create.mutate()} disabled={!form.title || !form.conditionKey || !form.conditionValue || create.isPending} className="px-4 py-2 bg-green-600 text-white text-sm rounded disabled:opacity-50">
              {create.isPending ? "Saving..." : "Save Rule"}
            </button>
            <button onClick={() => setCreating(false)} className="px-4 py-2 border text-sm rounded">Cancel</button>
          </div>
        </div>
      )}

      <div className="border rounded-lg divide-y">
        {(actions?.data ?? []).length === 0 && (
          <p className="p-6 text-center text-sm text-gray-400">No webhook actions yet.</p>
        )}
        {(actions?.data ?? []).map((action) => (
          <div key={action.id} className="flex items-center justify-between p-4">
            <div>
              <p className="font-medium text-sm">{action.title}</p>
              <p className="text-xs text-gray-500">
                When <code className="bg-gray-100 px-1 rounded">{action.conditionKey}</code> = <code className="bg-gray-100 px-1 rounded">{action.conditionValue}</code>
              </p>
            </div>
            <div className="flex items-center gap-3">
              <a href={`/settings/webhook-actions/${action.id}/logs`} className="text-xs text-blue-600 hover:underline">Logs</a>
              <button
                onClick={() => toggle.mutate({ id: action.id, isActive: !action.isActive })}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${action.isActive ? "bg-green-500" : "bg-gray-200"}`}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${action.isActive ? "translate-x-4" : "translate-x-0.5"}`} />
              </button>
              <button onClick={() => confirm("Delete this rule?") && del.mutate(action.id)} className="text-xs text-red-500 hover:text-red-700 px-2 py-1 border border-red-200 rounded">Delete</button>
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
git add apps/web/app/\(dashboard\)/settings/webhook-actions/
git commit -m "feat(web): webhook actions settings page with rule builder"
```

---

## Task 7: Web — Message Log Page

**Files:**
- Create: `apps/web/app/(dashboard)/messages/page.tsx`

- [ ] **Step 1: Create page**

```tsx
// apps/web/app/(dashboard)/messages/page.tsx
"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

interface MessageLog {
  id: string;
  body: string;
  direction: string;
  status: string;
  createdAt: string;
  contact: { firstName: string | null; lastName: string | null; phone: string } | null;
}

export default function MessageLogPage() {
  const today = new Date().toISOString().split("T")[0];
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];

  const [from, setFrom] = useState(weekAgo);
  const [to, setTo] = useState(today);
  const [direction, setDirection] = useState("");
  const [page, setPage] = useState(1);

  const params = new URLSearchParams({ from, to, page: String(page) });
  if (direction) params.set("direction", direction);

  const { data, isLoading } = useQuery<{ data: MessageLog[]; total: number }>({
    queryKey: ["message-log", from, to, direction, page],
    queryFn: () => fetch(`/api/v1/messages/log?${params}`).then((r) => r.json()),
  });

  const statusColor: Record<string, string> = {
    pending: "text-yellow-600",
    sent: "text-blue-600",
    delivered: "text-green-600",
    read: "text-purple-600",
    failed: "text-red-600",
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <h1 className="text-2xl font-semibold">Message Log</h1>

      <div className="flex flex-wrap gap-4 items-end border rounded-lg p-4 bg-gray-50">
        <div>
          <label className="block text-xs font-medium mb-1">From</label>
          <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="border rounded px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">To</label>
          <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="border rounded px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Direction</label>
          <select value={direction} onChange={(e) => { setDirection(e.target.value); setPage(1); }} className="border rounded px-2 py-1.5 text-sm">
            <option value="">All</option>
            <option value="inbound">Inbound</option>
            <option value="outbound">Outbound</option>
          </select>
        </div>
        <p className="text-sm text-gray-500 ml-auto">{data?.total ?? 0} messages</p>
      </div>

      <div className="border rounded-lg divide-y">
        {isLoading && <p className="p-6 text-center text-sm text-gray-400">Loading...</p>}
        {!isLoading && (data?.data ?? []).length === 0 && (
          <p className="p-6 text-center text-sm text-gray-400">No messages in this range.</p>
        )}
        {(data?.data ?? []).map((msg) => (
          <div key={msg.id} className="flex items-start justify-between p-4 gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{msg.contact ? [msg.contact.firstName, msg.contact.lastName].filter(Boolean).join(" ") || msg.contact.phone : "Unknown"}</p>
              <p className="text-sm text-gray-600 truncate mt-0.5">{msg.body}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <span className={`text-xs font-medium capitalize ${statusColor[msg.status] ?? "text-gray-500"}`}>{msg.status}</span>
              <p className="text-xs text-gray-400 mt-0.5">{new Date(msg.createdAt).toLocaleString("en-IN")}</p>
              <span className={`text-xs px-1.5 py-0.5 rounded ${msg.direction === "inbound" ? "bg-blue-50 text-blue-600" : "bg-green-50 text-green-600"}`}>
                {msg.direction}
              </span>
            </div>
          </div>
        ))}
      </div>

      {data && data.total > 50 && (
        <div className="flex justify-between items-center text-sm">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 border rounded disabled:opacity-40">Previous</button>
          <span className="text-gray-500">Page {page} of {Math.ceil(data.total / 50)}</span>
          <button onClick={() => setPage((p) => p + 1)} disabled={page >= Math.ceil(data.total / 50)} className="px-3 py-1.5 border rounded disabled:opacity-40">Next</button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check and commit**

```bash
pnpm type-check
git add apps/web/app/\(dashboard\)/messages/
git commit -m "feat(web): message log page with date/direction filters and pagination"
```

---

## Task 8: Web — Template Analytics Page + Send to Contact

**Files:**
- Create: `apps/web/app/(dashboard)/templates/[id]/analytics/page.tsx`
- Modify: `apps/web/app/(dashboard)/templates/page.tsx`

- [ ] **Step 1: Create analytics page**

```tsx
// apps/web/app/(dashboard)/templates/[id]/analytics/page.tsx
"use client";
import { useQuery } from "@tanstack/react-query";

interface Stats {
  sent: number;
  delivered: number;
  read: number;
  failed: number;
}

export default function TemplateAnalyticsPage({ params }: { params: { id: string } }) {
  const { data, isLoading } = useQuery<{ data: Stats }>({
    queryKey: ["template-analytics", params.id],
    queryFn: () => fetch(`/api/v1/templates/${params.id}/analytics`).then((r) => r.json()),
  });

  const stats = data?.data ?? { sent: 0, delivered: 0, read: 0, failed: 0 };
  const total = stats.sent + stats.delivered + stats.read + stats.failed;

  const bars = [
    { label: "Sent", value: stats.sent, color: "bg-blue-400" },
    { label: "Delivered", value: stats.delivered, color: "bg-green-400" },
    { label: "Read", value: stats.read, color: "bg-purple-400" },
    { label: "Failed", value: stats.failed, color: "bg-red-400" },
  ];

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Template Analytics</h1>
      {isLoading && <p className="text-sm text-gray-400">Loading...</p>}
      {!isLoading && (
        <div className="border rounded-lg p-6 space-y-6">
          <div className="flex gap-4">
            {bars.map((b) => (
              <div key={b.label} className="flex-1 text-center">
                <p className="text-3xl font-bold">{b.value}</p>
                <p className="text-sm text-gray-500">{b.label}</p>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            {bars.map((b) => (
              <div key={b.label} className="flex items-center gap-3">
                <span className="text-xs text-gray-500 w-16">{b.label}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-3">
                  <div
                    className={`${b.color} h-3 rounded-full transition-all`}
                    style={{ width: total > 0 ? `${(b.value / total) * 100}%` : "0%" }}
                  />
                </div>
                <span className="text-xs text-gray-500 w-10 text-right">{total > 0 ? Math.round((b.value / total) * 100) : 0}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add Analytics and Send to Contact buttons to templates list**

Find the template row actions in `apps/web/app/(dashboard)/templates/page.tsx`. Add:

```tsx
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";

// In the component, add state for send-to-contact modal:
const [sendModal, setSendModal] = useState<{ templateId: string } | null>(null);
const [contactIdToSend, setContactIdToSend] = useState("");

const sendToContact = useMutation({
  mutationFn: ({ templateId, contactId }: { templateId: string; contactId: string }) =>
    fetch(`/api/v1/templates/${templateId}/send-to-contact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId, variables: [] }),
    }).then((r) => r.json()),
  onSuccess: () => { setSendModal(null); setContactIdToSend(""); },
});

// In the template row actions:
<a href={`/templates/${template.id}/analytics`} className="text-xs text-blue-600 hover:underline">Analytics</a>
<button onClick={() => setSendModal({ templateId: template.id })} className="text-xs text-gray-600 hover:text-gray-800 px-2 py-1 border rounded">Send to Contact</button>

// Send modal:
{sendModal && (
  <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setSendModal(null)}>
    <div className="bg-white rounded-lg p-6 max-w-sm w-full space-y-4" onClick={(e) => e.stopPropagation()}>
      <h3 className="font-semibold">Send Template to Contact</h3>
      <input
        className="w-full border rounded px-3 py-2 text-sm"
        placeholder="Contact ID"
        value={contactIdToSend}
        onChange={(e) => setContactIdToSend(e.target.value)}
      />
      <div className="flex gap-3">
        <button
          onClick={() => sendToContact.mutate({ templateId: sendModal.templateId, contactId: contactIdToSend })}
          disabled={!contactIdToSend || sendToContact.isPending}
          className="flex-1 py-2 bg-green-600 text-white text-sm rounded disabled:opacity-50"
        >
          {sendToContact.isPending ? "Sending..." : "Send"}
        </button>
        <button onClick={() => setSendModal(null)} className="flex-1 py-2 border text-sm rounded">Cancel</button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 3: Type-check and commit**

```bash
pnpm type-check
git add apps/web/app/\(dashboard\)/templates/
git commit -m "feat(web): template analytics page and send-to-contact button"
```

---

## Task 9: Web — Deal Kanban Board

**Files:**
- Modify: `apps/web/app/(dashboard)/deals/page.tsx`

- [ ] **Step 1: Replace table view with drag-drop kanban board**

Replace the content of `apps/web/app/(dashboard)/deals/page.tsx`:

```tsx
// apps/web/app/(dashboard)/deals/page.tsx
"use client";
import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface Deal {
  id: string;
  title: string;
  value: number | null;
  stage: string;
  contact: { firstName: string | null; lastName: string | null } | null;
}

const STAGES = ["lead", "qualified", "proposal", "negotiation", "won", "lost"] as const;

export default function DealsPage() {
  const qc = useQueryClient();
  const dragItem = useRef<{ dealId: string; fromStage: string } | null>(null);

  const { data } = useQuery<{ data: Deal[] }>({
    queryKey: ["deals"],
    queryFn: () => fetch("/api/v1/deals").then((r) => r.json()),
  });

  const updateStage = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: string }) =>
      fetch(`/api/v1/deals/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage }),
      }).then((r) => r.json()),
    onMutate: async ({ id, stage }) => {
      await qc.cancelQueries({ queryKey: ["deals"] });
      const prev = qc.getQueryData<{ data: Deal[] }>(["deals"]);
      qc.setQueryData<{ data: Deal[] }>(["deals"], (old) => ({
        data: (old?.data ?? []).map((d) => (d.id === id ? { ...d, stage } : d)),
      }));
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(["deals"], ctx.prev); },
    onSettled: () => qc.invalidateQueries({ queryKey: ["deals"] }),
  });

  const deals = data?.data ?? [];

  function getDealsByStage(stage: string) {
    return deals.filter((d) => d.stage === stage);
  }

  function onDrop(e: React.DragEvent, toStage: string) {
    e.preventDefault();
    if (!dragItem.current) return;
    if (dragItem.current.fromStage !== toStage) {
      updateStage.mutate({ id: dragItem.current.dealId, stage: toStage });
    }
    dragItem.current = null;
  }

  const stageLabel: Record<string, string> = {
    lead: "Lead", qualified: "Qualified", proposal: "Proposal",
    negotiation: "Negotiation", won: "Won", lost: "Lost",
  };

  const stageColor: Record<string, string> = {
    lead: "border-gray-300", qualified: "border-blue-300", proposal: "border-yellow-300",
    negotiation: "border-orange-300", won: "border-green-400", lost: "border-red-300",
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Deals</h1>
        <a href="/deals/new" className="px-4 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700">New Deal</a>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: "70vh" }}>
        {STAGES.map((stage) => {
          const stageDeal = getDealsByStage(stage);
          const stageValue = stageDeal.reduce((sum, d) => sum + (d.value ?? 0), 0);

          return (
            <div
              key={stage}
              className={`flex-shrink-0 w-64 bg-gray-50 rounded-lg border-t-4 ${stageColor[stage]} flex flex-col`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => onDrop(e, stage)}
            >
              <div className="p-3 border-b">
                <p className="font-semibold text-sm">{stageLabel[stage]}</p>
                <p className="text-xs text-gray-500">{stageDeal.length} deals · ₹{stageValue.toLocaleString("en-IN")}</p>
              </div>
              <div className="flex-1 p-2 space-y-2 overflow-y-auto">
                {stageDeal.map((deal) => (
                  <div
                    key={deal.id}
                    draggable
                    onDragStart={() => { dragItem.current = { dealId: deal.id, fromStage: deal.stage }; }}
                    className="bg-white border rounded p-3 cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md transition-shadow"
                  >
                    <a href={`/deals/${deal.id}`} className="block">
                      <p className="text-sm font-medium">{deal.title}</p>
                      {deal.contact && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          {[deal.contact.firstName, deal.contact.lastName].filter(Boolean).join(" ")}
                        </p>
                      )}
                      {deal.value != null && (
                        <p className="text-sm font-semibold text-green-600 mt-1">₹{deal.value.toLocaleString("en-IN")}</p>
                      )}
                    </a>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check and commit**

```bash
pnpm type-check
git add apps/web/app/\(dashboard\)/deals/
git commit -m "feat(web): deal kanban board with drag-drop stage transitions"
```

---

## Task 10: Web — Contact Activity Timeline

**Files:**
- Modify: `apps/web/app/(dashboard)/contacts/[id]/page.tsx`

- [ ] **Step 1: Add activity timeline section to contact detail page**

Find the contact detail page. Add a new `ActivityTimeline` component inline after the contact info section:

```tsx
// Inside apps/web/app/(dashboard)/contacts/[id]/page.tsx

// Add state for timeline tab:
const [timelineTab, setTimelineTab] = useState<"all" | "messages" | "notes" | "deals">("all");

// Fetch messages for this contact:
const { data: messages } = useQuery({
  queryKey: ["contact-messages", params.id],
  queryFn: () => fetch(`/api/v1/messages?contactId=${params.id}&limit=20`).then((r) => r.json()),
});

// Fetch deals for this contact:
const { data: deals } = useQuery({
  queryKey: ["contact-deals", params.id],
  queryFn: () => fetch(`/api/v1/deals?contactId=${params.id}`).then((r) => r.json()),
});

// Unified timeline items:
type TimelineItem =
  | { type: "message"; id: string; body: string; direction: string; createdAt: string }
  | { type: "note"; id: string; notes: string; createdAt: string }
  | { type: "deal"; id: string; title: string; stage: string; createdAt: string };

const timeline: TimelineItem[] = [
  ...(messages?.data ?? []).map((m: { id: string; body: string; direction: string; createdAt: string }) => ({
    type: "message" as const,
    id: m.id,
    body: m.body,
    direction: m.direction,
    createdAt: m.createdAt,
  })),
  ...(contact?.notes ? [{ type: "note" as const, id: "note-1", notes: contact.notes, createdAt: contact.updatedAt }] : []),
  ...(deals?.data ?? []).map((d: { id: string; title: string; stage: string; createdAt: string }) => ({
    type: "deal" as const,
    id: d.id,
    title: d.title,
    stage: d.stage,
    createdAt: d.createdAt,
  })),
].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

// In JSX, add after contact info:
<section className="mt-6">
  <h2 className="font-semibold mb-3">Activity Timeline</h2>
  <div className="flex gap-2 mb-4">
    {(["all", "messages", "notes", "deals"] as const).map((t) => (
      <button
        key={t}
        onClick={() => setTimelineTab(t)}
        className={`px-3 py-1 text-xs rounded-full capitalize ${timelineTab === t ? "bg-green-600 text-white" : "bg-gray-100 text-gray-600"}`}
      >
        {t}
      </button>
    ))}
  </div>
  <div className="space-y-3">
    {timeline
      .filter((item) => timelineTab === "all" || item.type + "s" === timelineTab)
      .map((item) => (
        <div key={item.id} className="flex gap-3 text-sm">
          <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${item.type === "message" ? "bg-blue-400" : item.type === "note" ? "bg-yellow-400" : "bg-green-400"}`} />
          <div>
            {item.type === "message" && <p className="text-gray-700">{item.body.slice(0, 100)}{item.body.length > 100 ? "..." : ""} <span className="text-gray-400">({item.direction})</span></p>}
            {item.type === "note" && <p className="text-gray-700">Note: {item.notes}</p>}
            {item.type === "deal" && <p className="text-gray-700">Deal: <strong>{item.title}</strong> — {item.stage}</p>}
            <p className="text-xs text-gray-400 mt-0.5">{new Date(item.createdAt).toLocaleString("en-IN")}</p>
          </div>
        </div>
      ))}
  </div>
</section>
```

- [ ] **Step 2: Type-check and commit**

```bash
pnpm type-check
git add apps/web/app/\(dashboard\)/contacts/
git commit -m "feat(web): contact activity timeline with messages, notes, deals"
```

---

## Task 11: Full test run + type-check

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
git commit -m "feat(cycle4): CRM Superiority — webhook actions, message log, template analytics, deal kanban, activity timeline"
```

---

## Cycle 4 Acceptance Criteria

- [ ] When inbound webhook arrives with `{ "event": "payment_received" }`, matching rule fires and sends the configured template to the contact
- [ ] Message log shows all messages for the past 7 days with inbound/outbound filter
- [ ] Template analytics shows bar chart: 40 delivered, 22 read, 3 failed
- [ ] "Send to Contact" on template page sends template to a specific contact
- [ ] Deal kanban: drag "Proposal" deal to "Won" — stage updates immediately (optimistic) then persists
- [ ] Contact activity timeline shows messages, notes, and deals in reverse chronological order
- [ ] All API tests pass: `pnpm --filter @WBMSG/api test`
