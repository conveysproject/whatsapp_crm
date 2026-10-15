import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

vi.mock("../lib/io-ref.js", () => ({
  getIo: vi.fn().mockReturnValue({ to: vi.fn().mockReturnValue({ emit: vi.fn() }) }),
}));

const { mockPushToUser, mockUnread } = vi.hoisted(() => ({ mockPushToUser: vi.fn().mockResolvedValue(undefined), mockUnread: vi.fn() }));
vi.mock("../lib/push.js", () => ({ pushToUser: mockPushToUser, unreadChatCount: mockUnread }));

const mockPrisma = {
  conversation: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  message: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    deleteMany: vi.fn(),
  },
  user: {
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn(),
  },
  notification: { create: vi.fn() },
  flow: { findMany: vi.fn().mockResolvedValue([]) },
  team: {
    findFirst: vi.fn().mockResolvedValue(null),
  },
};

const mockAuth = {
  userId: "user-1",
  organizationId: "org-1",
  role: "agent" as const,
  permissions: { inbox_access: "allow" },
  teamId: null as string | null,
  teamRole: null as "lead" | "member" | null,
};

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (request) => {
    request.auth = mockAuth;
  });
  const { conversationsRouter } = await import("./conversations.js");
  await app.register(conversationsRouter, { prefix: "/v1" });
  return app;
}

const mockAuthOverride = { permissions: { inbox_access: "allow" } as Record<string, string> };

async function buildAppAsAgent(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (request) => {
    request.auth = {
      userId: "agent-1",
      organizationId: "org-1",
      role: "agent" as const,
      permissions: mockAuthOverride.permissions,
      teamId: null as string | null,
      teamRole: null as "lead" | "member" | null,
    };
  });
  const { conversationsRouter } = await import("./conversations.js");
  await app.register(conversationsRouter, { prefix: "/v1" });
  return app;
}

describe("GET /v1/conversations", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

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
        where: expect.objectContaining({ organizationId: "org-1" }),
        orderBy: { lastMessageAt: "desc" },
      })
    );
  });
});

describe("GET /v1/conversations/:id/messages", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

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

describe("DELETE /v1/conversations/:id/history", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("deletes all messages in the conversation and returns count", async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue({ id: "conv-1", organizationId: "org-1" });
    mockPrisma.message.deleteMany.mockResolvedValue({ count: 15 });
    const res = await app.inject({ method: "DELETE", url: "/v1/conversations/conv-1/history" });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.message.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { conversationId: "conv-1" } })
    );
    expect(res.json<{ data: { deleted: number } }>().data.deleted).toBe(15);
  });
});

describe("POST /v1/conversations/:id/status", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns 400 for invalid status", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/conversations/conv-1/status",
      headers: { "content-type": "application/json" },
      payload: { status: "invalid" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: { code: string } }>().error.code).toBe("INVALID_STATUS");
  });

  it("closes a conversation and sets closedAt", async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue({ id: "conv-1", organizationId: "org-1" });
    mockPrisma.conversation.update.mockResolvedValue({ id: "conv-1", status: "resolved" });
    const res = await app.inject({
      method: "POST", url: "/v1/conversations/conv-1/status",
      headers: { "content-type": "application/json" },
      payload: { status: "resolved" },
    });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "resolved" }) })
    );
  });
});

describe("POST /v1/conversations/:id/assign", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("assigns conversation to agent", async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ id: "user-2" });
    mockPrisma.conversation.findFirst.mockResolvedValue({ id: "conv-1", organizationId: "org-1" });
    mockPrisma.conversation.update.mockResolvedValue({ id: "conv-1", assignedTo: "user-2" });
    const res = await app.inject({
      method: "POST", url: "/v1/conversations/conv-1/assign",
      headers: { "content-type": "application/json" },
      payload: { assignedTo: "user-2" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: { assignedTo: string } }>().data.assignedTo).toBe("user-2");
  });
});

describe("POST /v1/conversations/:id/read", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("resets unreadCount to 0 and returns 204", async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue({ id: "conv-1", organizationId: "org-1", unreadCount: 5 });
    mockPrisma.conversation.update.mockResolvedValue({ id: "conv-1", unreadCount: 0 });
    const res = await app.inject({ method: "POST", url: "/v1/conversations/conv-1/read" });
    expect(res.statusCode).toBe(204);
    expect(mockPrisma.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { unreadCount: 0 } })
    );
  });
});

describe("POST /v1/conversations/:id/typing", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("emits typing event and returns 204", async () => {
    const res = await app.inject({
      method: "POST", url: "/v1/conversations/conv-1/typing",
      headers: { "content-type": "application/json" },
      payload: { isTyping: true },
    });
    expect(res.statusCode).toBe(204);
  });
});

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
    expect(mockPrisma.conversation.findMany).not.toHaveBeenCalled();
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

describe("inbox section gate (D15)", () => {
  async function buildAppAs(permissions: Record<string, string>, role = "agent"): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    app.decorate("prisma", mockPrisma as unknown as PrismaClient);
    app.addHook("onRequest", async (r) => {
      r.auth = { userId: "u-9", organizationId: "org-1", role: role as typeof mockAuth.role, permissions, teamId: null, teamRole: null };
    });
    const { conversationsRouter } = await import("./conversations.js");
    await app.register(conversationsRouter, { prefix: "/v1" });
    return app;
  }

  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

  it("returns 403 when the role lacks inbox_access", async () => {
    const app = await buildAppAs({ contacts_access: "allow" }); // no inbox_access
    const res = await app.inject({ method: "GET", url: "/v1/conversations" });
    expect(res.statusCode).toBe(403);
    expect(mockPrisma.conversation.findMany).not.toHaveBeenCalled();
    await app.close();
  });

  it("allows the read when the role has inbox_access", async () => {
    mockPrisma.conversation.findMany.mockResolvedValue([]);
    const app = await buildAppAs({ inbox_access: "allow" });
    const res = await app.inject({ method: "GET", url: "/v1/conversations" });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it("admin bypasses the section gate even with empty permissions", async () => {
    mockPrisma.conversation.findMany.mockResolvedValue([]);
    const app = await buildAppAs({}, "admin");
    const res = await app.inject({ method: "GET", url: "/v1/conversations" });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe("GET /v1/conversations — phone masking via privacy toggles", () => {
  async function buildAppAs(permissions: Record<string, string>): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    app.decorate("prisma", mockPrisma as unknown as PrismaClient);
    app.addHook("onRequest", async (r) => {
      r.auth = {
        userId: "u-1",
        organizationId: "org-1",
        role: "agent" as const,
        permissions: { inbox_access: "allow", ...permissions },
        teamId: null,
        teamRole: null,
      };
    });
    const { conversationsRouter } = await import("./conversations.js");
    await app.register(conversationsRouter, { prefix: "/v1" });
    return app;
  }

  const convWithContact = {
    id: "conv-1",
    organizationId: "org-1",
    status: "open",
    lastMessageAt: null,
    lastInboundAt: null,
    messages: [],
    contact: { id: "c-1", firstName: "Alice", lastName: null, phoneNumber: "919000000001", tags: [] },
  };

  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

  it("masks phone when hide_phone_only is set", async () => {
    mockPrisma.conversation.findMany.mockResolvedValue([convWithContact]);
    const app = await buildAppAs({
      "hide_phone_number": "allow",
      "hide_phone_number@hide_phone_only": "allow",
    });
    const res = await app.inject({ method: "GET", url: "/v1/conversations" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: Array<{ contact: { phoneNumber: string } }> }>();
    expect(body.data[0]?.contact?.phoneNumber).not.toBe("919000000001");
    await app.close();
  });

  it("masks phone when hide_contact_fields is set (email not in payload)", async () => {
    mockPrisma.conversation.findMany.mockResolvedValue([convWithContact]);
    const app = await buildAppAs({
      "hide_phone_number": "allow",
      "hide_phone_number@hide_contact_fields": "allow",
    });
    const res = await app.inject({ method: "GET", url: "/v1/conversations" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: Array<{ contact: { phoneNumber: string } }> }>();
    expect(body.data[0]?.contact?.phoneNumber).not.toBe("919000000001");
    await app.close();
  });

  it("does not mask phone when no privacy toggles are set", async () => {
    mockPrisma.conversation.findMany.mockResolvedValue([convWithContact]);
    const app = await buildAppAs({});
    const res = await app.inject({ method: "GET", url: "/v1/conversations" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: Array<{ contact: { phoneNumber: string } }> }>();
    expect(body.data[0]?.contact?.phoneNumber).toBe("919000000001");
    await app.close();
  });
});

describe("GET /v1/conversations — team visibility scoping", () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

  it("scopes inbox to own conversations for a plain agent", async () => {
    mockPrisma.conversation.findMany.mockResolvedValue([]);
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockPrisma.team.findFirst.mockResolvedValue(null);
    const app = await buildAppAsAgent();
    const res = await app.inject({ method: "GET", url: "/v1/conversations" });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.conversation.findMany.mock.calls[0][0].where.assignedTo).toBe("agent-1");
    await app.close();
  });
});

describe("impersonated (edit mode) side-effect suppression", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    app = Fastify({ logger: false });
    app.decorate("prisma", mockPrisma as unknown as PrismaClient);
    app.addHook("onRequest", async (request) => {
      request.auth = { ...mockAuth, impersonation: { adminId: "sa-1", mode: "edit" as const } };
    });
    const { conversationsRouter } = await import("./conversations.js");
    await app.register(conversationsRouter, { prefix: "/v1" });
  });
  afterEach(async () => { await app.close(); });

  it("mark-as-read returns 204 without resetting unreadCount", async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue({ id: "conv-1", organizationId: "org-1", unreadCount: 5 });
    const res = await app.inject({ method: "POST", url: "/v1/conversations/conv-1/read" });
    expect(res.statusCode).toBe(204);
    expect(mockPrisma.conversation.update).not.toHaveBeenCalled();
  });

  it("typing returns 204 without emitting a socket event", async () => {
    const { getIo } = await import("../lib/io-ref.js");
    const res = await app.inject({
      method: "POST", url: "/v1/conversations/conv-1/typing",
      headers: { "content-type": "application/json" },
      payload: { isTyping: true },
    });
    expect(res.statusCode).toBe(204);
    expect(getIo).not.toHaveBeenCalled();
  });

  it("GET messages and conversation list do not write anything", async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue({ id: "conv-1", organizationId: "org-1" });
    mockPrisma.message.findMany.mockResolvedValue([]);
    mockPrisma.conversation.findMany.mockResolvedValue([]);
    expect((await app.inject({ method: "GET", url: "/v1/conversations/conv-1/messages" })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/v1/conversations" })).statusCode).toBe(200);
    expect(mockPrisma.conversation.update).not.toHaveBeenCalled();
  });
});

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

  it("does not push when assigning to yourself", async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue({ id: "conv-1", organizationId: "org-1", whatsappContactId: null });
    mockPrisma.user.findFirst.mockResolvedValue({ id: "user-1" });
    mockPrisma.conversation.update.mockResolvedValue({ id: "conv-1", assignedTo: "user-1" });
    const res = await app.inject({ method: "POST", url: "/v1/conversations/conv-1/assign", payload: { assignedTo: "user-1" } });
    expect(res.statusCode).toBe(200);
    expect(mockPushToUser).not.toHaveBeenCalled();
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
  afterEach(async () => { await app.close(); mockAuthOverride.permissions = { inbox_access: "allow" }; });

  it("only finds conversations assigned to the caller when assigned_chats_only is allowed", async () => {
    mockAuthOverride.permissions = { inbox_access: "allow", assigned_chats_only: "allow" };
    mockPrisma.conversation.findFirst.mockResolvedValue(null);
    await app.inject({ method: "GET", url: "/v1/conversations/conv-1" });
    expect(mockPrisma.conversation.findFirst.mock.calls[0][0].where).toMatchObject({ assignedTo: "agent-1" });
  });
});

describe("GET /v1/conversations/:id/messages keyset paging", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); mockPrisma.conversation.findFirst.mockResolvedValue({ id: "conv-1" }); });
  afterEach(async () => { await app.close(); });

  it("nextCursor is the oldest message of the page", async () => {
    mockPrisma.message.findMany.mockResolvedValue([{ id: "c" }, { id: "b" }, { id: "a" }]);
    const res = await app.inject({ method: "GET", url: "/v1/conversations/conv-1/messages?limit=2" });
    const body = res.json<{ data: { id: string }[]; pagination: { hasMore: boolean; nextCursor: string | null } }>();
    expect(body.data.map((m) => m.id)).toEqual(["b", "c"]);
    expect(body.pagination).toEqual({ hasMore: true, nextCursor: "b" });
  });

  it("filters by sentAt/id keyset from the cursor message, scoped to conversation and org", async () => {
    const sentAt = new Date("2026-05-01T10:00:00Z");
    mockPrisma.message.findFirst.mockResolvedValue({ id: "m-9", sentAt });
    mockPrisma.message.findMany.mockResolvedValue([]);
    const res = await app.inject({ method: "GET", url: "/v1/conversations/conv-1/messages?cursor=m-9" });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.message.findFirst.mock.calls[0][0].where).toEqual({ id: "m-9", conversationId: "conv-1", organizationId: "org-1" });
    const args = mockPrisma.message.findMany.mock.calls[0][0];
    expect(args.where.OR).toEqual([{ sentAt: { lt: sentAt } }, { sentAt, id: { lt: "m-9" } }]);
    expect(args.orderBy).toEqual([{ sentAt: "desc" }, { id: "desc" }]);
  });

  it("returns 400 INVALID_CURSOR for an unknown cursor", async () => {
    mockPrisma.message.findFirst.mockResolvedValue(null);
    const res = await app.inject({ method: "GET", url: "/v1/conversations/conv-1/messages?cursor=nope" });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: { code: string } }>().error.code).toBe("INVALID_CURSOR");
  });
});

describe("assigned_chats_only on conversation-by-id routes", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildAppAsAgent(); });
  afterEach(async () => { await app.close(); mockAuthOverride.permissions = { inbox_access: "allow" }; });

  const cases: Array<[string, string, string, unknown?]> = [
    ["GET", "/v1/conversations/conv-1/messages", "messages"],
    ["DELETE", "/v1/conversations/conv-1/history", "history"],
    ["POST", "/v1/conversations/conv-1/status", "status", { status: "open" }],
    ["POST", "/v1/conversations/conv-1/assign", "assign", { assignedTo: null }],
    ["POST", "/v1/conversations/conv-1/read", "read"],
    ["POST", "/v1/conversations/conv-1/typing", "typing", { isTyping: true }],
    ["POST", "/v1/conversations/conv-1/summarize", "summarize"],
  ];
  for (const [method, url, name, payload] of cases) {
    it(`${name}: 404 when not assigned to the agent`, async () => {
      mockAuthOverride.permissions = { inbox_access: "allow", assigned_chats_only: "allow" };
      mockPrisma.conversation.findFirst.mockResolvedValue(null);
      const res = await app.inject({ method: method as "GET", url, payload: payload as object | undefined });
      expect(res.statusCode).toBe(404);
      expect(mockPrisma.conversation.findFirst.mock.calls[0][0].where).toMatchObject({ id: "conv-1", organizationId: "org-1", assignedTo: "agent-1" });
    });
  }

  it("messages: clamps NaN/negative limit to a sane value", async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue({ id: "conv-1" });
    mockPrisma.message.findMany.mockResolvedValue([]);
    await app.inject({ method: "GET", url: "/v1/conversations/conv-1/messages?limit=abc" });
    await app.inject({ method: "GET", url: "/v1/conversations/conv-1/messages?limit=-5" });
    expect(mockPrisma.message.findMany.mock.calls[0][0].take).toBe(51);
    expect(mockPrisma.message.findMany.mock.calls[1][0].take).toBe(2);
  });
});
