import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const mockPrisma = {
  businessHours: {
    findMany: vi.fn(),
    deleteMany: vi.fn(),
    createMany: vi.fn(),
  },
  orgAutomationSettings: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
  $transaction: vi.fn(),
};

const DEFAULT_SETTINGS = {
  id: "as-1",
  organizationId: "org-1",
  oooEnabled: false,
  oooMessage: null,
  oooMessageData: null,
  welcomeEnabled: false,
  welcomePersonalized: false,
  welcomeMessage: null,
  welcomeMessageData: null,
  welcomeNewMessage: null,
  welcomeNewData: null,
  welcomeReturningMessage: null,
  welcomeReturningData: null,
  welcomeFlowId: null,
  delayedEnabled: false,
  delayedMinutes: 30,
  delayedMessage: null,
  delayedMessageData: null,
  delayedSendWithOoo: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockAuth = {
  userId: "u-1",
  organizationId: "org-1",
  role: "admin" as const,
  permissions: {
    automation_access: "allow",
    "automation_access@automation_ooo": "allow",
    "automation_access@automation_welcome_message": "allow",
    "automation_access@automation_delayed_response": "allow",
  },
};

function buildApp(authOverride?: Partial<typeof mockAuth>): Promise<FastifyInstance> {
  return buildAppWith({ ...mockAuth, ...authOverride });
}

async function buildAppWith(auth: typeof mockAuth): Promise<FastifyInstance> {
  vi.resetModules();
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (r) => { r.auth = auth; });
  const { automationSettingsRouter } = await import("./automation-settings.js");
  await app.register(automationSettingsRouter, { prefix: "/v1" });
  return app;
}

describe("GET /v1/automation/settings", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns default settings when no row exists (upsert creates it)", async () => {
    mockPrisma.orgAutomationSettings.upsert.mockResolvedValue(DEFAULT_SETTINGS);
    const res = await app.inject({ method: "GET", url: "/v1/automation/settings" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: typeof DEFAULT_SETTINGS }>();
    expect(body.data.oooEnabled).toBe(false);
    expect(body.data.delayedMinutes).toBe(30);
    expect(mockPrisma.orgAutomationSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: "org-1" }, create: { organizationId: "org-1" }, update: {} })
    );
  });
});

describe("PUT /v1/automation/settings/ooo", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("updates OOO fields", async () => {
    const updated = { ...DEFAULT_SETTINGS, oooEnabled: true, oooMessage: "We are closed." };
    mockPrisma.orgAutomationSettings.upsert.mockResolvedValue(updated);
    const res = await app.inject({
      method: "PUT",
      url: "/v1/automation/settings/ooo",
      payload: { oooEnabled: true, oooMessage: "We are closed." },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: { oooEnabled: boolean; oooMessage: string } }>();
    expect(body.data.oooEnabled).toBe(true);
    expect(body.data.oooMessage).toBe("We are closed.");
  });

  it("returns 403 when agent role lacks automation_ooo sub-permission", async () => {
    const agentApp = await buildApp({
      role: "agent",
      permissions: { automation_access: "allow" }, // no sub perm
    });
    const res = await agentApp.inject({
      method: "PUT",
      url: "/v1/automation/settings/ooo",
      payload: { oooEnabled: true },
    });
    expect(res.statusCode).toBe(403);
    await agentApp.close();
  });
});

describe("GET /v1/automation/business-hours", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns empty array when no slots configured", async () => {
    mockPrisma.businessHours.findMany.mockResolvedValue([]);
    const res = await app.inject({ method: "GET", url: "/v1/automation/business-hours" });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: unknown[] }>().data).toHaveLength(0);
  });
});

describe("PUT /v1/automation/business-hours", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("replaces slots atomically via $transaction", async () => {
    mockPrisma.$transaction.mockImplementation(async (ops: unknown[]) => {
      // Simulate Prisma transaction: return array of results
      return [{ count: 0 }, { count: 2 }];
    });
    const res = await app.inject({
      method: "PUT",
      url: "/v1/automation/business-hours",
      payload: {
        slots: [
          { dayOfWeek: 1, startTime: "09:00", endTime: "18:00" },
          { dayOfWeek: 2, startTime: "09:00", endTime: "18:00" },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: { count: number } }>().data.count).toBe(2);
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("returns 400 when slot has invalid dayOfWeek", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/v1/automation/business-hours",
      payload: { slots: [{ dayOfWeek: 7, startTime: "09:00", endTime: "18:00" }] },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when slot has invalid time format", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/v1/automation/business-hours",
      payload: { slots: [{ dayOfWeek: 1, startTime: "9:00", endTime: "18:00" }] },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 403 when role lacks automation_ooo sub-permission", async () => {
    const agentApp = await buildApp({
      role: "agent",
      permissions: { automation_access: "allow" },
    });
    const res = await agentApp.inject({
      method: "PUT",
      url: "/v1/automation/business-hours",
      payload: { slots: [] },
    });
    expect(res.statusCode).toBe(403);
    await agentApp.close();
  });
});

describe("PUT /v1/automation/settings/delayed", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns 400 when delayedMinutes > 1440", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/v1/automation/settings/delayed",
      payload: { delayedMinutes: 1441 },
    });
    expect(res.statusCode).toBe(400);
  });

  it("updates delayed fields successfully", async () => {
    const updated = { ...DEFAULT_SETTINGS, delayedEnabled: true, delayedMinutes: 15 };
    mockPrisma.orgAutomationSettings.upsert.mockResolvedValue(updated);
    const res = await app.inject({
      method: "PUT",
      url: "/v1/automation/settings/delayed",
      payload: { delayedEnabled: true, delayedMinutes: 15 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: { delayedMinutes: number } }>().data.delayedMinutes).toBe(15);
  });
});
