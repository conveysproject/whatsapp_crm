import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

vi.mock("../lib/io-ref.js", () => ({
  getIo: vi.fn().mockReturnValue({ to: vi.fn().mockReturnValue({ emit: vi.fn() }) }),
}));

const mockPrisma = {
  conversation: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  message: {
    findMany: vi.fn(),
    deleteMany: vi.fn(),
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
        where: { organizationId: "org-1" },
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
