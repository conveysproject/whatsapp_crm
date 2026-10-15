# Mobile Plan 3: Inbox, Chat and Contact Details Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the agent's main loop in the mobile app — the Inbox tab, the Chat screen (read, reply, smart replies, canned responses, templates, attachments, status/assign/label), and Contact Details — on top of the Plan 2 foundation, using only features that exist in the system today.

**Architecture:** One small API addition (`GET /v1/conversations/:id`, same shape as a list item) so a chat opened from a push can load on its own. Everything else is mobile: pure, tested modules in `lib/` (types, query keys, filters, display text, presentation rules) and thin Expo Router screens using TanStack Query. Real-time invalidation (Plan 2) refreshes lists and threads; this plan adds `message:status` and the app badge query, and suppresses the push banner for the chat that is already open.

**Tech Stack:** Expo SDK 57, Expo Router, TanStack Query v5 (`useQuery`, `useInfiniteQuery`, `useMutation`), `@clerk/expo` v4, `expo-image-picker`, `expo-document-picker`, Jest via `jest-expo`; API side Fastify 4 + Prisma + Vitest.

**Spec:** `docs/prd-mobile-app.md` (§4 navigation, §5 screens 3–7, §5a alignment table, §6 flows F2–F4, §7). Mockups 2.1–2.5: https://claude.ai/artifact/T1xZ5zPGscLw29TuFZ7ev2.

## Global Constraints

- Only features that exist in the system, with web naming (PRD §5a): tabs **All · Open · Pending · Closed**, quick filters **Unread** and **Assigned to me**, **Filter by label**; statuses `open | pending | resolved | bot`; one inbox label per chat; assign to one user; **Canned responses**; **Smart replies**.
- "Closed" tab = `status=resolved` (the API enum has no `closed`; the status endpoint accepts `open | resolved | pending | bot`).
- Templates: pick an **approved** template, preview, send `{ contentType: "template", templateId }`. The API fills variables from the contact (`contactBodyVars`) — no variable inputs in the app.
- Composer actions in this plan: **Attach photo**, **Attach document**, **Canned responses**, **Send template**. Interactive messages, bot automations, create deal and media library stay on the web for now (listed as follow-ups, not drawn).
- Query keys (contract with Plan 2 realtime and Plan 4): conversation lists under `["conversations", …]`, one conversation `["conversations", "detail", id]`, thread `["messages", id]`, badge `["unread-count"]`. Never invent other top-level keys for these.
- Copy: never the word "Plivo". Super admins never reach these screens (Plan 2 gate).
- File ownership (parallel Plan 4 session works on Contacts tab, Dashboard, Notifications, Me): this plan may edit only the files listed under each task. `lib/theme.ts` is append-only (add tokens, never rename). Never run `pnpm dedupe` at the repo root; install mobile packages with `npx expo install` inside `apps/mobile`.
- Commits end with a `Co-Authored-By:` trailer naming the model that wrote the commit.
- Mobile: `cd apps/mobile && pnpm jest <path>`, `pnpm tsc --noEmit`, `npx expo export --platform android --output-dir dist-check && rm -rf dist-check`. API: `cd apps/api && pnpm vitest run <file>`, `pnpm tsc --noEmit`.

## Review Focus

- An agent opens a chat from a push while the app was closed (no list cached) → the chat header still shows the contact, status, assignee, label and 24-hour window. Test: Task 1 Step 1 (API returns one conversation with `serviceWindowActive`), Task 2 Step 1 (`keys.detail`).
- The 24-hour window has closed → the app must not let the agent type a free-form reply; it offers "Send template" instead. Test: Task 2 Step 1 (`canSendFreeForm`).
- An agent with `assigned_chats_only` or a team-restricted view opens a chat id they may not see (e.g. from an old notification) → a clear "You don't have access to this chat" state, not a crash or an empty screen. Test: Task 1 Step 1 (404 for an invisible conversation, `assigned_chats_only` filter) + Task 5 Step 4 (no-access state).
- Sending fails because billing paused sending (`402 BILLING_OVERDUE` / `ACCOUNT_CANCELLED`) or the template isn't approved → the draft text stays in the box and a specific message explains why. Test: Task 2 Step 1 (`sendErrorMessage`).
- The agent is looking at chat X when a push for chat X arrives → no banner over the open chat; pushes for other chats still show. Test: Task 3 Step 1 (`notificationPresentation`).

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/api/src/routes/conversations.ts` (+ test) | New `GET /conversations/:id` (org + visibility scoped, same shape as list item) |
| `apps/mobile/lib/conversations.ts` (+ test) | Types, list query mapping, quick filters, query keys, display helpers, window helpers, send-error copy |
| `apps/mobile/lib/badge.ts` (+ test) | `useUnreadBadge()` — `["unread-count"]` query → app icon badge |
| `apps/mobile/lib/active-conversation.ts` (+ test) | Which chat is on screen; push banner presentation rule |
| `apps/mobile/lib/realtime.ts` (+ test, modify) | Map `message:status` → `["messages"]` |
| `apps/mobile/lib/media-upload.ts` (+ test) | Multipart upload to `/media/upload` with a fresh token |
| `apps/mobile/components/inbox/ConversationRow.tsx` | One inbox row (mockup 2.1) |
| `apps/mobile/components/inbox/FilterBar.tsx` | Status tabs + quick filter chips + label filter button |
| `apps/mobile/app/(app)/(tabs)/inbox.tsx` | Inbox screen |
| `apps/mobile/app/(app)/conversation/[id]/index.tsx` (moved from `conversation/[id].tsx`) | Chat screen |
| `apps/mobile/app/(app)/conversation/[id]/assign.tsx` | Assign sheet (mockup 2.5) |
| `apps/mobile/app/(app)/conversation/[id]/label.tsx` | Inbox label sheet |
| `apps/mobile/app/(app)/conversation/[id]/template.tsx` | Template picker (mockup 2.3) |
| `apps/mobile/app/(app)/conversation/[id]/canned.tsx` | Canned responses sheet |
| `apps/mobile/components/chat/MessageBubble.tsx` | One message (text / media label / template / system) with ticks |
| `apps/mobile/components/chat/ChatHeader.tsx` | Back, contact, status/assignee/label pills |
| `apps/mobile/components/chat/Composer.tsx` | Smart replies, actions sheet, input, send |
| `apps/mobile/app/(app)/contact/[id].tsx` | Contact Details (mockup 2.4) |
| `apps/mobile/app/(app)/_layout.tsx` (modify) | Modal routes, badge hook, banner rule |

---

### Task 1: API — load one conversation

**Files:**
- Modify: `apps/api/src/routes/conversations.ts` (add a handler after `GET /conversations/unread-count`; reuse the list's include + mapping)
- Test: `apps/api/src/routes/conversations.test.ts`

**Interfaces:**
- Produces: `GET /v1/conversations/:id` → `200 { data: ConversationItem }` where `ConversationItem` is exactly one element of `GET /v1/conversations`'s `data` (`id, status, assignedTo, teamId, unreadCount, lastMessageAt, lastInboundAt, closedAt, createdAt, updatedAt, contactId, whatsappContactId, contact{ id, firstName, lastName, phoneNumber, tags }, lastMessage{ id, body, direction, contentType } | null, label{ id, name, color } | null, serviceWindowActive: boolean`); `404 NOT_FOUND` when the conversation is not in the caller's org or not visible to them (same `conversationVisibilityWhere` + `assigned_chats_only` rules as the list). Phone masked when `shouldHidePhone(permissions)`.

- [ ] **Step 1: Write the failing tests** (add to `conversations.test.ts`, reusing `buildApp()`; `mockAuth` is `user-1`/`org-1`)

```ts
describe("GET /v1/conversations/:id", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  const row = {
    id: "conv-1", organizationId: "org-1", status: "open", assignedTo: "user-1", unreadCount: 2,
    lastInboundAt: new Date(Date.now() - 60 * 60 * 1000), lastMessageAt: new Date(),
    contact: { id: "ct-1", firstName: "Priya", lastName: "Shah", phoneNumber: "447700900123", tags: [] },
    messages: [{ id: "m-1", body: "Hi", direction: "inbound", contentType: "text" }],
    conversationLabel: { inboxLabel: { id: "l-1", name: "Appointment", color: "#2563eb" } },
  };

  it("returns one conversation in the list-item shape with serviceWindowActive", async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue(row);
    const res = await app.inject({ method: "GET", url: "/v1/conversations/conv-1" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: Record<string, unknown> }>().data;
    expect(body["id"]).toBe("conv-1");
    expect(body["serviceWindowActive"]).toBe(true);
    expect(body["lastMessage"]).toEqual({ id: "m-1", body: "Hi", direction: "inbound", contentType: "text" });
    expect(body["label"]).toEqual({ id: "l-1", name: "Appointment", color: "#2563eb" });
    expect(body["messages"]).toBeUndefined();
    expect(body["conversationLabel"]).toBeUndefined();
    const where = mockPrisma.conversation.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({ id: "conv-1", organizationId: "org-1" });
  });

  it("marks the window closed after 24 hours", async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue({ ...row, lastInboundAt: new Date(Date.now() - 25 * 60 * 60 * 1000) });
    const res = await app.inject({ method: "GET", url: "/v1/conversations/conv-1" });
    expect(res.json<{ data: { serviceWindowActive: boolean } }>().data.serviceWindowActive).toBe(false);
  });

  it("returns 404 when the conversation is not visible to the caller", async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue(null);
    const res = await app.inject({ method: "GET", url: "/v1/conversations/conv-x" });
    expect(res.statusCode).toBe(404);
  });
});

describe("GET /v1/conversations/:id with assigned_chats_only", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildAppAsAgent(); });
  afterEach(async () => { await app.close(); });

  it("only finds conversations assigned to the caller when assigned_chats_only is allowed", async () => {
    mockAuthOverride.permissions = { inbox_access: "allow", assigned_chats_only: "allow" };
    mockPrisma.conversation.findFirst.mockResolvedValue(null);
    await app.inject({ method: "GET", url: "/v1/conversations/conv-1" });
    expect(mockPrisma.conversation.findFirst.mock.calls[0][0].where).toMatchObject({ assignedTo: "agent-1" });
  });
});
```

If `conversations.test.ts` has no mutable `mockAuthOverride`, add one: change `buildAppAsAgent` to read `permissions` from a module-level `const mockAuthOverride = { permissions: { inbox_access: "allow" } as Record<string, string> }` and reset it in that describe's `beforeEach`. Keep every existing test passing.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /e/Product/WhatsApp_CRM/apps/api && pnpm vitest run src/routes/conversations.test.ts`
Expected: the new tests FAIL (route returns 404 for every id because it does not exist).

- [ ] **Step 3: Implement**

Extract the list's per-row mapping into a function at the top of the plugin and reuse it in both handlers:

```ts
  const listInclude = {
    contact: { select: { id: true, firstName: true, lastName: true, phoneNumber: true, tags: true } },
    messages: { orderBy: { sentAt: "desc" as const }, take: 1, select: { id: true, body: true, direction: true, contentType: true } },
    conversationLabel: { include: { inboxLabel: { select: { id: true, name: true, color: true } } } },
  };

  function toListItem(c: any, hidePhone: boolean, now: number) {
    return {
      ...c,
      contact: hidePhone && c.contact ? { ...c.contact, phoneNumber: maskPhone(c.contact.phoneNumber) } : c.contact,
      serviceWindowActive: c.lastInboundAt != null && now - c.lastInboundAt.getTime() < 86_400_000,
      lastMessage: c.messages?.[0] ?? null,
      messages: undefined,
      label: c.conversationLabel
        ? { id: c.conversationLabel.inboxLabel.id, name: c.conversationLabel.inboxLabel.name, color: c.conversationLabel.inboxLabel.color }
        : null,
      conversationLabel: undefined,
    };
  }
```

Type `c` with the Prisma payload type instead of `any` if the file's lint rules reject `any` (`Prisma.ConversationGetPayload<{ include: typeof listInclude }>`). Replace the list handler's `include` and `.map(...)` with `listInclude` and `toListItem(c, hidePhone, now)` (behaviour unchanged). Then add, right after the `/conversations/unread-count` route:

```ts
  // One conversation in the list-item shape (mobile chat opened from a push, no list cached).
  fastify.get<{ Params: { id: ConversationId } }>("/conversations/:id", async (request, reply) => {
    const { userId, organizationId, permissions } = request.auth;
    const where: Record<string, unknown> = { id: request.params.id, organizationId, contact: { deletedAt: null } };
    if (permissions["assigned_chats_only"] === "allow") {
      where.assignedTo = userId;
    } else {
      const visWhere = await conversationVisibilityWhere(fastify.prisma, request.auth);
      if (visWhere) Object.assign(where, visWhere);
    }
    const c = await fastify.prisma.conversation.findFirst({ where, include: listInclude });
    if (!c) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Conversation not found" } });
    return reply.send({ data: toListItem(c, shouldHidePhone(permissions), Date.now()) });
  });
```

The router's existing `preHandler` already enforces `inbox_access` for every route in this file — confirm with `grep -n "inbox_access" apps/api/src/routes/conversations.ts`.

- [ ] **Step 4: Run tests + type check**

Run: `cd /e/Product/WhatsApp_CRM/apps/api && pnpm vitest run src/routes/conversations.test.ts && pnpm tsc --noEmit`
Expected: all conversations tests pass; type check clean.

- [ ] **Step 5: Security audit + commit**

Audit: the new route filters by `organizationId` from `request.auth`, applies the same visibility rules as the list, masks phone numbers by permission, and sits behind the router's `inbox_access` preHandler. Paste the grep output in the report.

```bash
git add apps/api/src/routes/conversations.ts apps/api/src/routes/conversations.test.ts
git commit -m "feat(api): GET /conversations/:id in the list-item shape for the mobile chat screen

Co-Authored-By: <model that wrote this> <noreply@anthropic.com>"
```

---

### Task 2: Conversation logic library

**Files:**
- Create: `apps/mobile/lib/conversations.ts`, `apps/mobile/lib/conversations.test.ts`

**Interfaces:**
- Produces (used by Tasks 3–7):

```ts
export type ConversationStatus = "open" | "pending" | "resolved" | "bot";
export type InboxTab = "all" | "open" | "pending" | "closed";
export type QuickFilter = "unread" | "assigned";
export interface ConversationContact { id: string; firstName: string | null; lastName: string | null; phoneNumber: string; tags: string[] }
export interface ConversationLabel { id: string; name: string; color: string }
export interface ConversationItem {
  id: string; status: ConversationStatus; assignedTo: string | null; unreadCount: number;
  lastMessageAt: string | null; lastInboundAt: string | null; serviceWindowActive: boolean;
  contact: ConversationContact | null;
  lastMessage: { id: string; body: string | null; direction: "inbound" | "outbound"; contentType: string } | null;
  label: ConversationLabel | null;
}
export type MessageStatus = "sending" | "sent" | "delivered" | "read" | "failed" | "expired" | "aborted";
export interface ChatMessage {
  id: string; direction: "inbound" | "outbound"; contentType: string; body: string | null;
  mediaUrl: string | null; status: MessageStatus; sentAt: string; senderName: string | null; isSystemMessage: boolean;
}
export const PAGE_SIZE = 50;
export function statusParamFor(tab: InboxTab): ConversationStatus | undefined;
export function listPath(tab: InboxTab, labelId: string | null, page: number): string;
export function applyQuickFilter(items: ConversationItem[], filter: QuickFilter | null, userId: string): ConversationItem[];
export const keys: {
  list: (tab: InboxTab, labelId: string | null) => readonly unknown[];
  search: (q: string) => readonly unknown[];
  detail: (id: string) => readonly unknown[];
  messages: (id: string) => readonly unknown[];
};
export function contactName(c: ConversationContact | null): string;
export function previewText(m: { body: string | null; contentType: string } | null): string;
export function windowHoursLeft(lastInboundAt: string | null, now: number): number | null;
export function canSendFreeForm(c: Pick<ConversationItem, "serviceWindowActive">): boolean;
export function sendErrorMessage(err: unknown): string;
```

- [ ] **Step 1: Write the failing test**

```ts
// apps/mobile/lib/conversations.test.ts
import { ApiError } from "./api";
import {
  applyQuickFilter, canSendFreeForm, contactName, keys, listPath, previewText, sendErrorMessage,
  statusParamFor, windowHoursLeft, type ConversationItem,
} from "./conversations";

const base: ConversationItem = {
  id: "c", status: "open", assignedTo: null, unreadCount: 0, lastMessageAt: null, lastInboundAt: null,
  serviceWindowActive: true, contact: null, lastMessage: null, label: null,
};

describe("list queries", () => {
  it("maps the Closed tab to status=resolved and All to no status", () => {
    expect(statusParamFor("all")).toBeUndefined();
    expect(statusParamFor("open")).toBe("open");
    expect(statusParamFor("pending")).toBe("pending");
    expect(statusParamFor("closed")).toBe("resolved");
  });
  it("builds the list path with status, label and page", () => {
    expect(listPath("all", null, 1)).toBe("/conversations?page=1");
    expect(listPath("closed", "l-1", 2)).toBe("/conversations?status=resolved&labelId=l-1&page=2");
  });
  it("keeps every conversation key under the ['conversations'] prefix and threads under ['messages', id]", () => {
    expect(keys.list("open", null)[0]).toBe("conversations");
    expect(keys.search("pri")[0]).toBe("conversations");
    expect(keys.detail("c-1")).toEqual(["conversations", "detail", "c-1"]);
    expect(keys.messages("c-1")).toEqual(["messages", "c-1"]);
  });
});

describe("applyQuickFilter (same rules as the web inbox)", () => {
  const items: ConversationItem[] = [
    { ...base, id: "a", unreadCount: 2, assignedTo: "u-1", status: "open" },
    { ...base, id: "b", unreadCount: 0, assignedTo: "u-1", status: "pending" },
    { ...base, id: "c", unreadCount: 1, assignedTo: "u-2", status: "open" },
    { ...base, id: "d", unreadCount: 0, assignedTo: "u-1", status: "resolved" },
  ];
  it("Unread keeps chats with unread messages", () => {
    expect(applyQuickFilter(items, "unread", "u-1").map((c) => c.id)).toEqual(["a", "c"]);
  });
  it("Assigned to me keeps my open and pending chats", () => {
    expect(applyQuickFilter(items, "assigned", "u-1").map((c) => c.id)).toEqual(["a", "b"]);
  });
  it("no filter keeps everything", () => {
    expect(applyQuickFilter(items, null, "u-1")).toHaveLength(4);
  });
});

describe("display helpers", () => {
  it("names a contact by first + last name, else phone", () => {
    expect(contactName({ id: "1", firstName: "Priya", lastName: "Shah", phoneNumber: "44", tags: [] })).toBe("Priya Shah");
    expect(contactName({ id: "1", firstName: null, lastName: null, phoneNumber: "+1 415", tags: [] })).toBe("+1 415");
    expect(contactName(null)).toBe("Unknown contact");
  });
  it("previews text or describes media", () => {
    expect(previewText({ body: "Hello", contentType: "text" })).toBe("Hello");
    expect(previewText({ body: null, contentType: "image" })).toBe("Photo");
    expect(previewText({ body: null, contentType: "audio" })).toBe("Voice message");
    expect(previewText({ body: null, contentType: "document" })).toBe("Document");
    expect(previewText({ body: null, contentType: "video" })).toBe("Video");
    expect(previewText({ body: null, contentType: "location" })).toBe("Location");
    expect(previewText({ body: null, contentType: "sticker" })).toBe("Message");
    expect(previewText(null)).toBe("");
  });
});

describe("24-hour window", () => {
  const now = Date.parse("2026-10-16T12:00:00Z");
  it("reports whole hours left, or null when closed or never opened", () => {
    expect(windowHoursLeft("2026-10-16T11:00:00Z", now)).toBe(23);
    expect(windowHoursLeft("2026-10-15T11:00:00Z", now)).toBeNull();
    expect(windowHoursLeft(null, now)).toBeNull();
  });
  it("only allows free-form replies while the window is open", () => {
    expect(canSendFreeForm({ serviceWindowActive: true })).toBe(true);
    expect(canSendFreeForm({ serviceWindowActive: false })).toBe(false);
  });
});

describe("sendErrorMessage", () => {
  it("explains paused sending and closed accounts", () => {
    expect(sendErrorMessage(new ApiError(402, "BILLING_OVERDUE", "x"))).toMatch(/Sending is paused/);
    expect(sendErrorMessage(new ApiError(402, "ACCOUNT_CANCELLED", "x"))).toMatch(/cancelled/);
  });
  it("explains template and connection problems", () => {
    expect(sendErrorMessage(new ApiError(400, "TEMPLATE_NOT_APPROVED", "x"))).toBe("Only approved templates can be sent.");
    expect(sendErrorMessage(new ApiError(400, "WHATSAPP_NOT_CONNECTED", "x"))).toBe("WhatsApp isn't connected for this workspace.");
    expect(sendErrorMessage(new ApiError(403, "FORBIDDEN", "x"))).toBe("You don't have permission to send messages.");
  });
  it("falls back to a neutral message", () => {
    expect(sendErrorMessage(new TypeError("Network request failed"))).toBe("Couldn't send. Check your connection and try again.");
    expect(sendErrorMessage(new ApiError(500, "INTERNAL", "boom"))).toBe("Couldn't send. Check your connection and try again.");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /e/Product/WhatsApp_CRM/apps/mobile && pnpm jest lib/conversations.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// apps/mobile/lib/conversations.ts
import { ApiError } from "./api";

export type ConversationStatus = "open" | "pending" | "resolved" | "bot";
export type InboxTab = "all" | "open" | "pending" | "closed";
export type QuickFilter = "unread" | "assigned";
export interface ConversationContact { id: string; firstName: string | null; lastName: string | null; phoneNumber: string; tags: string[] }
export interface ConversationLabel { id: string; name: string; color: string }
export interface ConversationItem {
  id: string;
  status: ConversationStatus;
  assignedTo: string | null;
  unreadCount: number;
  lastMessageAt: string | null;
  lastInboundAt: string | null;
  serviceWindowActive: boolean;
  contact: ConversationContact | null;
  lastMessage: { id: string; body: string | null; direction: "inbound" | "outbound"; contentType: string } | null;
  label: ConversationLabel | null;
}
export type MessageStatus = "sending" | "sent" | "delivered" | "read" | "failed" | "expired" | "aborted";
export interface ChatMessage {
  id: string;
  direction: "inbound" | "outbound";
  contentType: string;
  body: string | null;
  mediaUrl: string | null;
  status: MessageStatus;
  sentAt: string;
  senderName: string | null;
  isSystemMessage: boolean;
}

export const PAGE_SIZE = 50;

/** The web's "Closed" tab is the `resolved` status in the API. */
export function statusParamFor(tab: InboxTab): ConversationStatus | undefined {
  if (tab === "all") return undefined;
  return tab === "closed" ? "resolved" : tab;
}

export function listPath(tab: InboxTab, labelId: string | null, page: number): string {
  const params = new URLSearchParams();
  const status = statusParamFor(tab);
  if (status) params.set("status", status);
  if (labelId) params.set("labelId", labelId);
  params.set("page", String(page));
  return `/conversations?${params.toString()}`;
}

/** Same rules as apps/web/lib/inbox-params.ts applyQuickFilter. */
export function applyQuickFilter(items: ConversationItem[], filter: QuickFilter | null, userId: string): ConversationItem[] {
  if (filter === "unread") return items.filter((c) => c.unreadCount > 0);
  if (filter === "assigned") return items.filter((c) => c.assignedTo === userId && (c.status === "open" || c.status === "pending"));
  return items;
}

export const keys = {
  list: (tab: InboxTab, labelId: string | null) => ["conversations", "list", tab, labelId ?? "none"] as const,
  search: (q: string) => ["conversations", "search", q] as const,
  detail: (id: string) => ["conversations", "detail", id] as const,
  messages: (id: string) => ["messages", id] as const,
};

export function contactName(c: ConversationContact | null): string {
  if (!c) return "Unknown contact";
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
  return name || c.phoneNumber;
}

const MEDIA_PREVIEW: Record<string, string> = {
  image: "Photo",
  audio: "Voice message",
  document: "Document",
  video: "Video",
  location: "Location",
};

export function previewText(m: { body: string | null; contentType: string } | null): string {
  if (!m) return "";
  if (m.body && m.body.trim()) return m.body;
  return MEDIA_PREVIEW[m.contentType] ?? "Message";
}

const WINDOW_MS = 24 * 60 * 60 * 1000;

/** Whole hours left in WhatsApp's 24-hour customer-service window, or null when closed. */
export function windowHoursLeft(lastInboundAt: string | null, now: number): number | null {
  if (!lastInboundAt) return null;
  const left = Date.parse(lastInboundAt) + WINDOW_MS - now;
  return left > 0 ? Math.floor(left / 3_600_000) : null;
}

export function canSendFreeForm(c: Pick<ConversationItem, "serviceWindowActive">): boolean {
  return c.serviceWindowActive;
}

export function sendErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case "BILLING_OVERDUE":
        return "Sending is paused because a WBMSG statement is overdue. An admin can pay it on the web dashboard.";
      case "ACCOUNT_CANCELLED":
        return "This workspace has been cancelled, so messages can't be sent.";
      case "TEMPLATE_NOT_APPROVED":
        return "Only approved templates can be sent.";
      case "TEMPLATE_NOT_FOUND":
        return "That template no longer exists.";
      case "WHATSAPP_NOT_CONNECTED":
        return "WhatsApp isn't connected for this workspace.";
      case "NO_WA_CONTACT":
        return "This contact has no WhatsApp number.";
      case "FORBIDDEN":
        return "You don't have permission to send messages.";
    }
  }
  return "Couldn't send. Check your connection and try again.";
}
```

- [ ] **Step 4: Run tests and type check**

Run: `pnpm jest lib/conversations.test.ts && pnpm tsc --noEmit` → all pass; clean.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/lib/conversations.ts apps/mobile/lib/conversations.test.ts
git commit -m "feat(mobile): conversation types, inbox filters, query keys and send-error copy

Co-Authored-By: <model that wrote this> <noreply@anthropic.com>"
```

---

### Task 3: App badge, banner rule and message status (realtime/push plumbing)

**Files:**
- Create: `apps/mobile/lib/badge.ts`, `apps/mobile/lib/badge.test.ts`, `apps/mobile/lib/active-conversation.ts`, `apps/mobile/lib/active-conversation.test.ts`
- Modify: `apps/mobile/lib/realtime.ts` + `realtime.test.ts` (one case), `apps/mobile/app/(app)/_layout.tsx` (use `notificationPresentation`, mount `UnreadBadge`)

**Interfaces:**
- Produces:
  - `useUnreadBadge(): number | undefined` — `useQuery({ queryKey: ["unread-count"], queryFn: () => api("/conversations/unread-count") })`, sets the OS badge whenever the count changes.
  - `setBadgeFromCount(count: number | undefined): Promise<void>` (pure-ish, tested)
  - `setActiveConversation(id: string | null): void`, `getActiveConversation(): string | null`
  - `notificationPresentation(data: unknown, activeConversationId: string | null): { shouldShowBanner: boolean; shouldShowList: boolean; shouldPlaySound: boolean; shouldSetBadge: boolean }`
  - `queryKeysFor("message:status", …)` → `[["messages"]]`

- [ ] **Step 1: Write the failing tests**

```ts
// apps/mobile/lib/active-conversation.test.ts
import { getActiveConversation, notificationPresentation, setActiveConversation } from "./active-conversation";

describe("active conversation", () => {
  afterEach(() => setActiveConversation(null));
  it("remembers the chat on screen", () => {
    setActiveConversation("c-1");
    expect(getActiveConversation()).toBe("c-1");
    setActiveConversation(null);
    expect(getActiveConversation()).toBeNull();
  });
});

describe("notificationPresentation", () => {
  it("hides the banner and sound for the chat already open", () => {
    expect(notificationPresentation({ type: "new_message", conversationId: "c-1" }, "c-1")).toEqual({
      shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: true,
    });
  });
  it("shows everything for other chats and other types", () => {
    const shown = { shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true };
    expect(notificationPresentation({ type: "new_message", conversationId: "c-2" }, "c-1")).toEqual(shown);
    expect(notificationPresentation({ type: "closure_overdue", contactId: "x" }, "c-1")).toEqual(shown);
    expect(notificationPresentation(null, null)).toEqual(shown);
  });
});
```

```ts
// apps/mobile/lib/badge.test.ts
const mockSetBadge = jest.fn();
jest.mock("expo-notifications", () => ({ setBadgeCountAsync: (...a: unknown[]) => mockSetBadge(...a) }));
import { setBadgeFromCount } from "./badge";

describe("setBadgeFromCount", () => {
  beforeEach(() => mockSetBadge.mockReset());
  it("sets the OS badge to the count", async () => {
    await setBadgeFromCount(4);
    expect(mockSetBadge).toHaveBeenCalledWith(4);
  });
  it("does nothing until the count is known and never throws", async () => {
    await setBadgeFromCount(undefined);
    expect(mockSetBadge).not.toHaveBeenCalled();
    mockSetBadge.mockRejectedValueOnce(new Error("no permission"));
    await expect(setBadgeFromCount(1)).resolves.toBeUndefined();
  });
});
```

Add to `apps/mobile/lib/realtime.test.ts` inside `describe("queryKeysFor")`:

```ts
  it("refreshes open threads on delivery status changes", () => {
    expect(queryKeysFor("message:status", { whatsappMessageId: "wamid.1", status: "read" })).toEqual([["messages"]]);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm jest lib/active-conversation.test.ts lib/badge.test.ts lib/realtime.test.ts` → FAIL (modules missing; new realtime case returns `[]`).

- [ ] **Step 3: Implement**

```ts
// apps/mobile/lib/active-conversation.ts
let active: string | null = null;

/** Set by the Chat screen while it is focused, cleared when it loses focus. */
export function setActiveConversation(id: string | null): void {
  active = id;
}

export function getActiveConversation(): string | null {
  return active;
}

/** Foreground push presentation: no banner or sound for the chat the agent is already reading. */
export function notificationPresentation(
  data: unknown,
  activeConversationId: string | null,
): { shouldShowBanner: boolean; shouldShowList: boolean; shouldPlaySound: boolean; shouldSetBadge: boolean } {
  const conversationId =
    data && typeof data === "object" && typeof (data as { conversationId?: unknown }).conversationId === "string"
      ? (data as { conversationId: string }).conversationId
      : null;
  const isOpenChat = conversationId !== null && conversationId === activeConversationId;
  return { shouldShowBanner: !isOpenChat, shouldShowList: !isOpenChat, shouldPlaySound: !isOpenChat, shouldSetBadge: true };
}
```

```ts
// apps/mobile/lib/badge.ts
import { useQuery } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import { useEffect } from "react";
import { useApi } from "./api-context";

export async function setBadgeFromCount(count: number | undefined): Promise<void> {
  if (count === undefined) return;
  try {
    await Notifications.setBadgeCountAsync(count);
  } catch {
    // Badge is cosmetic.
  }
}

/** Unread chats assigned to me; realtime invalidates ["unread-count"] on new messages, assignments and status changes. */
export function useUnreadBadge(): number | undefined {
  const api = useApi();
  const { data } = useQuery({
    queryKey: ["unread-count"],
    queryFn: async () => (await api<{ data: { count: number } }>("/conversations/unread-count")).data.count,
  });
  useEffect(() => { void setBadgeFromCount(data); }, [data]);
  return data;
}
```

In `apps/mobile/lib/realtime.ts` `queryKeysFor`, add before `default`:

```ts
    case "message:status":
      // The server only sends the WhatsApp message id, so refresh every open thread.
      return [["messages"]];
```

In `apps/mobile/app/(app)/_layout.tsx`:
1. Replace the module-level `Notifications.setNotificationHandler({ handleNotification: async () => ({ ... }) })` with:

```ts
Notifications.setNotificationHandler({
  handleNotification: async (notification) =>
    notificationPresentation(notification.request.content.data, getActiveConversation()),
});
```

(import `getActiveConversation, notificationPresentation` from `../../lib/active-conversation`).
2. Add `function UnreadBadge() { useUnreadBadge(); return null; }` and render `<UnreadBadge />` next to `<RealtimeBridge />` / `<PushBridge />` in the `ok` branch only.

- [ ] **Step 4: Run tests, type check, export**

Run: `pnpm jest && pnpm tsc --noEmit && npx expo export --platform android --output-dir dist-check && rm -rf dist-check` → all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/lib apps/mobile/app/\(app\)/_layout.tsx
git commit -m "feat(mobile): app badge from unread count, no banner for the open chat, delivery-status refresh

Co-Authored-By: <model that wrote this> <noreply@anthropic.com>"
```

---

### Task 4: Inbox screen

**Files:**
- Create: `apps/mobile/components/inbox/ConversationRow.tsx`, `apps/mobile/components/inbox/FilterBar.tsx`
- Modify: `apps/mobile/app/(app)/(tabs)/inbox.tsx` (replace placeholder)

**Interfaces:**
- Consumes: Task 2 (`keys`, `listPath`, `applyQuickFilter`, `contactName`, `previewText`, `PAGE_SIZE`, types), `useApi`, `useMe`, theme, `Screen`.
- Produces: navigation to `/conversation/[id]`; bell → `/notifications` (Plan 4 screen).

- [ ] **Step 1: FilterBar**

```tsx
// apps/mobile/components/inbox/FilterBar.tsx
import { ChevronDown } from "lucide-react-native";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { InboxTab, QuickFilter } from "../../lib/conversations";
import { colors, font, space } from "../../lib/theme";

const TABS: { id: InboxTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "open", label: "Open" },
  { id: "pending", label: "Pending" },
  { id: "closed", label: "Closed" },
];

export function FilterBar(props: {
  tab: InboxTab;
  onTab: (t: InboxTab) => void;
  quick: QuickFilter | null;
  onQuick: (q: QuickFilter | null) => void;
  labelName: string | null;
  onLabelPress: () => void;
}) {
  return (
    <View>
      <View accessibilityRole="tablist" style={styles.tabs}>
        {TABS.map((t) => {
          const on = props.tab === t.id;
          return (
            <Pressable key={t.id} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => props.onTab(t.id)} style={[styles.tab, on && styles.tabOn]}>
              <Text style={[styles.tabText, on && styles.tabTextOn]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {(["unread", "assigned"] as const).map((q) => {
          const on = props.quick === q;
          return (
            <Pressable key={q} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => props.onQuick(on ? null : q)} style={[styles.chip, on && styles.chipOn]}>
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{q === "unread" ? "Unread" : "Assigned to me"}</Text>
            </Pressable>
          );
        })}
        <Pressable accessibilityRole="button" onPress={props.onLabelPress} style={[styles.chip, props.labelName ? styles.chipOn : null]}>
          <Text style={[styles.chipText, props.labelName ? styles.chipTextOn : null]}>{props.labelName ?? "Filter by label"}</Text>
          <ChevronDown size={14} color={props.labelName ? "#FFFFFF" : colors.text} />
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: "row", paddingHorizontal: space.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  tab: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center" },
  tabOn: { borderBottomWidth: 2, borderBottomColor: colors.brand },
  tabText: { fontFamily: font.semibold, fontSize: 14, color: colors.textMuted },
  tabTextOn: { color: colors.brand },
  chips: { gap: space.sm, paddingHorizontal: space.lg, paddingVertical: 10 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 34, paddingHorizontal: space.md, borderRadius: 17, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { fontFamily: font.semibold, fontSize: 13, color: colors.text },
  chipTextOn: { color: "#FFFFFF" },
});
```

- [ ] **Step 2: ConversationRow** (mockup 2.1)

```tsx
// apps/mobile/components/inbox/ConversationRow.tsx
import { Pressable, StyleSheet, Text, View } from "react-native";
import { contactName, previewText, type ConversationItem } from "../../lib/conversations";
import { colors, font, space } from "../../lib/theme";

const STATUS: Record<ConversationItem["status"], { label: string; bg: string; fg: string }> = {
  open: { label: "Open", bg: "#DCFCE7", fg: "#166534" },
  pending: { label: "Pending", bg: "#FEF3C7", fg: "#92400E" },
  resolved: { label: "Resolved", bg: "#F3F4F6", fg: "#374151" },
  bot: { label: "Bot", bg: "#EDE9FE", fg: "#5B21B6" },
};

function initials(name: string): string {
  const parts = name.replace(/[^\p{L}\p{N} ]/gu, "").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "#";
}

function timeLabel(iso: string | null, now: number): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  const mins = Math.floor((now - t) / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const d = new Date(t);
  const today = new Date(now);
  if (d.toDateString() === today.toDateString()) return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function ConversationRow({ item, assigneeName, onPress, now }: { item: ConversationItem; assigneeName: string; onPress: () => void; now: number }) {
  const name = contactName(item.contact);
  const st = STATUS[item.status];
  const unread = item.unreadCount > 0;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${name}, ${unread ? `${item.unreadCount} unread, ` : ""}${previewText(item.lastMessage)}`} onPress={onPress} style={styles.row}>
      <View style={styles.avatar}><Text style={styles.avatarText}>{initials(name)}</Text></View>
      <View style={styles.body}>
        <View style={styles.line}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          <Text style={[styles.time, unread && styles.timeUnread]}>{timeLabel(item.lastMessageAt, now)}</Text>
        </View>
        <View style={styles.line}>
          <Text style={styles.preview} numberOfLines={1}>{previewText(item.lastMessage)}</Text>
          {unread ? <View style={styles.badge}><Text style={styles.badgeText}>{item.unreadCount}</Text></View> : null}
        </View>
        <View style={styles.tags}>
          <Text style={[styles.tag, { backgroundColor: st.bg, color: st.fg }]}>{st.label}</Text>
          {item.label ? <Text style={[styles.tag, { backgroundColor: `${item.label.color}22`, color: colors.text }]}>{item.label.name}</Text> : null}
          {!item.serviceWindowActive ? <Text style={[styles.tag, { backgroundColor: colors.warningSoft, color: colors.warning }]}>24h window closed</Text> : null}
          <Text style={styles.assignee}>{assigneeName}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: "#F3F4F6", backgroundColor: colors.surface },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: "#E0E7FF", alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: font.semibold, fontSize: 16, color: "#3730A3" },
  body: { flex: 1, minWidth: 0, gap: 3 },
  line: { flexDirection: "row", alignItems: "center", gap: space.sm },
  name: { flex: 1, fontFamily: font.semibold, fontSize: 16, color: colors.text },
  time: { fontFamily: font.medium, fontSize: 12, color: colors.textSubtle },
  timeUnread: { color: colors.brand },
  preview: { flex: 1, fontFamily: font.regular, fontSize: 14, color: colors.textMuted },
  badge: { minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  badgeText: { fontFamily: font.semibold, fontSize: 12, color: "#FFFFFF" },
  tags: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  tag: { fontFamily: font.semibold, fontSize: 11, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, overflow: "hidden" },
  assignee: { fontFamily: font.regular, fontSize: 11, color: colors.textSubtle },
});
```

- [ ] **Step 3: Inbox screen**

```tsx
// apps/mobile/app/(app)/(tabs)/inbox.tsx
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Bell, Search } from "lucide-react-native";
import { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import { ConversationRow } from "../../../components/inbox/ConversationRow";
import { FilterBar } from "../../../components/inbox/FilterBar";
import { Screen } from "../../../components/Screen";
import { useApi } from "../../../lib/api-context";
import { applyQuickFilter, keys, listPath, PAGE_SIZE, type ConversationItem, type ConversationLabel, type InboxTab, type QuickFilter } from "../../../lib/conversations";
import { useMe } from "../../../lib/me-context";
import { colors, font, radius, space } from "../../../lib/theme";

interface UserRow { id: string; fullName: string }

export default function InboxScreen() {
  const api = useApi();
  const me = useMe();
  const router = useRouter();
  const [tab, setTab] = useState<InboxTab>("all");
  const [quick, setQuick] = useState<QuickFilter | null>(null);
  const [label, setLabel] = useState<ConversationLabel | null>(null);
  const [labelPicker, setLabelPicker] = useState(false);
  const [q, setQ] = useState("");
  const searching = q.trim().length >= 2;

  const list = useInfiniteQuery({
    queryKey: keys.list(tab, label?.id ?? null),
    queryFn: ({ pageParam }) => api<{ data: ConversationItem[] }>(listPath(tab, label?.id ?? null, pageParam)),
    initialPageParam: 1,
    getNextPageParam: (last, pages) => (last.data.length === PAGE_SIZE ? pages.length + 1 : undefined),
    enabled: !searching,
  });
  const search = useQuery({
    queryKey: keys.search(q.trim()),
    queryFn: () => api<{ data: ConversationItem[] }>(`/conversations/search?q=${encodeURIComponent(q.trim())}`),
    enabled: searching,
  });
  const users = useQuery({ queryKey: ["users"], queryFn: () => api<{ data: UserRow[] }>("/users"), staleTime: 5 * 60_000 });
  const labels = useQuery({ queryKey: ["inbox-labels"], queryFn: () => api<{ data: ConversationLabel[] }>("/inbox-labels"), enabled: labelPicker });

  const items = useMemo(() => {
    const raw = searching ? search.data?.data ?? [] : list.data?.pages.flatMap((p) => p.data) ?? [];
    return searching ? raw : applyQuickFilter(raw, quick, me.id);
  }, [searching, search.data, list.data, quick, me.id]);

  const nameOf = (id: string | null) => (id === null ? "Unassigned" : id === me.id ? "You" : users.data?.data.find((u) => u.id === id)?.fullName ?? "Assigned");
  const now = Date.now();
  const loading = searching ? search.isLoading : list.isLoading;
  const error = searching ? search.error : list.error;

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">Inbox</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Notifications" onPress={() => router.push("/notifications")} style={styles.iconBtn}>
          <Bell size={22} color={colors.text} />
        </Pressable>
      </View>
      <View style={styles.search}>
        <Search size={18} color={colors.textMuted} />
        <TextInput value={q} onChangeText={setQ} placeholder="Search conversations…" accessibilityLabel="Search conversations" style={styles.searchInput} autoCorrect={false} />
      </View>
      {!searching && (
        <FilterBar tab={tab} onTab={setTab} quick={quick} onQuick={setQuick} labelName={label?.name ?? null} onLabelPress={() => setLabelPicker((v) => !v)} />
      )}
      {labelPicker && !searching && (
        <View style={styles.labelList}>
          <Pressable accessibilityRole="button" onPress={() => { setLabel(null); setLabelPicker(false); }} style={styles.labelItem}><Text style={styles.labelText}>All labels</Text></Pressable>
          {(labels.data?.data ?? []).map((l) => (
            <Pressable key={l.id} accessibilityRole="button" onPress={() => { setLabel(l); setLabelPicker(false); }} style={styles.labelItem}>
              <View style={[styles.dot, { backgroundColor: l.color }]} /><Text style={styles.labelText}>{l.name}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {loading ? (
        <ActivityIndicator style={{ marginTop: space.xl }} color={colors.brand} />
      ) : error ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Couldn't load conversations.</Text>
          <Pressable accessibilityRole="button" onPress={() => void (searching ? search.refetch() : list.refetch())}><Text style={styles.link}>Try again</Text></Pressable>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => <ConversationRow item={item} assigneeName={nameOf(item.assignedTo)} now={now} onPress={() => router.push(`/conversation/${item.id}`)} />}
          onEndReached={() => { if (!searching && list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage(); }}
          onEndReachedThreshold={0.5}
          refreshControl={<RefreshControl refreshing={!searching && list.isRefetching} onRefresh={() => void list.refetch()} tintColor={colors.brand} />}
          ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyText}>{searching ? "No matches." : "No conversations here."}</Text></View>}
          ListFooterComponent={list.isFetchingNextPage ? <ActivityIndicator color={colors.brand} /> : null}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: space.xl, paddingTop: space.md },
  title: { flex: 1, fontFamily: font.bold, fontSize: 28, color: colors.text },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  search: { flexDirection: "row", alignItems: "center", gap: space.sm, marginHorizontal: space.lg, marginVertical: space.sm, height: 42, borderRadius: radius.md, backgroundColor: colors.background, paddingHorizontal: space.md },
  searchInput: { flex: 1, fontFamily: font.regular, fontSize: 15, color: colors.text },
  labelList: { marginHorizontal: space.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  labelItem: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 44, paddingHorizontal: space.md },
  labelText: { fontFamily: font.medium, fontSize: 15, color: colors.text },
  dot: { width: 10, height: 10, borderRadius: 5 },
  empty: { alignItems: "center", padding: space.xl, gap: space.sm },
  emptyText: { fontFamily: font.regular, fontSize: 15, color: colors.textMuted },
  link: { fontFamily: font.semibold, fontSize: 15, color: colors.brand },
});
```

`Screen` without a title is used so the screen draws its own header row with the bell. If `/users` returns 403 for agents, `nameOf` falls back to "Assigned"/"You"/"Unassigned" — no error shown.

- [ ] **Step 4: Verify and commit**

Run: `pnpm tsc --noEmit && pnpm jest && npx expo export --platform android --output-dir dist-check && rm -rf dist-check`

```bash
git add apps/mobile/components/inbox apps/mobile/app/\(app\)/\(tabs\)/inbox.tsx
git commit -m "feat(mobile): Inbox — status tabs, quick filters, label filter, search, paging

Co-Authored-By: <model that wrote this> <noreply@anthropic.com>"
```

---

### Task 5: Chat screen — header, thread, read receipts

**Files:**
- Move: `apps/mobile/app/(app)/conversation/[id].tsx` → `apps/mobile/app/(app)/conversation/[id]/index.tsx` (`git mv`)
- Create: `apps/mobile/components/chat/ChatHeader.tsx`, `apps/mobile/components/chat/MessageBubble.tsx`
- Modify: `apps/mobile/app/(app)/_layout.tsx` (declare modal sub-routes)

**Interfaces:**
- Consumes: Task 1 endpoint, Task 2 (`keys`, types, `contactName`, `windowHoursLeft`, `previewText`), Task 3 (`setActiveConversation`).
- Produces: Chat screen at `/conversation/[id]`; sub-routes `/conversation/[id]/assign`, `/label`, `/template`, `/canned` presented as modals (Tasks 6–7 create them). The screen renders `<Composer …/>` from Task 6 — until Task 6 lands, render a placeholder `View` in its place.

- [ ] **Step 1: Declare modal routes**

In `apps/mobile/app/(app)/_layout.tsx` replace the `ok` branch's `<Stack screenOptions={{ headerShown: false }} />` with:

```tsx
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="conversation/[id]/assign" options={{ presentation: "modal" }} />
            <Stack.Screen name="conversation/[id]/label" options={{ presentation: "modal" }} />
            <Stack.Screen name="conversation/[id]/template" options={{ presentation: "modal" }} />
            <Stack.Screen name="conversation/[id]/canned" options={{ presentation: "modal" }} />
          </Stack>
```

- [ ] **Step 2: MessageBubble**

```tsx
// apps/mobile/components/chat/MessageBubble.tsx
import { Check, CheckCheck, Clock, TriangleAlert } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";
import { previewText, type ChatMessage } from "../../lib/conversations";
import { colors, font, space } from "../../lib/theme";

function Ticks({ status }: { status: ChatMessage["status"] }) {
  if (status === "sending") return <Clock size={12} color={colors.textSubtle} />;
  if (status === "failed" || status === "expired" || status === "aborted") return <TriangleAlert size={12} color={colors.danger} />;
  if (status === "read") return <CheckCheck size={14} color="#2563EB" />;
  if (status === "delivered") return <CheckCheck size={14} color={colors.textSubtle} />;
  return <Check size={14} color={colors.textSubtle} />;
}

export function MessageBubble({ m }: { m: ChatMessage }) {
  if (m.isSystemMessage) return null;
  const out = m.direction === "outbound";
  const isMedia = !m.body && m.contentType !== "text";
  const time = new Date(m.sentAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return (
    <View style={[styles.wrap, out ? styles.right : styles.left]}>
      <View style={[styles.bubble, out ? styles.out : styles.in]}>
        {out && m.senderName ? <Text style={styles.sender}>{m.senderName}</Text> : null}
        {m.contentType === "template" ? <Text style={styles.kind}>Template</Text> : null}
        <Text style={[styles.text, isMedia && styles.media]}>{isMedia ? `[${previewText(m)}]` : m.body}</Text>
        <View style={styles.meta}>
          <Text style={styles.time}>{time}</Text>
          {out ? <Ticks status={m.status} /> : null}
        </View>
        {out && m.status === "failed" ? <Text style={styles.failed}>Not delivered</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", paddingHorizontal: space.md, marginVertical: 3 },
  left: { justifyContent: "flex-start" },
  right: { justifyContent: "flex-end" },
  bubble: { maxWidth: "80%", paddingHorizontal: 10, paddingVertical: 8, borderRadius: 14 },
  in: { backgroundColor: colors.surface, borderTopLeftRadius: 4 },
  out: { backgroundColor: colors.bubbleOut, borderTopRightRadius: 4 },
  sender: { fontFamily: font.semibold, fontSize: 11, color: colors.brand, marginBottom: 2 },
  kind: { fontFamily: font.semibold, fontSize: 11, color: colors.textMuted, marginBottom: 2 },
  text: { fontFamily: font.regular, fontSize: 15, lineHeight: 21, color: colors.text },
  media: { fontStyle: "italic", color: colors.textMuted },
  meta: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4, marginTop: 2 },
  time: { fontFamily: font.regular, fontSize: 11, color: colors.textMuted },
  failed: { fontFamily: font.medium, fontSize: 11, color: colors.danger, marginTop: 2 },
});
```

Media is shown as a labelled placeholder (`[Photo]`, `[Document]`, …) in this plan; inline image rendering is a follow-up.

- [ ] **Step 3: ChatHeader**

```tsx
// apps/mobile/components/chat/ChatHeader.tsx
import { ChevronDown, ChevronLeft } from "lucide-react-native";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { contactName, type ConversationItem } from "../../lib/conversations";
import { colors, font, space } from "../../lib/theme";

const STATUS_LABEL: Record<ConversationItem["status"], string> = { open: "Open", pending: "Pending", resolved: "Resolved", bot: "Bot" };
const STATUS_DOT: Record<ConversationItem["status"], string> = { open: "#16A34A", pending: "#D97706", resolved: "#9CA3AF", bot: "#7C3AED" };

export function ChatHeader(props: {
  c: ConversationItem;
  assigneeName: string;
  onBack: () => void;
  onContact: () => void;
  onStatus: () => void;
  onAssign: () => void;
  onLabel: () => void;
}) {
  const { c } = props;
  return (
    <View style={styles.wrap}>
      <View style={styles.top}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to inbox" onPress={props.onBack} style={styles.icon}><ChevronLeft size={26} color={colors.text} /></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Contact details" onPress={props.onContact} style={styles.who}>
          <Text style={styles.name} numberOfLines={1}>{contactName(c.contact)}</Text>
          <Text style={styles.sub} numberOfLines={1}>{c.contact?.phoneNumber ?? ""}</Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Status ${STATUS_LABEL[c.status]}, change`} onPress={props.onStatus} style={styles.pill}>
          <View style={[styles.dot, { backgroundColor: STATUS_DOT[c.status] }]} />
          <Text style={styles.pillText}>{STATUS_LABEL[c.status]}</Text><ChevronDown size={12} color={colors.text} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Assigned to ${props.assigneeName}, change`} onPress={props.onAssign} style={styles.pill}>
          <Text style={styles.pillText}>Assigned: {props.assigneeName}</Text><ChevronDown size={12} color={colors.text} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={c.label ? `Label ${c.label.name}, change` : "Add label"} onPress={props.onLabel} style={styles.pill}>
          <Text style={styles.pillText}>{c.label ? c.label.name : "Add label"}</Text><ChevronDown size={12} color={colors.text} />
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: space.sm },
  top: { flexDirection: "row", alignItems: "center" },
  icon: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  who: { flex: 1, minHeight: 44, justifyContent: "center" },
  name: { fontFamily: font.semibold, fontSize: 16, color: colors.text },
  sub: { fontFamily: font.regular, fontSize: 12, color: colors.textMuted },
  pills: { gap: space.sm, paddingHorizontal: space.md },
  pill: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 32, paddingHorizontal: 10, borderRadius: 16, borderWidth: 1, borderColor: colors.borderStrong },
  dot: { width: 8, height: 8, borderRadius: 4 },
  pillText: { fontFamily: font.semibold, fontSize: 12, color: colors.text },
});
```

- [ ] **Step 4: Chat screen (thread + header + status change)**

```tsx
// apps/mobile/app/(app)/conversation/[id]/index.tsx
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo } from "react";
import { ActionSheetIOS, ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChatHeader } from "../../../../components/chat/ChatHeader";
import { MessageBubble } from "../../../../components/chat/MessageBubble";
import { setActiveConversation } from "../../../../lib/active-conversation";
import { ApiError } from "../../../../lib/api";
import { useApi } from "../../../../lib/api-context";
import { keys, windowHoursLeft, type ChatMessage, type ConversationItem, type ConversationStatus } from "../../../../lib/conversations";
import { useMe } from "../../../../lib/me-context";
import { colors, font, space } from "../../../../lib/theme";

interface UserRow { id: string; fullName: string }

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useApi();
  const me = useMe();
  const router = useRouter();
  const qc = useQueryClient();

  const conv = useQuery({ queryKey: keys.detail(id), queryFn: async () => (await api<{ data: ConversationItem }>(`/conversations/${id}`)).data });
  const users = useQuery({ queryKey: ["users"], queryFn: () => api<{ data: UserRow[] }>("/users"), staleTime: 5 * 60_000 });
  const thread = useInfiniteQuery({
    queryKey: keys.messages(id),
    queryFn: ({ pageParam }) => api<{ data: ChatMessage[]; pagination: { hasMore: boolean; nextCursor: string | null } }>(
      `/conversations/${id}/messages${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ""}`,
    ),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.pagination.hasMore ? last.pagination.nextCursor : undefined),
  });

  // Newest first for an inverted list: page 0 is the newest page (ascending inside), later pages are older.
  const messages = useMemo(() => (thread.data?.pages ?? []).flatMap((p) => [...p.data].reverse()), [thread.data]);
  const newestInboundId = messages.find((m) => m.direction === "inbound")?.id ?? null;

  useFocusEffect(useCallback(() => {
    setActiveConversation(id);
    return () => setActiveConversation(null);
  }, [id]));

  useEffect(() => {
    if (!conv.data) return;
    void api(`/conversations/${id}/read`, { method: "POST" })
      .then(() => {
        void qc.invalidateQueries({ queryKey: ["unread-count"] });
        void qc.invalidateQueries({ queryKey: ["conversations", "list"] });
      })
      .catch(() => undefined);
  }, [api, id, qc, conv.data, newestInboundId]);

  const setStatus = useMutation({
    mutationFn: (status: ConversationStatus) => api(`/conversations/${id}/status`, { method: "POST", body: { status } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["conversations"] }),
    onError: () => Alert.alert("Couldn't change the status", "Check your connection and try again."),
  });

  function chooseStatus() {
    const options: { label: string; value: ConversationStatus }[] = [
      { label: "Open", value: "open" },
      { label: "Pending", value: "pending" },
      { label: "Resolved", value: "resolved" },
    ];
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [...options.map((o) => o.label), "Cancel"], cancelButtonIndex: options.length, title: "Conversation status" },
        (i) => { const o = options[i]; if (o) setStatus.mutate(o.value); },
      );
    } else {
      Alert.alert("Conversation status", undefined, [
        ...options.map((o) => ({ text: o.label, onPress: () => setStatus.mutate(o.value) })),
        { text: "Cancel", style: "cancel" as const },
      ]);
    }
  }

  if (conv.isLoading) return <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>;
  if (conv.error) {
    const noAccess = conv.error instanceof ApiError && conv.error.status === 404;
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.stateTitle}>{noAccess ? "You don't have access to this chat" : "Couldn't load this chat"}</Text>
        <Text style={styles.stateBody}>{noAccess ? "It may have been reassigned, or it's outside your team." : "Check your connection and try again."}</Text>
        <Pressable accessibilityRole="button" onPress={() => (noAccess ? router.back() : void conv.refetch())} style={styles.stateBtn}>
          <Text style={styles.stateBtnText}>{noAccess ? "Back" : "Try again"}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }
  const c = conv.data!;
  const assigneeName = c.assignedTo === null ? "Unassigned" : c.assignedTo === me.id ? "You" : users.data?.data.find((u) => u.id === c.assignedTo)?.fullName ?? "Assigned";
  const hours = windowHoursLeft(c.lastInboundAt, Date.now());

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ChatHeader
        c={c}
        assigneeName={assigneeName}
        onBack={() => router.back()}
        onContact={() => { if (c.contact) router.push(`/contact/${c.contact.id}`); }}
        onStatus={chooseStatus}
        onAssign={() => router.push(`/conversation/${id}/assign`)}
        onLabel={() => router.push(`/conversation/${id}/label`)}
      />
      <View style={[styles.window, c.serviceWindowActive ? styles.windowOpen : styles.windowClosed]}>
        <Text style={[styles.windowText, { color: c.serviceWindowActive ? colors.brandDark : colors.warning }]}>
          {c.serviceWindowActive ? `24-hour window open${hours !== null ? ` · ${hours}h left` : ""}` : "24-hour window closed. Send an approved template to restart."}
        </Text>
      </View>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={0}>
        <FlatList
          inverted
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => <MessageBubble m={item} />}
          onEndReached={() => { if (thread.hasNextPage && !thread.isFetchingNextPage) void thread.fetchNextPage(); }}
          onEndReachedThreshold={0.4}
          ListFooterComponent={thread.isFetchingNextPage ? <ActivityIndicator color={colors.brand} /> : null}
          style={styles.thread}
          contentContainerStyle={{ paddingVertical: space.sm }}
        />
        {/* Task 6 replaces this placeholder with <Composer conversation={c} /> */}
        <View style={{ height: 56, backgroundColor: colors.surface }} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  thread: { flex: 1, backgroundColor: colors.chatBackground },
  window: { paddingHorizontal: space.lg, paddingVertical: space.sm },
  windowOpen: { backgroundColor: "#F0FDF4" },
  windowClosed: { backgroundColor: colors.warningSoft },
  windowText: { fontFamily: font.medium, fontSize: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl, gap: space.md, backgroundColor: colors.surface },
  stateTitle: { fontFamily: font.bold, fontSize: 18, color: colors.text, textAlign: "center" },
  stateBody: { fontFamily: font.regular, fontSize: 15, color: colors.textMuted, textAlign: "center" },
  stateBtn: { minHeight: 48, paddingHorizontal: space.xl, borderRadius: 12, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  stateBtnText: { fontFamily: font.semibold, fontSize: 16, color: "#FFFFFF" },
});
```

- [ ] **Step 5: Verify and commit**

Run: `pnpm tsc --noEmit && pnpm jest && npx expo export --platform android --output-dir dist-check && rm -rf dist-check` (the bundle must list `/conversation/[id]`).

```bash
git add -A apps/mobile/app/\(app\)/conversation apps/mobile/components/chat apps/mobile/app/\(app\)/_layout.tsx
git commit -m "feat(mobile): Chat screen — header pills, status change, message thread, read receipts, no-access state

Co-Authored-By: <model that wrote this> <noreply@anthropic.com>"
```

---

### Task 6: Composer — text, smart replies, canned responses, templates, attachments

**Files:**
- Create: `apps/mobile/lib/media-upload.ts`, `apps/mobile/lib/media-upload.test.ts`, `apps/mobile/components/chat/Composer.tsx`, `apps/mobile/app/(app)/conversation/[id]/canned.tsx`, `apps/mobile/app/(app)/conversation/[id]/template.tsx`
- Modify: `apps/mobile/app/(app)/conversation/[id]/index.tsx` (render `<Composer conversation={c} />`)

**Interfaces:**
- Consumes: Task 2 (`canSendFreeForm`, `sendErrorMessage`, `keys`), `useApi`, `config`, Clerk `useAuth().getToken`.
- Produces:
  - `uploadMedia(args: { uri: string; name: string; mimeType: string; getToken: GetToken; baseUrl?: string }): Promise<{ mediaId: string; mimeType: string; filename: string }>` — POST multipart field `file` to `/v1/media/upload`, throws `ApiError` on non-2xx.
  - `contentTypeForMime(mime: string): "image" | "video" | "audio" | "document"`
  - Composer draft handoff: canned and template screens return by `router.back()`; the canned screen sets the draft through `setComposerDraft(conversationId, text)` / `takeComposerDraft(conversationId)` exported from `Composer.tsx`'s module (module-level `Map`).

- [ ] **Step 1: Install pickers**

```bash
cd /e/Product/WhatsApp_CRM/apps/mobile && npx expo install expo-image-picker expo-document-picker
```

Confirm `git diff --stat -- ../../pnpm-lock.yaml` is small (mobile entries only). Add `"expo-image-picker"` with `{ "photosPermission": "Allow WBMSG to attach photos to customer chats." }` to `plugins` in `app.config.ts` if `expo-doctor` asks for it.

- [ ] **Step 2: Write the failing test**

```ts
// apps/mobile/lib/media-upload.test.ts
import { ApiError } from "./api";
import { contentTypeForMime, uploadMedia } from "./media-upload";

describe("contentTypeForMime", () => {
  it("maps MIME types to WhatsApp content types", () => {
    expect(contentTypeForMime("image/jpeg")).toBe("image");
    expect(contentTypeForMime("video/mp4")).toBe("video");
    expect(contentTypeForMime("audio/ogg")).toBe("audio");
    expect(contentTypeForMime("application/pdf")).toBe("document");
  });
});

describe("uploadMedia", () => {
  it("posts multipart with a fresh bearer token and returns the media id", async () => {
    const fetchFn = jest.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ data: { mediaId: "mid-1", mimeType: "image/jpeg", filename: "a.jpg" } }) });
    globalThis.fetch = fetchFn as unknown as typeof fetch;
    const result = await uploadMedia({ uri: "file:///a.jpg", name: "a.jpg", mimeType: "image/jpeg", getToken: async () => "tok", baseUrl: "https://api.test" });
    expect(result).toEqual({ mediaId: "mid-1", mimeType: "image/jpeg", filename: "a.jpg" });
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe("https://api.test/v1/media/upload");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer tok");
    expect(init.headers["Content-Type"]).toBeUndefined();
    expect(init.body).toBeInstanceOf(FormData);
  });
  it("throws ApiError with the API code", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: { code: "NO_FILE", message: "No file uploaded" } }) }) as unknown as typeof fetch;
    await expect(uploadMedia({ uri: "x", name: "x", mimeType: "image/png", getToken: async () => "t", baseUrl: "https://api.test" })).rejects.toMatchObject({ status: 400, code: "NO_FILE" });
    await expect(uploadMedia({ uri: "x", name: "x", mimeType: "image/png", getToken: async () => "t", baseUrl: "https://api.test" })).rejects.toBeInstanceOf(ApiError);
  });
});
```

- [ ] **Step 3: Run test to verify it fails** — `pnpm jest lib/media-upload.test.ts` → FAIL.

- [ ] **Step 4: Implement upload**

```ts
// apps/mobile/lib/media-upload.ts
import { ApiError, type GetToken } from "./api";
import { config } from "./config";

export function contentTypeForMime(mime: string): "image" | "video" | "audio" | "document" {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "document";
}

/** Multipart upload to the API, which forwards the file to WhatsApp and returns its media id. */
export async function uploadMedia(args: { uri: string; name: string; mimeType: string; getToken: GetToken; baseUrl?: string }): Promise<{ mediaId: string; mimeType: string; filename: string }> {
  const token = await args.getToken();
  const form = new FormData();
  // React Native's FormData accepts { uri, name, type } file parts.
  form.append("file", { uri: args.uri, name: args.name, type: args.mimeType } as unknown as Blob);
  const res = await fetch(`${args.baseUrl ?? config.apiUrl}/v1/media/upload`, {
    method: "POST",
    headers: { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: form,
  });
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (json as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiError(res.status, err?.code ?? "HTTP_ERROR", err?.message ?? `Upload failed (${res.status})`);
  }
  const data = (json as { data: { mediaId: string; mimeType: string; filename: string } }).data;
  return { mediaId: data.mediaId, mimeType: data.mimeType, filename: data.filename };
}
```

Run `pnpm jest lib/media-upload.test.ts` → 3 pass.

- [ ] **Step 5: Composer**

```tsx
// apps/mobile/components/chat/Composer.tsx
import { useAuth } from "@clerk/expo";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, useRouter } from "expo-router";
import { FileText, Image as ImageIcon, MessageSquareText, Plus, Send, Sparkles, Zap } from "lucide-react-native";
import { useCallback, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useApi } from "../../lib/api-context";
import { canSendFreeForm, keys, sendErrorMessage, type ConversationItem } from "../../lib/conversations";
import { contentTypeForMime, uploadMedia } from "../../lib/media-upload";
import { colors, font, radius, space } from "../../lib/theme";

const drafts = new Map<string, string>();
export function setComposerDraft(conversationId: string, text: string): void { drafts.set(conversationId, text); }
export function takeComposerDraft(conversationId: string): string | null {
  const t = drafts.get(conversationId) ?? null;
  drafts.delete(conversationId);
  return t;
}

export function Composer({ conversation }: { conversation: ConversationItem }) {
  const api = useApi();
  const { getToken } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const id = conversation.id;
  const [text, setText] = useState("");
  const [menu, setMenu] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const freeForm = canSendFreeForm(conversation);

  useFocusEffect(useCallback(() => {
    const d = takeComposerDraft(id);
    if (d !== null) setText(d);
  }, [id]));

  const suggestions = useQuery({
    queryKey: ["suggestions", id, conversation.lastMessage?.id ?? null],
    queryFn: async () => (await api<{ data: { suggestions: string[] } }>(`/conversations/${id}/suggestions`, { method: "POST" })).data.suggestions,
    enabled: freeForm && conversation.lastMessage?.direction === "inbound",
    staleTime: Infinity,
    retry: false,
  });

  const afterSend = () => {
    void qc.invalidateQueries({ queryKey: keys.messages(id) });
    void qc.invalidateQueries({ queryKey: ["conversations"] });
  };

  const sendText = useMutation({
    mutationFn: (body: string) => api(`/conversations/${id}/messages`, { method: "POST", body: { contentType: "text", text: body } }),
    onMutate: () => setError(null),
    onSuccess: () => { setText(""); afterSend(); },
    onError: (e) => setError(sendErrorMessage(e)),
  });

  const sendFile = useMutation({
    mutationFn: async (f: { uri: string; name: string; mimeType: string }) => {
      const up = await uploadMedia({ ...f, getToken: () => getToken() });
      return api(`/conversations/${id}/messages`, {
        method: "POST",
        body: { contentType: contentTypeForMime(up.mimeType), mediaId: up.mediaId, mimeType: up.mimeType, filename: up.filename },
      });
    },
    onMutate: () => { setError(null); setMenu(false); },
    onSuccess: afterSend,
    onError: (e) => setError(sendErrorMessage(e)),
  });

  async function pickPhoto() {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images", "videos"], quality: 0.8 });
    const a = r.canceled ? null : r.assets[0];
    if (a) sendFile.mutate({ uri: a.uri, name: a.fileName ?? "photo.jpg", mimeType: a.mimeType ?? "image/jpeg" });
  }
  async function pickDocument() {
    const r = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    const a = r.canceled ? null : r.assets[0];
    if (a) sendFile.mutate({ uri: a.uri, name: a.name, mimeType: a.mimeType ?? "application/octet-stream" });
  }

  const busy = sendText.isPending || sendFile.isPending;

  if (!freeForm) {
    return (
      <View style={styles.bar}>
        {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
        <Pressable accessibilityRole="button" style={styles.templateBtn} onPress={() => router.push(`/conversation/${id}/template`)}>
          <FileText size={18} color="#FFFFFF" /><Text style={styles.templateText}>Send template</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.bar}>
      {suggestions.data && suggestions.data.length > 0 && !text ? (
        <View>
          <View style={styles.sugHead}><Sparkles size={14} color="#6D28D9" /><Text style={styles.sugTitle}>Smart replies</Text></View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sugRow}>
            {suggestions.data.map((s) => (
              <Pressable key={s} accessibilityRole="button" onPress={() => setText(s)} style={styles.sug}><Text style={styles.sugText} numberOfLines={1}>{s}</Text></Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
      {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
      <View style={styles.row}>
        <Pressable accessibilityRole="button" accessibilityLabel="More: attach, canned responses, template" onPress={() => setMenu(true)} style={styles.icon} disabled={busy}>
          <Plus size={24} color={colors.text} />
        </Pressable>
        <TextInput
          value={text}
          onChangeText={(t) => { if (t === "/") { setText(""); router.push(`/conversation/${id}/template`); } else setText(t); }}
          placeholder="Message, or / for templates"
          accessibilityLabel="Message"
          multiline
          style={styles.input}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send"
          accessibilityState={{ disabled: !text.trim() || busy, busy }}
          disabled={!text.trim() || busy}
          onPress={() => sendText.mutate(text.trim())}
          style={[styles.send, (!text.trim() || busy) && styles.disabled]}
        >
          {busy ? <ActivityIndicator color="#FFFFFF" /> : <Send size={20} color="#FFFFFF" />}
        </Pressable>
      </View>
      <Modal visible={menu} transparent animationType="slide" onRequestClose={() => setMenu(false)}>
        <Pressable style={styles.backdrop} onPress={() => setMenu(false)} accessibilityLabel="Close menu" />
        <View style={styles.sheet} accessibilityRole="menu">
          {[
            { label: "Attach photo or video", Icon: ImageIcon, onPress: () => void pickPhoto() },
            { label: "Attach document", Icon: FileText, onPress: () => void pickDocument() },
            { label: "Canned responses", Icon: Zap, onPress: () => { setMenu(false); router.push(`/conversation/${id}/canned`); } },
            { label: "Send template", Icon: MessageSquareText, onPress: () => { setMenu(false); router.push(`/conversation/${id}/template`); } },
          ].map(({ label, Icon, onPress }) => (
            <Pressable key={label} accessibilityRole="menuitem" onPress={onPress} style={styles.menuItem}>
              <Icon size={22} color={colors.brand} /><Text style={styles.menuText}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: space.sm, paddingTop: space.sm, paddingBottom: space.md, gap: space.sm },
  row: { flexDirection: "row", alignItems: "flex-end", gap: 4 },
  icon: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  input: { flex: 1, minHeight: 44, maxHeight: 120, borderRadius: 22, backgroundColor: colors.background, paddingHorizontal: 14, paddingTop: 11, paddingBottom: 11, fontFamily: font.regular, fontSize: 16, color: colors.text },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  disabled: { opacity: 0.5 },
  sugHead: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 4 },
  sugTitle: { fontFamily: font.semibold, fontSize: 12, color: "#6D28D9" },
  sugRow: { gap: space.sm, paddingHorizontal: 4, paddingTop: 6 },
  sug: { maxWidth: 260, minHeight: 36, justifyContent: "center", paddingHorizontal: space.md, borderRadius: 18, borderWidth: 1, borderColor: "#DDD6FE", backgroundColor: "#F5F3FF" },
  sugText: { fontFamily: font.medium, fontSize: 13, color: "#4C1D95" },
  error: { fontFamily: font.medium, fontSize: 13, color: colors.danger, paddingHorizontal: 4 },
  templateBtn: { flexDirection: "row", gap: space.sm, height: 48, borderRadius: radius.md, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  templateText: { fontFamily: font.semibold, fontSize: 16, color: "#FFFFFF" },
  backdrop: { flex: 1, backgroundColor: "rgba(17,24,39,0.35)" },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: space.sm, paddingBottom: space.xxl },
  menuItem: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 52, paddingHorizontal: space.lg },
  menuText: { fontFamily: font.regular, fontSize: 16, color: colors.text },
});
```

In the Chat screen replace the placeholder `View` with `<Composer conversation={c} />` and import it.

- [ ] **Step 6: Canned responses sheet**

```tsx
// apps/mobile/app/(app)/conversation/[id]/canned.tsx
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { setComposerDraft } from "../../../../components/chat/Composer";
import { useApi } from "../../../../lib/api-context";
import { colors, font, radius, space } from "../../../../lib/theme";

interface Canned { id: string; name: string; shortcut: string | null; content: string; category: string }

export default function CannedScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useApi();
  const router = useRouter();
  const [q, setQ] = useState("");
  const list = useQuery({ queryKey: ["canned-responses"], queryFn: () => api<{ data: Canned[] }>("/canned-responses") });
  const needle = q.trim().toLowerCase();
  const items = (list.data?.data ?? [])
    .filter((c) => c.category === "general")
    .filter((c) => !needle || c.name.toLowerCase().includes(needle) || (c.shortcut ?? "").toLowerCase().includes(needle) || c.content.toLowerCase().includes(needle));

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.head}>
        <Text style={styles.title} accessibilityRole="header">Canned responses</Text>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.close}><Text style={styles.closeText}>Close</Text></Pressable>
      </View>
      <TextInput value={q} onChangeText={setQ} placeholder="Search" accessibilityLabel="Search canned responses" style={styles.search} />
      {list.isLoading ? <ActivityIndicator color={colors.brand} /> : (
        <FlatList
          data={items}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => (
            <Pressable accessibilityRole="button" onPress={() => { setComposerDraft(id, item.content); router.back(); }} style={styles.item}>
              <Text style={styles.name}>{item.name}{item.shortcut ? `  /${item.shortcut}` : ""}</Text>
              <Text style={styles.content} numberOfLines={2}>{item.content}</Text>
            </Pressable>
          )}
          ListEmptyComponent={<Text style={styles.empty}>{list.error ? "Couldn't load canned responses." : "No canned responses yet. Add them on the web dashboard."}</Text>}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  head: { flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg, paddingVertical: space.sm },
  title: { flex: 1, fontFamily: font.bold, fontSize: 18, color: colors.text },
  close: { minHeight: 44, justifyContent: "center", paddingHorizontal: space.sm },
  closeText: { fontFamily: font.semibold, fontSize: 15, color: colors.brand },
  search: { marginHorizontal: space.lg, marginBottom: space.sm, height: 42, borderRadius: radius.md, backgroundColor: colors.background, paddingHorizontal: space.md, fontFamily: font.regular, fontSize: 15 },
  item: { paddingHorizontal: space.lg, paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
  name: { fontFamily: font.semibold, fontSize: 15, color: colors.text },
  content: { fontFamily: font.regular, fontSize: 14, color: colors.textMuted, marginTop: 2 },
  empty: { fontFamily: font.regular, fontSize: 15, color: colors.textMuted, textAlign: "center", padding: space.xl },
});
```

- [ ] **Step 7: Template picker** (mockup 2.3, aligned: no variable inputs)

```tsx
// apps/mobile/app/(app)/conversation/[id]/template.tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useApi } from "../../../../lib/api-context";
import { keys, sendErrorMessage } from "../../../../lib/conversations";
import { colors, font, radius, space } from "../../../../lib/theme";

interface Template { id: string; name: string; category: string; language: string; status: string; headerText: string | null; bodyText: string | null; footerText: string | null }

export default function TemplateScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useApi();
  const router = useRouter();
  const qc = useQueryClient();
  const [picked, setPicked] = useState<Template | null>(null);
  const [error, setError] = useState<string | null>(null);
  const list = useQuery({ queryKey: ["templates"], queryFn: () => api<{ data: Template[] }>("/templates") });
  const approved = (list.data?.data ?? []).filter((t) => t.status === "approved");

  const send = useMutation({
    mutationFn: (t: Template) => api(`/conversations/${id}/messages`, { method: "POST", body: { contentType: "template", templateId: t.id } }),
    onMutate: () => setError(null),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.messages(id) });
      void qc.invalidateQueries({ queryKey: ["conversations"] });
      router.back();
    },
    onError: (e) => setError(sendErrorMessage(e)),
  });

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.head}>
        <Text style={styles.title} accessibilityRole="header">Choose a template</Text>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.close}><Text style={styles.closeText}>Close</Text></Pressable>
      </View>
      {list.isLoading ? <ActivityIndicator color={colors.brand} /> : (
        <FlatList
          data={approved}
          keyExtractor={(t) => t.id}
          renderItem={({ item }) => {
            const on = picked?.id === item.id;
            return (
              <Pressable accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => setPicked(item)} style={[styles.item, on && styles.itemOn]}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.meta}>{item.category} · {item.language}</Text>
              </Pressable>
            );
          }}
          ListEmptyComponent={<Text style={styles.empty}>{list.error ? "Couldn't load templates." : "No approved templates yet."}</Text>}
        />
      )}
      {picked ? (
        <View style={styles.preview}>
          <Text style={styles.previewLabel}>Preview</Text>
          <View style={styles.bubble}>
            {picked.headerText ? <Text style={styles.bubbleHeader}>{picked.headerText}</Text> : null}
            <Text style={styles.bubbleBody}>{picked.bodyText ?? ""}</Text>
            {picked.footerText ? <Text style={styles.bubbleFooter}>{picked.footerText}</Text> : null}
          </View>
          <Text style={styles.note}>Variables like {"{{1}}"} are filled from this contact's details. Meta charges template messages, so this counts toward your monthly billable messages.</Text>
          {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
          <Pressable accessibilityRole="button" accessibilityState={{ busy: send.isPending, disabled: send.isPending }} disabled={send.isPending} onPress={() => send.mutate(picked)} style={styles.sendBtn}>
            {send.isPending ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.sendText}>Send template</Text>}
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  head: { flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg, paddingVertical: space.sm },
  title: { flex: 1, fontFamily: font.bold, fontSize: 18, color: colors.text },
  close: { minHeight: 44, justifyContent: "center", paddingHorizontal: space.sm },
  closeText: { fontFamily: font.semibold, fontSize: 15, color: colors.brand },
  item: { paddingHorizontal: space.lg, paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: "#F3F4F6", minHeight: 56 },
  itemOn: { backgroundColor: "#F0FDF4" },
  name: { fontFamily: "monospace", fontSize: 15, color: colors.text },
  meta: { fontFamily: font.regular, fontSize: 13, color: colors.textMuted, marginTop: 2 },
  empty: { fontFamily: font.regular, fontSize: 15, color: colors.textMuted, textAlign: "center", padding: space.xl },
  preview: { borderTopWidth: 1, borderTopColor: colors.border, padding: space.lg, gap: space.sm },
  previewLabel: { fontFamily: font.semibold, fontSize: 13, color: colors.textMuted },
  bubble: { alignSelf: "flex-end", maxWidth: "90%", backgroundColor: colors.bubbleOut, borderRadius: 14, borderTopRightRadius: 4, padding: space.md, gap: 4 },
  bubbleHeader: { fontFamily: font.semibold, fontSize: 14, color: colors.text },
  bubbleBody: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: colors.text },
  bubbleFooter: { fontFamily: font.regular, fontSize: 12, color: colors.textMuted },
  note: { fontFamily: font.regular, fontSize: 12, color: colors.textMuted },
  error: { fontFamily: font.medium, fontSize: 13, color: colors.danger },
  sendBtn: { height: 52, borderRadius: radius.md, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  sendText: { fontFamily: font.semibold, fontSize: 16, color: "#FFFFFF" },
});
```

- [ ] **Step 8: Verify and commit**

Run: `pnpm jest && pnpm tsc --noEmit && npx expo-doctor && npx expo export --platform android --output-dir dist-check && rm -rf dist-check`

```bash
git add apps/mobile pnpm-lock.yaml
git commit -m "feat(mobile): composer — text, smart replies, canned responses, approved templates, photo and document attachments

Co-Authored-By: <model that wrote this> <noreply@anthropic.com>"
```

---

### Task 7: Assign and label sheets

**Files:**
- Create: `apps/mobile/app/(app)/conversation/[id]/assign.tsx`, `apps/mobile/app/(app)/conversation/[id]/label.tsx`

**Interfaces:**
- Consumes: `POST /conversations/:id/assign { assignedTo: string | null }` (404 for a user outside the org — Plan 1), `GET /users` → `{ data: { id, fullName, email, role }[] }`, `GET /inbox-labels` → `{ data: { id, name, color }[] }`, `PUT /conversations/:id/label { name }`, `DELETE /conversations/:id/label`.

- [ ] **Step 1: Assign sheet** (mockup 2.5 without availability dots — `/users` does not return availability)

```tsx
// apps/mobile/app/(app)/conversation/[id]/assign.tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useApi } from "../../../../lib/api-context";
import { keys, type ConversationItem } from "../../../../lib/conversations";
import { useMe } from "../../../../lib/me-context";
import { colors, font, radius, space } from "../../../../lib/theme";

interface UserRow { id: string; fullName: string; email: string; role: string }
const ROLE: Record<string, string> = { admin: "Admin", manager: "Manager", agent: "Agent", viewer: "Viewer" };

export default function AssignScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useApi();
  const me = useMe();
  const router = useRouter();
  const qc = useQueryClient();
  const conv = qc.getQueryData<ConversationItem>(keys.detail(id));
  const [picked, setPicked] = useState<string | null>(conv?.assignedTo ?? null);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const users = useQuery({ queryKey: ["users"], queryFn: () => api<{ data: UserRow[] }>("/users"), staleTime: 5 * 60_000 });
  const needle = q.trim().toLowerCase();
  const list = (users.data?.data ?? []).filter((u) => u.role !== "superAdmin" && (!needle || u.fullName.toLowerCase().includes(needle) || u.email.toLowerCase().includes(needle)));

  const assign = useMutation({
    mutationFn: (assignedTo: string | null) => api(`/conversations/${id}/assign`, { method: "POST", body: { assignedTo } }),
    onMutate: () => setError(null),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["conversations"] }); void qc.invalidateQueries({ queryKey: ["unread-count"] }); router.back(); },
    onError: () => setError("Couldn't assign. The person may no longer be active — refresh and try again."),
  });

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.head}>
        <Text style={styles.title} accessibilityRole="header">Assign to</Text>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.close}><Text style={styles.closeText}>Close</Text></Pressable>
      </View>
      <TextInput value={q} onChangeText={setQ} placeholder="Search agents…" accessibilityLabel="Search agents" style={styles.search} />
      {users.isLoading ? <ActivityIndicator color={colors.brand} /> : (
        <FlatList
          data={list}
          keyExtractor={(u) => u.id}
          renderItem={({ item }) => {
            const on = picked === item.id;
            return (
              <Pressable accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => setPicked(item.id)} style={[styles.item, on && styles.itemOn]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.fullName}{item.id === me.id ? " (you)" : ""}</Text>
                  <Text style={styles.meta}>{ROLE[item.role] ?? item.role} · {item.email}</Text>
                </View>
                <View style={[styles.radio, on && styles.radioOn]} />
              </Pressable>
            );
          }}
          ListEmptyComponent={<Text style={styles.empty}>{users.error ? "Couldn't load your team." : "No one matches."}</Text>}
        />
      )}
      {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" disabled={assign.isPending} onPress={() => assign.mutate(null)} style={styles.secondary}><Text style={styles.secondaryText}>Unassign</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={!picked || assign.isPending} onPress={() => picked && assign.mutate(picked)} style={[styles.primary, (!picked || assign.isPending) && styles.disabled]}>
          {assign.isPending ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>Assign</Text>}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  head: { flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg, paddingVertical: space.sm },
  title: { flex: 1, fontFamily: font.bold, fontSize: 18, color: colors.text },
  close: { minHeight: 44, justifyContent: "center", paddingHorizontal: space.sm },
  closeText: { fontFamily: font.semibold, fontSize: 15, color: colors.brand },
  search: { marginHorizontal: space.lg, marginBottom: space.sm, height: 42, borderRadius: radius.md, backgroundColor: colors.background, paddingHorizontal: space.md, fontFamily: font.regular, fontSize: 15 },
  item: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, minHeight: 60 },
  itemOn: { backgroundColor: "#F0FDF4" },
  name: { fontFamily: font.semibold, fontSize: 15, color: colors.text },
  meta: { fontFamily: font.regular, fontSize: 13, color: colors.textMuted },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: "#9CA3AF" },
  radioOn: { borderWidth: 7, borderColor: colors.brand },
  empty: { fontFamily: font.regular, fontSize: 15, color: colors.textMuted, textAlign: "center", padding: space.xl },
  error: { fontFamily: font.medium, fontSize: 13, color: colors.danger, paddingHorizontal: space.lg },
  actions: { flexDirection: "row", gap: space.md, padding: space.lg },
  secondary: { flex: 1, height: 52, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  secondaryText: { fontFamily: font.semibold, fontSize: 15, color: colors.text },
  primary: { flex: 2, height: 52, borderRadius: radius.md, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  primaryText: { fontFamily: font.semibold, fontSize: 15, color: "#FFFFFF" },
  disabled: { opacity: 0.5 },
});
```

- [ ] **Step 2: Label sheet** (one inbox label per chat; pick existing or clear)

```tsx
// apps/mobile/app/(app)/conversation/[id]/label.tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useApi } from "../../../../lib/api-context";
import { keys, type ConversationItem, type ConversationLabel } from "../../../../lib/conversations";
import { colors, font, space } from "../../../../lib/theme";

export default function LabelScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useApi();
  const router = useRouter();
  const qc = useQueryClient();
  const current = qc.getQueryData<ConversationItem>(keys.detail(id))?.label ?? null;
  const [error, setError] = useState<string | null>(null);
  const labels = useQuery({ queryKey: ["inbox-labels"], queryFn: () => api<{ data: ConversationLabel[] }>("/inbox-labels") });

  const done = () => { void qc.invalidateQueries({ queryKey: ["conversations"] }); router.back(); };
  const setLabel = useMutation({
    mutationFn: (name: string) => api(`/conversations/${id}/label`, { method: "PUT", body: { name } }),
    onSuccess: done,
    onError: () => setError("Couldn't set the label. Try again."),
  });
  const clearLabel = useMutation({
    mutationFn: () => api(`/conversations/${id}/label`, { method: "DELETE" }),
    onSuccess: done,
    onError: () => setError("Couldn't clear the label. Try again."),
  });
  const busy = setLabel.isPending || clearLabel.isPending;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.head}>
        <Text style={styles.title} accessibilityRole="header">Inbox label</Text>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.close}><Text style={styles.closeText}>Close</Text></Pressable>
      </View>
      {labels.isLoading ? <ActivityIndicator color={colors.brand} /> : (
        <FlatList
          data={labels.data?.data ?? []}
          keyExtractor={(l) => l.id}
          renderItem={({ item }) => (
            <Pressable accessibilityRole="radio" accessibilityState={{ checked: current?.id === item.id, disabled: busy }} disabled={busy} onPress={() => setLabel.mutate(item.name)} style={styles.item}>
              <View style={[styles.dot, { backgroundColor: item.color }]} />
              <Text style={styles.name}>{item.name}</Text>
              {current?.id === item.id ? <Text style={styles.current}>Current</Text> : null}
            </Pressable>
          )}
          ListEmptyComponent={<Text style={styles.empty}>{labels.error ? "Couldn't load labels." : "No inbox labels yet. Create them on the web dashboard."}</Text>}
        />
      )}
      {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
      {current ? (
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => clearLabel.mutate()} style={styles.clear}>
          <Text style={styles.clearText}>Remove label</Text>
        </Pressable>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  head: { flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg, paddingVertical: space.sm },
  title: { flex: 1, fontFamily: font.bold, fontSize: 18, color: colors.text },
  close: { minHeight: 44, justifyContent: "center", paddingHorizontal: space.sm },
  closeText: { fontFamily: font.semibold, fontSize: 15, color: colors.brand },
  item: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, minHeight: 52 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  name: { flex: 1, fontFamily: font.medium, fontSize: 15, color: colors.text },
  current: { fontFamily: font.semibold, fontSize: 12, color: colors.brand },
  empty: { fontFamily: font.regular, fontSize: 15, color: colors.textMuted, textAlign: "center", padding: space.xl },
  error: { fontFamily: font.medium, fontSize: 13, color: colors.danger, paddingHorizontal: space.lg },
  clear: { margin: space.lg, minHeight: 48, alignItems: "center", justifyContent: "center" },
  clearText: { fontFamily: font.semibold, fontSize: 15, color: colors.danger },
});
```

- [ ] **Step 3: Verify and commit**

Run: `pnpm tsc --noEmit && pnpm jest && npx expo export --platform android --output-dir dist-check && rm -rf dist-check`

```bash
git add apps/mobile/app/\(app\)/conversation
git commit -m "feat(mobile): assign and inbox-label sheets for a chat

Co-Authored-By: <model that wrote this> <noreply@anthropic.com>"
```

---

### Task 8: Contact Details

**Files:**
- Modify: `apps/mobile/app/(app)/contact/[id].tsx` (replace placeholder)

**Interfaces:**
- Consumes: `GET /contacts/:id` → `{ data: { id, firstName, lastName, name, phoneNumber, email, tags: string[], notes: string | null, disableBot: boolean, waBlockedAt: string | null, createdAt, leadStatus: { id, name, color } | null, groupIds: string[], customFields: Record<string, unknown>, assignedUser: { id, fullName } | null, country: { name } | null } }`; `GET /deals?contactId=` → `{ data: { id, title, value, stage }[] }`; `GET /lead-statuses` → `{ data: { id, name, color }[] }`; `GET /contact-groups` → `{ data: { id, title }[] }`; `GET /custom-fields` → `{ data: { fieldKey, inputName }[] }`; `PATCH /contacts/:id { tags? , leadStatusId? }`; `PUT /contacts/:id/notes { notes }`; `POST /contacts/:id/toggle-bot { disabled }`; `POST /contacts/:id/block` / `/unblock`. 403 on edits → "You don't have permission to edit contacts."

- [ ] **Step 1: Contact screen** (mockup 2.4 aligned: Details, Tags, Custom fields, Notes (one field), Deals, Bot replies, Block)

```tsx
// apps/mobile/app/(app)/contact/[id].tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiError } from "../../../lib/api";
import { useApi } from "../../../lib/api-context";
import { colors, font, radius, space } from "../../../lib/theme";

interface Contact {
  id: string; firstName: string | null; lastName: string | null; name: string | null; phoneNumber: string; email: string | null;
  tags: string[]; notes: string | null; disableBot: boolean; waBlockedAt: string | null; createdAt: string;
  leadStatus: { id: string; name: string; color: string } | null; groupIds: string[]; customFields: Record<string, unknown>;
  assignedUser: { id: string; fullName: string } | null; country: { name: string } | null;
}
interface Named { id: string; name: string; color?: string }

function editError(e: unknown): string {
  return e instanceof ApiError && e.status === 403 ? "You don't have permission to edit contacts." : "Couldn't save. Check your connection and try again.";
}

export default function ContactScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useApi();
  const router = useRouter();
  const qc = useQueryClient();
  const key = ["contacts", "detail", id] as const;
  const contact = useQuery({ queryKey: key, queryFn: async () => (await api<{ data: Contact }>(`/contacts/${id}`)).data });
  const deals = useQuery({ queryKey: ["deals", "contact", id], queryFn: () => api<{ data: { id: string; title: string; value: string | null; stage: string }[] }>(`/deals?contactId=${id}`), retry: false });
  const statuses = useQuery({ queryKey: ["lead-statuses"], queryFn: () => api<{ data: Named[] }>("/lead-statuses"), staleTime: 10 * 60_000 });
  const groups = useQuery({ queryKey: ["contact-groups"], queryFn: () => api<{ data: { id: string; title: string }[] }>("/contact-groups"), staleTime: 10 * 60_000, retry: false });
  const fields = useQuery({ queryKey: ["custom-fields"], queryFn: () => api<{ data: { fieldKey: string; inputName: string }[] }>("/custom-fields"), staleTime: 10 * 60_000, retry: false });

  const [notes, setNotes] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (contact.data) setNotes(contact.data.notes ?? ""); }, [contact.data?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = () => void qc.invalidateQueries({ queryKey: key });
  const patch = useMutation({ mutationFn: (body: { tags?: string[]; leadStatusId?: string }) => api(`/contacts/${id}`, { method: "PATCH", body }), onMutate: () => setError(null), onSuccess: refresh, onError: (e) => setError(editError(e)) });
  const saveNotes = useMutation({ mutationFn: (n: string) => api(`/contacts/${id}/notes`, { method: "PUT", body: { notes: n } }), onMutate: () => { setError(null); setSaved(false); }, onSuccess: () => { setSaved(true); refresh(); }, onError: (e) => setError(editError(e)) });
  const toggleBot = useMutation({ mutationFn: (disabled: boolean) => api(`/contacts/${id}/toggle-bot`, { method: "POST", body: { disabled } }), onMutate: () => setError(null), onSuccess: refresh, onError: (e) => setError(editError(e)) });
  const block = useMutation({ mutationFn: (on: boolean) => api(`/contacts/${id}/${on ? "block" : "unblock"}`, { method: "POST" }), onMutate: () => setError(null), onSuccess: refresh, onError: (e) => setError(editError(e)) });

  if (contact.isLoading) return <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>;
  if (contact.error || !contact.data) {
    const noAccess = contact.error instanceof ApiError && (contact.error.status === 404 || contact.error.status === 403);
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.stateTitle}>{noAccess ? "You don't have access to this contact" : "Couldn't load this contact"}</Text>
        <Pressable accessibilityRole="button" onPress={() => (noAccess ? router.back() : void contact.refetch())} style={styles.primary}><Text style={styles.primaryText}>{noAccess ? "Back" : "Try again"}</Text></Pressable>
      </SafeAreaView>
    );
  }
  const c = contact.data;
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ") || c.name || c.phoneNumber;
  const groupNames = (groups.data?.data ?? []).filter((g) => c.groupIds.includes(g.id)).map((g) => g.title);
  const customRows = (fields.data?.data ?? []).filter((f) => c.customFields?.[f.fieldKey] !== undefined && c.customFields[f.fieldKey] !== "" && c.customFields[f.fieldKey] !== null);
  const blocked = c.waBlockedAt !== null;

  function chooseLeadStatus() {
    const list = statuses.data?.data ?? [];
    Alert.alert("Lead status", undefined, [...list.map((s) => ({ text: s.name, onPress: () => patch.mutate({ leadStatusId: s.id }) })), { text: "Cancel", style: "cancel" as const }]);
  }
  function addTag() {
    const t = tagDraft.trim();
    if (!t || c.tags.includes(t)) return;
    patch.mutate({ tags: [...c.tags, t] });
    setTagDraft("");
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.head}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={styles.icon}><ChevronLeft size={26} color={colors.text} /></Pressable>
        <Text style={styles.headTitle} accessibilityRole="header">Contact Details</Text>
        <View style={styles.icon} />
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <Text style={styles.name}>{name}</Text>
          <Text style={styles.sub}>{c.phoneNumber}{c.country ? ` · ${c.country.name}` : ""}</Text>
        </View>
        {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}

        <Text style={styles.sec}>DETAILS</Text>
        <View style={styles.card}>
          <Pressable accessibilityRole="button" onPress={chooseLeadStatus} style={styles.row}><Text style={styles.k}>Lead status</Text><Text style={styles.v}>{c.leadStatus?.name ?? "None"}</Text></Pressable>
          <View style={styles.row}><Text style={styles.k}>Assigned to</Text><Text style={styles.v}>{c.assignedUser?.fullName ?? "Nobody"}</Text></View>
          {c.email ? <View style={styles.row}><Text style={styles.k}>Email</Text><Text style={styles.v}>{c.email}</Text></View> : null}
          {groupNames.length ? <View style={styles.row}><Text style={styles.k}>Groups</Text><Text style={styles.v}>{groupNames.join(", ")}</Text></View> : null}
          <View style={styles.row}><Text style={styles.k}>First contact</Text><Text style={styles.v}>{new Date(c.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</Text></View>
        </View>

        <Text style={styles.sec}>TAGS</Text>
        <View style={styles.tags}>
          {c.tags.map((t) => (
            <Pressable key={t} accessibilityRole="button" accessibilityLabel={`Remove tag ${t}`} onPress={() => patch.mutate({ tags: c.tags.filter((x) => x !== t) })} style={styles.tag}>
              <Text style={styles.tagText}>{t}</Text><X size={12} color={colors.textMuted} />
            </Pressable>
          ))}
          <TextInput value={tagDraft} onChangeText={setTagDraft} onSubmitEditing={addTag} placeholder="Add tag…" accessibilityLabel="Add tag" returnKeyType="done" autoCapitalize="none" style={styles.tagInput} />
        </View>

        {customRows.length ? (
          <>
            <Text style={styles.sec}>CUSTOM FIELDS</Text>
            <View style={styles.card}>
              {customRows.map((f) => <View key={f.fieldKey} style={styles.row}><Text style={styles.k}>{f.inputName}</Text><Text style={styles.v}>{String(c.customFields[f.fieldKey])}</Text></View>)}
            </View>
          </>
        ) : null}

        <Text style={styles.sec}>NOTES</Text>
        <View style={[styles.card, { padding: space.md }]}>
          <TextInput value={notes} onChangeText={(t) => { setNotes(t); setSaved(false); }} placeholder="Add a note…" accessibilityLabel="Notes" multiline style={styles.notes} />
          <View style={styles.notesBar}>
            {saved ? <Text style={styles.saved}>Saved</Text> : null}
            <Pressable accessibilityRole="button" disabled={saveNotes.isPending || notes === (c.notes ?? "")} onPress={() => saveNotes.mutate(notes)} style={[styles.small, (saveNotes.isPending || notes === (c.notes ?? "")) && styles.disabled]}>
              <Text style={styles.smallText}>Save note</Text>
            </Pressable>
          </View>
        </View>

        <Text style={styles.sec}>DEALS</Text>
        <View style={styles.card}>
          {(deals.data?.data ?? []).length === 0 ? <View style={styles.row}><Text style={styles.k}>{deals.error ? "Deals aren't available for your role." : "No deals yet"}</Text></View> : (deals.data?.data ?? []).map((d) => (
            <View key={d.id} style={styles.row}><Text style={[styles.k, { color: colors.text }]}>{d.title}</Text><Text style={styles.v}>{d.stage}{d.value ? ` · ${d.value}` : ""}</Text></View>
          ))}
        </View>

        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={[styles.k, { color: colors.text }]}>Bot replies for this contact</Text>
            <Switch accessibilityLabel="Bot replies for this contact" value={!c.disableBot} disabled={toggleBot.isPending} onValueChange={(on) => toggleBot.mutate(!on)} trackColor={{ true: colors.brand, false: "#D1D5DB" }} />
          </View>
          <Pressable accessibilityRole="button" disabled={block.isPending} onPress={() => Alert.alert(blocked ? "Unblock this contact?" : "Block this contact?", undefined, [{ text: "Cancel", style: "cancel" }, { text: blocked ? "Unblock" : "Block", style: "destructive", onPress: () => block.mutate(!blocked) }])} style={styles.row}>
            <Text style={styles.danger}>{blocked ? "Unblock contact" : "Block contact"}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  head: { flexDirection: "row", alignItems: "center", backgroundColor: colors.background },
  icon: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headTitle: { flex: 1, textAlign: "center", fontFamily: font.semibold, fontSize: 16, color: colors.text },
  body: { padding: space.lg, gap: space.md, paddingBottom: space.xxl },
  hero: { alignItems: "center", gap: 4 },
  name: { fontFamily: font.bold, fontSize: 22, color: colors.text },
  sub: { fontFamily: font.regular, fontSize: 14, color: colors.textMuted },
  sec: { fontFamily: font.semibold, fontSize: 13, color: colors.textMuted, letterSpacing: 0.5, marginTop: space.sm },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, paddingHorizontal: space.lg },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 48, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
  k: { flex: 1, fontFamily: font.regular, fontSize: 14, color: colors.textMuted },
  v: { fontFamily: font.medium, fontSize: 14, color: colors.text, flexShrink: 1, textAlign: "right" },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, alignItems: "center" },
  tag: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 32, paddingHorizontal: space.md, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  tagText: { fontFamily: font.semibold, fontSize: 13, color: colors.text },
  tagInput: { minWidth: 110, minHeight: 32, paddingHorizontal: space.md, borderRadius: 16, borderWidth: 1, borderStyle: "dashed", borderColor: colors.brand, fontFamily: font.regular, fontSize: 13 },
  notes: { minHeight: 80, fontFamily: font.regular, fontSize: 15, lineHeight: 21, color: colors.text, textAlignVertical: "top" },
  notesBar: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: space.md },
  saved: { fontFamily: font.semibold, fontSize: 12, color: colors.brand },
  small: { minHeight: 36, paddingHorizontal: space.md, borderRadius: radius.sm, backgroundColor: colors.brand, justifyContent: "center" },
  smallText: { fontFamily: font.semibold, fontSize: 13, color: "#FFFFFF" },
  disabled: { opacity: 0.5 },
  danger: { fontFamily: font.semibold, fontSize: 15, color: colors.danger },
  error: { fontFamily: font.medium, fontSize: 14, color: colors.danger },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: space.md, padding: space.xl, backgroundColor: colors.surface },
  stateTitle: { fontFamily: font.bold, fontSize: 18, color: colors.text, textAlign: "center" },
  primary: { minHeight: 48, paddingHorizontal: space.xl, borderRadius: radius.md, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  primaryText: { fontFamily: font.semibold, fontSize: 16, color: "#FFFFFF" },
});
```

Before writing, confirm two shapes in the API and adapt field names only if they differ: the `GET /contacts/:id` response (fields above, `apps/api/src/routes/contacts.ts:409-436`) and how `customFields` is keyed (by `fieldKey` — check `apps/web/components/contacts/EditContactDrawer.tsx`). If the custom-fields endpoint or deals endpoint returns 403 for the role, those sections show their fallback text (no crash).

- [ ] **Step 2: Verify and commit**

Run: `pnpm tsc --noEmit && pnpm jest && npx expo export --platform android --output-dir dist-check && rm -rf dist-check`

```bash
git add apps/mobile/app/\(app\)/contact
git commit -m "feat(mobile): Contact Details — lead status, tags, custom fields, notes, deals, bot replies, block

Co-Authored-By: <model that wrote this> <noreply@anthropic.com>"
```

---

## Follow-ups (not in this plan)

- Inline image/video/audio rendering and opening documents (thread shows labelled placeholders).
- Interactive messages, bot automations, create deal, media library in the composer (web only for now).
- Typing indicator (`POST /conversations/:id/typing`).
- Web bug found while planning: the web inbox's "Closed" tab sends `status=closed`, which is not a `ConversationStatus` value — investigate separately (the mobile app uses `resolved`).
- Device check by the owner (same build as Plan 2): open a chat from a push with the app closed; reply inside the window; send a template after 24 h; attach a photo; assign; label; resolve; edit tags/notes.
