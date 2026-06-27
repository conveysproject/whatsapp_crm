import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

// Stub fetch so the disposable-email check never hits the network
vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

const mockCheckPlanLimit = vi.fn();
vi.mock("../lib/plan-limits.js", () => ({
  checkPlanLimit: (...args: unknown[]) => mockCheckPlanLimit(...args),
}));

// invitations.ts uses the module-level `prisma` import (not fastify.prisma),
// so we mock the prisma module itself. vi.hoisted lets the mock factory
// reference mockPrisma despite vi.mock being hoisted above this line.
const mockPrisma = vi.hoisted(() => ({
  invitation: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  user: {
    create: vi.fn(),
  },
  $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
}));
vi.mock("../lib/prisma.js", () => ({ prisma: mockPrisma }));

const mockAuth = {
  userId: "user-1",
  organizationId: "org-1",
  role: "admin" as const,
  permissions: {
    settings_access: "allow",
    "settings_access@settings_agents": "allow",
  },
  teamId: null as string | null,
  teamRole: null as "lead" | "member" | null,
};

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (request) => {
    request.auth = mockAuth;
  });
  const { invitationRoutes } = await import("./invitations.js");
  await app.register(invitationRoutes, { prefix: "/v1" });
  return app;
}

describe("invitations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-stub fetch after clearAllMocks
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
  });

  it("returns seat status", async () => {
    mockCheckPlanLimit.mockResolvedValue({ allowed: true, limit: 5, current: 2 });
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/v1/invitations/seat-status" });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ used: 2, limit: 5, canAdd: true });
  });

  it("stores teamId/teamRole on the invitation", async () => {
    mockCheckPlanLimit.mockResolvedValue({ allowed: true, limit: -1, current: 0 });
    mockPrisma.invitation.create.mockResolvedValue({
      id: "i1",
      email: "a@b.com",
      role: "agent",
      token: "t",
      expiresAt: new Date(),
    });
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/v1/invitations",
      payload: { email: "a@b.com", role: "agent", teamId: "team-1", teamRole: "member" },
    });
    expect(res.statusCode).toBe(201);
    expect(mockPrisma.invitation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ teamId: "team-1", teamRole: "member" }),
      })
    );
  });

  it("creates invitation without teamId when not provided", async () => {
    mockCheckPlanLimit.mockResolvedValue({ allowed: true, limit: -1, current: 0 });
    mockPrisma.invitation.create.mockResolvedValue({
      id: "i2",
      email: "b@c.com",
      role: "agent",
      token: "t2",
      expiresAt: new Date(),
    });
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/v1/invitations",
      payload: { email: "b@c.com", role: "agent" },
    });
    expect(res.statusCode).toBe(201);
    const callArg = mockPrisma.invitation.create.mock.calls[0][0];
    expect(callArg.data.teamId).toBeUndefined();
  });

  it("accept route writes mobileNumber and team fields to new user", async () => {
    const expiresAt = new Date(Date.now() + 60000);
    mockPrisma.invitation.findUnique.mockResolvedValue({
      id: "inv-1",
      organizationId: "org-1",
      email: "a@b.com",
      role: "agent",
      status: "pending",
      expiresAt,
      teamId: "team-1",
      teamRole: "lead",
    });
    mockPrisma.user.create.mockResolvedValue({});
    mockPrisma.invitation.update.mockResolvedValue({});

    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/v1/invitations/some-token/accept",
      payload: { clerkUserId: "clerk-1", fullName: "Alice", mobileNumber: "+919876543210" },
    });
    expect(res.statusCode).toBe(201);
    expect(mockPrisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          mobileNumber: "+919876543210",
          teamId: "team-1",
          teamRole: "lead",
        }),
      })
    );
  });

  it("rejects invite when plan limit is reached", async () => {
    mockCheckPlanLimit.mockResolvedValue({ allowed: false, limit: 3, current: 3 });
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/v1/invitations",
      payload: { email: "c@d.com", role: "agent" },
    });
    expect(res.statusCode).toBe(402);
    expect(res.json().error.code).toBe("PLAN_LIMIT_REACHED");
  });
});
