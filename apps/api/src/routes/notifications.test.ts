import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

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

const mockAuth = { userId: "user-1", organizationId: "org-1", role: "agent" as const, permissions: {}, teamId: null as string | null, teamRole: null as "lead" | "member" | null };

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (req) => { req.auth = mockAuth; });
  const { notificationsRouter } = await import("./notifications.js");
  await app.register(notificationsRouter, { prefix: "/v1" });
  return app;
}

describe("GET /v1/notifications", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mockPrisma.notification.findMany.mockResolvedValue(mockNotifications);
    mockPrisma.notification.updateMany.mockResolvedValue({ count: 2 });
    mockPrisma.notification.update.mockResolvedValue({ ...mockNotifications[0], readAt: new Date() });
    mockPrisma.notification.findFirst.mockResolvedValue(mockNotifications[0]);
    app = await buildApp();
  });
  afterEach(async () => { await app.close(); });

  it("returns notifications for current user", async () => {
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
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mockPrisma.notification.findMany.mockResolvedValue(mockNotifications);
    mockPrisma.notification.updateMany.mockResolvedValue({ count: 2 });
    mockPrisma.notification.update.mockResolvedValue({ ...mockNotifications[0], readAt: new Date() });
    mockPrisma.notification.findFirst.mockResolvedValue(mockNotifications[0]);
    app = await buildApp();
  });
  afterEach(async () => { await app.close(); });

  it("marks all unread notifications as read", async () => {
    const res = await app.inject({ method: "PUT", url: "/v1/notifications/read-all" });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith({
      where: { organizationId: "org-1", userId: "user-1", readAt: null },
      data: { readAt: expect.any(Date) },
    });
  });
});

describe("PUT /v1/notifications/:id/read", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mockPrisma.notification.findMany.mockResolvedValue(mockNotifications);
    mockPrisma.notification.updateMany.mockResolvedValue({ count: 2 });
    mockPrisma.notification.update.mockResolvedValue({ ...mockNotifications[0], readAt: new Date() });
    mockPrisma.notification.findFirst.mockResolvedValue(mockNotifications[0]);
    app = await buildApp();
  });
  afterEach(async () => { await app.close(); });

  it("marks a single notification as read", async () => {
    const res = await app.inject({ method: "PUT", url: "/v1/notifications/n-1/read" });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.notification.update).toHaveBeenCalledWith({
      where: { id: "n-1" },
      data: { readAt: expect.any(Date) },
    });
  });

  it("returns 404 if notification not found or not owned by user", async () => {
    mockPrisma.notification.findFirst.mockResolvedValue(null);
    const res = await app.inject({ method: "PUT", url: "/v1/notifications/n-99/read" });
    expect(res.statusCode).toBe(404);
  });
});
