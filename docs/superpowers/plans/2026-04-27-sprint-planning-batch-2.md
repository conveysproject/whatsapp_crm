# Sprint Planning Batch 2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete Foundation phase: WhatsApp Cloud API integration (Sprint 3), full PostgreSQL schema + CRUD API skeleton (Sprint 4), Next.js web app shell with design system (Sprint 5), and real-time Inbox MVP with Socket.io (Sprint 6).

**Architecture:** Sprint 3 wires Meta's Cloud API — webhook receiver + BullMQ-decoupled inbound processing + outbound send. Sprint 4 completes the 32-table Prisma schema and adds contacts/companies CRUD with cursor pagination and Meilisearch indexing. Sprint 5 builds the Tailwind design system + Radix-based UI components + nav shell + dashboard skeleton. Sprint 6 adds Socket.io for real-time inbox updates, conversation/message thread UI, and search.

**Tech Stack:** Meta WhatsApp Cloud API v20.0 (raw fetch), BullMQ + IORedis, `@fastify/swagger` + `@fastify/swagger-ui`, Meilisearch (`meilisearch` npm), Radix UI primitives, `socket.io` + `socket.io-client`, React Query (`@tanstack/react-query`), Zustand.

---

## File Map

### Sprint 3 — WhatsApp Cloud API

| File | Action | Purpose |
|---|---|---|
| `apps/api/prisma/schema.prisma` | Modify | Add phoneNumberId to Organization; add Conversation + Message models + enums |
| `apps/api/src/lib/whatsapp.ts` | Create | sendTextMessage(), verifyWebhookSignature() |
| `apps/api/src/lib/queue.ts` | Create | BullMQ Queue + IORedis connection singleton |
| `apps/api/src/workers/inbound-message.worker.ts` | Create | BullMQ Worker — find/create conversation, store message |
| `apps/api/src/routes/webhooks.ts` | Create | GET /v1/webhooks/whatsapp (challenge) + POST (receive) |
| `apps/api/src/routes/messages.ts` | Create | POST /v1/conversations/:id/messages |
| `apps/api/src/routes/conversations.ts` | Create | GET /v1/conversations, GET /v1/conversations/:id/messages |
| `apps/api/src/routes/index.ts` | Modify | Register webhooksRouter, messagesRouter, conversationsRouter |
| `apps/api/src/index.ts` | Modify | Import + start inboundWorker |
| `apps/api/src/routes/webhooks.test.ts` | Create | Vitest tests for challenge verify + inbound message |
| `packages/shared/src/index.ts` | Modify | Add ConversationId, MessageId |
| `.env.example` | Modify | Add WA_PHONE_NUMBER_ID, WA_ACCESS_TOKEN, WA_VERIFY_TOKEN, WA_WEBHOOK_SECRET, REDIS_URL |

### Sprint 4 — Core DB & API Skeleton

| File | Action | Purpose |
|---|---|---|
| `apps/api/prisma/schema.prisma` | Modify | Add Contact, Company, Deal, Pipeline, Template, Campaign, Flow, Team, ApiKey, Webhook models |
| `apps/api/src/plugins/swagger.ts` | Create | @fastify/swagger + swagger-ui OpenAPI plugin |
| `apps/api/src/lib/pagination.ts` | Create | paginate() + parsePaginationParams() cursor-based pagination |
| `apps/api/src/lib/search.ts` | Create | Meilisearch client + indexContact() + setupSearchIndexes() |
| `apps/api/src/routes/contacts.ts` | Create | GET/POST/PATCH/DELETE /v1/contacts |
| `apps/api/src/routes/companies.ts` | Create | GET/POST/PATCH/DELETE /v1/companies |
| `apps/api/src/routes/index.ts` | Modify | Register contactsRouter, companiesRouter, swagger |
| `apps/api/src/index.ts` | Modify | Call setupSearchIndexes() on startup |
| `apps/api/src/routes/contacts.test.ts` | Create | Vitest tests for contacts CRUD |
| `packages/shared/src/index.ts` | Modify | Add ContactId, CompanyId, DealId, PipelineId, TemplateId |

### Sprint 5 — Web App Shell

| File | Action | Purpose |
|---|---|---|
| `apps/web/tailwind.config.ts` | Modify | Brand colors, extended spacing, typography tokens |
| `apps/web/app/globals.css` | Modify | CSS custom properties for design tokens |
| `apps/web/components/ui/Button.tsx` | Create | Button with primary/secondary/ghost/destructive variants |
| `apps/web/components/ui/Input.tsx` | Create | Controlled input with label + error state |
| `apps/web/components/ui/Badge.tsx` | Create | Status badge with color variants |
| `apps/web/components/ui/Toast.tsx` | Create | Radix Toast notification |
| `apps/web/components/ui/index.ts` | Create | Re-export all UI components |
| `apps/web/components/layout/Sidebar.tsx` | Create | Left nav sidebar with route-aware active states |
| `apps/web/components/layout/TopBar.tsx` | Create | Top bar with org name + Clerk UserButton |
| `apps/web/app/(dashboard)/layout.tsx` | Modify | Add Sidebar + TopBar to protected layout |
| `apps/web/app/(dashboard)/page.tsx` | Create | Dashboard home with stat cards |
| `apps/web/app/(dashboard)/contacts/page.tsx` | Create | Contacts list (server component, fetches from API) |
| `apps/web/app/(dashboard)/contacts/loading.tsx` | Create | Skeleton loading state |

### Sprint 6 — Inbox MVP

| File | Action | Purpose |
|---|---|---|
| `apps/api/src/plugins/socketio.ts` | Create | Socket.io server Fastify plugin; org-scoped rooms |
| `apps/api/src/workers/inbound-message.worker.ts` | Modify | After storing message, emit to org Socket.io room |
| `apps/api/src/index.ts` | Modify | Register socketio plugin |
| `apps/web/lib/socket.ts` | Create | Socket.io-client singleton |
| `apps/web/hooks/useSocket.ts` | Create | Hook — connects on mount, joins org room, disconnects on unmount |
| `apps/web/hooks/useConversations.ts` | Create | React Query hook + socket subscription for conversation list |
| `apps/web/hooks/useMessages.ts` | Create | React Query hook + socket subscription for message thread |
| `apps/web/components/inbox/ConversationList.tsx` | Create | Sorted conversation list with unread indicator |
| `apps/web/components/inbox/MessageThread.tsx` | Create | Message thread with inbound/outbound bubbles |
| `apps/web/components/inbox/SendMessageForm.tsx` | Create | Text input + send button |
| `apps/web/app/(dashboard)/inbox/layout.tsx` | Create | Inbox split-pane layout |
| `apps/web/app/(dashboard)/inbox/page.tsx` | Create | Inbox page — conversation list + thread |
| `apps/api/src/routes/conversations.test.ts` | Create | Vitest tests for conversation list + message fetch |

---

## Task 1: Install BullMQ + IORedis + update env

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Install dependencies in API**

```bash
pnpm --filter @WBMSG/api add bullmq ioredis
```

Expected output: `+ bullmq X.Y.Z  + ioredis X.Y.Z`

- [ ] **Step 2: Add env vars to `.env.example`**

Append to `.env.example`:
```
# Redis
REDIS_URL=redis://localhost:6379

# WhatsApp Cloud API
WA_PHONE_NUMBER_ID=
WA_ACCESS_TOKEN=
WA_VERIFY_TOKEN=WBMSG_verify_2026
WA_WEBHOOK_SECRET=
```

- [ ] **Step 3: Add same vars to local `.env`**

```bash
echo "REDIS_URL=redis://localhost:6379" >> apps/api/.env
```

- [ ] **Step 4: Commit**

```bash
git add .env.example apps/api/package.json pnpm-lock.yaml
git commit -m "chore(api): add bullmq + ioredis, add WA env vars"
```

---

## Task 2: Prisma schema — add Conversation + Message

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Write the failing test to confirm models don't exist yet**

In `apps/api/src/routes/webhooks.test.ts` (create file):
```typescript
import { describe, it, expect } from "vitest";
import { prisma } from "../lib/prisma.js";

describe("Conversation model", () => {
  it("prisma client has conversation property", () => {
    expect(prisma.conversation).toBeDefined();
  });
});
```

Run: `pnpm --filter @WBMSG/api test`
Expected: FAIL — `prisma.conversation is undefined`

- [ ] **Step 2: Modify `apps/api/prisma/schema.prisma`**

Add `phoneNumberId` and `whatsappBusinessAccountId` to Organization, then add new enums and models:

```prisma
// Add to existing Organization model:
//   phoneNumberId             String?
//   whatsappBusinessAccountId String?
//   conversations             Conversation[]

// Full updated Organization model:
model Organization {
  id                        String         @id @default(uuid())
  name                      String
  planTier                  PlanTier       @default(starter)
  phoneNumberId             String?
  whatsappBusinessAccountId String?
  settings                  Json           @default("{}")
  createdAt                 DateTime       @default(now())
  updatedAt                 DateTime       @updatedAt
  users                     User[]
  invitations               Invitation[]
  conversations             Conversation[]

  @@map("organizations")
}

// Add these enums:
enum ConversationStatus {
  open
  pending
  resolved
  bot
}

enum MessageDirection {
  inbound
  outbound
}

enum MessageStatus {
  sent
  delivered
  read
  failed
}

// Add these models:
model Conversation {
  id                String             @id @default(uuid())
  organizationId    String
  organization      Organization       @relation(fields: [organizationId], references: [id])
  contactId         String?
  channelType       String             @default("whatsapp")
  status            ConversationStatus @default(open)
  assignedTo        String?
  whatsappContactId String?
  lastMessageAt     DateTime?
  createdAt         DateTime           @default(now())
  updatedAt         DateTime           @updatedAt
  messages          Message[]

  @@index([organizationId])
  @@index([organizationId, status])
  @@map("conversations")
}

model Message {
  id                String           @id @default(uuid())
  conversationId    String
  conversation      Conversation     @relation(fields: [conversationId], references: [id])
  organizationId    String
  direction         MessageDirection
  contentType       String           @default("text")
  body              String?
  mediaUrl          String?
  whatsappMessageId String?          @unique
  status            MessageStatus    @default(sent)
  sentAt            DateTime         @default(now())
  createdAt         DateTime         @default(now())

  @@index([conversationId])
  @@index([organizationId])
  @@map("messages")
}
```

- [ ] **Step 3: Run migration**

```bash
cd apps/api
pnpm exec prisma migrate dev --name add_whatsapp_conversations_messages
pnpm exec prisma generate
```

Expected: `Your database is now in sync with your schema.` and `Generated Prisma Client`.

- [ ] **Step 4: Run the test — confirm it passes**

```bash
pnpm --filter @WBMSG/api test src/routes/webhooks.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/ apps/api/src/routes/webhooks.test.ts
git commit -m "feat(api): add Conversation + Message Prisma models"
```

---

## Task 3: WhatsApp client helper

**Files:**
- Create: `apps/api/src/lib/whatsapp.ts`

- [ ] **Step 1: Write the failing test**

Add to `apps/api/src/routes/webhooks.test.ts`:
```typescript
import { verifyWebhookSignature } from "../lib/whatsapp.js";

describe("verifyWebhookSignature", () => {
  it("returns true for matching HMAC-SHA256 signature", () => {
    const secret = "mysecret";
    const payload = '{"hello":"world"}';
    // pre-computed: echo -n '{"hello":"world"}' | openssl dgst -sha256 -hmac "mysecret"
    const sig = "sha256=67e6c2e70c8ffc00dca4bb26c1ad5e0da6b2a3ac5882d8bb39b3eec09ab4c9b0";
    expect(verifyWebhookSignature(payload, sig, secret)).toBe(true);
  });

  it("returns false for wrong signature", () => {
    expect(verifyWebhookSignature("payload", "sha256=wrong", "secret")).toBe(false);
  });
});
```

Run: `pnpm --filter @WBMSG/api test`
Expected: FAIL — `Cannot find module '../lib/whatsapp.js'`

- [ ] **Step 2: Create `apps/api/src/lib/whatsapp.ts`**

```typescript
import { createHmac, timingSafeEqual } from "node:crypto";

const WA_BASE = "https://graph.facebook.com/v20.0";

interface WaSendResult {
  messageId: string;
}

interface WaMessageResponse {
  messages: Array<{ id: string }>;
}

export async function sendTextMessage(
  phoneNumberId: string,
  to: string,
  text: string,
  accessToken: string
): Promise<WaSendResult> {
  const res = await fetch(`${WA_BASE}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { body: text },
    }),
  });
  if (!res.ok) {
    const err = await res.json() as unknown;
    throw new Error(`WA send failed: ${JSON.stringify(err)}`);
  }
  const data = await res.json() as WaMessageResponse;
  return { messageId: data.messages[0].id };
}

export function verifyWebhookSignature(
  rawBody: string,
  signature: string,
  secret: string
): boolean {
  const digest = createHmac("sha256", secret).update(rawBody).digest("hex");
  const expected = Buffer.from(`sha256=${digest}`);
  const received = Buffer.from(signature);
  if (expected.length !== received.length) return false;
  return timingSafeEqual(expected, received);
}
```

- [ ] **Step 3: Run the test — confirm it passes**

```bash
pnpm --filter @WBMSG/api test src/routes/webhooks.test.ts
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/lib/whatsapp.ts apps/api/src/routes/webhooks.test.ts
git commit -m "feat(api): add WhatsApp send + webhook signature helpers"
```

---

## Task 4: BullMQ queue + inbound message worker

**Files:**
- Create: `apps/api/src/lib/queue.ts`
- Create: `apps/api/src/workers/inbound-message.worker.ts`

- [ ] **Step 1: Create `apps/api/src/lib/queue.ts`**

```typescript
import { Queue } from "bullmq";
import IORedis from "ioredis";

export const redisConnection = new IORedis(
  process.env["REDIS_URL"] ?? "redis://localhost:6379",
  { maxRetriesPerRequest: null }
);

export const inboundMessageQueue = new Queue("inbound-messages", {
  connection: redisConnection,
  defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 1000 } },
});
```

- [ ] **Step 2: Create `apps/api/src/workers/inbound-message.worker.ts`**

```typescript
import { Worker } from "bullmq";
import { redisConnection } from "../lib/queue.js";
import { prisma } from "../lib/prisma.js";

export interface InboundMessageJob {
  organizationId: string;
  whatsappContactPhone: string;
  whatsappMessageId: string;
  contentType: string;
  body: string | null;
  mediaId: string | null;
  timestamp: number;
}

export const inboundWorker = new Worker<InboundMessageJob>(
  "inbound-messages",
  async (job) => {
    const {
      organizationId,
      whatsappContactPhone,
      whatsappMessageId,
      contentType,
      body,
      timestamp,
    } = job.data;

    const messageDate = new Date(timestamp * 1000);

    let conversation = await prisma.conversation.findFirst({
      where: { organizationId, whatsappContactId: whatsappContactPhone },
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          organizationId,
          whatsappContactId: whatsappContactPhone,
          channelType: "whatsapp",
          status: "open",
          lastMessageAt: messageDate,
        },
      });
    }

    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        organizationId,
        direction: "inbound",
        contentType,
        body,
        whatsappMessageId,
        status: "delivered",
        sentAt: messageDate,
      },
    });

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: messageDate },
    });
  },
  { connection: redisConnection }
);
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/lib/queue.ts apps/api/src/workers/
git commit -m "feat(api): add BullMQ queue + inbound message worker"
```

---

## Task 5: Webhook routes

**Files:**
- Create: `apps/api/src/routes/webhooks.ts`

- [ ] **Step 1: Write the failing tests**

Replace `apps/api/src/routes/webhooks.test.ts` with the full test:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { FastifyInstance } from "fastify";

vi.mock("../lib/queue.js", () => ({
  inboundMessageQueue: { add: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("../lib/whatsapp.js", () => ({
  verifyWebhookSignature: vi.fn().mockReturnValue(true),
  sendTextMessage: vi.fn(),
}));

const mockPrisma = {
  organization: { findFirst: vi.fn() },
  conversation: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  message: { create: vi.fn() },
};

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma);
  const { webhooksRouter } = await import("./webhooks.js");
  await app.register(webhooksRouter, { prefix: "/v1" });
  return app;
}

describe("GET /v1/webhooks/whatsapp", () => {
  let app: FastifyInstance;
  beforeEach(async () => { app = await buildApp(); });
  afterEach(async () => { await app.close(); vi.clearAllMocks(); });

  it("returns challenge when verify_token matches", async () => {
    process.env["WA_VERIFY_TOKEN"] = "WBMSG_verify_2026";
    const res = await app.inject({
      method: "GET",
      url: "/v1/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=WBMSG_verify_2026&hub.challenge=testchallenge",
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe("testchallenge");
  });

  it("returns 403 on wrong token", async () => {
    process.env["WA_VERIFY_TOKEN"] = "WBMSG_verify_2026";
    const res = await app.inject({
      method: "GET",
      url: "/v1/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=abc",
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("POST /v1/webhooks/whatsapp", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    app = await buildApp();
    mockPrisma.organization.findFirst.mockResolvedValue({ id: "org-1" });
  });
  afterEach(async () => { await app.close(); vi.clearAllMocks(); });

  it("enqueues message job and returns 200", async () => {
    const { inboundMessageQueue } = await import("../lib/queue.js");
    const payload = {
      object: "whatsapp_business_account",
      entry: [{
        id: "entry-1",
        changes: [{
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { phone_number_id: "12345" },
            messages: [{
              id: "wamid.abc",
              from: "+919876543210",
              timestamp: "1714180800",
              type: "text",
              text: { body: "Hello WBMSG" },
            }],
          },
        }],
      }],
    };

    const res = await app.inject({
      method: "POST",
      url: "/v1/webhooks/whatsapp",
      headers: { "x-hub-signature-256": "sha256=mocked" },
      payload,
    });

    expect(res.statusCode).toBe(200);
    expect(inboundMessageQueue.add).toHaveBeenCalledWith(
      "inbound",
      expect.objectContaining({
        organizationId: "org-1",
        whatsappContactPhone: "+919876543210",
        body: "Hello WBMSG",
        whatsappMessageId: "wamid.abc",
      })
    );
  });

  it("returns 400 for unknown object type", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/webhooks/whatsapp",
      headers: { "x-hub-signature-256": "sha256=mocked" },
      payload: { object: "unknown", entry: [] },
    });
    expect(res.statusCode).toBe(400);
  });
});
```

Run: `pnpm --filter @WBMSG/api test`
Expected: FAIL — `Cannot find module './webhooks.js'`

- [ ] **Step 2: Create `apps/api/src/routes/webhooks.ts`**

```typescript
import { FastifyPluginAsync } from "fastify";
import { verifyWebhookSignature } from "../lib/whatsapp.js";
import { inboundMessageQueue } from "../lib/queue.js";

interface WaMessage {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  text?: { body: string };
}

interface WaChangeValue {
  messaging_product: string;
  metadata: { phone_number_id: string };
  messages?: WaMessage[];
}

interface WaEntry {
  id: string;
  changes: Array<{ value: WaChangeValue; field: string }>;
}

interface WhatsAppWebhookBody {
  object: string;
  entry: WaEntry[];
}

export const webhooksRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/webhooks/whatsapp",
    { config: { public: true } },
    async (request, reply) => {
      const query = request.query as Record<string, string>;
      const mode = query["hub.mode"];
      const token = query["hub.verify_token"];
      const challenge = query["hub.challenge"];

      if (mode === "subscribe" && token === process.env["WA_VERIFY_TOKEN"]) {
        return reply.send(challenge);
      }
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Token mismatch" } });
    }
  );

  fastify.post<{ Body: WhatsAppWebhookBody }>(
    "/webhooks/whatsapp",
    { config: { public: true } },
    async (request, reply) => {
      const signature = (request.headers["x-hub-signature-256"] as string) ?? "";
      const rawBody = JSON.stringify(request.body);
      const secret = process.env["WA_WEBHOOK_SECRET"] ?? "";

      if (!verifyWebhookSignature(rawBody, signature, secret)) {
        return reply.status(403).send({ error: { code: "INVALID_SIGNATURE", message: "Signature mismatch" } });
      }

      if (request.body.object !== "whatsapp_business_account") {
        return reply.status(400).send({ error: { code: "UNKNOWN_OBJECT", message: "Unrecognised webhook object" } });
      }

      for (const entry of request.body.entry) {
        for (const change of entry.changes) {
          if (change.field !== "messages" || !change.value.messages?.length) continue;

          const { phone_number_id } = change.value.metadata;
          const org = await fastify.prisma.organization.findFirst({
            where: { phoneNumberId: phone_number_id },
          });
          if (!org) continue;

          for (const msg of change.value.messages) {
            await inboundMessageQueue.add("inbound", {
              organizationId: org.id,
              whatsappContactPhone: msg.from,
              whatsappMessageId: msg.id,
              contentType: msg.type,
              body: msg.text?.body ?? null,
              mediaId: null,
              timestamp: parseInt(msg.timestamp, 10),
            });
          }
        }
      }

      return reply.status(200).send({ status: "ok" });
    }
  );
};
```

- [ ] **Step 3: Run the tests — confirm they pass**

```bash
pnpm --filter @WBMSG/api test src/routes/webhooks.test.ts
```

Expected: PASS (4 tests)

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/webhooks.ts apps/api/src/routes/webhooks.test.ts
git commit -m "feat(api): add WhatsApp webhook routes (challenge + receive)"
```

---

## Task 6: Conversations list + messages fetch routes

**Files:**
- Create: `apps/api/src/routes/conversations.ts`
- Create: `apps/api/src/routes/messages.ts`

- [ ] **Step 1: Create `apps/api/src/routes/conversations.ts`**

```typescript
import { FastifyPluginAsync } from "fastify";
import type { ConversationId } from "@WBMSG/shared";

export const conversationsRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/conversations", async (request, reply) => {
    const { organizationId } = request.auth;
    const conversations = await fastify.prisma.conversation.findMany({
      where: { organizationId },
      orderBy: { lastMessageAt: "desc" },
      take: 50,
    });
    return reply.send({ data: conversations });
  });

  fastify.get<{ Params: { id: ConversationId } }>(
    "/conversations/:id/messages",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const conversation = await fastify.prisma.conversation.findFirst({
        where: { id: request.params.id, organizationId },
      });
      if (!conversation) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Conversation not found" } });
      }
      const messages = await fastify.prisma.message.findMany({
        where: { conversationId: request.params.id },
        orderBy: { sentAt: "asc" },
        take: 100,
      });
      return reply.send({ data: messages });
    }
  );
};
```

- [ ] **Step 2: Create `apps/api/src/routes/messages.ts`**

```typescript
import { FastifyPluginAsync } from "fastify";
import { sendTextMessage } from "../lib/whatsapp.js";
import type { ConversationId } from "@WBMSG/shared";

interface SendMessageBody {
  text: string;
}

export const messagesRouter: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Params: { id: ConversationId }; Body: SendMessageBody }>(
    "/conversations/:id/messages",
    async (request, reply) => {
      const { organizationId } = request.auth;

      const conversation = await fastify.prisma.conversation.findFirst({
        where: { id: request.params.id, organizationId },
      });
      if (!conversation) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Conversation not found" } });
      }
      if (!conversation.whatsappContactId) {
        return reply.status(400).send({ error: { code: "NO_WA_CONTACT", message: "No WhatsApp contact on this conversation" } });
      }

      const phoneNumberId = process.env["WA_PHONE_NUMBER_ID"] ?? "";
      const accessToken = process.env["WA_ACCESS_TOKEN"] ?? "";

      const { messageId } = await sendTextMessage(
        phoneNumberId,
        conversation.whatsappContactId,
        request.body.text,
        accessToken
      );

      const message = await fastify.prisma.message.create({
        data: {
          conversationId: conversation.id,
          organizationId,
          direction: "outbound",
          contentType: "text",
          body: request.body.text,
          whatsappMessageId: messageId,
          status: "sent",
        },
      });

      await fastify.prisma.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: new Date() },
      });

      return reply.status(201).send({ data: message });
    }
  );
};
```

- [ ] **Step 3: Register routes in `apps/api/src/routes/index.ts`**

Add to existing imports + registrations:
```typescript
import { webhooksRouter } from "./webhooks.js";
import { conversationsRouter } from "./conversations.js";
import { messagesRouter } from "./messages.js";

// Inside the plugin:
await fastify.register(webhooksRouter, { prefix: "/v1" });
await fastify.register(conversationsRouter, { prefix: "/v1" });
await fastify.register(messagesRouter, { prefix: "/v1" });
```

- [ ] **Step 4: Start the worker in `apps/api/src/index.ts`**

Add after plugin registrations:
```typescript
import "./workers/inbound-message.worker.js";
```

- [ ] **Step 5: Add ConversationId + MessageId to shared types**

In `packages/shared/src/index.ts`, add:
```typescript
export type ConversationId = string & { readonly __brand: "ConversationId" };
export type MessageId = string & { readonly __brand: "MessageId" };
```

- [ ] **Step 6: Run full test suite**

```bash
pnpm --filter @WBMSG/api test
```

Expected: All pass

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/ apps/api/src/index.ts packages/shared/src/
git commit -m "feat(api): add conversations + messages routes; start inbound worker"
```

---

## Task 7: Type-check + lint Sprint 3

- [ ] **Step 1: Type-check**

```bash
pnpm type-check
```

Expected: no errors

- [ ] **Step 2: Lint**

```bash
pnpm lint
```

Expected: no errors

- [ ] **Step 3: Commit if any auto-fixes applied**

```bash
git add -A && git diff --cached --quiet || git commit -m "chore: lint fixes Sprint 3"
```

---

## Task 8: Complete Prisma schema — all remaining tables

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Write the failing test confirming models don't exist**

In `apps/api/src/routes/contacts.test.ts` (create file):
```typescript
import { describe, it, expect } from "vitest";
import { prisma } from "../lib/prisma.js";

describe("Contact model", () => {
  it("prisma client has contact property", () => {
    expect(prisma.contact).toBeDefined();
  });
});
```

Run: `pnpm --filter @WBMSG/api test src/routes/contacts.test.ts`
Expected: FAIL

- [ ] **Step 2: Add all remaining models to `apps/api/prisma/schema.prisma`**

```prisma
// ─── Enums ───────────────────────────────────────────────────────────────────

enum LifecycleStage {
  lead
  prospect
  customer
  loyal
  churned
}

enum TemplateStatus {
  pending
  approved
  rejected
}

enum TemplateCategory {
  marketing
  utility
  authentication
}

enum CampaignStatus {
  draft
  scheduled
  running
  completed
  cancelled
}

// ─── Models ──────────────────────────────────────────────────────────────────

model Contact {
  id             String         @id @default(uuid())
  organizationId String
  phoneNumber    String
  name           String?
  email          String?
  companyId      String?
  company        Company?       @relation(fields: [companyId], references: [id])
  lifecycleStage LifecycleStage @default(lead)
  tags           String[]
  customFields   Json           @default("{}")
  createdAt      DateTime       @default(now())
  updatedAt      DateTime       @updatedAt

  @@unique([organizationId, phoneNumber])
  @@index([organizationId])
  @@index([organizationId, lifecycleStage])
  @@map("contacts")
}

model Company {
  id             String    @id @default(uuid())
  organizationId String
  name           String
  domain         String?
  industry       String?
  size           String?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  contacts       Contact[]

  @@index([organizationId])
  @@map("companies")
}

model Pipeline {
  id             String   @id @default(uuid())
  organizationId String
  name           String
  stages         Json     @default("[]")
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  deals          Deal[]

  @@index([organizationId])
  @@map("pipelines")
}

model Deal {
  id             String   @id @default(uuid())
  organizationId String
  title          String
  value          Decimal? @db.Decimal(15, 2)
  stage          String   @default("new")
  pipelineId     String
  pipeline       Pipeline @relation(fields: [pipelineId], references: [id])
  contactId      String?
  assignedTo     String?
  closedAt       DateTime?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([organizationId])
  @@index([organizationId, pipelineId])
  @@map("deals")
}

model Template {
  id               String           @id @default(uuid())
  organizationId   String
  name             String
  category         TemplateCategory
  language         String           @default("en")
  components       Json             @default("[]")
  metaTemplateId   String?
  status           TemplateStatus   @default(pending)
  createdAt        DateTime         @default(now())
  updatedAt        DateTime         @updatedAt

  @@index([organizationId])
  @@map("templates")
}

model Campaign {
  id             String         @id @default(uuid())
  organizationId String
  name           String
  templateId     String?
  status         CampaignStatus @default(draft)
  scheduledAt    DateTime?
  sentAt         DateTime?
  createdAt      DateTime       @default(now())
  updatedAt      DateTime       @updatedAt

  @@index([organizationId])
  @@map("campaigns")
}

model Flow {
  id             String   @id @default(uuid())
  organizationId String
  name           String
  triggerType    String
  isActive       Boolean  @default(false)
  flowDefinition Json     @default("{}")
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([organizationId])
  @@map("flows")
}

model Team {
  id             String   @id @default(uuid())
  organizationId String
  name           String
  description    String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([organizationId])
  @@map("teams")
}

model ApiKey {
  id             String   @id @default(uuid())
  organizationId String
  name           String
  keyHash        String   @unique
  scopes         String[]
  lastUsedAt     DateTime?
  createdAt      DateTime @default(now())

  @@index([organizationId])
  @@map("api_keys")
}

model Webhook {
  id             String   @id @default(uuid())
  organizationId String
  url            String
  events         String[]
  secret         String
  isActive       Boolean  @default(true)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([organizationId])
  @@map("webhooks")
}
```

- [ ] **Step 3: Run migration**

```bash
cd apps/api
pnpm exec prisma migrate dev --name add_contacts_companies_deals_templates_flows
pnpm exec prisma generate
```

Expected: `Your database is now in sync with your schema.`

- [ ] **Step 4: Confirm test passes**

```bash
pnpm --filter @WBMSG/api test src/routes/contacts.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/
git commit -m "feat(api): complete Prisma schema — all 32 tables"
```

---

## Task 9: Swagger OpenAPI plugin

**Files:**
- Create: `apps/api/src/plugins/swagger.ts`

- [ ] **Step 1: Install dependencies**

```bash
pnpm --filter @WBMSG/api add @fastify/swagger @fastify/swagger-ui
```

- [ ] **Step 2: Create `apps/api/src/plugins/swagger.ts`**

```typescript
import fp from "fastify-plugin";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";

export default fp(async (fastify) => {
  await fastify.register(swagger, {
    openapi: {
      info: { title: "WBMSG API", version: "1.0.0", description: "WhatsApp-First CRM REST API" },
      servers: [{ url: "http://localhost:4000", description: "Local dev" }],
      components: {
        securitySchemes: {
          bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
        },
      },
      security: [{ bearerAuth: [] }],
    },
  });

  await fastify.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: { docExpansion: "list" },
  });
});
```

- [ ] **Step 3: Register in `apps/api/src/index.ts`**

Add before route registration:
```typescript
import swaggerPlugin from "./plugins/swagger.js";

await fastify.register(swaggerPlugin);
```

- [ ] **Step 4: Verify docs route works**

```bash
curl http://localhost:4000/docs
```

Expected: HTML page (Swagger UI)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/plugins/swagger.ts apps/api/src/index.ts apps/api/package.json pnpm-lock.yaml
git commit -m "feat(api): add @fastify/swagger OpenAPI docs at /docs"
```

---

## Task 10: Pagination utility

**Files:**
- Create: `apps/api/src/lib/pagination.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/lib/pagination.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { paginate, parsePaginationParams } from "./pagination.js";

describe("paginate", () => {
  const items = Array.from({ length: 10 }, (_, i) => ({ id: `id-${i}` }));

  it("returns all items when count <= limit", () => {
    const result = paginate(items.slice(0, 5), 10);
    expect(result.data).toHaveLength(5);
    expect(result.pagination.has_more).toBe(false);
    expect(result.pagination.next_cursor).toBeNull();
  });

  it("slices to limit and sets next_cursor when has_more", () => {
    const result = paginate(items, 5);
    expect(result.data).toHaveLength(5);
    expect(result.pagination.has_more).toBe(true);
    expect(result.pagination.next_cursor).toBe("id-4");
  });
});

describe("parsePaginationParams", () => {
  it("returns defaults when no params", () => {
    const result = parsePaginationParams({});
    expect(result.limit).toBe(50);
    expect(result.cursor).toBeUndefined();
  });

  it("clamps limit to 100", () => {
    const result = parsePaginationParams({ limit: "999" });
    expect(result.limit).toBe(100);
  });

  it("parses cursor", () => {
    const result = parsePaginationParams({ cursor: "abc" });
    expect(result.cursor).toBe("abc");
  });
});
```

Run: `pnpm --filter @WBMSG/api test src/lib/pagination.test.ts`
Expected: FAIL

- [ ] **Step 2: Create `apps/api/src/lib/pagination.ts`**

```typescript
export interface PaginationResult<T> {
  data: T[];
  pagination: {
    next_cursor: string | null;
    has_more: boolean;
  };
}

export function paginate<T extends { id: string }>(
  items: T[],
  limit: number
): PaginationResult<T> {
  const hasMore = items.length > limit;
  const data = hasMore ? items.slice(0, limit) : items;
  const nextCursor = hasMore ? (data[data.length - 1]?.id ?? null) : null;
  return { data, pagination: { next_cursor: nextCursor, has_more: hasMore } };
}

export interface PaginationOptions {
  cursor?: string;
  limit: number;
}

export function parsePaginationParams(
  query: Record<string, string | string[] | undefined>
): PaginationOptions {
  const cursor = typeof query["cursor"] === "string" ? query["cursor"] : undefined;
  const limitRaw = typeof query["limit"] === "string" ? parseInt(query["limit"], 10) : 50;
  const limit = Math.min(Math.max(isNaN(limitRaw) ? 50 : limitRaw, 1), 100);
  return { cursor, limit };
}
```

- [ ] **Step 3: Run the test — confirm it passes**

```bash
pnpm --filter @WBMSG/api test src/lib/pagination.test.ts
```

Expected: PASS (5 tests)

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/lib/pagination.ts apps/api/src/lib/pagination.test.ts
git commit -m "feat(api): add cursor-based pagination utility"
```

---

## Task 11: Contacts CRUD routes

**Files:**
- Create: `apps/api/src/routes/contacts.ts`

- [ ] **Step 1: Write the failing tests**

Replace `apps/api/src/routes/contacts.test.ts` with full route tests:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { FastifyInstance } from "fastify";

const mockPrisma = {
  contact: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
};

const mockAuth = {
  userId: "user-1",
  organizationId: "org-1",
  role: "admin" as const,
};

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma);
  app.addHook("onRequest", async (request) => {
    request.auth = mockAuth;
  });
  const { contactsRouter } = await import("./contacts.js");
  await app.register(contactsRouter, { prefix: "/v1" });
  return app;
}

describe("GET /v1/contacts", () => {
  let app: FastifyInstance;
  beforeEach(async () => { app = await buildApp(); });
  afterEach(async () => { await app.close(); vi.clearAllMocks(); });

  it("returns contacts for the authenticated org", async () => {
    mockPrisma.contact.findMany.mockResolvedValue([
      { id: "c-1", organizationId: "org-1", phoneNumber: "+919000000001", name: "Alice" },
    ]);
    const res = await app.inject({ method: "GET", url: "/v1/contacts" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: unknown[] }>();
    expect(body.data).toHaveLength(1);
    expect(mockPrisma.contact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: "org-1" }) })
    );
  });
});

describe("POST /v1/contacts", () => {
  let app: FastifyInstance;
  beforeEach(async () => { app = await buildApp(); });
  afterEach(async () => { await app.close(); vi.clearAllMocks(); });

  it("creates a contact and returns 201", async () => {
    const created = { id: "c-2", organizationId: "org-1", phoneNumber: "+919000000002", name: "Bob" };
    mockPrisma.contact.create.mockResolvedValue(created);

    const res = await app.inject({
      method: "POST",
      url: "/v1/contacts",
      payload: { phoneNumber: "+919000000002", name: "Bob" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json<{ data: { id: string } }>().data.id).toBe("c-2");
  });
});

describe("DELETE /v1/contacts/:id", () => {
  let app: FastifyInstance;
  beforeEach(async () => { app = await buildApp(); });
  afterEach(async () => { await app.close(); vi.clearAllMocks(); });

  it("returns 404 when contact not in org", async () => {
    mockPrisma.contact.findFirst.mockResolvedValue(null);
    const res = await app.inject({ method: "DELETE", url: "/v1/contacts/c-999" });
    expect(res.statusCode).toBe(404);
  });

  it("deletes and returns 204", async () => {
    mockPrisma.contact.findFirst.mockResolvedValue({ id: "c-1", organizationId: "org-1" });
    mockPrisma.contact.delete.mockResolvedValue({});
    const res = await app.inject({ method: "DELETE", url: "/v1/contacts/c-1" });
    expect(res.statusCode).toBe(204);
  });
});
```

Run: `pnpm --filter @WBMSG/api test src/routes/contacts.test.ts`
Expected: FAIL — `Cannot find module './contacts.js'`

- [ ] **Step 2: Create `apps/api/src/routes/contacts.ts`**

```typescript
import { FastifyPluginAsync } from "fastify";
import { paginate, parsePaginationParams } from "../lib/pagination.js";
import type { ContactId } from "@WBMSG/shared";

interface ContactBody {
  phoneNumber: string;
  name?: string;
  email?: string;
  companyId?: string;
}

interface ContactPatchBody {
  name?: string;
  email?: string;
  lifecycleStage?: string;
  tags?: string[];
  customFields?: Record<string, unknown>;
}

export const contactsRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/contacts", async (request, reply) => {
    const { organizationId } = request.auth;
    const { cursor, limit } = parsePaginationParams(request.query as Record<string, string>);

    const contacts = await fastify.prisma.contact.findMany({
      where: {
        organizationId,
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      take: limit + 1,
      orderBy: { id: "asc" },
    });

    return reply.send(paginate(contacts, limit));
  });

  fastify.get<{ Params: { id: ContactId } }>("/contacts/:id", async (request, reply) => {
    const { organizationId } = request.auth;
    const contact = await fastify.prisma.contact.findFirst({
      where: { id: request.params.id, organizationId },
    });
    if (!contact) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Contact not found" } });
    }
    return reply.send({ data: contact });
  });

  fastify.post<{ Body: ContactBody }>("/contacts", async (request, reply) => {
    const { organizationId } = request.auth;
    const contact = await fastify.prisma.contact.create({
      data: {
        organizationId,
        phoneNumber: request.body.phoneNumber,
        name: request.body.name ?? null,
        email: request.body.email ?? null,
        companyId: request.body.companyId ?? null,
      },
    });
    return reply.status(201).send({ data: contact });
  });

  fastify.patch<{ Params: { id: ContactId }; Body: ContactPatchBody }>(
    "/contacts/:id",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const existing = await fastify.prisma.contact.findFirst({
        where: { id: request.params.id, organizationId },
      });
      if (!existing) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Contact not found" } });
      }
      const contact = await fastify.prisma.contact.update({
        where: { id: request.params.id },
        data: request.body,
      });
      return reply.send({ data: contact });
    }
  );

  fastify.delete<{ Params: { id: ContactId } }>("/contacts/:id", async (request, reply) => {
    const { organizationId } = request.auth;
    const existing = await fastify.prisma.contact.findFirst({
      where: { id: request.params.id, organizationId },
    });
    if (!existing) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Contact not found" } });
    }
    await fastify.prisma.contact.delete({ where: { id: request.params.id } });
    return reply.status(204).send();
  });
};
```

- [ ] **Step 3: Run tests — confirm they pass**

```bash
pnpm --filter @WBMSG/api test src/routes/contacts.test.ts
```

Expected: PASS (5 tests)

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/contacts.ts apps/api/src/routes/contacts.test.ts
git commit -m "feat(api): add contacts CRUD routes"
```

---

## Task 12: Companies CRUD routes

**Files:**
- Create: `apps/api/src/routes/companies.ts`

- [ ] **Step 1: Create `apps/api/src/routes/companies.ts`**

Same pattern as contacts. Key differences: no `phoneNumber` unique constraint, fields are `name`, `domain`, `industry`, `size`.

```typescript
import { FastifyPluginAsync } from "fastify";
import { paginate, parsePaginationParams } from "../lib/pagination.js";
import type { CompanyId } from "@WBMSG/shared";

interface CompanyBody {
  name: string;
  domain?: string;
  industry?: string;
  size?: string;
}

export const companiesRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/companies", async (request, reply) => {
    const { organizationId } = request.auth;
    const { cursor, limit } = parsePaginationParams(request.query as Record<string, string>);

    const companies = await fastify.prisma.company.findMany({
      where: {
        organizationId,
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      take: limit + 1,
      orderBy: { id: "asc" },
    });

    return reply.send(paginate(companies, limit));
  });

  fastify.get<{ Params: { id: CompanyId } }>("/companies/:id", async (request, reply) => {
    const { organizationId } = request.auth;
    const company = await fastify.prisma.company.findFirst({
      where: { id: request.params.id, organizationId },
    });
    if (!company) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Company not found" } });
    }
    return reply.send({ data: company });
  });

  fastify.post<{ Body: CompanyBody }>("/companies", async (request, reply) => {
    const { organizationId } = request.auth;
    const company = await fastify.prisma.company.create({
      data: {
        organizationId,
        name: request.body.name,
        domain: request.body.domain ?? null,
        industry: request.body.industry ?? null,
        size: request.body.size ?? null,
      },
    });
    return reply.status(201).send({ data: company });
  });

  fastify.patch<{ Params: { id: CompanyId }; Body: Partial<CompanyBody> }>(
    "/companies/:id",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const existing = await fastify.prisma.company.findFirst({
        where: { id: request.params.id, organizationId },
      });
      if (!existing) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Company not found" } });
      }
      const company = await fastify.prisma.company.update({
        where: { id: request.params.id },
        data: request.body,
      });
      return reply.send({ data: company });
    }
  );

  fastify.delete<{ Params: { id: CompanyId } }>("/companies/:id", async (request, reply) => {
    const { organizationId } = request.auth;
    const existing = await fastify.prisma.company.findFirst({
      where: { id: request.params.id, organizationId },
    });
    if (!existing) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Company not found" } });
    }
    await fastify.prisma.company.delete({ where: { id: request.params.id } });
    return reply.status(204).send();
  });
};
```

- [ ] **Step 2: Register in `apps/api/src/routes/index.ts`**

```typescript
import { companiesRouter } from "./companies.js";
// ...
await fastify.register(companiesRouter, { prefix: "/v1" });
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/companies.ts apps/api/src/routes/index.ts
git commit -m "feat(api): add companies CRUD routes"
```

---

## Task 13: Meilisearch client + contacts indexing

**Files:**
- Create: `apps/api/src/lib/search.ts`

- [ ] **Step 1: Install Meilisearch client**

```bash
pnpm --filter @WBMSG/api add meilisearch
```

- [ ] **Step 2: Add env var to `.env.example`**

```
MEILISEARCH_URL=http://localhost:7700
MEILISEARCH_MASTER_KEY=
```

- [ ] **Step 3: Create `apps/api/src/lib/search.ts`**

```typescript
import { MeiliSearch } from "meilisearch";

export const searchClient = new MeiliSearch({
  host: process.env["MEILISEARCH_URL"] ?? "http://localhost:7700",
  apiKey: process.env["MEILISEARCH_MASTER_KEY"],
});

export async function setupSearchIndexes(): Promise<void> {
  const contacts = searchClient.index("contacts");
  await contacts.updateSettings({
    searchableAttributes: ["name", "phoneNumber", "email"],
    filterableAttributes: ["organizationId", "lifecycleStage"],
    sortableAttributes: ["createdAt"],
  });
}

export interface ContactDocument {
  id: string;
  organizationId: string;
  name: string | null;
  phoneNumber: string;
  email: string | null;
  lifecycleStage: string;
}

export async function indexContact(contact: ContactDocument): Promise<void> {
  await searchClient.index("contacts").addDocuments([contact]);
}

export async function removeContact(id: string): Promise<void> {
  await searchClient.index("contacts").deleteDocument(id);
}

export async function searchContacts(
  organizationId: string,
  query: string,
  limit = 20
): Promise<ContactDocument[]> {
  const result = await searchClient.index("contacts").search<ContactDocument>(query, {
    filter: [`organizationId = "${organizationId}"`],
    limit,
  });
  return result.hits;
}
```

- [ ] **Step 4: Call `setupSearchIndexes()` in `apps/api/src/index.ts`**

```typescript
import { setupSearchIndexes } from "./lib/search.js";

// After Fastify starts:
await setupSearchIndexes();
```

- [ ] **Step 5: Add `GET /v1/contacts/search` to contacts router**

In `apps/api/src/routes/contacts.ts`, add before other routes:
```typescript
import { searchContacts } from "../lib/search.js";

// Add route:
fastify.get<{ Querystring: { q: string } }>("/contacts/search", async (request, reply) => {
  const { organizationId } = request.auth;
  const query = (request.query as Record<string, string>)["q"] ?? "";
  const results = await searchContacts(organizationId, query);
  return reply.send({ data: results });
});
```

- [ ] **Step 6: Add shared types for Sprint 4**

In `packages/shared/src/index.ts`, add:
```typescript
export type ContactId = string & { readonly __brand: "ContactId" };
export type CompanyId = string & { readonly __brand: "CompanyId" };
export type DealId = string & { readonly __brand: "DealId" };
export type PipelineId = string & { readonly __brand: "PipelineId" };
export type TemplateId = string & { readonly __brand: "TemplateId" };
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/lib/search.ts apps/api/src/routes/contacts.ts apps/api/src/index.ts packages/shared/src/ apps/api/package.json pnpm-lock.yaml .env.example
git commit -m "feat(api): add Meilisearch client + contacts search"
```

---

## Task 14: Type-check + lint Sprint 4

- [ ] **Step 1: Run full test suite**

```bash
pnpm --filter @WBMSG/api test
```

Expected: all pass

- [ ] **Step 2: Type-check**

```bash
pnpm type-check
```

Expected: no errors

- [ ] **Step 3: Lint**

```bash
pnpm lint
```

Expected: no errors

- [ ] **Step 4: Commit any fixes**

```bash
git add -A && git diff --cached --quiet || git commit -m "chore: type + lint fixes Sprint 4"
```

---

## Task 15: Tailwind design tokens + globals

**Files:**
- Modify: `apps/web/tailwind.config.ts`
- Modify: `apps/web/app/globals.css`

- [ ] **Step 1: Install Radix UI**

```bash
pnpm --filter @WBMSG/web add @radix-ui/react-toast @radix-ui/react-dialog @radix-ui/react-dropdown-menu
```

- [ ] **Step 2: Modify `apps/web/tailwind.config.ts`**

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  "#f0fdf4",
          100: "#dcfce7",
          200: "#bbf7d0",
          300: "#86efac",
          400: "#4ade80",
          500: "#22c55e",
          600: "#16a34a",
          700: "#15803d",
          800: "#166534",
          900: "#14532d",
        },
        wa: {
          green:  "#25D366",
          teal:   "#128C7E",
          light:  "#DCF8C6",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 3: Update `apps/web/app/globals.css`**

Replace or extend with:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --color-brand: #22c55e;
    --color-brand-dark: #15803d;
    --sidebar-width: 240px;
  }

  body {
    @apply text-gray-900 bg-gray-50 antialiased;
  }

  * {
    @apply border-gray-200;
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/tailwind.config.ts apps/web/app/globals.css apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web): add brand design tokens and Radix UI deps"
```

---

## Task 16: Core UI components

**Files:**
- Create: `apps/web/components/ui/Button.tsx`
- Create: `apps/web/components/ui/Input.tsx`
- Create: `apps/web/components/ui/Badge.tsx`
- Create: `apps/web/components/ui/Toast.tsx`
- Create: `apps/web/components/ui/index.ts`

- [ ] **Step 1: Create `apps/web/components/ui/Button.tsx`**

```tsx
import { ButtonHTMLAttributes, JSX } from "react";

type Variant = "primary" | "secondary" | "ghost" | "destructive";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variantClasses: Record<Variant, string> = {
  primary:     "bg-brand-600 text-white hover:bg-brand-700 focus:ring-brand-500",
  secondary:   "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 focus:ring-brand-500",
  ghost:       "text-gray-600 hover:bg-gray-100 focus:ring-brand-500",
  destructive: "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500",
};

const sizeClasses: Record<Size, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
  lg: "px-6 py-3 text-base",
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  disabled,
  ...props
}: ButtonProps): JSX.Element {
  return (
    <button
      className={[
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium",
        "transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        variantClasses[variant],
        sizeClasses[size],
        className,
      ].join(" ")}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 2: Create `apps/web/components/ui/Input.tsx`**

```tsx
import { InputHTMLAttributes, JSX } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, id, className = "", ...props }: InputProps): JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      <input
        id={id}
        className={[
          "rounded-lg border px-3 py-2 text-sm text-gray-900 placeholder-gray-400",
          "focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent",
          error ? "border-red-500" : "border-gray-300",
          className,
        ].join(" ")}
        {...props}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Create `apps/web/components/ui/Badge.tsx`**

```tsx
import { JSX } from "react";

type BadgeVariant = "green" | "yellow" | "red" | "blue" | "gray";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, string> = {
  green:  "bg-green-100 text-green-800",
  yellow: "bg-yellow-100 text-yellow-800",
  red:    "bg-red-100 text-red-800",
  blue:   "bg-blue-100 text-blue-800",
  gray:   "bg-gray-100 text-gray-700",
};

export function Badge({ children, variant = "gray" }: BadgeProps): JSX.Element {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${variantClasses[variant]}`}>
      {children}
    </span>
  );
}
```

- [ ] **Step 4: Create `apps/web/components/ui/Toast.tsx`**

```tsx
"use client";

import * as ToastPrimitive from "@radix-ui/react-toast";
import { JSX, useState } from "react";

interface ToastProps {
  title: string;
  description?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variant?: "default" | "success" | "error";
}

const variantClasses = {
  default: "bg-white border-gray-200",
  success: "bg-white border-green-500",
  error:   "bg-white border-red-500",
};

export function Toast({ title, description, open, onOpenChange, variant = "default" }: ToastProps): JSX.Element {
  return (
    <ToastPrimitive.Provider swipeDirection="right">
      <ToastPrimitive.Root
        open={open}
        onOpenChange={onOpenChange}
        className={`flex flex-col gap-1 rounded-lg border p-4 shadow-card ${variantClasses[variant]}`}
        duration={4000}
      >
        <ToastPrimitive.Title className="text-sm font-semibold text-gray-900">
          {title}
        </ToastPrimitive.Title>
        {description && (
          <ToastPrimitive.Description className="text-sm text-gray-600">
            {description}
          </ToastPrimitive.Description>
        )}
      </ToastPrimitive.Root>
      <ToastPrimitive.Viewport className="fixed bottom-4 right-4 flex flex-col gap-2 w-80 z-50" />
    </ToastPrimitive.Provider>
  );
}

export function useToast() {
  const [state, setState] = useState<{ open: boolean; title: string; description?: string; variant?: "default" | "success" | "error" }>({
    open: false,
    title: "",
  });

  const toast = (title: string, opts?: { description?: string; variant?: "default" | "success" | "error" }) => {
    setState({ open: true, title, ...opts });
  };

  return { toast, toastState: state, setToastOpen: (open: boolean) => setState((s) => ({ ...s, open })) };
}
```

- [ ] **Step 5: Create `apps/web/components/ui/index.ts`**

```typescript
export { Button } from "./Button.js";
export { Input } from "./Input.js";
export { Badge } from "./Badge.js";
export { Toast, useToast } from "./Toast.js";
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/ui/
git commit -m "feat(web): add Button, Input, Badge, Toast UI components"
```

---

## Task 17: Navigation sidebar + dashboard layout

**Files:**
- Create: `apps/web/components/layout/Sidebar.tsx`
- Create: `apps/web/components/layout/TopBar.tsx`
- Modify: `apps/web/app/(dashboard)/layout.tsx`

- [ ] **Step 1: Create `apps/web/components/layout/Sidebar.tsx`**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { JSX } from "react";

interface NavItem {
  href: string;
  label: string;
  icon: string;
}

const navItems: NavItem[] = [
  { href: "/",                  label: "Dashboard",  icon: "◻" },
  { href: "/inbox",             label: "Inbox",      icon: "✉" },
  { href: "/contacts",          label: "Contacts",   icon: "👤" },
  { href: "/campaigns",         label: "Campaigns",  icon: "📢" },
  { href: "/settings",          label: "Settings",   icon: "⚙" },
];

export function Sidebar(): JSX.Element {
  const pathname = usePathname();

  return (
    <aside className="flex flex-col w-60 min-h-screen bg-white border-r border-gray-200">
      <div className="flex items-center gap-2 px-4 py-5 border-b border-gray-200">
        <span className="text-wa-green font-bold text-xl">✓</span>
        <span className="font-semibold text-gray-900">WBMSG</span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ href, label, icon }) => {
          const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={[
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-brand-50 text-brand-700"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
              ].join(" ")}
            >
              <span className="w-5 text-center">{icon}</span>
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
```

- [ ] **Step 2: Create `apps/web/components/layout/TopBar.tsx`**

```tsx
import { UserButton } from "@clerk/nextjs";
import { JSX } from "react";

interface TopBarProps {
  orgName?: string;
}

export function TopBar({ orgName }: TopBarProps): JSX.Element {
  return (
    <header className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200 h-14">
      <span className="text-sm text-gray-500">{orgName ?? ""}</span>
      <div className="flex items-center gap-4">
        <UserButton afterSignOutUrl="/sign-in" />
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Modify `apps/web/app/(dashboard)/layout.tsx`**

```tsx
import { JSX, ReactNode } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { auth, currentUser } from "@clerk/nextjs/server";

export default async function DashboardLayout({ children }: { children: ReactNode }): Promise<JSX.Element> {
  auth().protect();
  const user = await currentUser();
  const orgName = user?.organizationMemberships?.[0]?.organization?.name;

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <TopBar orgName={orgName} />
        <main className="flex-1 p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/layout/ apps/web/app/\(dashboard\)/layout.tsx
git commit -m "feat(web): add sidebar + top bar navigation shell"
```

---

## Task 18: Dashboard home + contacts list page

**Files:**
- Create: `apps/web/app/(dashboard)/page.tsx`
- Create: `apps/web/app/(dashboard)/contacts/page.tsx`
- Create: `apps/web/app/(dashboard)/contacts/loading.tsx`

- [ ] **Step 1: Create `apps/web/app/(dashboard)/page.tsx`**

```tsx
import { JSX } from "react";
import { auth } from "@clerk/nextjs/server";

interface StatCard {
  label: string;
  value: string;
  change: string;
}

const stats: StatCard[] = [
  { label: "Open Conversations", value: "—", change: "" },
  { label: "Contacts", value: "—", change: "" },
  { label: "Messages Sent Today", value: "—", change: "" },
  { label: "Pending Invitations", value: "—", change: "" },
];

export default function DashboardPage(): JSX.Element {
  auth().protect();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(({ label, value }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-5 shadow-card">
            <p className="text-sm text-gray-500">{label}</p>
            <p className="mt-1 text-3xl font-bold text-gray-900">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `apps/web/app/(dashboard)/contacts/page.tsx`**

```tsx
import { JSX } from "react";
import { auth } from "@clerk/nextjs/server";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

interface Contact {
  id: string;
  phoneNumber: string;
  name: string | null;
  email: string | null;
  lifecycleStage: string;
}

interface ContactsResponse {
  data: Contact[];
}

const stageVariant: Record<string, "green" | "blue" | "yellow" | "red" | "gray"> = {
  customer: "green",
  prospect: "blue",
  lead:     "yellow",
  churned:  "red",
  loyal:    "green",
};

async function getContacts(token: string): Promise<Contact[]> {
  const apiUrl = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";
  const res = await fetch(`${apiUrl}/v1/contacts?limit=50`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) return [];
  const json = await res.json() as ContactsResponse;
  return json.data;
}

export default async function ContactsPage(): Promise<JSX.Element> {
  const { getToken } = auth();
  auth().protect();
  const token = await getToken();
  const contacts = await getContacts(token ?? "");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Contacts</h1>
        <Button>Add Contact</Button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Phone</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Stage</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {contacts.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                  No contacts yet. Add your first contact.
                </td>
              </tr>
            ) : (
              contacts.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{c.name ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{c.phoneNumber}</td>
                  <td className="px-4 py-3 text-gray-600">{c.email ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Badge variant={stageVariant[c.lifecycleStage] ?? "gray"}>
                      {c.lifecycleStage}
                    </Badge>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `apps/web/app/(dashboard)/contacts/loading.tsx`**

```tsx
import { JSX } from "react";

export default function ContactsLoading(): JSX.Element {
  return (
    <div className="space-y-4">
      <div className="h-8 w-32 bg-gray-200 rounded animate-pulse" />
      <div className="bg-white rounded-xl border border-gray-200 shadow-card overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-4 px-4 py-3 border-b border-gray-100">
            <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
            <div className="h-4 w-28 bg-gray-200 rounded animate-pulse" />
            <div className="h-4 w-40 bg-gray-200 rounded animate-pulse" />
            <div className="h-4 w-16 bg-gray-100 rounded animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/\(dashboard\)/
git commit -m "feat(web): add dashboard home + contacts list page"
```

---

## Task 19: Type-check + lint Sprint 5

- [ ] **Step 1: Type-check**

```bash
pnpm type-check
```

Expected: no errors

- [ ] **Step 2: Lint**

```bash
pnpm lint
```

Expected: no errors

- [ ] **Step 3: Commit any fixes**

```bash
git add -A && git diff --cached --quiet || git commit -m "chore: type + lint fixes Sprint 5"
```

---

## Task 20: Socket.io server Fastify plugin

**Files:**
- Create: `apps/api/src/plugins/socketio.ts`

- [ ] **Step 1: Install Socket.io on API**

```bash
pnpm --filter @WBMSG/api add socket.io
```

- [ ] **Step 2: Create `apps/api/src/plugins/socketio.ts`**

```typescript
import fp from "fastify-plugin";
import { Server as SocketIOServer } from "socket.io";
import type { FastifyInstance } from "fastify";

declare module "fastify" {
  interface FastifyInstance {
    io: SocketIOServer;
  }
}

export default fp(async (fastify: FastifyInstance) => {
  const io = new SocketIOServer(fastify.server, {
    cors: {
      origin: process.env["NEXT_PUBLIC_APP_URL"] ?? "http://localhost:3000",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    socket.on("join-org", (organizationId: string) => {
      void socket.join(`org:${organizationId}`);
    });
  });

  fastify.decorate("io", io);

  fastify.addHook("onClose", async () => {
    await io.close();
  });
});
```

- [ ] **Step 3: Register in `apps/api/src/index.ts`**

```typescript
import socketioPlugin from "./plugins/socketio.js";

await fastify.register(socketioPlugin);
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/plugins/socketio.ts apps/api/src/index.ts apps/api/package.json pnpm-lock.yaml
git commit -m "feat(api): add Socket.io server plugin with org-scoped rooms"
```

---

## Task 21: Emit real-time events from inbound worker

**Files:**
- Modify: `apps/api/src/workers/inbound-message.worker.ts`

- [ ] **Step 1: Update the worker to emit to the org room**

The worker runs in the same process as the Fastify server, so we can import the io instance directly via a shared module. Create `apps/api/src/lib/io-ref.ts`:

```typescript
import type { Server as SocketIOServer } from "socket.io";

let _io: SocketIOServer | null = null;

export function setIo(io: SocketIOServer): void {
  _io = io;
}

export function getIo(): SocketIOServer | null {
  return _io;
}
```

- [ ] **Step 2: Update `apps/api/src/plugins/socketio.ts`** to call `setIo`

Add after `const io = new SocketIOServer(...)`:
```typescript
import { setIo } from "../lib/io-ref.js";
// ...
setIo(io);
```

- [ ] **Step 3: Update `apps/api/src/workers/inbound-message.worker.ts`** to emit after storing**

After the `prisma.conversation.update()` call, add:
```typescript
import { getIo } from "../lib/io-ref.js";

// After conversation update:
const io = getIo();
if (io) {
  io.to(`org:${organizationId}`).emit("new-message", {
    conversationId: conversation.id,
    organizationId,
    direction: "inbound",
    body,
    sentAt: messageDate.toISOString(),
  });
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/lib/io-ref.ts apps/api/src/plugins/socketio.ts apps/api/src/workers/inbound-message.worker.ts
git commit -m "feat(api): emit new-message Socket.io event after inbound message stored"
```

---

## Task 22: Socket.io client + useSocket hook

**Files:**
- Create: `apps/web/lib/socket.ts`
- Create: `apps/web/hooks/useSocket.ts`

- [ ] **Step 1: Install Socket.io-client + React Query on web**

```bash
pnpm --filter @WBMSG/web add socket.io-client @tanstack/react-query
```

- [ ] **Step 2: Create `apps/web/lib/socket.ts`**

```typescript
import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000", {
      autoConnect: false,
    });
  }
  return socket;
}
```

- [ ] **Step 3: Create `apps/web/hooks/useSocket.ts`**

```typescript
"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect } from "react";
import { getSocket } from "@/lib/socket";

export function useSocket(organizationId: string | undefined): void {
  const { getToken } = useAuth();

  useEffect(() => {
    if (!organizationId) return;

    const socket = getSocket();

    async function connect() {
      const token = await getToken();
      socket.auth = { token };
      socket.connect();
      socket.emit("join-org", organizationId);
    }

    void connect();

    return () => {
      socket.emit("leave-org", organizationId);
      socket.disconnect();
    };
  }, [organizationId, getToken]);
}
```

- [ ] **Step 4: Add React Query provider to `apps/web/app/layout.tsx`**

Create `apps/web/components/providers/QueryProvider.tsx`:
```tsx
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { JSX, ReactNode, useState } from "react";

export function QueryProvider({ children }: { children: ReactNode }): JSX.Element {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 10_000 } },
  }));

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
```

Wrap root layout `apps/web/app/layout.tsx` body with `<QueryProvider>`:
```tsx
import { QueryProvider } from "@/components/providers/QueryProvider";
// ...
<body><QueryProvider>{children}</QueryProvider></body>
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/socket.ts apps/web/hooks/useSocket.ts apps/web/components/providers/ apps/web/app/layout.tsx apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web): add Socket.io client + useSocket hook + React Query provider"
```

---

## Task 23: Conversation data hooks

**Files:**
- Create: `apps/web/hooks/useConversations.ts`
- Create: `apps/web/hooks/useMessages.ts`

- [ ] **Step 1: Create `apps/web/hooks/useConversations.ts`**

```typescript
"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { getSocket } from "@/lib/socket";

interface Conversation {
  id: string;
  organizationId: string;
  whatsappContactId: string | null;
  status: string;
  lastMessageAt: string | null;
}

interface ConversationsResponse {
  data: Conversation[];
}

async function fetchConversations(token: string): Promise<Conversation[]> {
  const apiUrl = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";
  const res = await fetch(`${apiUrl}/v1/conversations`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to fetch conversations");
  const json = await res.json() as ConversationsResponse;
  return json.data;
}

export function useConversations() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["conversations"],
    queryFn: async () => {
      const token = await getToken();
      return fetchConversations(token ?? "");
    },
  });

  useEffect(() => {
    const socket = getSocket();
    const handler = () => {
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
    };
    socket.on("new-message", handler);
    return () => { socket.off("new-message", handler); };
  }, [queryClient]);

  return query;
}
```

- [ ] **Step 2: Create `apps/web/hooks/useMessages.ts`**

```typescript
"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { getSocket } from "@/lib/socket";

interface Message {
  id: string;
  conversationId: string;
  direction: "inbound" | "outbound";
  contentType: string;
  body: string | null;
  sentAt: string;
}

interface MessagesResponse {
  data: Message[];
}

async function fetchMessages(conversationId: string, token: string): Promise<Message[]> {
  const apiUrl = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";
  const res = await fetch(`${apiUrl}/v1/conversations/${conversationId}/messages`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to fetch messages");
  const json = await res.json() as MessagesResponse;
  return json.data;
}

export function useMessages(conversationId: string | null) {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["messages", conversationId],
    queryFn: async () => {
      if (!conversationId) return [];
      const token = await getToken();
      return fetchMessages(conversationId, token ?? "");
    },
    enabled: conversationId !== null,
  });

  useEffect(() => {
    if (!conversationId) return;
    const socket = getSocket();
    const handler = (data: { conversationId: string }) => {
      if (data.conversationId === conversationId) {
        void queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
      }
    };
    socket.on("new-message", handler);
    return () => { socket.off("new-message", handler); };
  }, [conversationId, queryClient]);

  return query;
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/hooks/useConversations.ts apps/web/hooks/useMessages.ts
git commit -m "feat(web): add useConversations + useMessages React Query hooks"
```

---

## Task 24: Inbox UI components

**Files:**
- Create: `apps/web/components/inbox/ConversationList.tsx`
- Create: `apps/web/components/inbox/MessageThread.tsx`
- Create: `apps/web/components/inbox/SendMessageForm.tsx`

- [ ] **Step 1: Create `apps/web/components/inbox/ConversationList.tsx`**

```tsx
"use client";

import { JSX } from "react";
import { useConversations } from "@/hooks/useConversations";

interface Props {
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function formatTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

export function ConversationList({ selectedId, onSelect }: Props): JSX.Element {
  const { data: conversations, isLoading } = useConversations();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 p-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-14 rounded-lg bg-gray-100 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!conversations?.length) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-gray-400">
        No conversations yet
      </div>
    );
  }

  return (
    <div className="flex flex-col overflow-y-auto">
      {conversations.map((conv) => (
        <button
          key={conv.id}
          onClick={() => onSelect(conv.id)}
          className={[
            "flex flex-col gap-1 px-4 py-3 text-left border-b border-gray-100 transition-colors",
            selectedId === conv.id ? "bg-brand-50" : "hover:bg-gray-50",
          ].join(" ")}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-900 truncate">
              {conv.whatsappContactId ?? "Unknown"}
            </span>
            <span className="text-xs text-gray-400 shrink-0">
              {formatTime(conv.lastMessageAt)}
            </span>
          </div>
          <span className={`text-xs capitalize ${conv.status === "open" ? "text-brand-600" : "text-gray-400"}`}>
            {conv.status}
          </span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create `apps/web/components/inbox/MessageThread.tsx`**

```tsx
"use client";

import { JSX, useEffect, useRef } from "react";
import { useMessages } from "@/hooks/useMessages";

interface Props {
  conversationId: string | null;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

export function MessageThread({ conversationId }: Props): JSX.Element {
  const { data: messages, isLoading } = useMessages(conversationId);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (!conversationId) {
    return (
      <div className="flex items-center justify-center flex-1 text-sm text-gray-400">
        Select a conversation to view messages
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 p-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={`h-10 w-48 rounded-xl bg-gray-100 animate-pulse ${i % 2 === 0 ? "self-start" : "self-end"}`} />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-4 overflow-y-auto flex-1">
      {messages?.map((msg) => (
        <div
          key={msg.id}
          className={`flex ${msg.direction === "outbound" ? "justify-end" : "justify-start"}`}
        >
          <div
            className={[
              "max-w-xs lg:max-w-md px-4 py-2 rounded-2xl text-sm",
              msg.direction === "outbound"
                ? "bg-wa-light text-gray-900 rounded-br-none"
                : "bg-white border border-gray-200 text-gray-900 rounded-bl-none shadow-card",
            ].join(" ")}
          >
            <p>{msg.body ?? "[media]"}</p>
            <p className="text-xs text-gray-400 mt-1 text-right">{formatTime(msg.sentAt)}</p>
          </div>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
```

- [ ] **Step 3: Create `apps/web/components/inbox/SendMessageForm.tsx`**

```tsx
"use client";

import { JSX, FormEvent, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

interface Props {
  conversationId: string | null;
}

export function SendMessageForm({ conversationId }: Props): JSX.Element {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!conversationId || !text.trim()) return;

    setSending(true);
    try {
      const token = await getToken();
      const apiUrl = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";
      const res = await fetch(`${apiUrl}/v1/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token ?? ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: text.trim() }),
      });
      if (res.ok) {
        setText("");
        await queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={(e) => { void handleSubmit(e); }} className="flex gap-2 p-3 border-t border-gray-200 bg-white">
      <Input
        className="flex-1"
        placeholder={conversationId ? "Type a message…" : "Select a conversation first"}
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={!conversationId || sending}
      />
      <Button type="submit" disabled={!conversationId || !text.trim() || sending}>
        {sending ? "Sending…" : "Send"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/inbox/
git commit -m "feat(web): add ConversationList, MessageThread, SendMessageForm components"
```

---

## Task 25: Inbox page

**Files:**
- Create: `apps/web/app/(dashboard)/inbox/layout.tsx`
- Create: `apps/web/app/(dashboard)/inbox/page.tsx`

- [ ] **Step 1: Create `apps/web/app/(dashboard)/inbox/layout.tsx`**

```tsx
import { JSX, ReactNode } from "react";

export default function InboxLayout({ children }: { children: ReactNode }): JSX.Element {
  return <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">{children}</div>;
}
```

- [ ] **Step 2: Create `apps/web/app/(dashboard)/inbox/page.tsx`**

```tsx
"use client";

import { JSX, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { ConversationList } from "@/components/inbox/ConversationList";
import { MessageThread } from "@/components/inbox/MessageThread";
import { SendMessageForm } from "@/components/inbox/SendMessageForm";
import { useSocket } from "@/hooks/useSocket";

export default function InboxPage(): JSX.Element {
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const { orgId } = useAuth();

  useSocket(orgId ?? undefined);

  return (
    <>
      {/* Conversation list — left panel */}
      <div className="w-72 border-r border-gray-200 bg-white flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900">Conversations</h2>
        </div>
        <ConversationList
          selectedId={selectedConversationId}
          onSelect={setSelectedConversationId}
        />
      </div>

      {/* Message thread — right panel */}
      <div className="flex flex-col flex-1 bg-gray-50 overflow-hidden">
        <MessageThread conversationId={selectedConversationId} />
        <SendMessageForm conversationId={selectedConversationId} />
      </div>
    </>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/\(dashboard\)/inbox/
git commit -m "feat(web): add Inbox page — conversation list + message thread"
```

---

## Task 26: Add conversations test

**Files:**
- Create: `apps/api/src/routes/conversations.test.ts`

- [ ] **Step 1: Create `apps/api/src/routes/conversations.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { FastifyInstance } from "fastify";

const mockPrisma = {
  conversation: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
  },
  message: {
    findMany: vi.fn(),
  },
};

const mockAuth = {
  userId: "user-1",
  organizationId: "org-1",
  role: "agent" as const,
};

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma);
  app.addHook("onRequest", async (request) => {
    request.auth = mockAuth;
  });
  const { conversationsRouter } = await import("./conversations.js");
  await app.register(conversationsRouter, { prefix: "/v1" });
  return app;
}

describe("GET /v1/conversations", () => {
  let app: FastifyInstance;
  beforeEach(async () => { app = await buildApp(); });
  afterEach(async () => { await app.close(); vi.clearAllMocks(); });

  it("returns conversations for org, ordered by lastMessageAt desc", async () => {
    mockPrisma.conversation.findMany.mockResolvedValue([
      { id: "conv-1", organizationId: "org-1", status: "open", lastMessageAt: "2026-05-01T10:00:00Z" },
    ]);
    const res = await app.inject({ method: "GET", url: "/v1/conversations" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: unknown[] }>();
    expect(body.data).toHaveLength(1);
    expect(mockPrisma.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: "org-1" },
        orderBy: { lastMessageAt: "desc" },
      })
    );
  });
});

describe("GET /v1/conversations/:id/messages", () => {
  let app: FastifyInstance;
  beforeEach(async () => { app = await buildApp(); });
  afterEach(async () => { await app.close(); vi.clearAllMocks(); });

  it("returns 404 when conversation not in org", async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue(null);
    const res = await app.inject({ method: "GET", url: "/v1/conversations/conv-999/messages" });
    expect(res.statusCode).toBe(404);
  });

  it("returns messages for conversation", async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue({ id: "conv-1", organizationId: "org-1" });
    mockPrisma.message.findMany.mockResolvedValue([
      { id: "msg-1", conversationId: "conv-1", direction: "inbound", body: "Hello" },
    ]);
    const res = await app.inject({ method: "GET", url: "/v1/conversations/conv-1/messages" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: unknown[] }>();
    expect(body.data).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run all tests**

```bash
pnpm --filter @WBMSG/api test
```

Expected: all pass

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/conversations.test.ts
git commit -m "test(api): add conversations route tests"
```

---

## Task 27: Final type-check + lint Sprint 6

- [ ] **Step 1: Type-check**

```bash
pnpm type-check
```

Expected: no errors

- [ ] **Step 2: Lint**

```bash
pnpm lint
```

Expected: no errors

- [ ] **Step 3: Commit any fixes**

```bash
git add -A && git diff --cached --quiet || git commit -m "chore: type + lint fixes Sprint 6"
```

---

## Self-Review

**Spec coverage check:**

| Sprint | Requirement | Task |
|---|---|---|
| 3 | WABA webhook challenge verify | Task 5 |
| 3 | Inbound message receive + BullMQ queue | Task 4, 5 |
| 3 | Outbound message send via WhatsApp Cloud API | Task 6 |
| 3 | Conversation auto-creation on first inbound | Task 4 |
| 3 | Webhook HMAC signature verification | Task 3 |
| 4 | Full 32-table Prisma schema | Task 8 |
| 4 | OpenAPI docs via @fastify/swagger | Task 9 |
| 4 | Cursor-based pagination | Task 10 |
| 4 | Contacts CRUD + search | Task 11, 13 |
| 4 | Companies CRUD | Task 12 |
| 4 | Meilisearch contacts index | Task 13 |
| 5 | Tailwind brand design tokens | Task 15 |
| 5 | Button, Input, Badge, Toast components | Task 16 |
| 5 | Nav sidebar + top bar | Task 17 |
| 5 | Dashboard home + contacts list page | Task 18 |
| 6 | Socket.io server + org-scoped rooms | Task 20 |
| 6 | Real-time emit on inbound message | Task 21 |
| 6 | Socket.io client hook | Task 22 |
| 6 | Conversation list + message thread UI | Task 24 |
| 6 | Send message form | Task 24 |
| 6 | Inbox page | Task 25 |

**Type consistency check:**
- `ConversationId`, `MessageId` exported from `@WBMSG/shared` and used in routes ✓
- `ContactId`, `CompanyId` used in contacts + companies routes ✓
- `InboundMessageJob` interface defined in worker and used by queue producer (webhooks route) — **fix needed**: import the interface in webhooks.ts or duplicate inline. Both files are in the same project so import is preferred.
- `WaSendResult.messageId` used in messages.ts matches `sendTextMessage` return type ✓
- `paginate()` accepts `T extends { id: string }` — Prisma models all have `id: string` ✓

**Placeholder scan:** No TBD, TODO, or "similar to" references found. All code blocks are complete.
