import { describe, it, expect, beforeEach, vi } from "vitest";
import type * as IdentityModule from "../auth/identity.js";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

// Stub fetch so the disposable-email check never hits the network
vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

const mockSendMail = vi.hoisted(() => vi.fn());
const mockIsEmailConfigured = vi.hoisted(() => vi.fn());
vi.mock("../lib/mail.js", () => ({ sendMail: (...a: unknown[]) => mockSendMail(...a), isEmailConfigured: () => mockIsEmailConfigured() }));
const mockCheckPlanLimit = vi.fn();
vi.mock("../lib/plan-limits.js", () => ({
  checkPlanLimit: (...args: unknown[]) => mockCheckPlanLimit(...args),
}));

// invitations.ts uses the module-level `prisma` import (not fastify.prisma),
// so we mock the prisma module itself. vi.hoisted lets the mock factory
// reference mockPrisma despite vi.mock being hoisted above this line.
const mockPrisma: Record<string, any> = vi.hoisted(() => ({
  invitation: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  user: {
    create: vi.fn(),
    findUnique: vi.fn(),
  },
  authAccount: { findUnique: vi.fn() },
  team: { findFirst: vi.fn() },
  $transaction: vi.fn((arg: unknown): unknown =>
    typeof arg === "function" ? (arg as (t: unknown) => unknown)(mockPrisma) : Promise.all(arg as unknown[]),
  ),
}));
const mockVerifyBearer = vi.hoisted(() => vi.fn());
vi.mock("../auth/identity.js", async (orig) => ({
  ...(await orig<typeof IdentityModule>()),
  verifyBearer: (...a: unknown[]) => mockVerifyBearer(...a),
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
    mockIsEmailConfigured.mockReturnValue(true);
    mockPrisma.team.findFirst.mockResolvedValue({ id: "team-1" });
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

  it("emails the invitee a fixed template with their accept link", async () => {
    mockCheckPlanLimit.mockResolvedValue({ allowed: true, limit: -1, current: 0 });
    mockSendMail.mockResolvedValue(undefined);
    mockPrisma.invitation.create.mockResolvedValue({ id: "i3", email: "new@c.com", role: "agent", token: "tok3", expiresAt: new Date() });
    const app = await buildApp();
    const res = await app.inject({ method: "POST", url: "/v1/invitations", payload: { email: "new@c.com", role: "agent" } });
    expect(res.statusCode).toBe(201);
    expect(res.json().emailSent).toBe(true);
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const arg = mockSendMail.mock.calls[0]![0];
    expect(arg.to).toBe("new@c.com");
    expect(arg.html).toContain("/invitations/tok3/accept");
  });

  it("still creates the invitation when the email fails", async () => {
    mockCheckPlanLimit.mockResolvedValue({ allowed: true, limit: -1, current: 0 });
    mockSendMail.mockRejectedValue(new Error("smtp down"));
    mockPrisma.invitation.create.mockResolvedValue({ id: "i4", email: "n@c.com", role: "agent", token: "t4", expiresAt: new Date() });
    const app = await buildApp();
    const res = await app.inject({ method: "POST", url: "/v1/invitations", payload: { email: "n@c.com", role: "agent" } });
    expect(res.statusCode).toBe(201);
    expect(res.json().emailSent).toBe(false);
  });

  it("sends no email when the caller lacks permission", async () => {
    const app = await buildApp();
    const saved = mockAuth.role;
    (mockAuth as { role: string }).role = "agent";
    (mockAuth as { permissions: Record<string, string> }).permissions = {};
    const res = await app.inject({ method: "POST", url: "/v1/invitations", payload: { email: "x@c.com", role: "agent" } });
    (mockAuth as { role: string }).role = saved;
    (mockAuth as { permissions: Record<string, string> }).permissions = { settings_access: "allow", "settings_access@settings_agents": "allow" };
    expect(res.statusCode).toBe(403);
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("rejects a teamId from another org and sends nothing", async () => {
    mockCheckPlanLimit.mockResolvedValue({ allowed: true, limit: -1, current: 0 });
    mockPrisma.team.findFirst.mockResolvedValue(null);
    const app = await buildApp();
    const res = await app.inject({ method: "POST", url: "/v1/invitations", payload: { email: "a@b.com", role: "agent", teamId: "other-org-team" } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("INVALID_TEAM");
    expect(mockPrisma.team.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "other-org-team", organizationId: "org-1" } }));
    expect(mockPrisma.invitation.create).not.toHaveBeenCalled();
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("reports emailSent:false and skips sendMail when mail is not configured", async () => {
    mockCheckPlanLimit.mockResolvedValue({ allowed: true, limit: -1, current: 0 });
    mockIsEmailConfigured.mockReturnValue(false);
    mockPrisma.invitation.create.mockResolvedValue({ id: "i5", email: "n@c.com", role: "agent", token: "t5", expiresAt: new Date() });
    const app = await buildApp();
    const res = await app.inject({ method: "POST", url: "/v1/invitations", payload: { email: "n@c.com", role: "agent" } });
    expect(res.statusCode).toBe(201);
    expect(res.json().emailSent).toBe(false);
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("rate limit is keyed per org (auth set in preHandler), shared across IPs", async () => {
    mockCheckPlanLimit.mockResolvedValue({ allowed: true, limit: -1, current: 0 });
    mockSendMail.mockResolvedValue(undefined);
    mockPrisma.invitation.create.mockResolvedValue({ id: "i6", email: "n@c.com", role: "agent", token: "t6", expiresAt: new Date() });
    const { default: rateLimit } = await import("@fastify/rate-limit");
    const app = Fastify({ logger: false });
    await app.register(rateLimit, { global: false });
    // Like the real auth plugin: auth is attached after onRequest.
    app.addHook("preHandler", async (request) => { request.auth = mockAuth; });
    const { invitationRoutes } = await import("./invitations.js");
    await app.register(invitationRoutes, { prefix: "/v1" });
    const send = (i: number) => app.inject({
      method: "POST", url: "/v1/invitations", remoteAddress: `10.0.0.${i % 250 + 1}`,
      payload: { email: "n@c.com", role: "agent" },
    });
    for (let i = 0; i < 30; i++) expect((await send(i)).statusCode).toBe(201);
    expect((await send(99)).statusCode).toBe(429);
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

  it.each([
    ["manager", "admin", 403],
    ["manager", "whatsappAdmin", 403],
    ["manager", "agent", 201],
    ["admin", "admin", 201],
    ["admin", "whatsappAdmin", 201],
  ])("%s inviting %s → %i", async (actorRole, inviteRole, expected) => {
    mockCheckPlanLimit.mockResolvedValue({ allowed: true, limit: -1, current: 0 });
    mockPrisma.invitation.create.mockResolvedValue({ id: "i1", email: "a@b.com", role: inviteRole, token: "t", expiresAt: new Date() });
    const saved = mockAuth.role;
    (mockAuth as { role: string }).role = actorRole;
    try {
      const app = await buildApp();
      const res = await app.inject({ method: "POST", url: "/v1/invitations", payload: { email: "a@b.com", role: inviteRole } });
      expect(res.statusCode).toBe(expected);
      if (expected === 403) expect(mockPrisma.invitation.create).not.toHaveBeenCalled();
      await app.close();
    } finally {
      (mockAuth as { role: string }).role = saved;
    }
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

  describe("accept", () => {
    const invRow = () => ({
      id: "inv-1",
      organizationId: "org-1",
      email: "A@b.com",
      role: "agent",
      status: "pending",
      expiresAt: new Date(Date.now() + 60000),
      teamId: "team-1",
      teamRole: "lead",
    });
    const call = async (payload: Record<string, unknown> = { fullName: "Alice" }) => {
      const app = await buildApp();
      return app.inject({ method: "POST", url: "/v1/invitations/tok/accept", payload, headers: { authorization: "Bearer x" } });
    };
    beforeEach(() => {
      mockVerifyBearer.mockResolvedValue({ userId: "usr_1", sid: "s", typ: "user" });
      mockPrisma.invitation.findUnique.mockResolvedValue(invRow());
      mockPrisma.authAccount.findUnique.mockResolvedValue({ email: "a@b.com" });
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({});
      mockPrisma.invitation.updateMany.mockResolvedValue({ count: 1 });
      mockCheckPlanLimit.mockResolvedValue({ allowed: true, limit: -1, current: 0 });
    });
    it("401 without a valid bearer", async () => {
      mockVerifyBearer.mockRejectedValue(new Error("bad"));
      const res = await call();
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe("UNAUTHORIZED");
    });

    it("creates the user with the account id and ignores a body-supplied user id", async () => {
      const res = await call({ fullName: "Alice", mobileNumber: "+1", userId: "evil-id", clerkUserId: "evil-legacy-id" });
      expect(res.statusCode).toBe(201);
      expect(mockPrisma.user.create.mock.calls[0][0].data).toMatchObject({
        id: "usr_1",
        organizationId: "org-1",
        teamId: "team-1",
        teamRole: "lead",
        mobileNumber: "+1",
      });
      expect(mockPrisma.invitation.updateMany).toHaveBeenCalledWith({
        where: { id: "inv-1", status: "pending" },
        data: { status: "accepted" },
      });
    });

    it("stores the normalized email for a mixed-case invitation", async () => {
      mockPrisma.invitation.findUnique.mockResolvedValue({ ...invRow(), email: "  Alice@B.com " });
      mockPrisma.authAccount.findUnique.mockResolvedValue({ email: "alice@b.com" });
      const res = await call();
      expect(res.statusCode).toBe(201);
      expect(mockPrisma.user.create.mock.calls[0][0].data.email).toBe("alice@b.com");
    });

    it("403 EMAIL_MISMATCH", async () => {
      mockPrisma.authAccount.findUnique.mockResolvedValue({ email: "other@b.com" });
      const res = await call();
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("EMAIL_MISMATCH");
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });

    it("409 ALREADY_MEMBER", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: "usr_1" });
      const res = await call();
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("ALREADY_MEMBER");
    });

    it("403 SEAT_LIMIT", async () => {
      mockCheckPlanLimit.mockResolvedValue({ allowed: false, limit: 2, current: 2 });
      const res = await call();
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("SEAT_LIMIT");
    });

    it("400 when the invitation was claimed concurrently", async () => {
      mockPrisma.invitation.updateMany.mockResolvedValue({ count: 0 });
      expect((await call()).statusCode).toBe(400);
    });
  });
});
