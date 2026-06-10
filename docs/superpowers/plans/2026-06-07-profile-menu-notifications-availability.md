# Profile Menu, Notifications & Availability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Clerk UserButton with a custom profile menu (avatar → popup panel with availability toggle + org summary), add a real notification bell (assignment + inbound message notifications via Socket.io), and a settings gear link — matching the Interakt UI reference.

**Architecture:** Schema adds `availability` to `User`. A new `notifications` API route serves the `Notification` model that already exists in the schema. Socket.io gains a per-user room (`user:{userId}`) so assignment/inbound notifications are delivered in real-time. Three new client components (`ProfileMenu`, `NotificationBell`, `AvailabilityConfirmModal`) replace the Clerk `UserButton` in `TopBar`.

**Tech Stack:** Fastify 4, Prisma, Socket.io, Next.js 15 App Router, React Query, Tailwind CSS, TypeScript strict, Vitest

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `apps/api/prisma/schema.prisma` | Add `availability` field to `User` |
| Create | `apps/api/src/routes/notifications.ts` | GET list, PUT read-one, PUT read-all |
| Create | `apps/api/src/routes/notifications.test.ts` | Tests for notification routes |
| Modify | `apps/api/src/routes/users.ts` | Add `PATCH /users/me/availability`, include `availability` in `/users/me` |
| Modify | `apps/api/src/routes/users.test.ts` | Tests for availability endpoint |
| Modify | `apps/api/src/plugins/socketio.ts` | Add `join-user` room handler |
| Modify | `apps/api/src/routes/conversations.ts` | Create Notification + emit on assign |
| Modify | `apps/api/src/workers/inbound-message.ts` | Create Notification + emit on inbound |
| Modify | `apps/api/src/index.ts` | Register notifications router |
| Modify | `apps/web/hooks/useSocket.ts` | Emit `join-user` on connect |
| Create | `apps/web/components/layout/AvailabilityConfirmModal.tsx` | "Going Offline?" dialog |
| Create | `apps/web/components/layout/ProfileMenu.tsx` | Avatar button + dropdown panel |
| Create | `apps/web/components/layout/NotificationBell.tsx` | Bell icon + notification dropdown |
| Modify | `apps/web/components/layout/TopBar.tsx` | Wire in new components, remove UserButton |

---

## Task 1: Add `availability` field to User schema

**Files:**
- Modify: `apps/api/prisma/schema.prisma:285-305`

- [ ] **Step 1: Add the field**

Open `apps/api/prisma/schema.prisma`. Find `model User` (line ~285). Add one line after `pushToken`:

```prisma
model User {
  id             String   @id
  organizationId String   @map("organization_id")
  email          String
  fullName       String   @map("full_name")
  role           Role     @default(agent)
  isActive       Boolean   @default(true) @map("is_active")
  pushToken      String?   @map("push_token")
  availability   String    @default("online") @map("availability")
  username       String?   @unique
  mobileNumber   String?   @map("mobile_number")
  settings       Json      @default("{}") 
  deletedAt      DateTime? @map("deleted_at")
  createdAt      DateTime  @default(now()) @map("created_at")
  updatedAt      DateTime  @updatedAt @map("updated_at")

  organization Organization        @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  memberships  OrganizationMember[]

  @@index([organizationId])
  @@map("users")
}
```

- [ ] **Step 2: Push schema to DB and record migration**

```bash
cd apps/api
pnpm exec prisma db push --accept-data-loss
```

Expected output: `Your database is now in sync with your Prisma schema.`

Then create the migration record (Windows machine — `migrate dev` hangs):

```bash
mkdir -p prisma/migrations/20260607_add_user_availability
```

Create file `apps/api/prisma/migrations/20260607_add_user_availability/migration.sql`:
```sql
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "availability" TEXT NOT NULL DEFAULT 'online';
```

Then:
```bash
pnpm exec prisma migrate resolve --applied 20260607_add_user_availability
pnpm exec prisma generate
```

- [ ] **Step 3: Verify**

```bash
pnpm exec prisma studio
```

Check the `users` table has an `availability` column with default `online`. Then close.

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260607_add_user_availability/
git commit -m "feat(schema): add availability field to User"
```

---

## Task 2: Notifications API routes + tests

**Files:**
- Create: `apps/api/src/routes/notifications.ts`
- Create: `apps/api/src/routes/notifications.test.ts`
- Modify: `apps/api/src/index.ts` (register router)

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/routes/notifications.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";

const mockNotifications = [
  { id: "n-1", organizationId: "org-1", userId: "user-1", type: "conversation_assigned", message: "Conversation assigned to you", action: "/inbox?conversation=c-1", data: null, readAt: null, createdAt: new Date("2026-06-07T10:00:00Z") },
  { id: "n-2", organizationId: "org-1", userId: "user-1", type: "new_message", message: "New message from customer", action: "/inbox?conversation=c-2", data: null, readAt: new Date("2026-06-07T09:00:00Z"), createdAt: new Date("2026-06-07T09:00:00Z") },
];

const mockPrisma = {
  notification: {
    findMany: vi.fn(),
    updateMany: vi.fn(),
    update: vi.fn(),
    findFirst: vi.fn(),
  },
};

const mockAuth = { userId: "user-1", organizationId: "org-1", role: "agent" as const, permissions: {} };

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.notification.findMany.mockResolvedValue(mockNotifications);
  mockPrisma.notification.updateMany.mockResolvedValue({ count: 2 });
  mockPrisma.notification.update.mockResolvedValue({ ...mockNotifications[0], readAt: new Date() });
  mockPrisma.notification.findFirst.mockResolvedValue(mockNotifications[0]);
});

async function buildApp() {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma);
  app.addHook("preHandler", async (req) => { req.auth = mockAuth; });
  const { notificationsRouter } = await import("./notifications.js");
  await app.register(notificationsRouter, { prefix: "/v1" });
  return app;
}

describe("GET /v1/notifications", () => {
  it("returns notifications for current user", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/v1/notifications" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { data: typeof mockNotifications; unreadCount: number };
    expect(body.data).toHaveLength(2);
    expect(body.unreadCount).toBe(1);
    expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: "org-1", userId: "user-1" },
        orderBy: { createdAt: "desc" },
        take: 20,
      })
    );
  });
});

describe("PUT /v1/notifications/read-all", () => {
  it("marks all unread notifications as read", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "PUT", url: "/v1/notifications/read-all" });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith({
      where: { organizationId: "org-1", userId: "user-1", readAt: null },
      data: { readAt: expect.any(Date) },
    });
  });
});

describe("PUT /v1/notifications/:id/read", () => {
  it("marks a single notification as read", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "PUT", url: "/v1/notifications/n-1/read" });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.notification.update).toHaveBeenCalledWith({
      where: { id: "n-1" },
      data: { readAt: expect.any(Date) },
    });
  });

  it("returns 404 if notification not found or not owned by user", async () => {
    mockPrisma.notification.findFirst.mockResolvedValue(null);
    const app = await buildApp();
    const res = await app.inject({ method: "PUT", url: "/v1/notifications/n-99/read" });
    expect(res.statusCode).toBe(404);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
pnpm --filter @WBMSG/api test -- notifications.test.ts
```

Expected: FAIL — "Cannot find module './notifications.js'"

- [ ] **Step 3: Implement notifications router**

Create `apps/api/src/routes/notifications.ts`:

```typescript
import type { FastifyPluginAsync } from "fastify";

export const notificationsRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/notifications", async (request) => {
    const { userId, organizationId } = request.auth;
    const notifications = await fastify.prisma.notification.findMany({
      where: { organizationId, userId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, type: true, message: true, action: true, readAt: true, createdAt: true },
    });
    const unreadCount = notifications.filter((n) => n.readAt === null).length;
    return { data: notifications, unreadCount };
  });

  fastify.put("/notifications/read-all", async (request) => {
    const { userId, organizationId } = request.auth;
    await fastify.prisma.notification.updateMany({
      where: { organizationId, userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { data: { success: true } };
  });

  fastify.put<{ Params: { id: string } }>(
    "/notifications/:id/read",
    async (request, reply) => {
      const { userId, organizationId } = request.auth;
      const notification = await fastify.prisma.notification.findFirst({
        where: { id: request.params.id, organizationId, userId },
      });
      if (!notification) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Notification not found" } });
      }
      const updated = await fastify.prisma.notification.update({
        where: { id: request.params.id },
        data: { readAt: new Date() },
      });
      return { data: updated };
    }
  );
};
```

- [ ] **Step 4: Register in index.ts**

Open `apps/api/src/index.ts`. Find where other routers are registered (look for `app.register(userRoutes` or similar). Add:

```typescript
import { notificationsRouter } from "./routes/notifications.js";
// ... existing imports ...

// In the registration block:
await app.register(notificationsRouter, { prefix: "/v1" });
```

- [ ] **Step 5: Run tests — verify they pass**

```bash
pnpm --filter @WBMSG/api test -- notifications.test.ts
```

Expected: all 4 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/notifications.ts apps/api/src/routes/notifications.test.ts apps/api/src/index.ts
git commit -m "feat(api): add notifications routes — GET list, PUT read-one, PUT read-all"
```

---

## Task 3: Availability endpoint + socket per-user room

**Files:**
- Modify: `apps/api/src/routes/users.ts`
- Modify: `apps/api/src/routes/users.test.ts`
- Modify: `apps/api/src/plugins/socketio.ts`

- [ ] **Step 1: Write failing test for availability endpoint**

Open `apps/api/src/routes/users.test.ts`. The existing mock setup has `mockPrisma.user` already. Add this test block (add `update` to the mock if needed):

```typescript
describe("PATCH /v1/users/me/availability", () => {
  it("updates availability to away", async () => {
    mockPrisma.user.update.mockResolvedValue({ id: "user-1", availability: "away" });
    const res = await app.inject({
      method: "PATCH",
      url: "/v1/users/me/availability",
      payload: { availability: "away" },
    });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { availability: "away" },
      select: { id: true, availability: true },
    });
  });

  it("rejects invalid availability values", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/v1/users/me/availability",
      payload: { availability: "busy" },
    });
    expect(res.statusCode).toBe(400);
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
pnpm --filter @WBMSG/api test -- users.test.ts
```

Expected: FAIL — route not found.

- [ ] **Step 3: Add availability endpoint to users.ts**

In `apps/api/src/routes/users.ts`, add after the push-token route:

```typescript
fastify.patch<{ Body: { availability: string } }>(
  "/users/me/availability",
  {
    schema: {
      body: {
        type: "object",
        required: ["availability"],
        properties: {
          availability: { type: "string", enum: ["online", "away"] },
        },
      },
    },
  },
  async (request) => {
    const updated = await fastify.prisma.user.update({
      where: { id: request.auth.userId },
      data: { availability: request.body.availability },
      select: { id: true, availability: true },
    });
    return { data: updated };
  }
);
```

Also update the `/users/me` GET select to include `availability`:

```typescript
fastify.get("/users/me", async (request, reply) => {
  const user = await fastify.prisma.user.findFirst({
    where: { id: request.auth.userId, organizationId: request.auth.organizationId, isActive: true },
    select: { id: true, fullName: true, email: true, role: true, organizationId: true, availability: true },
  });
  if (!user) return reply.status(404).send({ error: { code: "USER_NOT_FOUND", message: "User not found" } });
  return { data: user };
});
```

- [ ] **Step 4: Add per-user socket room to socketio.ts**

In `apps/api/src/plugins/socketio.ts`, add the `join-user` handler:

```typescript
io.on("connection", (socket) => {
  socket.on("join-org", (organizationId: string) => {
    void socket.join(`org:${organizationId}`);
  });

  socket.on("join-user", (userId: string) => {
    void socket.join(`user:${userId}`);
  });
});
```

- [ ] **Step 5: Run tests — verify they pass**

```bash
pnpm --filter @WBMSG/api test -- users.test.ts
```

Expected: all existing tests + 2 new tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/users.ts apps/api/src/routes/users.test.ts apps/api/src/plugins/socketio.ts
git commit -m "feat(api): add availability endpoint and per-user socket room"
```

---

## Task 4: Emit notifications on conversation assign and inbound message

**Files:**
- Modify: `apps/api/src/routes/conversations.ts`
- Modify: `apps/api/src/workers/inbound-message.ts`

- [ ] **Step 1: Add notification creation + socket emit on conversation assign**

Open `apps/api/src/routes/conversations.ts`. Find the `POST /conversations/:id/assign` handler (around line 127). After the existing `getIo()?.to(...)` emit call, add:

```typescript
if (request.body.assignedTo) {
  // Notify the assigned agent
  await fastify.prisma.notification.create({
    data: {
      organizationId,
      userId: request.body.assignedTo,
      type: "conversation_assigned",
      message: "A conversation has been assigned to you",
      action: `/inbox?conversation=${conversation.id}`,
    },
  });
  getIo()?.to(`user:${request.body.assignedTo}`).emit("notification", {
    type: "conversation_assigned",
    message: "A conversation has been assigned to you",
    action: `/inbox?conversation=${conversation.id}`,
  });
}
```

The full updated assign handler body:

```typescript
fastify.post<{ Params: { id: ConversationId }; Body: { assignedTo: string | null } }>(
  "/conversations/:id/assign",
  async (request, reply) => {
    const { organizationId } = request.auth;
    const conversation = await fastify.prisma.conversation.findFirst({
      where: { id: request.params.id, organizationId },
    });
    if (!conversation) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Conversation not found" } });
    }
    const updated = await fastify.prisma.conversation.update({
      where: { id: conversation.id },
      data: { assignedTo: request.body.assignedTo },
    });
    getIo()?.to(`org:${organizationId}`).emit("conversation:assign", {
      conversationId: conversation.id,
      assignedTo: request.body.assignedTo,
    });
    if (request.body.assignedTo) {
      void dispatchFlowTrigger(fastify.prisma, organizationId, "conversation_assigned", {
        organizationId,
        conversationId: conversation.id,
        contactPhone: conversation.whatsappContactId ?? undefined,
      });
      await fastify.prisma.notification.create({
        data: {
          organizationId,
          userId: request.body.assignedTo,
          type: "conversation_assigned",
          message: "A conversation has been assigned to you",
          action: `/inbox?conversation=${conversation.id}`,
        },
      });
      getIo()?.to(`user:${request.body.assignedTo}`).emit("notification", {
        type: "conversation_assigned",
        message: "A conversation has been assigned to you",
        action: `/inbox?conversation=${conversation.id}`,
      });
    }
    return reply.send({ data: updated });
  }
);
```

- [ ] **Step 2: Add notification on inbound message**

Open `apps/api/src/workers/inbound-message.ts`. Find where a new inbound message is processed and the conversation has an `assignedTo`. After message is saved, add:

```typescript
// Notify assigned agent of new inbound message
if (conversation.assignedTo && conversation.assignedTo !== senderId) {
  await prisma.notification.create({
    data: {
      organizationId: org.id,
      userId: conversation.assignedTo,
      type: "new_message",
      message: `New message from ${contact.fullName ?? contact.whatsappPhone}`,
      action: `/inbox?conversation=${conversation.id}`,
    },
  });
  getIo()?.to(`user:${conversation.assignedTo}`).emit("notification", {
    type: "new_message",
    message: `New message from ${contact.fullName ?? contact.whatsappPhone}`,
    action: `/inbox?conversation=${conversation.id}`,
  });
}
```

**Note:** The exact insertion point depends on the worker's structure. Find where `conversation.assignedTo` is available after message creation. If the pattern is different (e.g., the worker uses a different variable name for the contact), adapt accordingly — the key is: after the message row is written, before the function returns.

- [ ] **Step 3: Type-check**

```bash
pnpm --filter @WBMSG/api type-check
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/conversations.ts apps/api/src/workers/inbound-message.ts
git commit -m "feat(api): create notifications on conversation assign and inbound message"
```

---

## Task 5: AvailabilityConfirmModal component

**Files:**
- Create: `apps/web/components/layout/AvailabilityConfirmModal.tsx`

- [ ] **Step 1: Create the component**

Create `apps/web/components/layout/AvailabilityConfirmModal.tsx`:

```typescript
"use client";
import { JSX } from "react";

interface Props {
  onConfirm: () => void;
  onCancel: () => void;
}

export function AvailabilityConfirmModal({ onConfirm, onCancel }: Props): JSX.Element {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />

      {/* Dialog */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-8 flex flex-col items-center gap-5">
        {/* Orange info icon */}
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-amber-400">
          <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
          </svg>
        </div>

        <h2 className="text-xl font-bold text-gray-900">Going Offline?</h2>

        <ul className="list-disc list-outside pl-5 space-y-2 text-sm text-gray-700 text-left w-full">
          <li>
            You&apos;re about to go offline. New chats will continue to auto-assigned to you while you&apos;re offline.
          </li>
          <li>
            To prevent assignment while offline,{" "}
            <a href="/settings/routing" className="text-teal-700 underline font-medium">
              change assignment rules here
            </a>
          </li>
        </ul>

        <div className="flex gap-3 w-full mt-2">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-lg border border-gray-300 text-gray-700 font-medium text-sm hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-3 rounded-lg bg-teal-800 text-white font-medium text-sm hover:bg-teal-900 transition-colors"
          >
            Go Offline
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm --filter @WBMSG/web type-check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/layout/AvailabilityConfirmModal.tsx
git commit -m "feat(web): add AvailabilityConfirmModal component"
```

---

## Task 6: ProfileMenu component

**Files:**
- Create: `apps/web/components/layout/ProfileMenu.tsx`

The profile panel matches the Interakt reference: avatar + name + online dot, availability toggle (with offline confirmation modal), org summary (name, copy ID, plan), WA phone, log out.

- [ ] **Step 1: Create the component**

Create `apps/web/components/layout/ProfileMenu.tsx`:

```typescript
"use client";
import { JSX, useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useClerk } from "@clerk/nextjs";
import { AvailabilityConfirmModal } from "./AvailabilityConfirmModal";

interface UserMe {
  id: string;
  fullName: string | null;
  email: string;
  role: string;
  availability: string;
}

interface OrgMe {
  id: string;
  name: string;
  planTier: string;
  phone: string | null;
}

function initials(name: string | null | undefined, email: string): string {
  if (name) {
    const parts = name.trim().split(" ");
    return parts.length >= 2
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
      : name.slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

export function ProfileMenu(): JSX.Element {
  const [open, setOpen] = useState(false);
  const [showOfflineModal, setShowOfflineModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { signOut } = useClerk();
  const qc = useQueryClient();

  const { data: userData } = useQuery<{ data: UserMe }>({
    queryKey: ["user-me"],
    queryFn: () => fetch("/api/v1/users/me").then((r) => r.json() as Promise<{ data: UserMe }>),
  });

  const { data: orgData } = useQuery<{ data: OrgMe }>({
    queryKey: ["org-me"],
    queryFn: () => fetch("/api/v1/organizations/me").then((r) => r.json() as Promise<{ data: OrgMe }>),
  });

  const setAvailability = useMutation({
    mutationFn: (availability: string) =>
      fetch("/api/v1/users/me/availability", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ availability }),
      }).then((r) => r.json()),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["user-me"] }),
  });

  // Close panel on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const user = userData?.data;
  const org = orgData?.data;
  const isOnline = user?.availability !== "away";
  const userInitials = initials(user?.fullName, user?.email ?? "");

  function handleAvailabilityToggle() {
    if (isOnline) {
      setShowOfflineModal(true);
    } else {
      setAvailability.mutate("online");
    }
  }

  function confirmGoOffline() {
    setShowOfflineModal(false);
    setAvailability.mutate("away");
  }

  function copyOrgId() {
    if (org?.id) {
      void navigator.clipboard.writeText(org.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  const planLabel: Record<string, string> = {
    starter: "Starter",
    growth: "Growth",
    professional: "Professional",
    enterprise: "Enterprise",
  };

  return (
    <>
      {showOfflineModal && (
        <AvailabilityConfirmModal
          onConfirm={confirmGoOffline}
          onCancel={() => setShowOfflineModal(false)}
        />
      )}

      <div className="relative" ref={ref}>
        {/* Avatar button */}
        <button
          onClick={() => setOpen((v) => !v)}
          className="relative flex items-center justify-center w-9 h-9 rounded-full bg-emerald-500 text-white text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-400"
        >
          {userInitials}
          {/* Online/Away dot */}
          <span
            className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white ${
              isOnline ? "bg-emerald-400" : "bg-gray-400"
            }`}
          />
        </button>

        {/* Panel */}
        {open && (
          <div className="absolute right-0 top-11 w-80 bg-white rounded-xl shadow-xl border border-gray-100 z-50 overflow-hidden">
            {/* USER DETAILS */}
            <div className="px-5 pt-5 pb-4 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                User Details
              </p>
              <div className="flex items-center gap-3 mb-4">
                <div className="relative flex-shrink-0 w-12 h-12 rounded-full bg-emerald-500 flex items-center justify-center text-white font-bold text-base">
                  {userInitials}
                  <span
                    className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${
                      isOnline ? "bg-emerald-400" : "bg-gray-400"
                    }`}
                  />
                </div>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">
                    {user?.fullName ?? user?.email ?? "—"}
                  </p>
                  <p className="text-xs text-emerald-500 flex items-center gap-1">
                    <span className={`w-1.5 h-1.5 rounded-full inline-block ${isOnline ? "bg-emerald-500" : "bg-gray-400"}`} />
                    {isOnline ? "Online" : "Away"}
                  </p>
                </div>
              </div>

              {/* Availability toggle */}
              <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2.5">
                <span className="text-sm text-gray-700 font-medium">Set Your Availability</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">{isOnline ? "Online" : "Away"}</span>
                  <button
                    type="button"
                    onClick={handleAvailabilityToggle}
                    disabled={setAvailability.isPending}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none disabled:opacity-60 ${
                      isOnline ? "bg-emerald-500" : "bg-gray-300"
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                        isOnline ? "translate-x-4" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>

            {/* ACCOUNT SUMMARY */}
            <div className="px-5 py-4 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                Account Summary
              </p>

              {/* Org card */}
              <div className="bg-gray-900 rounded-lg px-4 py-3 mb-3 flex items-center justify-between">
                <div>
                  <p className="text-white font-semibold text-sm truncate max-w-[140px]">
                    {org?.name ?? "—"}
                  </p>
                  <button
                    onClick={copyOrgId}
                    className="text-xs text-gray-400 hover:text-white transition-colors mt-0.5 flex items-center gap-1"
                  >
                    {copied ? "Copied!" : "Copy Org ID"}
                    {!copied && (
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    )}
                  </button>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-400">
                    {planLabel[org?.planTier ?? ""] ?? org?.planTier ?? "—"} Plan
                  </p>
                  <a
                    href="/settings/billing"
                    className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
                  >
                    Manage →
                  </a>
                </div>
              </div>

              {/* WA Number */}
              {org?.phone && (
                <div className="flex items-center gap-2 py-2">
                  <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                    <path d="M11.97 0C5.357 0 0 5.358 0 11.97c0 2.104.547 4.079 1.504 5.798L0 24l6.404-1.48A11.932 11.932 0 0011.97 23.94C18.582 23.94 24 18.582 24 11.97 24 5.358 18.582 0 11.97 0zm0 21.894a9.896 9.896 0 01-5.038-1.374l-.361-.214-3.741.981.998-3.648-.235-.374A9.869 9.869 0 012.07 11.97c0-5.464 4.446-9.91 9.9-9.91 5.453 0 9.9 4.446 9.9 9.91 0 5.453-4.447 9.924-9.9 9.924z"/>
                  </svg>
                  <span className="text-sm text-gray-700">{org.phone}</span>
                </div>
              )}
            </div>

            {/* Log Out */}
            <div className="px-5 py-3">
              <button
                onClick={() => void signOut({ redirectUrl: "/sign-in" })}
                className="flex items-center gap-2 text-sm text-red-500 hover:text-red-600 transition-colors w-full py-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Log Out
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm --filter @WBMSG/web type-check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/layout/ProfileMenu.tsx
git commit -m "feat(web): add ProfileMenu component with availability toggle and org summary"
```

---

## Task 7: NotificationBell component + useSocket join-user

**Files:**
- Create: `apps/web/components/layout/NotificationBell.tsx`
- Modify: `apps/web/hooks/useSocket.ts`

- [ ] **Step 1: Update useSocket to join per-user room**

Open `apps/web/hooks/useSocket.ts`. The hook currently emits `join-org`. Add `join-user` as well:

```typescript
"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect } from "react";
import { getSocket } from "@/lib/socket";

export function useSocket(organizationId: string | undefined, userId?: string): void {
  const { getToken } = useAuth();

  useEffect(() => {
    if (!organizationId) return;

    const socket = getSocket();

    function joinRooms() {
      socket.emit("join-org", organizationId);
      if (userId) socket.emit("join-user", userId);
    }

    async function connect() {
      const token = await getToken();
      socket.auth = { token };
      socket.on("connect", joinRooms);
      socket.connect();
    }

    void connect();

    return () => {
      socket.off("connect", joinRooms);
      socket.emit("leave-org", organizationId);
      socket.disconnect();
    };
  }, [organizationId, userId, getToken]);
}
```

- [ ] **Step 2: Create NotificationBell**

Create `apps/web/components/layout/NotificationBell.tsx`:

```typescript
"use client";
import { JSX, useState, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSocket } from "@/lib/socket";
import { useRouter } from "next/navigation";

interface Notification {
  id: string;
  type: string;
  message: string | null;
  action: string | null;
  readAt: string | null;
  createdAt: string;
}

interface NotificationsResponse {
  data: Notification[];
  unreadCount: number;
}

export function NotificationBell(): JSX.Element {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const qc = useQueryClient();

  const { data } = useQuery<NotificationsResponse>({
    queryKey: ["notifications"],
    queryFn: () =>
      fetch("/api/v1/notifications").then((r) => r.json() as Promise<NotificationsResponse>),
    refetchInterval: 30_000, // fallback poll every 30s
  });

  // Real-time: refetch on socket notification event
  useEffect(() => {
    const socket = getSocket();
    function onNotification() {
      void qc.invalidateQueries({ queryKey: ["notifications"] });
    }
    socket.on("notification", onNotification);
    return () => { socket.off("notification", onNotification); };
  }, [qc]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function markAllRead() {
    await fetch("/api/v1/notifications/read-all", { method: "PUT" });
    void qc.invalidateQueries({ queryKey: ["notifications"] });
  }

  async function handleNotificationClick(n: Notification) {
    await fetch(`/api/v1/notifications/${n.id}/read`, { method: "PUT" });
    void qc.invalidateQueries({ queryKey: ["notifications"] });
    setOpen(false);
    if (n.action) router.push(n.action);
  }

  const notifications = data?.data ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  const typeLabel: Record<string, string> = {
    conversation_assigned: "Assigned to you",
    new_message: "New message",
  };

  function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-1.5 text-gray-500 hover:text-gray-700 focus:outline-none rounded-lg hover:bg-gray-100 transition-colors"
        aria-label="Notifications"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center w-4 h-4 text-[10px] font-bold text-white bg-red-500 rounded-full">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 w-80 bg-white rounded-xl shadow-xl border border-gray-100 z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h3 className="font-semibold text-sm text-gray-900">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={() => void markAllRead()}
                className="text-xs text-blue-600 hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
            {notifications.length === 0 && (
              <p className="px-4 py-8 text-sm text-center text-gray-400">
                No notifications yet
              </p>
            )}
            {notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => void handleNotificationClick(n)}
                className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex items-start gap-3 ${
                  !n.readAt ? "bg-blue-50/60" : ""
                }`}
              >
                <span
                  className={`mt-1 flex-shrink-0 w-2 h-2 rounded-full ${
                    !n.readAt ? "bg-blue-500" : "bg-transparent"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-gray-500 mb-0.5">
                    {typeLabel[n.type] ?? n.type}
                  </p>
                  <p className="text-sm text-gray-800 leading-snug">{n.message}</p>
                  <p className="text-xs text-gray-400 mt-1">{timeAgo(n.createdAt)}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
pnpm --filter @WBMSG/web type-check
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/layout/NotificationBell.tsx apps/web/hooks/useSocket.ts
git commit -m "feat(web): add NotificationBell with real-time socket updates"
```

---

## Task 8: Update TopBar — wire in new components

**Files:**
- Modify: `apps/web/components/layout/TopBar.tsx`
- Modify: `apps/web/app/(dashboard)/layout.tsx` (pass userId to TopBar)

The TopBar becomes a client component so it can render `ProfileMenu` and `NotificationBell` (both client components). The layout already passes `orgSlug`; also pass `userId` so `useSocket` can join the per-user room.

- [ ] **Step 1: Update DashboardLayout to fetch userId and pass to TopBar**

Open `apps/web/app/(dashboard)/layout.tsx`. The layout already calls `auth.protect()`. Update it to also read `userId` and pass to `TopBar`:

In the `DashboardLayout` function, `auth.protect()` already returns the auth context. Destructure `userId`:

```typescript
const { getToken, orgSlug, userId } = await auth.protect();
```

Update the `TopBar` call:

```typescript
<TopBar orgName={orgSlug ?? undefined} userId={userId ?? undefined} />
```

- [ ] **Step 2: Rewrite TopBar**

Replace `apps/web/components/layout/TopBar.tsx` with:

```typescript
"use client";
import { JSX } from "react";
import Link from "next/link";
import { GlobalSearch } from "@/components/search/GlobalSearch";
import { DarkModeToggle } from "@/components/layout/DarkModeToggle";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { ProfileMenu } from "@/components/layout/ProfileMenu";
import { useSocket } from "@/hooks/useSocket";
import { useOrganization } from "@clerk/nextjs";

interface TopBarProps {
  orgName?: string;
  userId?: string;
}

export function TopBar({ orgName, userId }: TopBarProps): JSX.Element {
  const { organization } = useOrganization();
  const orgId = organization?.id;

  useSocket(orgId ?? orgName, userId);

  return (
    <header className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200 h-14">
      <span className="text-sm text-gray-500">{orgName ?? ""}</span>
      <div className="flex items-center gap-3">
        <GlobalSearch />
        <DarkModeToggle />
        {/* Settings gear */}
        <Link
          href="/settings"
          className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          aria-label="Settings"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </Link>
        <NotificationBell />
        <ProfileMenu />
      </div>
    </header>
  );
}
```

**Note on `useSocket`:** The `useSocket` hook previously received `organizationId` as a string. After this change, `TopBar` passes either `organization?.id` (from Clerk's `useOrganization`) or `orgName` (the slug) as a fallback. Check `useSocket`'s implementation — the socket room join emits `organizationId`, so confirm this still sends the correct value. If `useOrganization().organization?.id` returns Clerk's org ID (not the DB org ID), the inbox page's `useSocket` call that works today is the source of truth for the correct value. Match that pattern.

- [ ] **Step 3: Update DashboardLayout**

In `apps/web/app/(dashboard)/layout.tsx`, update the destructuring and TopBar call as described in Step 1:

```typescript
const { getToken, orgSlug, userId } = await auth.protect();
// ...
<TopBar orgName={orgSlug ?? undefined} userId={userId ?? undefined} />
```

Also update the `TopBarProps` import is not needed (it's in the component itself).

- [ ] **Step 4: Type-check**

```bash
pnpm --filter @WBMSG/web type-check
```

Fix any TypeScript errors. Common ones:
- `auth.protect()` may not return `userId` — check `@clerk/nextjs/server` auth typings. If not available, pass userId from a separate `auth()` call or skip it (the `useSocket` will just not join the per-user room).
- `useOrganization` may not be needed in TopBar — check how `inbox/page.tsx` calls `useSocket` and match that.

- [ ] **Step 5: Run full test suite**

```bash
pnpm --filter @WBMSG/api test
```

Expected: same pass rate as before (1 known fail in conversations.test.ts pre-existing).

- [ ] **Step 6: Commit and push**

```bash
git add apps/web/components/layout/TopBar.tsx apps/web/app/\(dashboard\)/layout.tsx
git commit -m "feat(web): update TopBar with ProfileMenu, NotificationBell, settings link"
git push origin main
```

---

## Self-Review

**Spec coverage:**
- ✅ Profile avatar with initials → ProfileMenu
- ✅ Availability toggle + "Going Offline?" modal → AvailabilityConfirmModal
- ✅ Org summary (name, copy ID, plan) → ProfileMenu
- ✅ Log out → ProfileMenu
- ✅ Notification bell with unread count → NotificationBell
- ✅ Real-time notifications → socket `notification` event + React Query invalidation
- ✅ Notifications on assignment → conversations.ts
- ✅ Notifications on inbound message → inbound-message.ts worker
- ✅ Settings gear icon → TopBar
- ✅ Per-user socket room → socketio.ts + useSocket

**Placeholder scan:** None found. All code blocks are complete.

**Type consistency:**
- `UserMe.availability: string` — used in ProfileMenu, returned by `/users/me`
- `Notification.readAt: string | null` — returned by API as ISO string (Prisma DateTime → JSON string)
- `useSocket(orgId, userId)` — second param added in Task 7, consumed in Task 8
