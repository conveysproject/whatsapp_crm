# Inbox Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the inbox into a WhatsApp-style 3-column CRM inbox with date separators, full-text search, message previews, status management, and a contact detail panel — while fixing the double-scroll and scroll-to-bottom bugs.

**Architecture:** API gains a search endpoint and includes `lastMessage` in the conversations list response. The web inbox is restructured into focused components: `ConversationHeader` (extracted from page.tsx), `ContactPanel` (new right sidebar), with BotPanel and CannedResponsePicker absorbed into `SendMessageForm`. `InboxPage` orchestrates layout state.

**Tech Stack:** Fastify 4 + Prisma 7 (API) · Next.js 15 App Router + React Query + Tailwind CSS (Web) · Vitest (API tests)

## Global Constraints

- All Prisma queries must include `organizationId` in `where` — never query cross-org
- API is ESM-only — use `.js` extensions in imports even for `.ts` source files
- No `console.log` in production — use `fastify.log` or `request.log`
- TypeScript strict mode — no `any`, no implicit returns
- Conventional commits: `feat(inbox):`, `fix(inbox):`, `test(inbox):`
- Status values on `Conversation` model: `open`, `pending`, `resolved`, `bot` (never "closed")
- Run `pnpm --filter @WBMSG/api test` after each API task and `pnpm lint` before committing

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `apps/api/src/routes/conversations.ts` | Modify | Add `lastMessage` include to list; add `GET /conversations/search` |
| `apps/api/src/routes/contacts.ts` | Modify | Add `notes` to `ContactPatchBody` + update handler |
| `apps/api/src/routes/conversations.test.ts` | Modify | Tests for new search endpoint + lastMessage shape |
| `apps/web/hooks/useConversations.ts` | Modify | Extend `Conversation` type with `lastMessage`; add `useSearchConversations` |
| `apps/web/hooks/useContactDetail.ts` | Create | Fetches full contact detail by id for ContactPanel |
| `apps/web/components/inbox/MessageThread.tsx` | Modify | Fix `min-h-0` scroll bug; add date separators; fix initial scroll |
| `apps/web/components/inbox/ConversationList.tsx` | Modify | Add search bar (debounced), message preview line, intent tag |
| `apps/web/components/inbox/ConversationHeader.tsx` | Create | Contact name, status dropdown, tag pills, ℹ️ toggle button |
| `apps/web/components/inbox/SendMessageForm.tsx` | Modify | Absorb CannedResponsePicker + SmartReplyPanel; add 🤖 BotPanel icon+popover |
| `apps/web/components/inbox/ContactPanel.tsx` | Create | Right sidebar: identity, tags, trust score, deals, notes, contact details |
| `apps/web/app/(dashboard)/inbox/page.tsx` | Modify | Wire `contactPanelOpen` state; use new components; remove old BotPanel row |

---

## Task 1: API — Add `lastMessage` to conversations list + `notes` to contact PATCH

**Files:**
- Modify: `apps/api/src/routes/conversations.ts` (lines 26–42)
- Modify: `apps/api/src/routes/contacts.ts` (lines 91–102 `ContactPatchBody`, lines 415–430 update handler)
- Modify: `apps/api/src/routes/conversations.test.ts`

**Interfaces:**
- Produces: each conversation in `GET /v1/conversations` now includes `lastMessage: { id, body, direction, contentType } | null`
- Produces: `PATCH /v1/contacts/:id` now accepts `notes?: string`

- [ ] **Step 1: Write failing test for lastMessage shape**

In `apps/api/src/routes/conversations.test.ts`, add after the existing `GET /v1/conversations` describe block:

```typescript
describe("GET /v1/conversations — lastMessage", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("includes lastMessage on each conversation", async () => {
    mockPrisma.conversation.findMany.mockResolvedValue([
      {
        id: "conv-1",
        organizationId: "org-1",
        status: "open",
        lastMessageAt: "2026-05-01T10:00:00Z",
        messages: [{ id: "msg-1", body: "Hello", direction: "inbound", contentType: "text" }],
        contact: null,
      },
    ]);
    const res = await app.inject({ method: "GET", url: "/v1/conversations" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: Array<{ lastMessage: { id: string; body: string } }> }>();
    expect(body.data[0]?.lastMessage).toMatchObject({ id: "msg-1", body: "Hello" });
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
pnpm --filter @WBMSG/api test -- --reporter=verbose conversations
```
Expected: FAIL — `lastMessage` is `undefined`

- [ ] **Step 3: Update the `findMany` include in `GET /v1/conversations`**

In `apps/api/src/routes/conversations.ts`, replace the `findMany` call (around line 26):

```typescript
const conversations = await fastify.prisma.conversation.findMany({
  where,
  include: {
    contact: { select: { id: true, firstName: true, lastName: true, phoneNumber: true, tags: true } },
    messages: { orderBy: { sentAt: "desc" }, take: 1, select: { id: true, body: true, direction: true, contentType: true } },
  },
  orderBy: { lastMessageAt: "desc" },
  skip: (pageNum - 1) * 50,
  take: 50,
});
```

Then update the `data` mapping (replace the existing map):

```typescript
const data = conversations.map((c) => ({
  ...c,
  contact: hidePhone && c.contact ? { ...c.contact, phoneNumber: maskPhone(c.contact.phoneNumber) } : c.contact,
  serviceWindowActive: c.lastInboundAt != null && now - c.lastInboundAt.getTime() < 86_400_000,
  lastMessage: c.messages[0] ?? null,
  messages: undefined,  // remove the array from response
}));
```

- [ ] **Step 4: Add `notes` to `ContactPatchBody` and handler**

In `apps/api/src/routes/contacts.ts`, add `notes?: string` to `ContactPatchBody` (around line 102):

```typescript
interface ContactPatchBody {
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  lifecycleStage?: string;
  tags?: string[];
  customFields?: Record<string, unknown>;
  countryId?: number | null;
  languageCode?: string | null;
  whatsappOptOut?: boolean;
  disableBot?: boolean;
  groupIds?: string[];
  notes?: string;
}
```

In the Prisma `contact.update` data block (around line 428), add before the closing `}`):

```typescript
...(request.body.notes !== undefined ? { notes: request.body.notes } : {}),
```

- [ ] **Step 5: Run tests and lint**

```bash
pnpm --filter @WBMSG/api test -- --reporter=verbose conversations
pnpm lint
```
Expected: all tests pass, no lint errors

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/conversations.ts apps/api/src/routes/contacts.ts apps/api/src/routes/conversations.test.ts
git commit -m "feat(inbox): include lastMessage in conversations list; add notes to contact PATCH"
```

---

## Task 2: API — Add `GET /v1/conversations/search` endpoint

**Files:**
- Modify: `apps/api/src/routes/conversations.ts`
- Modify: `apps/api/src/routes/conversations.test.ts`

**Interfaces:**
- Produces: `GET /v1/conversations/search?q=<term>` returns `{ data: Conversation[] }` (same shape as list, with `lastMessage`)
- Returns empty array if `q` is missing or under 2 characters

- [ ] **Step 1: Write failing tests**

Add to `apps/api/src/routes/conversations.test.ts`:

```typescript
describe("GET /v1/conversations/search", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns empty array when q is missing", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/conversations/search" });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: unknown[] }>().data).toHaveLength(0);
    expect(mockPrisma.conversation.findMany).not.toHaveBeenCalled();
  });

  it("returns empty array when q is under 2 chars", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/conversations/search?q=a" });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: unknown[] }>().data).toHaveLength(0);
  });

  it("calls findMany with OR filter and org scope when q is valid", async () => {
    mockPrisma.conversation.findMany.mockResolvedValue([]);
    const res = await app.inject({ method: "GET", url: "/v1/conversations/search?q=dev" });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: "org-1" }),
        take: 20,
      })
    );
  });

  it("returns conversations with lastMessage", async () => {
    mockPrisma.conversation.findMany.mockResolvedValue([
      {
        id: "conv-1", organizationId: "org-1", status: "open", lastMessageAt: null,
        messages: [{ id: "msg-1", body: "dev test", direction: "inbound", contentType: "text" }],
        contact: null,
      },
    ]);
    const res = await app.inject({ method: "GET", url: "/v1/conversations/search?q=dev" });
    const body = res.json<{ data: Array<{ lastMessage: { id: string } }> }>();
    expect(body.data[0]?.lastMessage?.id).toBe("msg-1");
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm --filter @WBMSG/api test -- --reporter=verbose conversations
```
Expected: FAIL — route not found (404)

- [ ] **Step 3: Implement the search route**

Add the following route to `apps/api/src/routes/conversations.ts`, **before** the `/conversations/:id/messages` route (important: more-specific routes must register before parameterised ones):

```typescript
// ── Full-text search across contact names and message bodies ───────────
fastify.get<{ Querystring: { q?: string } }>("/conversations/search", async (request, reply) => {
  const { organizationId, permissions } = request.auth;
  const q = request.query.q?.trim() ?? "";
  if (q.length < 2) return reply.send({ data: [] });

  const conversations = await fastify.prisma.conversation.findMany({
    where: {
      organizationId,
      OR: [
        { contact: { OR: [
          { firstName: { contains: q, mode: "insensitive" } },
          { lastName: { contains: q, mode: "insensitive" } },
        ]}},
        { messages: { some: { body: { contains: q, mode: "insensitive" } } } },
      ],
    },
    include: {
      contact: { select: { id: true, firstName: true, lastName: true, phoneNumber: true, tags: true } },
      messages: { orderBy: { sentAt: "desc" }, take: 1, select: { id: true, body: true, direction: true, contentType: true } },
    },
    orderBy: { lastMessageAt: "desc" },
    take: 20,
  });

  const hidePhone = permissions["hide_contact_phone_numbers"] === "allow";
  const now = Date.now();
  const data = conversations.map((c) => ({
    ...c,
    contact: hidePhone && c.contact ? { ...c.contact, phoneNumber: maskPhone(c.contact.phoneNumber) } : c.contact,
    serviceWindowActive: c.lastInboundAt != null && now - c.lastInboundAt.getTime() < 86_400_000,
    lastMessage: c.messages[0] ?? null,
    messages: undefined,
  }));
  return reply.send({ data });
});
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @WBMSG/api test -- --reporter=verbose conversations
pnpm lint
```
Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/conversations.ts apps/api/src/routes/conversations.test.ts
git commit -m "feat(inbox): add GET /conversations/search endpoint"
```

---

## Task 3: Web — Update `useConversations` type + create `useContactDetail` hook

**Files:**
- Modify: `apps/web/hooks/useConversations.ts`
- Create: `apps/web/hooks/useContactDetail.ts`

**Interfaces:**
- Produces: `Conversation.lastMessage: { id: string; body: string | null; direction: string; contentType: string | null } | null`
- Produces: `useSearchConversations(q: string): { data: Conversation[]; isLoading: boolean }`
- Produces: `useContactDetail(contactId: string | null)` returning full contact with `email`, `notes`, `createdAt`

- [ ] **Step 1: Extend `Conversation` interface and add search hook**

Replace the contents of `apps/web/hooks/useConversations.ts`:

```typescript
"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { getSocket } from "@/lib/socket";

export interface LastMessage {
  id: string;
  body: string | null;
  direction: string;
  contentType: string | null;
}

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
}

interface ConversationsResponse {
  data: Conversation[];
}

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

async function fetchConversations(token: string, status?: string): Promise<Conversation[]> {
  const params = new URLSearchParams();
  if (status && status !== "all") params.set("status", status);
  const res = await fetch(`${API_URL}/v1/conversations?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to fetch conversations");
  const json = await res.json() as ConversationsResponse;
  return json.data;
}

export function useConversations(status?: string) {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["conversations", status ?? "all"],
    queryFn: async () => {
      const token = await getToken();
      return fetchConversations(token ?? "", status);
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

export function useSearchConversations(q: string) {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ["conversations-search", q],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/conversations/search?q=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (!res.ok) throw new Error("Search failed");
      const json = await res.json() as ConversationsResponse;
      return json.data;
    },
    enabled: q.trim().length >= 2,
    staleTime: 10_000,
  });
}
```

- [ ] **Step 2: Create `useContactDetail` hook**

Create `apps/web/hooks/useContactDetail.ts`:

```typescript
"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";

export interface ContactDetail {
  id: string;
  firstName: string | null;
  lastName: string | null;
  phoneNumber: string;
  email: string | null;
  tags: string[];
  notes: string | null;
  createdAt: string;
}

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export function useContactDetail(contactId: string | null) {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ["contact-detail", contactId],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/contacts/${contactId}`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (!res.ok) throw new Error("Failed to fetch contact");
      const json = await res.json() as { data: ContactDetail };
      return json.data;
    },
    enabled: contactId != null,
    staleTime: 30_000,
  });
}
```

- [ ] **Step 3: Check types compile**

```bash
pnpm --filter @WBMSG/web type-check
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add apps/web/hooks/useConversations.ts apps/web/hooks/useContactDetail.ts
git commit -m "feat(inbox): extend Conversation type with lastMessage; add useSearchConversations and useContactDetail hooks"
```

---

## Task 4: Web — Fix MessageThread scroll + add date separators

**Files:**
- Modify: `apps/web/components/inbox/MessageThread.tsx`

**Interfaces:**
- Consumes: existing `useMessages` hook, existing `Message` shape
- Produces: same `MessageThread` component props, now with correct scroll behaviour and date dividers

- [ ] **Step 1: Add date separator helper**

At the top of `apps/web/components/inbox/MessageThread.tsx`, add after the existing `formatTime` function:

```typescript
function formatDateLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (sameDay(date, today)) return "Today";
  if (sameDay(date, yesterday)) return "Yesterday";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function DateSeparator({ label }: { label: string }): JSX.Element {
  return (
    <div className="flex items-center gap-3 my-3 px-2">
      <div className="flex-1 h-px bg-gray-200" />
      <span className="text-xs text-gray-400 font-medium shrink-0">{label}</span>
      <div className="flex-1 h-px bg-gray-200" />
    </div>
  );
}
```

- [ ] **Step 2: Fix scroll behaviour**

In the `MessageThread` component, replace the two scroll-related `useEffect` hooks with:

```typescript
const isFirstLoad = useRef(true);

// Scroll to bottom on initial load (instant) and on new message (smooth)
useEffect(() => {
  if (!bottomRef.current) return;
  bottomRef.current.scrollIntoView({ behavior: isFirstLoad.current ? "auto" : "smooth" });
  isFirstLoad.current = false;
}, [conversationId, lastMessageId]);
```

Also reset `isFirstLoad` when the conversation changes. Replace the existing `lastMessageId` line with:

```typescript
const lastMessageId = messages[messages.length - 1]?.id;

useEffect(() => {
  isFirstLoad.current = true;
}, [conversationId]);
```

- [ ] **Step 3: Fix the double-scroll — add `min-h-0`**

In `MessageThread`, change the outer scrollable div:

```typescript
// was: className="flex flex-col gap-2 p-4 overflow-y-auto flex-1"
// now:
<div ref={scrollRef} className="flex flex-col gap-2 p-4 overflow-y-auto flex-1 min-h-0">
```

Also add `shrink-0` imports reminder: in `apps/web/app/(dashboard)/inbox/page.tsx`, the bot indicator div already has no `shrink-0`. We will fix this in Task 9 when wiring the page.

- [ ] **Step 4: Insert date separators between message groups**

In the messages render block, replace the `.map` section:

```typescript
{messages.map((msg, idx) => {
  const prevMsg = messages[idx - 1];
  const showSeparator =
    !prevMsg ||
    new Date(msg.sentAt).toDateString() !== new Date(prevMsg.sentAt).toDateString();

  return (
    <div key={msg.id}>
      {showSeparator && <DateSeparator label={formatDateLabel(msg.sentAt)} />}
      <div className={`flex ${msg.direction === "outbound" ? "justify-end" : "justify-start"}`}>
        <div
          className={[
            "max-w-xs lg:max-w-md px-4 py-2 rounded-2xl text-sm",
            msg.direction === "outbound"
              ? "bg-wa-light text-gray-900 rounded-br-none"
              : "bg-white border border-gray-200 text-gray-900 rounded-bl-none shadow-card",
          ].join(" ")}
        >
          {msg.contentType === "audio" && msg.mediaUrl ? (
            <VoicePlayer mediaUrl={msg.mediaUrl} messageId={msg.id} />
          ) : msg.contentType === "template" && msg.body ? (
            <TemplateMessageBubble body={msg.body} />
          ) : msg.contentType === "interactive" ? (
            msg.body
              ? <InteractiveMessageBubble body={msg.body} />
              : <span className="text-xs text-gray-400 italic">Interactive message</span>
          ) : msg.mediaUrl != null && msg.contentType !== "text" ? (
            <MediaMessage mediaUrl={msg.mediaUrl} contentType={msg.contentType ?? "document"} />
          ) : (
            <>
              <p dangerouslySetInnerHTML={{ __html: msg.body ? formatWhatsAppText(msg.body) : "[media]" }} />
              {msg.direction === "inbound" && msg.body && (
                <IntentBadge messageId={msg.id} text={msg.body} direction={msg.direction} />
              )}
            </>
          )}
          <p className="text-xs text-gray-400 mt-1 text-right flex items-center justify-end gap-0.5">
            {formatTime(msg.sentAt)}
            {msg.direction === "outbound" && <MessageTicks status={msg.status} />}
          </p>
        </div>
      </div>
    </div>
  );
})}
```

- [ ] **Step 5: Type-check**

```bash
pnpm --filter @WBMSG/web type-check
```
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/inbox/MessageThread.tsx
git commit -m "fix(inbox): fix double-scroll with min-h-0; add date separators; fix scroll-to-bottom on load"
```

---

## Task 5: Web — Redesign ConversationList

**Files:**
- Modify: `apps/web/components/inbox/ConversationList.tsx`

**Interfaces:**
- Consumes: `useConversations` (from `@/hooks/useConversations`), `useSearchConversations` (same file), `IntentBadge` (from `@/components/intent-badge`)
- Props unchanged: `{ selectedId: string | null; onSelect: (id: string) => void }`

- [ ] **Step 1: Rewrite ConversationList**

Replace the full contents of `apps/web/components/inbox/ConversationList.tsx`:

```typescript
"use client";

import { JSX, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useConversations, useSearchConversations } from "@/hooks/useConversations";
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
  const { getToken } = useAuth();

  const isSearching = searchQuery.trim().length >= 2;
  const { data: conversations, isLoading: listLoading } = useConversations(
    isSearching ? undefined : (activeTab === "all" ? undefined : activeTab)
  );
  const { data: searchResults, isLoading: searchLoading } = useSearchConversations(searchQuery);

  const items = isSearching ? (searchResults ?? []) : (conversations ?? []);
  const isLoading = isSearching ? searchLoading : listLoading;

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

              {/* Row 3: intent tag (renders only if cached) */}
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

- [ ] **Step 2: Type-check**

```bash
pnpm --filter @WBMSG/web type-check
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/inbox/ConversationList.tsx
git commit -m "feat(inbox): add search bar, message preview, and intent tag to ConversationList"
```

---

## Task 6: Web — New ConversationHeader component

**Files:**
- Create: `apps/web/components/inbox/ConversationHeader.tsx`

**Interfaces:**
- Consumes: `Conversation` type from `@/hooks/useConversations`
- Props:
  ```typescript
  interface Props {
    conversation: Conversation;
    contact: { id: string; firstName: string | null; lastName: string | null; phoneNumber: string; tags: string[] } | null;
    contactName: string;
    onToggleContactPanel: () => void;
    onStatusChange: (status: string) => void;
  }
  ```

- [ ] **Step 1: Create ConversationHeader component**

Create `apps/web/components/inbox/ConversationHeader.tsx`:

```typescript
"use client";

import { JSX, useState, useRef, useEffect } from "react";
import type { Conversation } from "@/hooks/useConversations";

const STATUS_OPTIONS = [
  { value: "open", label: "Open", color: "text-green-600" },
  { value: "pending", label: "Pending", color: "text-amber-600" },
  { value: "resolved", label: "Resolved", color: "text-gray-400" },
] as const;

interface Props {
  conversation: Conversation;
  contact: { id: string; firstName: string | null; lastName: string | null; phoneNumber: string; tags: string[] } | null;
  contactName: string;
  onToggleContactPanel: () => void;
  onStatusChange: (status: string) => Promise<void>;
}

export function ConversationHeader({ conversation, contact, contactName, onToggleContactPanel, onStatusChange }: Props): JSX.Element {
  const [statusOpen, setStatusOpen] = useState(false);
  const [updating, setUpdating] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setStatusOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleStatusSelect(value: string) {
    setStatusOpen(false);
    setUpdating(true);
    try {
      await onStatusChange(value);
    } finally {
      setUpdating(false);
    }
  }

  const currentStatus = STATUS_OPTIONS.find((s) => s.value === conversation.status) ?? STATUS_OPTIONS[0];

  return (
    <div className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-gray-200 shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        {/* Avatar */}
        <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center shrink-0">
          <span className="text-xs font-semibold text-green-700">
            {(contactName)[0]?.toUpperCase() ?? "?"}
          </span>
        </div>

        {/* Name + status + tags */}
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{contactName}</p>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            {/* Status dropdown */}
            <div className="relative" ref={dropdownRef}>
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
          </div>
        </div>
      </div>

      {/* Action icons */}
      <div className="flex items-center gap-1 shrink-0">
        {/* Assign placeholder */}
        <button
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          title="Assign (coming soon)"
          disabled
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </button>

        {/* Toggle contact panel */}
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

- [ ] **Step 2: Type-check**

```bash
pnpm --filter @WBMSG/web type-check
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/inbox/ConversationHeader.tsx
git commit -m "feat(inbox): add ConversationHeader with status dropdown and contact panel toggle"
```

---

## Task 7: Web — Move BotPanel into SendMessageForm

**Files:**
- Modify: `apps/web/components/inbox/SendMessageForm.tsx`

**Interfaces:**
- Props unchanged: `{ conversationId, prefillText, onSent, onCreateDeal, contact }`
- BotPanel logic (fetch bots, quick-send) is absorbed inline — `BotPanel` component file is not deleted (it may be used elsewhere) but is no longer rendered in `InboxPage`
- CannedResponsePicker and SmartReplyPanel are now rendered inside `SendMessageForm` (props `conversationId` and `onSelect` are wired internally)

- [ ] **Step 1: Confirm CannedResponsePicker props (already verified)**

`CannedResponsePicker` accepts:
```typescript
interface Props {
  conversationId: string | null;
  onSelect: (content: string) => void;
  onSent?: () => void;
}
```
No changes needed to that component.

- [ ] **Step 2: Add bot popover state and fetch logic to SendMessageForm**

At the top of `SendMessageForm` (after existing state declarations), add:

```typescript
const [botPanelOpen, setBotPanelOpen] = useState(false);
const [bots, setBots] = useState<Array<{ id: string; name: string; startTrigger: string | null }>>([]);
const [botContactId, setBotContactId] = useState<string | null>(null);
const [sendingBot, setSendingBot] = useState<string | null>(null);
const botPanelRef = useRef<HTMLDivElement>(null);
```

Add a `useEffect` that fetches bots when `botPanelOpen` becomes true:

```typescript
useEffect(() => {
  if (!botPanelOpen || !conversationId) return;
  let cancelled = false;
  async function fetchBotData() {
    const token = await getToken();
    const api = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";
    const convRes = await fetch(`${api}/v1/conversations/${conversationId}`, {
      headers: { Authorization: `Bearer ${token ?? ""}` },
    });
    if (!convRes.ok || cancelled) return;
    const convBody = await convRes.json() as { data: { contactId: string | null } };
    const cid = convBody.data.contactId;
    if (!cid || cancelled) return;
    setBotContactId(cid);
    const botsRes = await fetch(`${api}/v1/chatbots/active-for/${cid}`, {
      headers: { Authorization: `Bearer ${token ?? ""}` },
    });
    if (!botsRes.ok || cancelled) return;
    const botsBody = await botsRes.json() as { data: Array<{ id: string; name: string; startTrigger: string | null }> };
    if (!cancelled) setBots(botsBody.data);
  }
  void fetchBotData();
  return () => { cancelled = true; };
}, [botPanelOpen, conversationId, getToken]);
```

Add click-outside handler for bot panel in the existing `handleClickOutside` `useEffect`:

```typescript
// Inside the existing handleClickOutside function, add:
if (botPanelRef.current && !botPanelRef.current.contains(e.target as Node)) {
  setBotPanelOpen(false);
}
```

Add bot send handler:

```typescript
async function handleBotSend(chatbotId: string) {
  if (!botContactId) return;
  setSendingBot(chatbotId);
  try {
    const token = await getToken();
    await fetch(
      `${process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000"}/v1/chatbots/${chatbotId}/quick-send/${botContactId}`,
      { method: "POST", headers: { Authorization: `Bearer ${token ?? ""}` } }
    );
  } finally {
    setSendingBot(null);
  }
}
```

- [ ] **Step 3: Add the 🤖 icon button + popover to the form JSX**

Add the bot icon button after the "Create Deal" button (before the slash command palette div), inside the `<form>`:

```typescript
{/* Bot Automations */}
<div className="relative" ref={botPanelRef}>
  <button
    type="button"
    onClick={() => { setBotPanelOpen((v) => !v); setAttachMenuOpen(false); setTemplateOpen(false); setInteractiveOpen(false); }}
    disabled={!conversationId}
    className={`p-2 rounded-lg transition-colors disabled:opacity-40 ${botPanelOpen ? "text-green-600 bg-green-50" : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"}`}
    title="Bot Automations"
  >
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  </button>
  {botPanelOpen && (
    <div className="absolute bottom-full left-0 mb-1 w-64 bg-white rounded-xl border border-gray-200 shadow-lg z-20 overflow-hidden">
      <p className="px-3 py-2 text-xs font-semibold text-gray-500 border-b border-gray-100">Bot Automations</p>
      <div className="p-2 flex flex-col gap-1.5 max-h-48 overflow-y-auto">
        {bots.length === 0 ? (
          <p className="text-xs text-gray-400 px-1 py-2">No active bots for this contact.</p>
        ) : bots.map((bot) => (
          <div key={bot.id} className="flex items-center justify-between gap-2 px-2 py-1.5 border border-gray-100 rounded-lg">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{bot.name}</p>
              {bot.startTrigger && (
                <p className="text-xs text-gray-400 truncate">Trigger: {bot.startTrigger}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => { void handleBotSend(bot.id); }}
              disabled={sendingBot === bot.id}
              className="text-xs px-2 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 shrink-0"
            >
              {sendingBot === bot.id ? "…" : "Send"}
            </button>
          </div>
        ))}
      </div>
    </div>
  )}
</div>
```

- [ ] **Step 4: Move CannedResponsePicker and SmartReplyPanel into the form**

Import them at the top of `SendMessageForm.tsx`:

```typescript
import { CannedResponsePicker } from "@/components/canned-response-picker";
import { SmartReplyPanel } from "@/components/smart-reply-panel";
```

Add a new state for smart reply prefill inside the form (since `onSelect` sets `prefillText` internally now):

In the form JSX, add a row **above the main form controls row** (inside the `<form>` but before the icon buttons):

```typescript
{/* Quick actions row: canned responses + AI replies */}
{conversationId && (
  <div className="flex items-center gap-2 px-1 pb-1">
    <CannedResponsePicker
      conversationId={conversationId}
      onSelect={(content) => {
        const substituted = content
          .replace(/\{\{first_name\}\}/g, contact?.firstName ?? "")
          .replace(/\{\{last_name\}\}/g, contact?.lastName ?? "");
        setText(substituted);
      }}
    />
    <SmartReplyPanel
      conversationId={conversationId}
      onSelect={(t) => setText(t)}
    />
  </div>
)}
```

- [ ] **Step 5: Update form className to `flex-col`**

The form now has two rows (quick actions + main controls). Change the form element:

```typescript
// was: className="flex items-center gap-2 p-3 border-t border-gray-200 bg-white"
// now:
<form onSubmit={(e) => { void handleSubmit(e); }} className="flex flex-col gap-1 p-3 border-t border-gray-200 bg-white shrink-0">
```

Add `shrink-0` to prevent flex-shrink in the parent column layout.

And wrap the existing icon buttons + input + send button in a second inner div:

```typescript
<div className="flex items-center gap-2">
  {/* ... all existing icon buttons, input, send button ... */}
</div>
```

- [ ] **Step 6: Type-check**

```bash
pnpm --filter @WBMSG/web type-check
```
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/inbox/SendMessageForm.tsx
git commit -m "feat(inbox): move BotPanel and CannedResponsePicker into SendMessageForm compose bar"
```

---

## Task 8: Web — New ContactPanel component

**Files:**
- Create: `apps/web/components/inbox/ContactPanel.tsx`

**Interfaces:**
- Consumes: `useContactDetail` from `@/hooks/useContactDetail`, `ContactTrustBadge` from `@/components/trust-score/ContactTrustBadge`, `CreateOfferModal` from `@/components/deals/CreateOfferModal`
- Props:
  ```typescript
  interface Props {
    contactId: string;
    contactName: string;
    conversationStatus: string;
    lastMessageAt: string | null;
    onCreateDeal: () => void;
    onClose: () => void;
  }
  ```

- [ ] **Step 1: Create ContactPanel**

Create `apps/web/components/inbox/ContactPanel.tsx`:

```typescript
"use client";

import { JSX, useState, useEffect, useRef } from "react";
import { useAuth } from "@clerk/nextjs";
import { useContactDetail } from "@/hooks/useContactDetail";
import { ContactTrustBadge } from "@/components/trust-score/ContactTrustBadge";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface Props {
  contactId: string;
  contactName: string;
  conversationStatus: string;
  lastMessageAt: string | null;
  onCreateDeal: () => void;
  onClose: () => void;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function ContactPanel({ contactId, contactName, conversationStatus, lastMessageAt, onCreateDeal, onClose }: Props): JSX.Element {
  const { data: contact, isLoading } = useContactDetail(contactId);
  const { getToken } = useAuth();
  const [notes, setNotes] = useState<string>("");
  const [notesSaved, setNotesSaved] = useState(false);
  const savedNotesRef = useRef<string>("");

  // Initialise notes once contact loads (useEffect avoids render-time setState)
  useEffect(() => {
    if (contact) {
      setNotes(contact.notes ?? "");
      savedNotesRef.current = contact.notes ?? "";
    }
  }, [contact?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleNotesBlur() {
    if (notes === savedNotesRef.current) return;
    try {
      const token = await getToken();
      await fetch(`${API_URL}/v1/contacts/${contactId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 2000);
    } catch { /* non-critical */ }
  }

  const initials = contactName.split(" ").map((w) => w[0]?.toUpperCase() ?? "").slice(0, 2).join("");

  return (
    <div className="w-80 border-l border-gray-200 bg-white flex flex-col overflow-y-auto shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 shrink-0">
        <h3 className="text-sm font-semibold text-gray-900">Contact Details</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-3 p-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-8 rounded bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-gray-100 overflow-y-auto">
          {/* Identity */}
          <div className="px-4 py-4 flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
              <span className="text-sm font-bold text-green-700">{initials || "?"}</span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{contactName}</p>
              <p className="text-xs text-gray-500 mt-0.5">+{contact?.phoneNumber ?? "—"}</p>
              {contact?.email && (
                <p className="text-xs text-gray-500 truncate">{contact.email}</p>
              )}
            </div>
          </div>

          {/* Tags */}
          <div className="px-4 py-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Tags</p>
            {contact?.tags && contact.tags.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {contact.tags.map((tag) => (
                  <span key={tag} className="inline-flex items-center h-5 px-2 rounded-full text-[11px] font-medium bg-gray-100 text-gray-600">{tag}</span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400">No tags</p>
            )}
          </div>

          {/* Trust Score */}
          <div className="px-4 py-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Trust Score</p>
            <ContactTrustBadge contactId={contactId} />
          </div>

          {/* Deals */}
          <div className="px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Deals</p>
              <button
                onClick={onCreateDeal}
                className="text-xs text-brand-600 hover:text-brand-700 font-medium"
              >
                + Create
              </button>
            </div>
            <p className="text-xs text-gray-400">No deals yet</p>
          </div>

          {/* Notes */}
          <div className="px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Notes</p>
              {notesSaved && <span className="text-xs text-green-600">Saved</span>}
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => { void handleNotesBlur(); }}
              placeholder="Add a note…"
              rows={3}
              className="w-full text-xs text-gray-700 border border-gray-200 rounded-lg px-2.5 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
          </div>

          {/* Contact details */}
          <div className="px-4 py-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Details</p>
            <dl className="flex flex-col gap-1.5">
              <div className="flex justify-between">
                <dt className="text-xs text-gray-400">First contact</dt>
                <dd className="text-xs text-gray-700">{formatDate(contact?.createdAt)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-xs text-gray-400">Last message</dt>
                <dd className="text-xs text-gray-700">{formatDate(lastMessageAt)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-xs text-gray-400">Status</dt>
                <dd className="text-xs text-gray-700 capitalize">{conversationStatus}</dd>
              </div>
            </dl>
          </div>
        </div>
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
git add apps/web/components/inbox/ContactPanel.tsx apps/web/hooks/useContactDetail.ts
git commit -m "feat(inbox): add ContactPanel right sidebar with contact details, trust score, notes, deals"
```

---

## Task 9: Web — Wire InboxPage

**Files:**
- Modify: `apps/web/app/(dashboard)/inbox/page.tsx`

**Interfaces:**
- Consumes: `ConversationHeader`, `ContactPanel` (new), `SendMessageForm` (updated), `MessageThread` (updated), `ConversationList` (updated)
- Removes: standalone `CannedResponsePicker` row, standalone `BotPanel`, old inline conversation header

- [ ] **Step 1: Rewrite InboxPage**

Replace the full contents of `apps/web/app/(dashboard)/inbox/page.tsx`:

```typescript
"use client";

import { JSX, useState, useCallback } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQueryClient } from "@tanstack/react-query";
import { ConversationList } from "@/components/inbox/ConversationList";
import { MessageThread } from "@/components/inbox/MessageThread";
import { SendMessageForm } from "@/components/inbox/SendMessageForm";
import { ConversationHeader } from "@/components/inbox/ConversationHeader";
import { ContactPanel } from "@/components/inbox/ContactPanel";
import { WhatsAppGate } from "@/components/WhatsAppGate";
import { useBotStatus } from "@/hooks/useBotStatus";
import { useConversations } from "@/hooks/useConversations";
import { CreateOfferModal } from "@/components/deals/CreateOfferModal";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export default function InboxPage(): JSX.Element {
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [prefillText, setPrefillText] = useState("");
  const [showOffer, setShowOffer] = useState(false);
  const [contactPanelOpen, setContactPanelOpen] = useState(false);

  const botActive = useBotStatus(selectedConversationId);
  const { data: conversations } = useConversations();
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  const selectedConversation = selectedConversationId
    ? conversations?.find((c) => c.id === selectedConversationId) ?? null
    : null;

  const contact = selectedConversation?.contact ?? null;
  const contactName = contact
    ? [contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.phoneNumber
    : null;

  const handleStatusChange = useCallback(async (status: string) => {
    if (!selectedConversationId) return;
    const token = await getToken();
    await fetch(`${API_URL}/v1/conversations/${selectedConversationId}/status`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await queryClient.invalidateQueries({ queryKey: ["conversations"] });
  }, [selectedConversationId, getToken, queryClient]);

  return (
    <WhatsAppGate feature="Inbox">
      {/* Conversation sidebar */}
      <div className="w-72 border-r border-gray-200 bg-white flex flex-col overflow-hidden shrink-0">
        <div className="px-4 py-3 border-b border-gray-200 shrink-0">
          <h2 className="text-sm font-semibold text-gray-900">Conversations</h2>
        </div>
        <ConversationList
          selectedId={selectedConversationId}
          onSelect={setSelectedConversationId}
        />
      </div>

      {/* Main message panel */}
      <div className="flex flex-col flex-1 bg-gray-50 overflow-hidden min-w-0">
        {/* Conversation header */}
        {selectedConversation && contact && contactName ? (
          <ConversationHeader
            conversation={selectedConversation}
            contact={contact}
            contactName={contactName}
            onToggleContactPanel={() => setContactPanelOpen((v) => !v)}
            onStatusChange={handleStatusChange}
          />
        ) : selectedConversation && (
          <div className="px-4 py-2.5 bg-white border-b border-gray-200 shrink-0">
            <p className="text-sm font-medium text-gray-500">Unknown contact</p>
          </div>
        )}

        <MessageThread conversationId={selectedConversationId} />

        {/* Bot responding indicator */}
        {botActive && (
          <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-t border-amber-200 text-amber-700 text-xs shrink-0">
            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Bot is responding…
          </div>
        )}

        <SendMessageForm
          conversationId={selectedConversationId}
          prefillText={prefillText}
          onSent={() => setPrefillText("")}
          onCreateDeal={contact ? () => setShowOffer(true) : undefined}
          contact={contact}
        />
      </div>

      {/* Contact detail panel */}
      {contactPanelOpen && contact && contactName && selectedConversation && (
        <ContactPanel
          contactId={contact.id}
          contactName={contactName}
          conversationStatus={selectedConversation.status}
          lastMessageAt={selectedConversation.lastMessageAt}
          onCreateDeal={() => setShowOffer(true)}
          onClose={() => setContactPanelOpen(false)}
        />
      )}

      {/* Create deal modal */}
      {showOffer && contact && (
        <CreateOfferModal
          contactId={contact.id}
          contactName={contactName ?? ""}
          onClose={() => setShowOffer(false)}
          onCreated={() => setShowOffer(false)}
        />
      )}
    </WhatsAppGate>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm --filter @WBMSG/web type-check
```
Expected: no errors

- [ ] **Step 3: Lint**

```bash
pnpm lint
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/(dashboard)/inbox/page.tsx
git commit -m "feat(inbox): wire 3-column layout — ConversationHeader, ContactPanel, fixed compose bar"
```

---

## Verification Checklist

After all tasks complete, verify these manually in the browser at `http://localhost:3000/inbox`:

- [ ] No double scrollbar — only the message thread scrolls
- [ ] Opening a conversation scrolls to the latest message instantly
- [ ] New messages arriving scroll smoothly to bottom
- [ ] Date separators appear between message groups (Today / Yesterday / date)
- [ ] Conversation list shows last message preview text
- [ ] Typing 2+ characters in search filters conversations from API
- [ ] Clearing search restores the tab list
- [ ] Clicking the status label ("Open ▾") shows a dropdown with Open/Pending/Resolved
- [ ] Clicking ℹ️ opens the contact panel on the right
- [ ] Contact panel shows name, phone, tags, trust score, notes textarea
- [ ] Editing notes and blurring the textarea saves (shows "Saved" briefly)
- [ ] 🤖 icon in compose bar opens bot popover
- [ ] AI Replies and canned response picker are inside the compose bar
- [ ] "Bot Automations" accordion is gone from below the send bar
