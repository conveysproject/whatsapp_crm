# Mobile Plan 1: Push Notifications API (and socket security) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the API everything the mobile app needs for reliable alerts — authenticated real-time sockets, multi-device push registration, and pushes for the three notification types that already exist — and close the cross-tenant socket leak found while planning.

**Architecture:** A new `lib/socket-auth.ts` verifies the Clerk token on every Socket.IO handshake and only lets a socket join its own `org:` and `user:` rooms. A new `lib/push.ts` sends Expo pushes to every registered device of a user (existing `UserDevice` table + legacy `User.pushToken`), removes dead tokens, and never throws. Routes and workers that already create `new_message`, `conversation_assigned` and `closure_overdue` notification rows call it. No schema change.

**Tech Stack:** Fastify 4, Prisma, Socket.IO 4, `expo-server-sdk` 6 (already a dependency), `@clerk/backend` (`lib/clerk.ts`), Vitest. Web: Next.js + `socket.io-client`.

**Spec:** `docs/prd-mobile-app.md` (sections 5a, 7, 9).

## Global Constraints

- Only existing notification types: `new_message`, `conversation_assigned`, `closure_overdue` (PRD §7).
- Push body preview max 100 characters (current worker behaviour; PRD §8 "100-character preview").
- No Prisma schema change and no migration (local DB is drifted; `UserDevice` already exists).
- Every touched route stays org-scoped and RBAC-checked (`request.auth.organizationId`); audit before marking a task done.
- Push failures must never break message processing, assignment or the closure job.
- Never use the word "Plivo" anywhere.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Run tests from `apps/api` with `pnpm vitest run <file>`; known flaky suites: `segments.test.ts`, sometimes `public-api/index.test.ts`.

## Review Focus

- A web tab left open longer than the Clerk token lifetime (about 60 s) reconnects after a network drop → it must still receive live events (fresh token per handshake). Test: Task 2 Step 5.
- Someone connects a socket with no token, a bad token, or emits `join-org` with another org's id → they receive nothing from that org. Tests: Task 1 Steps 1 and 5.
- A phone is handed from user A to user B and B signs in → the token belongs to B only; A stops getting pushes on that phone. Test: Task 4 Step 1.
- An assign request names a user from another organization, or a deactivated user → 404, no notification row, no push. Test: Task 5 Step 1.
- Expo's service is down or rejects a token → inbound processing, assignment and the closure job still finish; dead tokens are removed. Tests: Task 3 Step 1.

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/api/src/lib/socket-auth.ts` (new) | Verify a handshake token → `{ userId, organizationId }`; decide whether a room join is allowed |
| `apps/api/src/lib/socket-auth.test.ts` (new) | Unit tests for the above |
| `apps/api/src/plugins/socketio.ts` (modify) | Use socket-auth as handshake middleware; auto-join own rooms; ignore foreign joins |
| `apps/web/hooks/useSocket.ts` (modify) | Send a fresh Clerk token on every (re)connect |
| `apps/api/src/lib/push.ts` (new) | `sendPushToUser`, `unreadChatCount`, `pushToUser` (badge + send) |
| `apps/api/src/lib/push.test.ts` (new) | Unit tests with a mocked Expo SDK |
| `apps/api/src/routes/users.ts` (modify) | `POST /users/device-token` writes `UserDevice`; new `DELETE /users/device-token` |
| `apps/api/src/routes/users.test.ts` (modify) | Tests for device registration |
| `apps/api/src/routes/conversations.ts` (modify) | Assign: validate assignee in org + push; new `GET /conversations/unread-count` |
| `apps/api/src/routes/conversations.test.ts` (modify) | Tests for the above |
| `apps/api/src/workers/inbound-message.worker.ts` (modify) | Use `pushToUser` for auto-assign and for every inbound message to the assignee |
| `apps/api/src/workers/closure-deadline.worker.ts` (modify) | Push on `closure_overdue` |

---

### Task 1: Socket handshake authentication (library)

**Files:**
- Create: `apps/api/src/lib/socket-auth.ts`
- Test: `apps/api/src/lib/socket-auth.test.ts`

**Interfaces:**
- Consumes: `verifyClerkToken(authHeader: string | undefined): Promise<{ userId: string }>` from `lib/clerk.ts`.
- Produces:
  - `interface SocketIdentity { userId: string; organizationId: string }`
  - `authenticateSocket(prisma: PrismaClient, token: unknown, verify?: typeof verifyClerkToken): Promise<SocketIdentity>` — throws `Error("unauthorized")` on any failure.
  - `canJoinRoom(identity: SocketIdentity, kind: "org" | "user", id: unknown): boolean`

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/lib/socket-auth.test.ts
import { describe, it, expect, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { authenticateSocket, canJoinRoom } from "./socket-auth.js";

function prismaWith(user: { organizationId: string } | null) {
  return { user: { findFirst: vi.fn().mockResolvedValue(user) } } as unknown as PrismaClient;
}

describe("authenticateSocket", () => {
  it("returns the user's own org for a valid token", async () => {
    const verify = vi.fn().mockResolvedValue({ userId: "u-1" });
    const prisma = prismaWith({ organizationId: "org-1" });
    await expect(authenticateSocket(prisma, "tok", verify)).resolves.toEqual({ userId: "u-1", organizationId: "org-1" });
    expect(verify).toHaveBeenCalledWith("Bearer tok");
    expect((prisma.user.findFirst as ReturnType<typeof vi.fn>).mock.calls[0][0].where).toEqual({ id: "u-1", isActive: true, deletedAt: null });
  });

  it("rejects a missing or non-string token without calling Clerk", async () => {
    const verify = vi.fn();
    await expect(authenticateSocket(prismaWith(null), undefined, verify)).rejects.toThrow("unauthorized");
    await expect(authenticateSocket(prismaWith(null), 42, verify)).rejects.toThrow("unauthorized");
    await expect(authenticateSocket(prismaWith(null), "", verify)).rejects.toThrow("unauthorized");
    expect(verify).not.toHaveBeenCalled();
  });

  it("rejects when Clerk rejects the token", async () => {
    const verify = vi.fn().mockRejectedValue(new Error("expired"));
    await expect(authenticateSocket(prismaWith({ organizationId: "org-1" }), "tok", verify)).rejects.toThrow("unauthorized");
  });

  it("rejects an unknown or inactive user", async () => {
    const verify = vi.fn().mockResolvedValue({ userId: "u-9" });
    await expect(authenticateSocket(prismaWith(null), "tok", verify)).rejects.toThrow("unauthorized");
  });
});

describe("canJoinRoom", () => {
  const me = { userId: "u-1", organizationId: "org-1" };
  it("allows only the caller's own org and user rooms", () => {
    expect(canJoinRoom(me, "org", "org-1")).toBe(true);
    expect(canJoinRoom(me, "user", "u-1")).toBe(true);
    expect(canJoinRoom(me, "org", "org-2")).toBe(false);
    expect(canJoinRoom(me, "user", "u-2")).toBe(false);
    expect(canJoinRoom(me, "org", { id: "org-1" })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm vitest run src/lib/socket-auth.test.ts`
Expected: FAIL — cannot find module `./socket-auth.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/api/src/lib/socket-auth.ts
import type { PrismaClient } from "@prisma/client";
import { verifyClerkToken } from "./clerk.js";

export interface SocketIdentity {
  userId: string;
  organizationId: string;
}

/** Verifies the Clerk session token sent in the Socket.IO handshake (`auth.token`). Throws "unauthorized" on any failure. */
export async function authenticateSocket(
  prisma: PrismaClient,
  token: unknown,
  verify: typeof verifyClerkToken = verifyClerkToken,
): Promise<SocketIdentity> {
  if (typeof token !== "string" || token.length === 0) throw new Error("unauthorized");
  let userId: string;
  try {
    ({ userId } = await verify(`Bearer ${token}`));
  } catch {
    throw new Error("unauthorized");
  }
  const user = await prisma.user.findFirst({
    where: { id: userId, isActive: true, deletedAt: null },
    select: { organizationId: true },
  });
  if (!user) throw new Error("unauthorized");
  return { userId, organizationId: user.organizationId };
}

/** A socket may only join its own org room and its own user room. */
export function canJoinRoom(identity: SocketIdentity, kind: "org" | "user", id: unknown): boolean {
  if (typeof id !== "string") return false;
  return kind === "org" ? id === identity.organizationId : id === identity.userId;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && pnpm vitest run src/lib/socket-auth.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/socket-auth.ts apps/api/src/lib/socket-auth.test.ts
git commit -m "feat(api): socket handshake authentication helpers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Enforce socket authentication (server + web client)

**Files:**
- Modify: `apps/api/src/plugins/socketio.ts:24-39` (the `io.on("connection", …)` block)
- Modify: `apps/web/hooks/useSocket.ts` (the `connect()` function)
- Test: `apps/api/src/plugins/socketio.test.ts` (new)

**Interfaces:**
- Consumes: `authenticateSocket`, `canJoinRoom`, `SocketIdentity` from Task 1.
- Produces: every connected socket is already in `org:<own org>` and `user:<own id>`; `join-org` / `join-user` with any other id is ignored. Clients must send `auth: { token }` (web already does; mobile Plan 2 will).

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/plugins/socketio.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import type { AddressInfo } from "node:net";
import { io as ioClient, type Socket } from "socket.io-client";

vi.mock("../lib/clerk.js", () => ({
  verifyClerkToken: vi.fn(async (h: string) => {
    if (h === "Bearer good-1") return { userId: "u-1" };
    throw new Error("bad token");
  }),
}));

const mockPrisma = {
  user: { findFirst: vi.fn(async ({ where }: { where: { id: string } }) => (where.id === "u-1" ? { organizationId: "org-1" } : null)) },
};

let app: FastifyInstance;
let url: string;
const clients: Socket[] = [];

function connect(token?: string): Socket {
  const s = ioClient(url, { auth: token ? { token } : {}, transports: ["websocket"], reconnection: false });
  clients.push(s);
  return s;
}

beforeEach(async () => {
  app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  const { default: socketio } = await import("./socketio.js");
  await app.register(socketio);
  await app.listen({ port: 0, host: "127.0.0.1" });
  url = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  clients.splice(0).forEach((c) => c.close());
  await app.close();
});

describe("socket.io authentication", () => {
  it("rejects a handshake without a valid token", async () => {
    const s = connect("bad");
    const err = await new Promise<Error>((resolve) => s.on("connect_error", resolve));
    expect(err.message).toBe("unauthorized");
  });

  it("puts an authenticated socket in its own org room and ignores foreign joins", async () => {
    const s = connect("good-1");
    await new Promise<void>((resolve) => s.on("connect", () => resolve()));
    s.emit("join-org", "org-2");
    await new Promise((r) => setTimeout(r, 50));
    const own = new Promise<unknown>((resolve) => s.on("own", resolve));
    let leaked = false;
    s.on("foreign", () => { leaked = true; });
    app.io.to("org:org-2").emit("foreign", {});
    app.io.to("org:org-1").emit("own", { ok: true });
    await expect(own).resolves.toEqual({ ok: true });
    await new Promise((r) => setTimeout(r, 50));
    expect(leaked).toBe(false);
  });
});
```

Add `socket.io-client` as a dev dependency of the API if it is missing: `cd apps/api && pnpm add -D socket.io-client@^4.8.1`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm vitest run src/plugins/socketio.test.ts`
Expected: FAIL — the first test times out or connects (no `connect_error`), because the server accepts every handshake.

- [ ] **Step 3: Implement the server change**

Replace the `io.on("connection", …)` block in `apps/api/src/plugins/socketio.ts` (keep the comment line above it, update its text) with:

```ts
  // Rooms: `org:{organizationId}` and `user:{userId}`. The handshake must carry a Clerk session token
  // (`auth: { token }`); the socket is joined to its OWN rooms only. join-*/leave-* events from older
  // clients are honoured only for those same rooms.
  io.use((socket, next) => {
    authenticateSocket(fastify.prisma, (socket.handshake.auth as { token?: unknown } | undefined)?.token)
      .then((identity) => {
        socket.data.identity = identity;
        next();
      })
      .catch(() => next(new Error("unauthorized")));
  });

  io.on("connection", (socket) => {
    const identity = socket.data.identity as SocketIdentity;
    void socket.join(`org:${identity.organizationId}`);
    void socket.join(`user:${identity.userId}`);
    socket.on("join-org", (organizationId: unknown) => {
      if (canJoinRoom(identity, "org", organizationId)) void socket.join(`org:${identity.organizationId}`);
    });
    socket.on("join-user", (userId: unknown) => {
      if (canJoinRoom(identity, "user", userId)) void socket.join(`user:${identity.userId}`);
    });
    socket.on("leave-org", (organizationId: unknown) => {
      if (canJoinRoom(identity, "org", organizationId)) void socket.leave(`org:${identity.organizationId}`);
    });
    socket.on("leave-user", (userId: unknown) => {
      if (canJoinRoom(identity, "user", userId)) void socket.leave(`user:${identity.userId}`);
    });
  });
```

and add the import at the top:

```ts
import { authenticateSocket, canJoinRoom, type SocketIdentity } from "../lib/socket-auth.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && pnpm vitest run src/plugins/socketio.test.ts src/lib/socket-auth.test.ts`
Expected: PASS.

- [ ] **Step 5: Update the web client to send a fresh token on every handshake**

In `apps/web/hooks/useSocket.ts`, replace the body of `connect()`:

```ts
    async function connect() {
      // Function form: socket.io calls this on every (re)connect, so an expired Clerk token is never reused.
      socket.auth = (cb: (data: { token: string | null }) => void) => {
        void getToken().then((token) => cb({ token }));
      };
      socket.on("connect", joinRooms);
      socket.connect();
    }
```

Check: `cd apps/web && pnpm tsc --noEmit` → no new errors. Manual check (record the result in the commit body): run `pnpm dev`, open the inbox, stop the API for 90 s, start it again, send a WhatsApp message to the test number → it appears without a page refresh.

- [ ] **Step 6: Security audit + commit**

Audit: grep that every `getIo()?.to(` target in `apps/api/src` is `org:${…organizationId}` or `user:${…}` built from server data (never from client input): `grep -rn "getIo()?.to(" apps/api/src --include=*.ts | grep -v test`. Note in the commit body: impersonation sessions now receive real-time events for the admin's own org only (read-only impersonation keeps working via polling/refresh).

```bash
git add apps/api/src/plugins/socketio.ts apps/api/src/plugins/socketio.test.ts apps/api/package.json pnpm-lock.yaml apps/web/hooks/useSocket.ts
git commit -m "fix(security): authenticate Socket.IO handshakes and restrict rooms to the caller's own org/user

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Push sender library

**Files:**
- Create: `apps/api/src/lib/push.ts`
- Test: `apps/api/src/lib/push.test.ts`

**Interfaces:**
- Produces:
  - `interface PushPayload { title: string; body: string; data: Record<string, string> }`
  - `sendPushToUser(prisma: PrismaClient, userId: string, payload: PushPayload & { badge?: number }): Promise<number>` — returns number of accepted tickets; never throws.
  - `unreadChatCount(prisma: PrismaClient, organizationId: string, userId: string): Promise<number>` — conversations assigned to the user, status `open` or `pending`, `unreadCount > 0`.
  - `pushToUser(prisma: PrismaClient, organizationId: string, userId: string, payload: PushPayload): Promise<void>` — adds `badge` from `unreadChatCount`, then `sendPushToUser`; never throws.
- Data contract for `data` (the mobile app relies on it): `{ type: "new_message" | "conversation_assigned" | "closure_overdue", conversationId?: string, contactId?: string }`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/lib/push.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";

const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }));
vi.mock("expo-server-sdk", () => {
  class Expo {
    static isExpoPushToken(t: unknown): boolean { return typeof t === "string" && t.startsWith("ExponentPushToken["); }
    chunkPushNotifications<T>(m: T[]): T[][] { return [m]; }
    sendPushNotificationsAsync = mockSend;
  }
  return { default: Expo };
});

const mockPrisma = {
  userDevice: { findMany: vi.fn(), deleteMany: vi.fn() },
  user: { findUnique: vi.fn(), update: vi.fn() },
  conversation: { count: vi.fn() },
};
const prisma = mockPrisma as unknown as PrismaClient;
const A = "ExponentPushToken[aaa]";
const B = "ExponentPushToken[bbb]";

beforeEach(() => { vi.clearAllMocks(); });

describe("sendPushToUser", () => {
  it("sends once per distinct valid token (devices + legacy pushToken) and truncates the body", async () => {
    mockPrisma.userDevice.findMany.mockResolvedValue([{ deviceToken: A }, { deviceToken: "not-expo" }, { deviceToken: null }]);
    mockPrisma.user.findUnique.mockResolvedValue({ pushToken: A });
    mockSend.mockResolvedValue([{ status: "ok" }]);
    const { sendPushToUser } = await import("./push.js");
    const n = await sendPushToUser(prisma, "u-1", { title: "Priya", body: "x".repeat(150), data: { type: "new_message", conversationId: "c-1" }, badge: 2 });
    expect(n).toBe(1);
    const msgs = mockSend.mock.calls[0][0];
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({ to: A, title: "Priya", sound: "default", badge: 2, data: { type: "new_message", conversationId: "c-1" } });
    expect(msgs[0].body).toHaveLength(100);
  });

  it("does nothing when the user has no valid token", async () => {
    mockPrisma.userDevice.findMany.mockResolvedValue([]);
    mockPrisma.user.findUnique.mockResolvedValue({ pushToken: null });
    const { sendPushToUser } = await import("./push.js");
    expect(await sendPushToUser(prisma, "u-1", { title: "t", body: "b", data: {} })).toBe(0);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("removes tokens Expo reports as DeviceNotRegistered", async () => {
    mockPrisma.userDevice.findMany.mockResolvedValue([{ deviceToken: A }]);
    mockPrisma.user.findUnique.mockResolvedValue({ pushToken: B });
    mockSend.mockResolvedValue([
      { status: "ok" },
      { status: "error", details: { error: "DeviceNotRegistered" } },
    ]);
    const { sendPushToUser } = await import("./push.js");
    await sendPushToUser(prisma, "u-1", { title: "t", body: "b", data: {} });
    expect(mockPrisma.userDevice.deleteMany).toHaveBeenCalledWith({ where: { userId: "u-1", deviceToken: { in: [B] } } });
    expect(mockPrisma.user.update).toHaveBeenCalledWith({ where: { id: "u-1" }, data: { pushToken: null } });
  });

  it("never throws when Expo or the database fails", async () => {
    mockPrisma.userDevice.findMany.mockResolvedValue([{ deviceToken: A }]);
    mockPrisma.user.findUnique.mockResolvedValue({ pushToken: null });
    mockSend.mockRejectedValue(new Error("expo down"));
    const { sendPushToUser } = await import("./push.js");
    await expect(sendPushToUser(prisma, "u-1", { title: "t", body: "b", data: {} })).resolves.toBe(0);
    mockPrisma.userDevice.findMany.mockRejectedValue(new Error("db down"));
    await expect(sendPushToUser(prisma, "u-1", { title: "t", body: "b", data: {} })).resolves.toBe(0);
  });
});

describe("pushToUser", () => {
  it("sets the badge to the user's unread assigned chat count", async () => {
    mockPrisma.conversation.count.mockResolvedValue(3);
    mockPrisma.userDevice.findMany.mockResolvedValue([{ deviceToken: A }]);
    mockPrisma.user.findUnique.mockResolvedValue({ pushToken: null });
    mockSend.mockResolvedValue([{ status: "ok" }]);
    const { pushToUser } = await import("./push.js");
    await pushToUser(prisma, "org-1", "u-1", { title: "t", body: "b", data: { type: "new_message" } });
    expect(mockPrisma.conversation.count).toHaveBeenCalledWith({
      where: { organizationId: "org-1", assignedTo: "u-1", status: { in: ["open", "pending"] }, unreadCount: { gt: 0 } },
    });
    expect(mockSend.mock.calls[0][0][0].badge).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm vitest run src/lib/push.test.ts`
Expected: FAIL — cannot find module `./push.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/api/src/lib/push.ts
import Expo, { type ExpoPushMessage, type ExpoPushTicket } from "expo-server-sdk";
import type { PrismaClient } from "@prisma/client";

export interface PushPayload {
  title: string;
  body: string;
  /** Read by the mobile app: { type, conversationId?, contactId? } */
  data: Record<string, string>;
}

const PREVIEW_MAX = 100;
const expo = new Expo();

/** Sends to every registered device of the user. Returns accepted tickets. Never throws. */
export async function sendPushToUser(
  prisma: PrismaClient,
  userId: string,
  payload: PushPayload & { badge?: number },
): Promise<number> {
  try {
    const [devices, user] = await Promise.all([
      prisma.userDevice.findMany({ where: { userId }, select: { deviceToken: true } }),
      prisma.user.findUnique({ where: { id: userId }, select: { pushToken: true } }),
    ]);
    const tokens = new Set<string>();
    for (const d of devices) if (d.deviceToken && Expo.isExpoPushToken(d.deviceToken)) tokens.add(d.deviceToken);
    if (user?.pushToken && Expo.isExpoPushToken(user.pushToken)) tokens.add(user.pushToken);
    if (tokens.size === 0) return 0;

    const messages: ExpoPushMessage[] = [...tokens].map((to) => ({
      to,
      title: payload.title,
      body: payload.body.slice(0, PREVIEW_MAX),
      data: payload.data,
      sound: "default",
      ...(payload.badge !== undefined ? { badge: payload.badge } : {}),
    }));

    let accepted = 0;
    const dead: string[] = [];
    for (const chunk of expo.chunkPushNotifications(messages)) {
      let tickets: ExpoPushTicket[];
      try {
        tickets = await expo.sendPushNotificationsAsync(chunk);
      } catch (err) {
        console.error(`[push] send failed user=${userId}: ${(err as Error).message}`);
        continue;
      }
      tickets.forEach((t, i) => {
        if (t.status === "ok") accepted++;
        else if (t.details?.error === "DeviceNotRegistered") dead.push(chunk[i]!.to as string);
      });
    }

    if (dead.length > 0) {
      await prisma.userDevice.deleteMany({ where: { userId, deviceToken: { in: dead } } });
      if (user?.pushToken && dead.includes(user.pushToken)) {
        await prisma.user.update({ where: { id: userId }, data: { pushToken: null } });
      }
    }
    return accepted;
  } catch (err) {
    console.error(`[push] failed user=${userId}: ${(err as Error).message}`);
    return 0;
  }
}

/** App icon badge: chats assigned to the user that are open/pending and have unread messages. */
export async function unreadChatCount(prisma: PrismaClient, organizationId: string, userId: string): Promise<number> {
  return prisma.conversation.count({
    where: { organizationId, assignedTo: userId, status: { in: ["open", "pending"] }, unreadCount: { gt: 0 } },
  });
}

/** Badge + send. Never throws. */
export async function pushToUser(
  prisma: PrismaClient,
  organizationId: string,
  userId: string,
  payload: PushPayload,
): Promise<void> {
  let badge: number | undefined;
  try {
    badge = await unreadChatCount(prisma, organizationId, userId);
  } catch {
    badge = undefined;
  }
  await sendPushToUser(prisma, userId, { ...payload, ...(badge !== undefined ? { badge } : {}) });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && pnpm vitest run src/lib/push.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/push.ts apps/api/src/lib/push.test.ts
git commit -m "feat(api): multi-device Expo push sender with badge count and dead-token cleanup

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Device registration routes

**Files:**
- Modify: `apps/api/src/routes/users.ts` — the `POST /users/device-token` handler (currently writes `User.pushToken`); add `DELETE /users/device-token` right after it. Leave `POST /users/push-token` unchanged (legacy).
- Test: `apps/api/src/routes/users.test.ts` (add to `mockPrisma`: `userDevice: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), deleteMany: vi.fn() }`)

**Interfaces:**
- Produces (used by mobile Plan 2):
  - `POST /v1/users/device-token` body `{ token: string; platform?: "ios" | "android" | string; deviceId?: string }` → `200 { data: { registered: true } }`.
  - `DELETE /v1/users/device-token` body `{ token: string }` → `204` (only removes the caller's own row).

- [ ] **Step 1: Write the failing tests**

```ts
describe("device tokens", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("creates a UserDevice row for a new token", async () => {
    mockPrisma.userDevice.findFirst.mockResolvedValue(null);
    mockPrisma.userDevice.create.mockResolvedValue({ id: "d-1" });
    const res = await app.inject({ method: "POST", url: "/v1/users/device-token", payload: { token: "ExponentPushToken[a]", platform: "ios", deviceId: "dev-1" } });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.userDevice.create).toHaveBeenCalledWith({
      data: { userId: "user-1", deviceToken: "ExponentPushToken[a]", deviceType: "ios", deviceId: "dev-1" },
    });
  });

  it("moves an existing token to the signed-in user (phone handed over)", async () => {
    mockPrisma.userDevice.findFirst.mockResolvedValue({ id: "d-1", userId: "someone-else" });
    const res = await app.inject({ method: "POST", url: "/v1/users/device-token", payload: { token: "ExponentPushToken[a]" } });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.userDevice.update).toHaveBeenCalledWith({
      where: { id: "d-1" },
      data: { userId: "user-1", deviceType: null, deviceId: null },
    });
    expect(mockPrisma.userDevice.create).not.toHaveBeenCalled();
  });

  it("rejects a missing token", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/users/device-token", payload: {} });
    expect(res.statusCode).toBe(400);
  });

  it("DELETE removes only the caller's own row", async () => {
    mockPrisma.userDevice.deleteMany.mockResolvedValue({ count: 1 });
    const res = await app.inject({ method: "DELETE", url: "/v1/users/device-token", payload: { token: "ExponentPushToken[a]" } });
    expect(res.statusCode).toBe(204);
    expect(mockPrisma.userDevice.deleteMany).toHaveBeenCalledWith({ where: { userId: "user-1", deviceToken: "ExponentPushToken[a]" } });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && pnpm vitest run src/routes/users.test.ts`
Expected: FAIL — `userDevice.create` not called (handler still writes `user.update`), DELETE returns 404.

- [ ] **Step 3: Implement**

Replace the `POST /users/device-token` handler and add the DELETE route:

```ts
  // Mobile Expo push token registration. One row per device in user_devices; a token re-registered by
  // another user (shared phone) moves to that user so the previous owner stops receiving pushes on it.
  fastify.post<{ Body: { token: string; platform?: string; deviceId?: string } }>(
    "/users/device-token",
    {
      schema: {
        body: {
          type: "object",
          required: ["token"],
          properties: {
            token: { type: "string", minLength: 1, maxLength: 512 },
            platform: { type: "string", maxLength: 32 },
            deviceId: { type: "string", maxLength: 128 },
          },
        },
      },
    },
    async (request, reply) => {
      const { token, platform, deviceId } = request.body;
      const existing = await fastify.prisma.userDevice.findFirst({ where: { deviceToken: token }, select: { id: true } });
      if (existing) {
        await fastify.prisma.userDevice.update({
          where: { id: existing.id },
          data: { userId: request.auth.userId, deviceType: platform ?? null, deviceId: deviceId ?? null },
        });
      } else {
        await fastify.prisma.userDevice.create({
          data: { userId: request.auth.userId, deviceToken: token, deviceType: platform ?? null, deviceId: deviceId ?? null },
        });
      }
      return reply.send({ data: { registered: true } });
    }
  );

  // Sign-out / push turned off on this phone: remove the caller's own registration only.
  fastify.delete<{ Body: { token: string } }>(
    "/users/device-token",
    {
      schema: {
        body: {
          type: "object",
          required: ["token"],
          properties: { token: { type: "string", minLength: 1, maxLength: 512 } },
        },
      },
    },
    async (request, reply) => {
      await fastify.prisma.userDevice.deleteMany({ where: { userId: request.auth.userId, deviceToken: request.body.token } });
      return reply.status(204).send();
    }
  );
```

When `platform` or `deviceId` is omitted the handler writes `null` (asserted by the second test).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && pnpm vitest run src/routes/users.test.ts`
Expected: PASS (all existing + 4 new).

- [ ] **Step 5: Security audit + commit**

Audit: both handlers act only on `request.auth.userId`; `/v1/users` writes are already blocked during impersonation (`lib/impersonation-guard.ts:44`), so an impersonating admin cannot register their phone as the target user. Confirm with `grep -n '"/v1/users"' apps/api/src/lib/impersonation-guard.ts`.

```bash
git add apps/api/src/routes/users.ts apps/api/src/routes/users.test.ts
git commit -m "feat(api): register mobile push tokens per device (user_devices) and allow unregistering

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Assignment — validate assignee, push, and unread-count endpoint

**Files:**
- Modify: `apps/api/src/routes/conversations.ts:229-275` (assign handler); add `GET /conversations/unread-count` before the `/conversations/:id/...` GET routes (around line 95, next to `/conversations/search`).
- Test: `apps/api/src/routes/conversations.test.ts` (add `user.findFirst: vi.fn()`, `notification: { create: vi.fn() }` to `mockPrisma`; mock push).

**Interfaces:**
- Consumes: `pushToUser`, `unreadChatCount` from Task 3.
- Produces: `GET /v1/conversations/unread-count` → `{ data: { count: number } }` (mobile badge on app open).

- [ ] **Step 1: Write the failing tests**

At the top of `conversations.test.ts`, next to the existing `io-ref` mock:

```ts
const { mockPushToUser, mockUnread } = vi.hoisted(() => ({ mockPushToUser: vi.fn().mockResolvedValue(undefined), mockUnread: vi.fn() }));
vi.mock("../lib/push.js", () => ({ pushToUser: mockPushToUser, unreadChatCount: mockUnread }));
```

Add to `mockPrisma`: `user: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn() }` (merge with the existing `user` key) and `notification: { create: vi.fn() }`. Then:

```ts
describe("POST /v1/conversations/:id/assign — assignee validation and push", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns 404 and creates nothing when the assignee is not an active user of this org", async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue({ id: "conv-1", organizationId: "org-1", whatsappContactId: null });
    mockPrisma.user.findFirst.mockResolvedValue(null);
    const res = await app.inject({ method: "POST", url: "/v1/conversations/conv-1/assign", payload: { assignedTo: "user-from-other-org" } });
    expect(res.statusCode).toBe(404);
    expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
      where: { id: "user-from-other-org", organizationId: "org-1", isActive: true, deletedAt: null },
      select: { id: true },
    });
    expect(mockPrisma.conversation.update).not.toHaveBeenCalled();
    expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    expect(mockPushToUser).not.toHaveBeenCalled();
  });

  it("pushes to the assignee with the conversation id", async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue({ id: "conv-1", organizationId: "org-1", whatsappContactId: null });
    mockPrisma.user.findFirst.mockResolvedValue({ id: "user-2" });
    mockPrisma.conversation.update.mockResolvedValue({ id: "conv-1", assignedTo: "user-2" });
    const res = await app.inject({ method: "POST", url: "/v1/conversations/conv-1/assign", payload: { assignedTo: "user-2" } });
    expect(res.statusCode).toBe(200);
    expect(mockPushToUser).toHaveBeenCalledWith(expect.anything(), "org-1", "user-2", {
      title: "Conversation assigned to you",
      body: "A conversation has been assigned to you",
      data: { type: "conversation_assigned", conversationId: "conv-1" },
    });
  });

  it("does not push to yourself and allows unassigning (null)", async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue({ id: "conv-1", organizationId: "org-1", whatsappContactId: null });
    mockPrisma.conversation.update.mockResolvedValue({ id: "conv-1", assignedTo: null });
    const res = await app.inject({ method: "POST", url: "/v1/conversations/conv-1/assign", payload: { assignedTo: null } });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.user.findFirst).not.toHaveBeenCalled();
    expect(mockPushToUser).not.toHaveBeenCalled();
  });
});

describe("GET /v1/conversations/unread-count", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns the caller's unread assigned chat count", async () => {
    mockUnread.mockResolvedValue(4);
    const res = await app.inject({ method: "GET", url: "/v1/conversations/unread-count" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ data: { count: 4 } });
    expect(mockUnread).toHaveBeenCalledWith(expect.anything(), "org-1", "user-1");
  });
});
```

Also update the existing test "assigns conversation to agent" (line ~162) to set `mockPrisma.user.findFirst.mockResolvedValue({ id: "user-2" })` before the request.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && pnpm vitest run src/routes/conversations.test.ts`
Expected: FAIL — 200 instead of 404 for the foreign assignee; push not called; unread-count 404.

- [ ] **Step 3: Implement**

In the assign handler, right after the `if (!conversation) { … 404 … }` block, add:

```ts
      const assignee = request.body.assignedTo;
      if (assignee) {
        const target = await fastify.prisma.user.findFirst({
          where: { id: assignee, organizationId, isActive: true, deletedAt: null },
          select: { id: true },
        });
        if (!target) {
          return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Assignee not found" } });
        }
      }
```

Inside the existing `try { … notification.create … emit("notification", …) }` block, after the emit, add:

```ts
          if (request.body.assignedTo !== request.auth.userId) {
            void pushToUser(fastify.prisma, organizationId, request.body.assignedTo, {
              title: "Conversation assigned to you",
              body: "A conversation has been assigned to you",
              data: { type: "conversation_assigned", conversationId: conversation.id },
            });
          }
```

Add the route next to `/conversations/search`:

```ts
  // Mobile app icon badge: unread chats assigned to the caller.
  fastify.get("/conversations/unread-count", async (request) => {
    const count = await unreadChatCount(fastify.prisma, request.auth.organizationId, request.auth.userId);
    return { data: { count } };
  });
```

Import at the top: `import { pushToUser, unreadChatCount } from "../lib/push.js";`

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && pnpm vitest run src/routes/conversations.test.ts`
Expected: PASS (existing + 4 new). The known flaky conversations test may fail intermittently; re-run once before investigating.

- [ ] **Step 5: Security audit + commit**

Audit: assign is scoped by `conversationVisibilityWhere` + `organizationId` (unchanged) and now the assignee is org-checked; unread-count reads only the caller's own `organizationId` + `userId`. Confirm the conversations router is behind the inbox permission the same way as before (no new route bypasses it): `grep -n "inbox_access" apps/api/src/routes/conversations.ts apps/api/src/routes/index.ts`.

```bash
git add apps/api/src/routes/conversations.ts apps/api/src/routes/conversations.test.ts
git commit -m "fix(api): assign only to active users of the same org; push on assignment; unread-count endpoint

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Push from the inbound-message and closure-deadline workers

**Files:**
- Modify: `apps/api/src/workers/inbound-message.worker.ts` — line 20 (`import Expo`), line 52 (`const expo = new Expo()`), lines ~172-188 (auto-assign push block), lines ~266-288 (`new_message` notification block).
- Modify: `apps/api/src/workers/closure-deadline.worker.ts` — after `prisma.notification.create` for `closure_overdue` (~line 53).
- Test: `apps/api/src/lib/push-events.test.ts` (new) for the payload builders below.
- Create: `apps/api/src/lib/push-events.ts` — pure payload builders so the workers stay thin and the wording is tested.

**Interfaces:**
- Consumes: `pushToUser`, `PushPayload` from Task 3.
- Produces:
  - `newMessagePush(args: { contactName: string; body: string | null; contentType: string; conversationId: string }): PushPayload`
  - `closureOverduePush(args: { contactLabel: string; contactId: string }): PushPayload`

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/lib/push-events.test.ts
import { describe, it, expect } from "vitest";
import { newMessagePush, closureOverduePush } from "./push-events.js";

describe("newMessagePush", () => {
  it("uses the contact name as title and the text as body", () => {
    expect(newMessagePush({ contactName: "Priya Shah", body: "Is my appointment on?", contentType: "text", conversationId: "c-1" })).toEqual({
      title: "Priya Shah",
      body: "Is my appointment on?",
      data: { type: "new_message", conversationId: "c-1" },
    });
  });

  it("describes media messages that have no text", () => {
    expect(newMessagePush({ contactName: "Ahmed", body: null, contentType: "audio", conversationId: "c-2" }).body).toBe("Voice message");
    expect(newMessagePush({ contactName: "Ahmed", body: null, contentType: "image", conversationId: "c-2" }).body).toBe("Image");
    expect(newMessagePush({ contactName: "Ahmed", body: "", contentType: "sticker", conversationId: "c-2" }).body).toBe("New message");
  });
});

describe("closureOverduePush", () => {
  it("points at the contact", () => {
    expect(closureOverduePush({ contactLabel: "Tom Becker", contactId: "ct-1" })).toEqual({
      title: "Lead closure overdue",
      body: "Tom Becker passed its closure deadline without being closed.",
      data: { type: "closure_overdue", contactId: "ct-1" },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm vitest run src/lib/push-events.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement the builders**

```ts
// apps/api/src/lib/push-events.ts
import type { PushPayload } from "./push.js";

const MEDIA_LABEL: Record<string, string> = {
  audio: "Voice message",
  image: "Image",
  video: "Video",
  document: "Document",
  location: "Location",
};

export function newMessagePush(args: { contactName: string; body: string | null; contentType: string; conversationId: string }): PushPayload {
  const text = args.body && args.body.trim().length > 0 ? args.body : (MEDIA_LABEL[args.contentType] ?? "New message");
  return { title: args.contactName, body: text, data: { type: "new_message", conversationId: args.conversationId } };
}

export function closureOverduePush(args: { contactLabel: string; contactId: string }): PushPayload {
  return {
    title: "Lead closure overdue",
    body: `${args.contactLabel} passed its closure deadline without being closed.`,
    data: { type: "closure_overdue", contactId: args.contactId },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && pnpm vitest run src/lib/push-events.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire the inbound worker**

In `inbound-message.worker.ts`:
1. Delete `import Expo from "expo-server-sdk";` (line 20) and `const expo = new Expo();` (line 52). Add `import { pushToUser } from "../lib/push.js";` and `import { newMessagePush } from "../lib/push-events.js";`.
2. Replace the whole auto-assign push block (from `const profile = await prisma.user.findUnique({ where: { id: assignment.assignTo }, select: { pushToken: true } });` through the closing brace of `if (profile?.pushToken && …) { … }`) with nothing — the new-message push in step 3 covers this chat's first message, because `refreshed.assignedTo` is set by then. Keep the `conversation:assigned` socket emit.
3. In the `// --- Notify assigned agent of new inbound message ---` block, after the `getIo()?.to(\`user:${refreshed.assignedTo}\`).emit("notification", …)` call and still inside the `try`, add:

```ts
        void pushToUser(
          prisma,
          organizationId,
          refreshed.assignedTo,
          newMessagePush({ contactName: displayName, body: body ?? null, contentType, conversationId: conversation.id }),
        );
```

`body` and `contentType` are the worker's job-data locals (destructured at line 89); `displayName` is already computed at the top of this block.

- [ ] **Step 6: Wire the closure worker**

In `closure-deadline.worker.ts`, add the imports `import { pushToUser } from "../lib/push.js";` and `import { closureOverduePush } from "../lib/push-events.js";`, and right after the `await prisma.notification.create({ … type: "closure_overdue" … })` call add:

```ts
      void pushToUser(prisma, org.id, userId, closureOverduePush({ contactLabel: label, contactId: c.id }));
```

- [ ] **Step 7: Run the full API suite and type check**

Run: `cd apps/api && pnpm tsc --noEmit && pnpm vitest run`
Expected: type check clean; all tests pass except the known flaky `segments.test.ts` / `public-api/index.test.ts` (re-run those once if they fail).

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/lib/push-events.ts apps/api/src/lib/push-events.test.ts apps/api/src/workers/inbound-message.worker.ts apps/api/src/workers/closure-deadline.worker.ts
git commit -m "feat(api): push every inbound message to the assignee and push overdue lead closures

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Release checklist (after merge, before the mobile app ships)

1. Deploy API and web together (the socket change rejects un-authenticated handshakes; the web already sends a token, the function form keeps it fresh).
2. After deploy, open the web inbox in production and confirm live updates still arrive (send a WhatsApp message to the test number).
3. The legacy mobile prototype is not in any store, so no installed client depends on `User.pushToken` alone; nothing else to migrate.
