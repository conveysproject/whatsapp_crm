# Cycle 3 — Bot Automation Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bot flows and auto-replies fully match WhatsJet's capabilities — duplicate auto-replies in one click, preview what a bot would send to a specific contact, manually trigger a chatbot reply from the inbox (WhatsJet "quick-send" mode), and startTrigger keyword activation on chatbots.

**Architecture:** Extend existing `auto-replies.ts` / `chatbots.ts` / `flows.ts` route files with new endpoints. The `startTrigger` field was already added in Cycle 1's Prisma schema. All routes follow the existing `FastifyPluginAsync` pattern with `request.auth.organizationId`. The inbox bot panel is a React component that fetches applicable active bots for the current contact.

**Tech Stack:** Prisma (PostgreSQL), Fastify 4 ESM, Vitest, Next.js 15 App Router, Tailwind, React Query

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Modify | `apps/api/src/routes/auto-replies.ts` | Add duplicate endpoint |
| Modify | `apps/api/src/routes/auto-replies.test.ts` | Test for duplicate |
| Modify | `apps/api/src/routes/chatbots.ts` | Add active-for/:contactId and quick-send endpoints |
| Modify | `apps/api/src/routes/chatbots.test.ts` | Tests |
| Modify | `apps/api/src/routes/flows.ts` | Add preview endpoint |
| Modify | `apps/api/src/routes/flows.test.ts` | Test for preview |
| Create | `apps/web/components/bot-panel.tsx` | Applicable bots panel for inbox |
| Modify | `apps/web/app/(dashboard)/inbox/page.tsx` | Add BotPanel to conversation sidebar |
| Modify | `apps/web/app/(dashboard)/flows/page.tsx` | Add Duplicate button per auto-reply row |
| Modify | `apps/web/app/(dashboard)/flows/[id]/builder/page.tsx` | Add Preview button |

---

## Task 1: Auto-Reply Duplicate Endpoint

**Files:**
- Modify: `apps/api/src/routes/auto-replies.ts`
- Modify: `apps/api/src/routes/auto-replies.test.ts`

- [ ] **Step 1: Write failing test** — add to `auto-replies.test.ts`:

```typescript
describe("POST /v1/auto-replies/:id/duplicate", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("creates a copy of the auto-reply with 'Copy of' prefix", async () => {
    const original = {
      id: "ar-1",
      organizationId: "org-1",
      name: "Welcome Bot",
      triggerType: "keyword",
      triggerKeyword: "hi",
      replyText: "Hello! Welcome.",
      replyData: null,
      flowId: null,
      priorityIndex: 1,
      isActive: true,
    };
    mockPrisma.autoReply = {
      findFirst: vi.fn().mockResolvedValue(original),
      create: vi.fn().mockResolvedValue({ ...original, id: "ar-2", name: "Copy of Welcome Bot" }),
    };
    const res = await app.inject({ method: "POST", url: "/v1/auto-replies/ar-1/duplicate" });
    expect(res.statusCode).toBe(201);
    expect(res.json<{ data: { name: string } }>().data.name).toBe("Copy of Welcome Bot");
    expect(mockPrisma.autoReply.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: "Copy of Welcome Bot" }),
      })
    );
  });

  it("returns 404 when auto-reply not found in org", async () => {
    mockPrisma.autoReply = { findFirst: vi.fn().mockResolvedValue(null) };
    const res = await app.inject({ method: "POST", url: "/v1/auto-replies/bad-id/duplicate" });
    expect(res.statusCode).toBe(404);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm --filter @WBMSG/api test auto-replies
```

Expected: failure for `duplicate` route not found

- [ ] **Step 3: Add route to auto-replies.ts**

At the bottom of the `autoRepliesRouter` function in `apps/api/src/routes/auto-replies.ts`, add:

```typescript
  fastify.post<{ Params: { id: string } }>("/auto-replies/:id/duplicate", async (request, reply) => {
    const { organizationId } = request.auth;
    const original = await fastify.prisma.autoReply.findFirst({
      where: { id: request.params.id, organizationId },
    });
    if (!original) return reply.status(404).send({ error: "Not found" });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, createdAt, updatedAt, ...fields } = original;
    const data = await fastify.prisma.autoReply.create({
      data: {
        ...fields,
        name: `Copy of ${original.name}`,
        isActive: false,
      },
    });
    return reply.status(201).send({ data });
  });
```

- [ ] **Step 4: Run test — expect PASS**

```bash
pnpm --filter @WBMSG/api test auto-replies
```

Expected: `✓ all tests pass`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/auto-replies.ts apps/api/src/routes/auto-replies.test.ts
git commit -m "feat(api): auto-reply duplicate endpoint"
```

---

## Task 2: Flow Preview Endpoint

**Files:**
- Modify: `apps/api/src/routes/flows.ts`
- Modify: `apps/api/src/routes/flows.test.ts`

- [ ] **Step 1: Write failing test** — add to `flows.test.ts`:

```typescript
describe("GET /v1/auto-replies/:id/preview/:contactId", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns the first message the bot would send to the contact", async () => {
    mockPrisma.autoReply = {
      findFirst: vi.fn().mockResolvedValue({
        id: "ar-1",
        organizationId: "org-1",
        replyText: "Hello {{first_name}}!",
        replyData: null,
      }),
    };
    mockPrisma.contact = {
      findFirst: vi.fn().mockResolvedValue({ id: "c-1", organizationId: "org-1", firstName: "Priya", lastName: "Shah" }),
    };
    const res = await app.inject({ method: "GET", url: "/v1/auto-replies/ar-1/preview/c-1" });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: { preview: string } }>().data.preview).toBe("Hello Priya!");
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm --filter @WBMSG/api test flows
```

Expected: failure for `preview` route not found

- [ ] **Step 3: Add route to flows.ts (or auto-replies.ts)**

Add inside the flows router or auto-replies router in `apps/api/src/routes/auto-replies.ts`:

```typescript
  fastify.get<{ Params: { id: string; contactId: string } }>(
    "/auto-replies/:id/preview/:contactId",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const [autoReply, contact] = await Promise.all([
        fastify.prisma.autoReply.findFirst({ where: { id: request.params.id, organizationId } }),
        fastify.prisma.contact.findFirst({ where: { id: request.params.contactId, organizationId } }),
      ]);
      if (!autoReply) return reply.status(404).send({ error: "Auto-reply not found" });
      if (!contact) return reply.status(404).send({ error: "Contact not found" });

      const preview = (autoReply.replyText ?? "")
        .replace(/\{\{first_name\}\}/g, contact.firstName ?? "")
        .replace(/\{\{last_name\}\}/g, contact.lastName ?? "")
        .replace(/\{\{phone\}\}/g, contact.phone ?? "")
        .trim();

      return reply.send({ data: { preview, autoReply } });
    }
  );
```

- [ ] **Step 4: Run test — expect PASS**

```bash
pnpm --filter @WBMSG/api test auto-replies
```

Expected: `✓ all tests pass`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/auto-replies.ts apps/api/src/routes/auto-replies.test.ts
git commit -m "feat(api): auto-reply preview endpoint with contact variable substitution"
```

---

## Task 3: Chatbot Active-For and Quick-Send Endpoints

**Files:**
- Modify: `apps/api/src/routes/chatbots.ts`
- Modify: `apps/api/src/routes/chatbots.test.ts`

- [ ] **Step 1: Write failing tests** — add to `chatbots.test.ts`:

```typescript
describe("GET /v1/chatbots/active-for/:contactId", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns all active chatbots not blocked by contact settings", async () => {
    mockPrisma.contact = {
      findFirst: vi.fn().mockResolvedValue({ id: "c-1", organizationId: "org-1", disableBot: false }),
    };
    mockPrisma.chatbot = {
      findMany: vi.fn().mockResolvedValue([
        { id: "cb-1", name: "Product FAQ", isActive: true, startTrigger: "product" },
        { id: "cb-2", name: "Support Bot", isActive: true, startTrigger: null },
      ]),
    };
    const res = await app.inject({ method: "GET", url: "/v1/chatbots/active-for/c-1" });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: unknown[] }>().data).toHaveLength(2);
  });

  it("returns empty array when contact has bot disabled", async () => {
    mockPrisma.contact = {
      findFirst: vi.fn().mockResolvedValue({ id: "c-1", organizationId: "org-1", disableBot: true }),
    };
    const res = await app.inject({ method: "GET", url: "/v1/chatbots/active-for/c-1" });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: unknown[] }>().data).toHaveLength(0);
  });
});

describe("POST /v1/chatbots/:id/quick-send/:contactId", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("triggers a chatbot reply to the contact", async () => {
    mockPrisma.chatbot = {
      findFirst: vi.fn().mockResolvedValue({ id: "cb-1", organizationId: "org-1", flowId: "flow-1" }),
    };
    mockPrisma.contact = {
      findFirst: vi.fn().mockResolvedValue({ id: "c-1", organizationId: "org-1", phone: "+919000000001" }),
    };
    mockPrisma.botSession = {
      upsert: vi.fn().mockResolvedValue({ id: "bs-1" }),
    };
    const res = await app.inject({ method: "POST", url: "/v1/chatbots/cb-1/quick-send/c-1" });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.botSession.upsert).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
pnpm --filter @WBMSG/api test chatbots
```

Expected: failures for `active-for` and `quick-send` routes

- [ ] **Step 3: Add routes to chatbots.ts**

At the bottom of the `chatbotsRouter` function in `apps/api/src/routes/chatbots.ts`, add:

```typescript
  // ── Active chatbots for a contact ────────────────────────────────────────
  fastify.get<{ Params: { contactId: string } }>(
    "/chatbots/active-for/:contactId",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const contact = await fastify.prisma.contact.findFirst({
        where: { id: request.params.contactId, organizationId },
      });
      if (!contact) return reply.status(404).send({ error: "Contact not found" });

      if (contact.disableBot) return reply.send({ data: [] });

      const data = await fastify.prisma.chatbot.findMany({
        where: { organizationId, isActive: true },
        select: { id: true, name: true, startTrigger: true, description: true },
      });
      return reply.send({ data });
    }
  );

  // ── Quick-send: manually trigger a chatbot for a contact ─────────────────
  fastify.post<{ Params: { id: string; contactId: string } }>(
    "/chatbots/:id/quick-send/:contactId",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const [chatbot, contact] = await Promise.all([
        fastify.prisma.chatbot.findFirst({ where: { id: request.params.id, organizationId } }),
        fastify.prisma.contact.findFirst({ where: { id: request.params.contactId, organizationId } }),
      ]);
      if (!chatbot) return reply.status(404).send({ error: "Chatbot not found" });
      if (!contact) return reply.status(404).send({ error: "Contact not found" });

      // Start or reset a bot session for this contact
      const session = await fastify.prisma.botSession.upsert({
        where: { chatbotId_contactId: { chatbotId: chatbot.id, contactId: contact.id } },
        create: {
          chatbotId: chatbot.id,
          contactId: contact.id,
          currentNodeId: "start",
          isActive: true,
          startedAt: new Date(),
        },
        update: {
          currentNodeId: "start",
          isActive: true,
          startedAt: new Date(),
        },
      });

      return reply.send({ data: { session, message: "Bot session started — next inbound message will be processed by this bot" } });
    }
  );
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm --filter @WBMSG/api test chatbots
```

Expected: `✓ all tests pass`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/chatbots.ts apps/api/src/routes/chatbots.test.ts
git commit -m "feat(api): chatbot active-for-contact and quick-send endpoints"
```

---

## Task 4: Web — Flows Page Duplicate Button

**Files:**
- Modify: `apps/web/app/(dashboard)/flows/page.tsx`

- [ ] **Step 1: Add Duplicate button to each auto-reply row**

Find the auto-reply list in `apps/web/app/(dashboard)/flows/page.tsx`. Add after any existing action buttons:

```tsx
import { useMutation, useQueryClient } from "@tanstack/react-query";

// Inside the component:
const qc = useQueryClient();

const duplicate = useMutation({
  mutationFn: (id: string) =>
    fetch(`/api/v1/auto-replies/${id}/duplicate`, { method: "POST" }).then((r) => r.json()),
  onSuccess: () => qc.invalidateQueries({ queryKey: ["auto-replies"] }),
});

// In the row actions JSX, add:
<button
  onClick={() => duplicate.mutate(autoReply.id)}
  disabled={duplicate.isPending}
  className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 border rounded"
  title="Duplicate"
>
  Duplicate
</button>
```

- [ ] **Step 2: Type-check and commit**

```bash
pnpm type-check
git add apps/web/app/\(dashboard\)/flows/
git commit -m "feat(web): auto-reply duplicate button on flows page"
```

---

## Task 5: Web — Flow Builder Preview Button

**Files:**
- Modify: `apps/web/app/(dashboard)/flows/[id]/builder/page.tsx`

- [ ] **Step 1: Add Preview button to flow builder toolbar**

Find the toolbar in `apps/web/app/(dashboard)/flows/[id]/builder/page.tsx`. Add:

```tsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

// Inside the component:
const [previewContactId, setPreviewContactId] = useState("");
const [showPreview, setShowPreview] = useState(false);

const { data: previewData } = useQuery({
  queryKey: ["auto-reply-preview", autoReplyId, previewContactId],
  queryFn: () => fetch(`/api/v1/auto-replies/${autoReplyId}/preview/${previewContactId}`).then((r) => r.json()),
  enabled: !!previewContactId && showPreview,
});

// In the toolbar JSX:
<div className="flex items-center gap-2">
  <input
    className="border rounded px-2 py-1 text-sm w-48"
    placeholder="Contact ID to preview..."
    value={previewContactId}
    onChange={(e) => setPreviewContactId(e.target.value)}
  />
  <button
    onClick={() => setShowPreview(true)}
    disabled={!previewContactId}
    className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50 disabled:opacity-50"
  >
    Preview
  </button>
</div>

{showPreview && previewData?.data && (
  <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowPreview(false)}>
    <div className="bg-white rounded-lg p-6 max-w-md w-full space-y-4" onClick={(e) => e.stopPropagation()}>
      <h3 className="font-semibold">Bot Preview</h3>
      <div className="bg-green-50 border border-green-200 rounded p-3 text-sm">
        {previewData.data.preview}
      </div>
      <button onClick={() => setShowPreview(false)} className="text-sm text-gray-500 hover:text-gray-700">Close</button>
    </div>
  </div>
)}
```

- [ ] **Step 2: Type-check and commit**

```bash
pnpm type-check
git add apps/web/app/\(dashboard\)/flows/
git commit -m "feat(web): flow builder preview button with contact variable substitution"
```

---

## Task 6: Web — Bot Panel in Inbox

**Files:**
- Create: `apps/web/components/bot-panel.tsx`
- Modify: `apps/web/app/(dashboard)/inbox/page.tsx`

- [ ] **Step 1: Create the BotPanel component**

```tsx
// apps/web/components/bot-panel.tsx
"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface Chatbot {
  id: string;
  name: string;
  startTrigger: string | null;
  description: string | null;
}

interface Props {
  contactId: string;
  conversationId: string;
}

export function BotPanel({ contactId, conversationId }: Props) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);

  const { data } = useQuery<{ data: Chatbot[] }>({
    queryKey: ["active-bots", contactId],
    queryFn: () => fetch(`/api/v1/chatbots/active-for/${contactId}`).then((r) => r.json()),
    enabled: expanded,
  });

  const quickSend = useMutation({
    mutationFn: (chatbotId: string) =>
      fetch(`/api/v1/chatbots/${chatbotId}/quick-send/${contactId}`, { method: "POST" }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["messages", conversationId] });
    },
  });

  const bots = data?.data ?? [];

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 text-sm font-medium"
      >
        <span>Bot Automations</span>
        <span className="text-gray-400">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="p-3 space-y-2">
          {bots.length === 0 && (
            <p className="text-xs text-gray-400">No active bots for this contact.</p>
          )}
          {bots.map((bot) => (
            <div key={bot.id} className="flex items-center justify-between border rounded p-2">
              <div>
                <p className="text-sm font-medium">{bot.name}</p>
                {bot.startTrigger && (
                  <p className="text-xs text-gray-500">Trigger: <code className="bg-gray-100 px-1 rounded">{bot.startTrigger}</code></p>
                )}
              </div>
              <button
                onClick={() => quickSend.mutate(bot.id)}
                disabled={quickSend.isPending}
                className="text-xs px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
              >
                Send
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add BotPanel to inbox conversation sidebar**

Find the conversation sidebar/panel in `apps/web/app/(dashboard)/inbox/page.tsx`. Add:

```tsx
import { BotPanel } from "@/components/bot-panel";

// In the sidebar JSX, after any contact info section:
{selectedConversation && (
  <BotPanel
    contactId={selectedConversation.contactId}
    conversationId={selectedConversation.id}
  />
)}
```

- [ ] **Step 3: Type-check and commit**

```bash
pnpm type-check
git add apps/web/components/bot-panel.tsx apps/web/app/\(dashboard\)/inbox/
git commit -m "feat(web): bot panel in inbox — list active bots for contact, manual trigger"
```

---

## Task 7: Full test run + type-check

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
git commit -m "feat(cycle3): Bot Automation Parity — duplicate, preview, quick-send, bot panel in inbox"
```

---

## Cycle 3 Acceptance Criteria

- [ ] Agent in inbox sees "Bot Automations" panel; expands it to see "Product FAQ (trigger: product)" and "Support Bot"; clicks "Send" — bot session starts
- [ ] Auto-reply with `startTrigger = "price"` activates when contact sends message containing "price"
- [ ] Duplicate auto-reply creates "Copy of [original name]" in inactive state
- [ ] Flow builder preview button shows rendered message with `{{first_name}}` substituted for the chosen contact
- [ ] All API tests pass: `pnpm --filter @WBMSG/api test`
