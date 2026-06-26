import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const mockPrisma = {
  team: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  user: {
    findMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
};

const mockAuth = {
  userId: "user-1",
  organizationId: "org-1",
  role: "admin" as const,
  permissions: { "settings_access": "allow", "settings_access@settings_teams": "allow" } as Record<string, string>,
  teamId: null as string | null,
  teamRole: null as "lead" | "member" | null,
};

const mockAuthNoPerm = {
  userId: "user-2",
  organizationId: "org-1",
  role: "agent" as const,
  permissions: {} as Record<string, string>,
  teamId: null as string | null,
  teamRole: null as "lead" | "member" | null,
};

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (request) => {
    request.auth = mockAuth;
  });
  const { teamsRouter } = await import("./teams.js");
  await app.register(teamsRouter, { prefix: "/v1" });
  await app.ready();
  return app;
}

async function buildAppNoPerm(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (request) => {
    request.auth = mockAuthNoPerm;
  });
  const { teamsRouter } = await import("./teams.js");
  await app.register(teamsRouter, { prefix: "/v1" });
  await app.ready();
  return app;
}

describe("POST /v1/teams", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("rejects POST without a lead (400)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/teams",
      payload: { name: "Sales", members: [{ userId: "u1", teamRole: "member" }] },
    });
    expect(res.statusCode).toBe(400);
  });

  it("creates a team and assigns members (201)", async () => {
    mockPrisma.team.findFirst.mockResolvedValue(null); // name not taken
    mockPrisma.team.create.mockResolvedValue({ id: "t1" });
    mockPrisma.user.findMany.mockResolvedValue([{ id: "u1" }, { id: "u2" }]);
    mockPrisma.user.update.mockResolvedValue({});
    const res = await app.inject({
      method: "POST",
      url: "/v1/teams",
      payload: { name: "Sales", members: [{ userId: "u1", teamRole: "lead" }, { userId: "u2", teamRole: "member" }] },
    });
    expect(res.statusCode).toBe(201);
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ teamId: "t1", teamRole: "lead" }) }),
    );
  });

  it("returns 409 when team name is duplicate", async () => {
    mockPrisma.team.findFirst.mockResolvedValue({ id: "existing-t" });
    const res = await app.inject({
      method: "POST",
      url: "/v1/teams",
      payload: { name: "Sales", members: [{ userId: "u1", teamRole: "lead" }] },
    });
    expect(res.statusCode).toBe(409);
    const body = res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe("DUPLICATE_NAME");
  });

  it("returns 400 when a member does not belong to the org", async () => {
    mockPrisma.team.findFirst.mockResolvedValue(null);
    // Only 1 user found but 2 requested
    mockPrisma.user.findMany.mockResolvedValue([{ id: "u1" }]);
    const res = await app.inject({
      method: "POST",
      url: "/v1/teams",
      payload: { name: "Sales", members: [{ userId: "u1", teamRole: "lead" }, { userId: "outsider", teamRole: "member" }] },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe("INVALID_MEMBER");
  });

  it("forbids a user without settings_teams (403)", async () => {
    const noPermApp = await buildAppNoPerm();
    const res = await noPermApp.inject({
      method: "POST",
      url: "/v1/teams",
      payload: { name: "X", members: [{ userId: "u1", teamRole: "lead" }] },
    });
    await noPermApp.close();
    expect(res.statusCode).toBe(403);
  });
});

describe("GET /v1/teams", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns teams with members", async () => {
    mockPrisma.team.findMany.mockResolvedValue([
      { id: "t1", name: "Sales", description: null, viewAllContacts: false, members: [{ id: "u1", fullName: "Alice", email: "a@b.com", role: "agent", teamRole: "lead" }] },
    ]);
    const res = await app.inject({ method: "GET", url: "/v1/teams" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: unknown[] }>();
    expect(body.data).toHaveLength(1);
    expect(mockPrisma.team.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: "org-1" }) }),
    );
  });
});

describe("PATCH /v1/teams/:id", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns 404 when team not found", async () => {
    mockPrisma.team.findFirst.mockResolvedValue(null);
    const res = await app.inject({ method: "PATCH", url: "/v1/teams/no-such", payload: { name: "New" } });
    expect(res.statusCode).toBe(404);
  });

  it("updates team name (200)", async () => {
    mockPrisma.team.findFirst.mockResolvedValue({ id: "t1" });
    mockPrisma.team.update.mockResolvedValue({ id: "t1" });
    const res = await app.inject({ method: "PATCH", url: "/v1/teams/t1", payload: { name: "Renamed" } });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.team.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: "Renamed" }) }),
    );
  });

  it("rejects PATCH members without a lead (400)", async () => {
    mockPrisma.team.findFirst.mockResolvedValue({ id: "t1" });
    mockPrisma.team.update.mockResolvedValue({ id: "t1" });
    const res = await app.inject({
      method: "PATCH",
      url: "/v1/teams/t1",
      payload: { members: [{ userId: "u1", teamRole: "member" }] },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe("NO_LEAD");
  });

  it("forbids PATCH without settings_teams (403)", async () => {
    const noPermApp = await buildAppNoPerm();
    const res = await noPermApp.inject({ method: "PATCH", url: "/v1/teams/t1", payload: { name: "X" } });
    await noPermApp.close();
    expect(res.statusCode).toBe(403);
  });

  it("evicts dropped members when PATCH provides a new members list (200)", async () => {
    mockPrisma.team.findFirst.mockResolvedValue({ id: "t1" });
    mockPrisma.user.findMany.mockResolvedValue([{ id: "u2" }]);
    mockPrisma.user.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.user.update.mockResolvedValue({});
    const res = await app.inject({
      method: "PATCH",
      url: "/v1/teams/t1",
      payload: { members: [{ userId: "u2", teamRole: "lead" }] },
    });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: "org-1",
          teamId: "t1",
          id: { notIn: ["u2"] },
        }),
        data: { teamId: null, teamRole: null },
      }),
    );
  });
});

describe("DELETE /v1/teams/:id", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns 404 when team not found", async () => {
    mockPrisma.team.findFirst.mockResolvedValue(null);
    const res = await app.inject({ method: "DELETE", url: "/v1/teams/no-such" });
    expect(res.statusCode).toBe(404);
  });

  it("deletes team and clears member assignments (204)", async () => {
    mockPrisma.team.findFirst.mockResolvedValue({ id: "t1" });
    mockPrisma.user.updateMany.mockResolvedValue({ count: 2 });
    mockPrisma.team.delete.mockResolvedValue({ id: "t1" });
    const res = await app.inject({ method: "DELETE", url: "/v1/teams/t1" });
    expect(res.statusCode).toBe(204);
    expect(mockPrisma.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: "org-1", teamId: "t1" }) }),
    );
    expect(mockPrisma.team.delete).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: "t1" }) }),
    );
  });

  it("forbids DELETE without settings_teams (403)", async () => {
    const noPermApp = await buildAppNoPerm();
    const res = await noPermApp.inject({ method: "DELETE", url: "/v1/teams/t1" });
    await noPermApp.close();
    expect(res.statusCode).toBe(403);
  });
});
