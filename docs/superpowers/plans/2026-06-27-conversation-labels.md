# Conversation Labels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build inbox-level conversation labels that let agents tag and filter conversations, matching Interakt's feature exactly.

**Architecture:** Two new DB models (`InboxLabel` + `ConversationLabel`) are introduced independently of the existing `Label`/`ContactLabel` system. A new API route file handles label CRUD. The inbox UI gains a label assign/clear dropdown in `ConversationHeader` and a label badge + filter in `ConversationList`. A new settings page manages the org's label palette.

**Tech Stack:** Fastify 4, Prisma 7, PostgreSQL, React 18, Next.js 15 App Router, TanStack Query, Vitest.

## Global Constraints

- ESM-only in `apps/api` — all imports use `.js` extension even for `.ts` source files.
- `organizationId` must be in every Prisma `where` clause — never query cross-org.
- No `console.log` — use Fastify logger or `request.log`.
- No `any` — TypeScript strict mode.
- DB migration is hand-authored SQL (local DB is drifted; `prisma migrate dev` fails).
- Label name: max 22 chars, only alphanumeric + spaces + hyphens (`/^[a-zA-Z0-9 -]{1,22}$/`).
- 1 label per conversation enforced at DB level via `UNIQUE (conversation_id)` on `conversation_labels`.
- Run `pnpm --filter @WBMSG/api test` after each API task; `pnpm --filter @WBMSG/api type-check` before committing.

---

## File Map

**Create:**
- `apps/api/prisma/migrations/conversation_labels/migration.sql`
- `apps/api/src/routes/inbox-labels.ts`
- `apps/api/src/routes/inbox-labels.test.ts`
- `apps/web/hooks/useInboxLabels.ts`
- `apps/web/app/(dashboard)/settings/inbox-labels/page.tsx`
- `apps/web/app/(dashboard)/settings/inbox-labels/InboxLabelsClient.tsx`

**Modify:**
- `apps/api/prisma/schema.prisma` — add `InboxLabel`, `ConversationLabel` models; add `conversationLabel` relation to `Conversation`
- `apps/api/src/routes/index.ts` — register `inboxLabelsRouter`
- `apps/api/src/routes/conversations.ts` — include label in list response; add `labelId` filter param
- `apps/web/hooks/useConversations.ts` — add `label` field to `Conversation` type; add `labelId` param to hook
- `apps/web/components/inbox/ConversationHeader.tsx` — add label assign/clear UI
- `apps/web/components/inbox/ConversationList.tsx` — add label badge per row + label filter
- `apps/web/app/(dashboard)/inbox/page.tsx` — add `handleLabelChange` callback; pass to `ConversationHeader`
- `apps/web/app/(dashboard)/settings/page.tsx` — add Inbox Labels nav card

---

## Task 1: DB Migration + Schema

**Files:**
- Create: `apps/api/prisma/migrations/conversation_labels/migration.sql`
- Modify: `apps/api/prisma/schema.prisma`

**Interfaces:**
- Produces: `InboxLabel` and `ConversationLabel` Prisma models available to all subsequent tasks.

- [ ] **Step 1: Write migration SQL**

Create the file `apps/api/prisma/migrations/conversation_labels/migration.sql` with:

```sql
CREATE TABLE inbox_labels (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id  TEXT NOT NULL,
  name             TEXT NOT NULL,
  color            TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);
CREATE INDEX idx_inbox_labels_org ON inbox_labels(organization_id);

CREATE TABLE conversation_labels (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  conversation_id  TEXT NOT NULL UNIQUE,
  inbox_label_id   TEXT NOT NULL,
  assigned_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_conv  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  CONSTRAINT fk_label FOREIGN KEY (inbox_label_id)  REFERENCES inbox_labels(id)  ON DELETE CASCADE
);
CREATE INDEX idx_conv_labels_label ON conversation_labels(inbox_label_id);
```

- [ ] **Step 2: Apply migration to the production DB**

```bash
# Connect to Railway Postgres and run:
psql $DATABASE_URL -f apps/api/prisma/migrations/conversation_labels/migration.sql
```

Expected: `CREATE TABLE`, `CREATE INDEX` for each statement, no errors.

- [ ] **Step 3: Update schema.prisma — add InboxLabel model**

In `apps/api/prisma/schema.prisma`, after the `// ─── Labels ───` section (around line 866), add:

```prisma
// ─── Inbox (Conversation) Labels ─────────────────────────────────────────────

model InboxLabel {
  id             String              @id @default(uuid())
  organizationId String              @map("organization_id")
  name           String
  color          String
  createdAt      DateTime            @default(now()) @map("created_at")

  conversationLabels ConversationLabel[]

  @@unique([organizationId, name])
  @@index([organizationId])
  @@map("inbox_labels")
}

model ConversationLabel {
  id             String       @id @default(uuid())
  conversationId String       @unique @map("conversation_id")
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  inboxLabelId   String       @map("inbox_label_id")
  inboxLabel     InboxLabel   @relation(fields: [inboxLabelId], references: [id], onDelete: Cascade)
  assignedAt     DateTime     @default(now()) @map("assigned_at")

  @@index([inboxLabelId])
  @@map("conversation_labels")
}
```

- [ ] **Step 4: Add conversationLabel relation to Conversation model**

In `schema.prisma`, find the `model Conversation` block. After the last relation field (look for the block of relation lines near the end of the model, before `@@index`), add:

```prisma
  conversationLabel ConversationLabel?
```

- [ ] **Step 5: Regenerate Prisma client**

```bash
npx prisma generate
```

Expected: `✔ Generated Prisma Client` with no errors.

- [ ] **Step 6: Type-check API**

```bash
pnpm --filter @WBMSG/api type-check
```

Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add apps/api/prisma/migrations/conversation_labels/migration.sql apps/api/prisma/schema.prisma
git commit -m "feat(inbox-labels): add InboxLabel and ConversationLabel schema models"
```

---

## Task 2: API Route — inbox-labels.ts (TDD)

**Files:**
- Create: `apps/api/src/routes/inbox-labels.ts`
- Create: `apps/api/src/routes/inbox-labels.test.ts`
- Modify: `apps/api/src/routes/index.ts`

**Interfaces:**
- Consumes: `InboxLabel`, `ConversationLabel`, `Conversation` Prisma models from Task 1.
- Produces:
  - `GET /v1/inbox-labels` → `{ data: Array<{ id, name, color, count }> }`
  - `PUT /v1/conversations/:id/label` body `{ name: string }` → `{ label: { id, name, color } }`
  - `DELETE /v1/conversations/:id/label` → `204`
  - `DELETE /v1/inbox-labels/:id` → `204`
  - Exported: `inboxLabelsRouter: FastifyPluginAsync`

- [ ] **Step 1: Write failing tests**

Create `apps/api/src/routes/inbox-labels.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const mockPrisma = {
  inboxLabel: { findMany: vi.fn(), upsert: vi.fn(), findFirst: vi.fn(), delete: vi.fn() },
  conversationLabel: { upsert: vi.fn(), deleteMany: vi.fn() },
  conversation: { findFirst: vi.fn() },
};

const mockAuth = {
  userId: "user-1",
  organizationId: "org-1",
  role: "admin" as const,
  permissions: {} as Record<string, string>,
  teamId: null as string | null,
  teamRole: null as "lead" | "member" | null,
};

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (r) => { r.auth = mockAuth; });
  const { inboxLabelsRouter } = await import("./inbox-labels.js");
  await app.register(inboxLabelsRouter, { prefix: "/v1" });
  return app;
}

describe("GET /v1/inbox-labels", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns label list with conversation counts", async () => {
    mockPrisma.inboxLabel.findMany.mockResolvedValue([
      { id: "lbl-1", name: "Billing", color: "#EF4444", _count: { conversationLabels: 3 } },
      { id: "lbl-2", name: "Refund",  color: "#3B82F6", _count: { conversationLabels: 1 } },
    ]);
    const res = await app.inject({ method: "GET", url: "/v1/inbox-labels" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: Array<{ id: string; name: string; color: string; count: number }> }>();
    expect(body.data).toHaveLength(2);
    expect(body.data[0]).toEqual({ id: "lbl-1", name: "Billing", color: "#EF4444", count: 3 });
  });
});

describe("PUT /v1/conversations/:id/label", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("assigns an existing label to a conversation", async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue({ id: "conv-1" });
    mockPrisma.inboxLabel.upsert.mockResolvedValue({ id: "lbl-1", name: "Billing", color: "#EF4444" });
    mockPrisma.conversationLabel.upsert.mockResolvedValue({});
    const res = await app.inject({
      method: "PUT",
      url: "/v1/conversations/conv-1/label",
      payload: { name: "Billing" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ label: { id: string; name: string; color: string } }>();
    expect(body.label).toEqual({ id: "lbl-1", name: "Billing", color: "#EF4444" });
    expect(mockPrisma.inboxLabel.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId_name: { organizationId: "org-1", name: "Billing" } },
      })
    );
  });

  it("returns 404 when conversation not found", async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue(null);
    const res = await app.inject({
      method: "PUT",
      url: "/v1/conversations/missing/label",
      payload: { name: "Billing" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns 400 when name is too long", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/v1/conversations/conv-1/label",
      payload: { name: "A".repeat(23) },
    });
    expect(res.statusCode).toBe(400);
    expect(mockPrisma.conversation.findFirst).not.toHaveBeenCalled();
  });

  it("returns 400 when name contains special chars", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/v1/conversations/conv-1/label",
      payload: { name: "Billing!" },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("DELETE /v1/conversations/:id/label", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("clears the label from a conversation", async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue({ id: "conv-1" });
    mockPrisma.conversationLabel.deleteMany.mockResolvedValue({ count: 1 });
    const res = await app.inject({ method: "DELETE", url: "/v1/conversations/conv-1/label" });
    expect(res.statusCode).toBe(204);
    expect(mockPrisma.conversationLabel.deleteMany).toHaveBeenCalledWith({
      where: { conversationId: "conv-1" },
    });
  });

  it("returns 404 when conversation not found", async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue(null);
    const res = await app.inject({ method: "DELETE", url: "/v1/conversations/missing/label" });
    expect(res.statusCode).toBe(404);
  });
});

describe("DELETE /v1/inbox-labels/:id", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("deletes an inbox label", async () => {
    mockPrisma.inboxLabel.findFirst.mockResolvedValue({ id: "lbl-1" });
    mockPrisma.inboxLabel.delete.mockResolvedValue({});
    const res = await app.inject({ method: "DELETE", url: "/v1/inbox-labels/lbl-1" });
    expect(res.statusCode).toBe(204);
  });

  it("returns 404 when label not found", async () => {
    mockPrisma.inboxLabel.findFirst.mockResolvedValue(null);
    const res = await app.inject({ method: "DELETE", url: "/v1/inbox-labels/missing" });
    expect(res.statusCode).toBe(404);
  });
});
```

- [ ] **Step 2: Run tests — verify they all fail**

```bash
pnpm --filter @WBMSG/api test inbox-labels
```

Expected: All tests fail with `Cannot find module './inbox-labels.js'`.

- [ ] **Step 3: Implement inbox-labels.ts**

Create `apps/api/src/routes/inbox-labels.ts`:

```ts
import type { FastifyPluginAsync } from "fastify";

const LABEL_COLORS = [
  "#EF4444", "#F97316", "#F59E0B", "#84CC16",
  "#22C55E", "#14B8A6", "#06B6D4", "#3B82F6",
  "#8B5CF6", "#EC4899", "#F43F5E", "#6B7280",
];

function randomColor(): string {
  return LABEL_COLORS[Math.floor(Math.random() * LABEL_COLORS.length)]!;
}

const NAME_RE = /^[a-zA-Z0-9 -]{1,22}$/;

export const inboxLabelsRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/inbox-labels", async (request, reply) => {
    const { organizationId } = request.auth;
    const labels = await fastify.prisma.inboxLabel.findMany({
      where: { organizationId },
      include: { _count: { select: { conversationLabels: true } } },
      orderBy: { name: "asc" },
    });
    return reply.send({
      data: labels.map((l) => ({
        id: l.id,
        name: l.name,
        color: l.color,
        count: l._count.conversationLabels,
      })),
    });
  });

  fastify.put<{ Params: { id: string }; Body: { name?: string } }>(
    "/conversations/:id/label",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const trimmedName = request.body?.name?.trim() ?? "";
      if (!NAME_RE.test(trimmedName)) {
        return reply.status(400).send({
          error: {
            code: "INVALID_NAME",
            message: "Label name must be 1–22 alphanumeric characters, spaces, or hyphens",
          },
        });
      }
      const conversation = await fastify.prisma.conversation.findFirst({
        where: { id: request.params.id, organizationId },
        select: { id: true },
      });
      if (!conversation) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Conversation not found" } });
      }
      const inboxLabel = await fastify.prisma.inboxLabel.upsert({
        where: { organizationId_name: { organizationId, name: trimmedName } },
        create: { organizationId, name: trimmedName, color: randomColor() },
        update: {},
      });
      await fastify.prisma.conversationLabel.upsert({
        where: { conversationId: conversation.id },
        create: { conversationId: conversation.id, inboxLabelId: inboxLabel.id },
        update: { inboxLabelId: inboxLabel.id },
      });
      return reply.send({ label: { id: inboxLabel.id, name: inboxLabel.name, color: inboxLabel.color } });
    }
  );

  fastify.delete<{ Params: { id: string } }>(
    "/conversations/:id/label",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const conversation = await fastify.prisma.conversation.findFirst({
        where: { id: request.params.id, organizationId },
        select: { id: true },
      });
      if (!conversation) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Conversation not found" } });
      }
      await fastify.prisma.conversationLabel.deleteMany({
        where: { conversationId: conversation.id },
      });
      return reply.status(204).send();
    }
  );

  fastify.delete<{ Params: { id: string } }>(
    "/inbox-labels/:id",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const label = await fastify.prisma.inboxLabel.findFirst({
        where: { id: request.params.id, organizationId },
        select: { id: true },
      });
      if (!label) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Label not found" } });
      }
      await fastify.prisma.inboxLabel.delete({ where: { id: label.id } });
      return reply.status(204).send();
    }
  );
};
```

- [ ] **Step 4: Run tests — verify they all pass**

```bash
pnpm --filter @WBMSG/api test inbox-labels
```

Expected: All 9 tests pass.

- [ ] **Step 5: Register router in index.ts**

In `apps/api/src/routes/index.ts`, add import after the last import line:

```ts
import { inboxLabelsRouter } from "./inbox-labels.js";
```

Add registration inside the `routes` function after the `tagsRouter` line:

```ts
await fastify.register(inboxLabelsRouter, { prefix: "/v1" });
```

- [ ] **Step 6: Type-check**

```bash
pnpm --filter @WBMSG/api type-check
```

Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/inbox-labels.ts apps/api/src/routes/inbox-labels.test.ts apps/api/src/routes/index.ts
git commit -m "feat(inbox-labels): add inbox-labels API route (GET, PUT, DELETE)"
```

---

## Task 3: Conversations API — Label Include + Filter

**Files:**
- Modify: `apps/api/src/routes/conversations.ts`

**Interfaces:**
- Consumes: `conversationLabel` relation on `Conversation` from Task 1.
- Produces: `label: { id, name, color } | null` in every conversation response; `?labelId=` query param on `GET /v1/conversations`.

- [ ] **Step 1: Update the list endpoint**

In `apps/api/src/routes/conversations.ts`, find the `GET /conversations` handler (around line 46). Make these three changes:

**1a. Add `labelId` to the `Querystring` type:**

```ts
// Before:
Querystring: { status?: string; assignedTo?: string; teamId?: string; page?: string; contactId?: string };

// After:
Querystring: { status?: string; assignedTo?: string; teamId?: string; page?: string; contactId?: string; labelId?: string };
```

**1b. Destructure `labelId` and add it to the `where` clause** (after the `contactId` lines, around line 57):

```ts
const { status, assignedTo, teamId, page, contactId, labelId } = request.query;
// ...existing where assignments...
if (labelId) where["conversationLabel"] = { inboxLabelId: labelId };
```

**1c. Add `conversationLabel` to the `include`** (alongside the existing `contact` and `messages` includes):

```ts
include: {
  contact: { select: { id: true, firstName: true, lastName: true, phoneNumber: true, tags: true } },
  messages: { orderBy: { sentAt: "desc" }, take: 1, select: { id: true, body: true, direction: true, contentType: true } },
  conversationLabel: { include: { inboxLabel: { select: { id: true, name: true, color: true } } } },
},
```

**1d. Add `label` to the data map** (in the `.map((c) => ({...}))` call):

```ts
label: c.conversationLabel
  ? { id: c.conversationLabel.inboxLabel.id, name: c.conversationLabel.inboxLabel.name, color: c.conversationLabel.inboxLabel.color }
  : null,
```

- [ ] **Step 2: Update the search endpoint the same way**

Find the `/conversations/search` handler (around line 89). Add the same `conversationLabel` include and `label` map (no `labelId` filter needed on search):

```ts
include: {
  contact: { select: { id: true, firstName: true, lastName: true, phoneNumber: true, tags: true } },
  messages: { orderBy: { sentAt: "desc" }, take: 1, select: { id: true, body: true, direction: true, contentType: true } },
  conversationLabel: { include: { inboxLabel: { select: { id: true, name: true, color: true } } } },
},
```

Add same `label` field to the map:

```ts
label: c.conversationLabel
  ? { id: c.conversationLabel.inboxLabel.id, name: c.conversationLabel.inboxLabel.name, color: c.conversationLabel.inboxLabel.color }
  : null,
```

- [ ] **Step 3: Type-check**

```bash
pnpm --filter @WBMSG/api type-check
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/conversations.ts
git commit -m "feat(inbox-labels): include label in conversations list; add labelId filter"
```

---

## Task 4: Web Types + useInboxLabels Hook

**Files:**
- Modify: `apps/web/hooks/useConversations.ts`
- Create: `apps/web/hooks/useInboxLabels.ts`

**Interfaces:**
- Produces:
  - `Conversation.label?: { id: string; name: string; color: string } | null`
  - `useConversations(status?, labelId?)` — same hook, extra optional param
  - `useInboxLabels()` → `{ data: InboxLabel[] }` where `InboxLabel = { id, name, color, count }`

- [ ] **Step 1: Update Conversation type in useConversations.ts**

In `apps/web/hooks/useConversations.ts`, add `label` to the `Conversation` interface:

```ts
export interface Conversation {
  id: string;
  organizationId: string;
  whatsappContactId: string | null;
  status: string;
  assignedTo: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  serviceWindowActive?: boolean;
  lastMessage: LastMessage | null;
  contact?: { id: string; firstName: string | null; lastName: string | null; phoneNumber: string; tags: string[] } | null;
  label?: { id: string; name: string; color: string } | null;
}
```

- [ ] **Step 2: Update fetchConversations and useConversations to accept labelId**

```ts
async function fetchConversations(token: string, status?: string, labelId?: string): Promise<Conversation[]> {
  const params = new URLSearchParams();
  if (status && status !== "all") params.set("status", status);
  if (labelId) params.set("labelId", labelId);
  const res = await fetch(`${API_URL}/v1/conversations?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to fetch conversations");
  const json = await res.json() as ConversationsResponse;
  return json.data;
}

export function useConversations(status?: string, labelId?: string) {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["conversations", status ?? "all", labelId ?? "none"],
    queryFn: async () => {
      const token = await getToken();
      return fetchConversations(token ?? "", status, labelId);
    },
  });

  useEffect(() => {
    const socket = getSocket();
    const handler = () => {
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
    };
    socket.on("new-message", handler);
    socket.on("conversation:status", handler);
    socket.on("conversation:assign", handler);
    socket.on("conversation:assigned", handler);
    return () => {
      socket.off("new-message", handler);
      socket.off("conversation:status", handler);
      socket.off("conversation:assign", handler);
      socket.off("conversation:assigned", handler);
    };
  }, [queryClient]);

  return query;
}
```

- [ ] **Step 3: Create useInboxLabels.ts**

Create `apps/web/hooks/useInboxLabels.ts`:

```ts
"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";

export interface InboxLabel {
  id: string;
  name: string;
  color: string;
  count: number;
}

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export function useInboxLabels() {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ["inbox-labels"],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/inbox-labels`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (!res.ok) throw new Error("Failed to fetch inbox labels");
      const json = await res.json() as { data: InboxLabel[] };
      return json.data;
    },
    staleTime: 30_000,
  });
}
```

- [ ] **Step 4: Type-check web**

```bash
pnpm --filter @WBMSG/web type-check
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/hooks/useConversations.ts apps/web/hooks/useInboxLabels.ts
git commit -m "feat(inbox-labels): add label field to Conversation type; add useInboxLabels hook"
```

---

## Task 5: ConversationHeader — Label Assign/Clear UI

**Files:**
- Modify: `apps/web/components/inbox/ConversationHeader.tsx`
- Modify: `apps/web/app/(dashboard)/inbox/page.tsx`

**Interfaces:**
- Consumes: `conversation.label` from Task 4; `useInboxLabels` from Task 4; `onLabelChange(name: string | null): Promise<void>` prop.
- Produces: Label badge + dropdown in the chat header.

- [ ] **Step 1: Update ConversationHeader Props and add label state**

Replace the content of `apps/web/components/inbox/ConversationHeader.tsx` with:

```tsx
"use client";

import { JSX, useState, useRef, useEffect } from "react";
import type { Conversation } from "@/hooks/useConversations";
import { useInboxLabels } from "@/hooks/useInboxLabels";

const STATUS_OPTIONS = [
  { value: "open", label: "Open", color: "text-green-600" },
  { value: "pending", label: "Pending", color: "text-amber-600" },
  { value: "resolved", label: "Resolved", color: "text-gray-400" },
] as const;

const NAME_RE = /^[a-zA-Z0-9 -]{1,22}$/;

interface Props {
  conversation: Conversation;
  contact: { id: string; firstName: string | null; lastName: string | null; phoneNumber: string; tags: string[] } | null;
  contactName: string;
  onToggleContactPanel: () => void;
  onStatusChange: (status: string) => Promise<void>;
  onLabelChange: (name: string | null) => Promise<void>;
}

export function ConversationHeader({
  conversation,
  contact,
  contactName,
  onToggleContactPanel,
  onStatusChange,
  onLabelChange,
}: Props): JSX.Element {
  const [statusOpen, setStatusOpen] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [labelOpen, setLabelOpen] = useState(false);
  const [labelQuery, setLabelQuery] = useState("");
  const [labelUpdating, setLabelUpdating] = useState(false);
  const statusRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const { data: allLabels = [] } = useInboxLabels();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) setStatusOpen(false);
      if (labelRef.current && !labelRef.current.contains(e.target as Node)) {
        setLabelOpen(false);
        setLabelQuery("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleStatusSelect(value: string) {
    setStatusOpen(false);
    setUpdating(true);
    try { await onStatusChange(value); } finally { setUpdating(false); }
  }

  async function handleLabelSelect(name: string) {
    setLabelOpen(false);
    setLabelQuery("");
    setLabelUpdating(true);
    try { await onLabelChange(name); } finally { setLabelUpdating(false); }
  }

  async function handleLabelClear() {
    setLabelUpdating(true);
    try { await onLabelChange(null); } finally { setLabelUpdating(false); }
  }

  const currentStatus = STATUS_OPTIONS.find((s) => s.value === conversation.status) ?? STATUS_OPTIONS[0];
  const currentLabel = conversation.label ?? null;

  const filteredLabels = labelQuery.trim()
    ? allLabels.filter((l) => l.name.toLowerCase().includes(labelQuery.toLowerCase()))
    : allLabels;

  const trimmedQuery = labelQuery.trim();
  const showCreate = trimmedQuery.length > 0
    && NAME_RE.test(trimmedQuery)
    && !allLabels.some((l) => l.name.toLowerCase() === trimmedQuery.toLowerCase());

  return (
    <div className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-gray-200 shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        {/* Avatar */}
        <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center shrink-0">
          <span className="text-xs font-semibold text-green-700">
            {(contactName)[0]?.toUpperCase() ?? "?"}
          </span>
        </div>

        {/* Name + status + tags + label */}
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{contactName}</p>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            {/* Status dropdown */}
            <div className="relative" ref={statusRef}>
              <button
                onClick={() => setStatusOpen((v) => !v)}
                disabled={updating}
                className={`text-xs capitalize font-medium ${currentStatus?.color ?? "text-gray-500"} hover:underline disabled:opacity-50`}
              >
                {updating ? "…" : (currentStatus?.label ?? conversation.status)} ▾
              </button>
              {statusOpen && (
                <div className="absolute top-full left-0 mt-1 w-32 bg-white rounded-lg border border-gray-200 shadow-lg z-20 overflow-hidden">
                  {STATUS_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => { void handleStatusSelect(opt.value); }}
                      className={`w-full text-left px-3 py-2 text-xs font-medium hover:bg-gray-50 ${opt.color} ${conversation.status === opt.value ? "bg-gray-50" : ""}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Tag pills */}
            {contact?.tags && contact.tags.length > 0 && (
              <>
                <span className="text-gray-200">·</span>
                {contact.tags.slice(0, 3).map((tag) => (
                  <span key={tag} className="inline-flex items-center h-4 px-1.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-500">{tag}</span>
                ))}
                {contact.tags.length > 3 && (
                  <span className="text-[10px] text-gray-400">+{contact.tags.length - 3}</span>
                )}
              </>
            )}

            {/* Conversation label */}
            <span className="text-gray-200">·</span>
            <div className="relative" ref={labelRef}>
              {currentLabel ? (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => { setLabelOpen((v) => !v); setLabelQuery(""); }}
                    disabled={labelUpdating}
                    className="inline-flex items-center gap-1 h-4 px-1.5 rounded-full text-[10px] font-medium text-white disabled:opacity-50"
                    style={{ backgroundColor: currentLabel.color }}
                  >
                    {currentLabel.name}
                  </button>
                  <button
                    onClick={() => { void handleLabelClear(); }}
                    disabled={labelUpdating}
                    className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
                    title="Clear label"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { setLabelOpen((v) => !v); setLabelQuery(""); }}
                  disabled={labelUpdating}
                  className="text-[10px] text-gray-400 hover:text-gray-600 disabled:opacity-50"
                >
                  {labelUpdating ? "…" : "+ Add label"}
                </button>
              )}

              {labelOpen && (
                <div className="absolute top-full left-0 mt-1 w-52 bg-white rounded-lg border border-gray-200 shadow-lg z-20">
                  <div className="p-2">
                    <input
                      autoFocus
                      value={labelQuery}
                      onChange={(e) => setLabelQuery(e.target.value.slice(0, 22))}
                      placeholder="Search or create label…"
                      className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </div>
                  <div className="max-h-40 overflow-y-auto">
                    {filteredLabels.map((l) => (
                      <button
                        key={l.id}
                        onClick={() => { void handleLabelSelect(l.name); }}
                        className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left hover:bg-gray-50"
                      >
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: l.color }} />
                        {l.name}
                      </button>
                    ))}
                    {showCreate && (
                      <button
                        onClick={() => { void handleLabelSelect(trimmedQuery); }}
                        className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left hover:bg-gray-50 text-brand-600 font-medium border-t border-gray-100"
                      >
                        + Create &quot;{trimmedQuery}&quot;
                      </button>
                    )}
                    {filteredLabels.length === 0 && !showCreate && (
                      <p className="px-3 py-2 text-xs text-gray-400">No labels found</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Action icons */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          title="Assign (coming soon)"
          disabled
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </button>
        <button
          onClick={onToggleContactPanel}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          title="Contact details"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add handleLabelChange to InboxPage**

In `apps/web/app/(dashboard)/inbox/page.tsx`, add the handler after `handleStatusChange`:

```ts
const handleLabelChange = useCallback(async (name: string | null) => {
  if (!selectedConversationId) return;
  const token = await getToken();
  if (name) {
    await fetch(`${API_URL}/v1/conversations/${selectedConversationId}/label`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
  } else {
    await fetch(`${API_URL}/v1/conversations/${selectedConversationId}/label`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token ?? ""}` },
    });
  }
  await queryClient.invalidateQueries({ queryKey: ["conversations"] });
  await queryClient.invalidateQueries({ queryKey: ["inbox-labels"] });
}, [selectedConversationId, getToken, queryClient]);
```

Then pass it to `ConversationHeader`:

```tsx
<ConversationHeader
  conversation={selectedConversation}
  contact={contact}
  contactName={contactName}
  onToggleContactPanel={() => setContactPanelOpen((v) => !v)}
  onStatusChange={handleStatusChange}
  onLabelChange={handleLabelChange}
/>
```

- [ ] **Step 3: Type-check web**

```bash
pnpm --filter @WBMSG/web type-check
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/inbox/ConversationHeader.tsx apps/web/app/(dashboard)/inbox/page.tsx
git commit -m "feat(inbox-labels): add label assign/clear UI to ConversationHeader"
```

---

## Task 6: ConversationList — Label Badge + Filter

**Files:**
- Modify: `apps/web/components/inbox/ConversationList.tsx`

**Interfaces:**
- Consumes: `conversation.label` from Task 4; `useInboxLabels` from Task 4; `useConversations(status, labelId)` from Task 4.
- Produces: Colored label badge on each conversation row; label filter dropdown above the list.

- [ ] **Step 1: Update ConversationList**

Replace the content of `apps/web/components/inbox/ConversationList.tsx` with:

```tsx
"use client";

import { JSX, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useConversations, useSearchConversations } from "@/hooks/useConversations";
import { useInboxLabels } from "@/hooks/useInboxLabels";
import { IntentBadge } from "@/components/intent-badge";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";
const STATUS_TABS = ["all", "open", "pending", "closed"] as const;
type StatusTab = typeof STATUS_TABS[number];

interface Props {
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function formatTime(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  if (isToday) return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function ConversationList({ selectedId, onSelect }: Props): JSX.Element {
  const [activeTab, setActiveTab] = useState<StatusTab>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeLabelId, setActiveLabelId] = useState<string | undefined>(undefined);
  const [labelFilterOpen, setLabelFilterOpen] = useState(false);
  const { getToken } = useAuth();
  const { data: allLabels = [] } = useInboxLabels();

  const isSearching = searchQuery.trim().length >= 2;
  const { data: conversations, isLoading: listLoading } = useConversations(
    isSearching ? undefined : (activeTab === "all" ? undefined : activeTab),
    isSearching ? undefined : activeLabelId,
  );
  const { data: searchResults, isLoading: searchLoading } = useSearchConversations(searchQuery);

  const items = isSearching ? (searchResults ?? []) : (conversations ?? []);
  const isLoading = isSearching ? searchLoading : listLoading;

  const activeLabel = allLabels.find((l) => l.id === activeLabelId);

  async function handleSelect(id: string) {
    onSelect(id);
    try {
      const token = await getToken();
      void fetch(`${API_URL}/v1/conversations/${id}/read`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
    } catch { /* non-critical */ }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search bar */}
      <div className="px-3 py-2 border-b border-gray-200 shrink-0">
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search conversations…"
            className="w-full pl-8 pr-7 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              aria-label="Clear search"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Status tabs — hidden while searching */}
      {!isSearching && (
        <div className="flex border-b border-gray-200 shrink-0">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={[
                "flex-1 py-2 text-xs font-medium capitalize transition-colors",
                activeTab === tab
                  ? "text-brand-600 border-b-2 border-brand-600"
                  : "text-gray-500 hover:text-gray-700",
              ].join(" ")}
            >
              {tab}
            </button>
          ))}
        </div>
      )}

      {/* Label filter row — hidden while searching */}
      {!isSearching && allLabels.length > 0 && (
        <div className="px-3 py-1.5 border-b border-gray-100 shrink-0">
          <div className="relative inline-block">
            <button
              onClick={() => setLabelFilterOpen((v) => !v)}
              className="flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-gray-700"
            >
              {activeLabel ? (
                <>
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: activeLabel.color }} />
                  <span className="font-medium">{activeLabel.name}</span>
                  <span
                    onClick={(e) => { e.stopPropagation(); setActiveLabelId(undefined); }}
                    className="ml-0.5 text-gray-400 hover:text-gray-600 cursor-pointer"
                  >
                    ×
                  </span>
                </>
              ) : (
                <>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" />
                  </svg>
                  Filter by label
                </>
              )}
            </button>

            {labelFilterOpen && (
              <div className="absolute top-full left-0 mt-1 w-44 bg-white rounded-lg border border-gray-200 shadow-lg z-20">
                {allLabels.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => { setActiveLabelId(l.id); setLabelFilterOpen(false); }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left hover:bg-gray-50"
                  >
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: l.color }} />
                    {l.name}
                    <span className="ml-auto text-gray-400">{l.count}</span>
                  </button>
                ))}
                {activeLabelId && (
                  <button
                    onClick={() => { setActiveLabelId(undefined); setLabelFilterOpen(false); }}
                    className="w-full px-3 py-2 text-xs text-left text-gray-400 hover:bg-gray-50 border-t border-gray-100"
                  >
                    Clear filter
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* List */}
      <div className="flex flex-col overflow-y-auto flex-1">
        {isLoading && (
          <div className="flex flex-col gap-2 p-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-16 rounded-lg bg-gray-100 animate-pulse" />
            ))}
          </div>
        )}

        {!isLoading && !items.length && (
          <div className="flex items-center justify-center h-32 text-sm text-gray-400">
            {isSearching ? "No results" : "No conversations"}
          </div>
        )}

        {items.map((conv) => {
          const displayName =
            conv.contact
              ? [conv.contact.firstName, conv.contact.lastName].filter(Boolean).join(" ") || `+${conv.contact.phoneNumber}`
              : conv.whatsappContactId ? `+${conv.whatsappContactId}` : "Unknown";

          const lastMsgPreview = conv.lastMessage?.body
            ? (conv.lastMessage.direction === "outbound" ? "✓✓ " : "") +
              conv.lastMessage.body.slice(0, 60) + (conv.lastMessage.body.length > 60 ? "…" : "")
            : null;

          return (
            <button
              key={conv.id}
              onClick={() => { void handleSelect(conv.id); }}
              className={[
                "flex flex-col gap-0.5 px-4 py-3 text-left border-b border-gray-100 transition-colors",
                selectedId === conv.id ? "bg-brand-50" : "hover:bg-gray-50",
              ].join(" ")}
            >
              {/* Row 1: name + time */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-gray-900 truncate">{displayName}</span>
                <span className="text-xs text-gray-400 shrink-0">{formatTime(conv.lastMessageAt)}</span>
              </div>

              {/* Row 2: last message preview + unread badge */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-gray-500 truncate flex-1">
                  {lastMsgPreview ?? (
                    <span className={`capitalize ${conv.status === "open" ? "text-brand-600" : "text-gray-400"}`}>
                      {conv.status}
                    </span>
                  )}
                </span>
                {conv.unreadCount > 0 && (
                  <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-brand-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                    {conv.unreadCount > 99 ? "99+" : conv.unreadCount}
                  </span>
                )}
              </div>

              {/* Row 3: label badge (if assigned) */}
              {conv.label && (
                <div className="flex items-center gap-1 mt-0.5">
                  <span
                    className="inline-flex items-center gap-1 h-4 px-1.5 rounded-full text-[10px] font-medium text-white"
                    style={{ backgroundColor: conv.label.color }}
                  >
                    {conv.label.name}
                  </span>
                </div>
              )}

              {/* Row 4: intent tag (renders only if cached) */}
              {conv.lastMessage?.id && conv.lastMessage.direction === "inbound" && conv.lastMessage.body && (
                <IntentBadge
                  messageId={conv.lastMessage.id}
                  text={conv.lastMessage.body}
                  direction="inbound"
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check web**

```bash
pnpm --filter @WBMSG/web type-check
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/inbox/ConversationList.tsx
git commit -m "feat(inbox-labels): add label badge and label filter to ConversationList"
```

---

## Task 7: Settings Page — Inbox Labels

**Files:**
- Create: `apps/web/app/(dashboard)/settings/inbox-labels/InboxLabelsClient.tsx`
- Create: `apps/web/app/(dashboard)/settings/inbox-labels/page.tsx`
- Modify: `apps/web/app/(dashboard)/settings/page.tsx`

**Interfaces:**
- Consumes: `GET /v1/inbox-labels`, `DELETE /v1/inbox-labels/:id` from Task 2.
- Produces: Settings page at `/settings/inbox-labels` showing org label palette with delete.

- [ ] **Step 1: Create InboxLabelsClient.tsx**

Create `apps/web/app/(dashboard)/settings/inbox-labels/InboxLabelsClient.tsx`:

```tsx
"use client";

import { JSX, useState } from "react";
import { useAuth } from "@clerk/nextjs";

export interface InboxLabelStat {
  id: string;
  name: string;
  color: string;
  count: number;
}

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface Props {
  initialLabels: InboxLabelStat[];
}

export function InboxLabelsClient({ initialLabels }: Props): JSX.Element {
  const { getToken } = useAuth();
  const [labels, setLabels] = useState<InboxLabelStat[]>(initialLabels);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function handleDelete(id: string) {
    setDeleting(id);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/inbox-labels/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (res.ok) setLabels((prev) => prev.filter((l) => l.id !== id));
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
        <svg className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" />
        </svg>
        <p className="text-sm text-blue-800">
          Conversation labels are created directly from the inbox. Delete a label here to remove it from all conversations.
        </p>
      </div>

      {labels.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 px-4 py-12 text-center text-sm text-gray-400">
          No labels yet. Assign a label to a conversation from the inbox to create one.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Label</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Active Conversations</th>
                <th className="w-16 px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {labels.map((label) => (
                <tr key={label.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3">
                    <span
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-white"
                      style={{ backgroundColor: label.color }}
                    >
                      {label.name}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{label.count}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => { void handleDelete(label.id); }}
                      disabled={deleting === label.id}
                      className="text-xs text-red-500 hover:text-red-700 font-medium disabled:opacity-50"
                    >
                      {deleting === label.id ? "…" : "Delete"}
                    </button>
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

- [ ] **Step 2: Create page.tsx**

Create `apps/web/app/(dashboard)/settings/inbox-labels/page.tsx`:

```tsx
import type { JSX } from "react";
import { auth } from "@clerk/nextjs/server";
import { InboxLabelsClient, type InboxLabelStat } from "./InboxLabelsClient";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

async function getInboxLabels(token: string): Promise<InboxLabelStat[]> {
  try {
    const res = await fetch(`${API_URL}/v1/inbox-labels`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    return res.ok ? (await res.json() as { data: InboxLabelStat[] }).data : [];
  } catch { return []; }
}

export default async function InboxLabelsPage(): Promise<JSX.Element> {
  const { getToken } = await auth.protect();
  const token = await getToken() ?? "";
  const labels = await getInboxLabels(token);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Conversation Labels</h1>
        <p className="text-sm text-gray-500 mt-1">Labels assigned to inbox conversations for queue management.</p>
      </div>
      <InboxLabelsClient initialLabels={labels} />
    </div>
  );
}
```

- [ ] **Step 3: Add nav card to settings/page.tsx**

In `apps/web/app/(dashboard)/settings/page.tsx`, find the grid of setting links and add this entry to the array:

```ts
{ href: "/settings/inbox-labels", label: "Conversation Labels", desc: "Labels for inbox queue management" },
```

Add it after the existing `{ href: "/settings/labels", ... }` entry.

- [ ] **Step 4: Type-check web**

```bash
pnpm --filter @WBMSG/web type-check
```

Expected: 0 errors.

- [ ] **Step 5: Run full pre-commit check**

```bash
pnpm --filter @WBMSG/api test
pnpm lint
```

Expected: Tests pass (including pre-existing flaky failures for segments/conversations which are known); lint clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/(dashboard)/settings/inbox-labels/ apps/web/app/(dashboard)/settings/page.tsx
git commit -m "feat(inbox-labels): add Conversation Labels settings page"
```
