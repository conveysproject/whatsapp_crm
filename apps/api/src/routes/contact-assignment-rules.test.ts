import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const mockPrisma = {
  contactAssignmentRule: { findMany: vi.fn(), create: vi.fn(), findFirst: vi.fn(), update: vi.fn(), delete: vi.fn(), aggregate: vi.fn() },
  user: { findFirst: vi.fn() },
  team: { findFirst: vi.fn() },
};

let auth = { userId: "u1", organizationId: "org-1", role: "admin" as string, permissions: {} as Record<string, string> };

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (req) => { req.auth = auth as typeof req.auth; });
  const { contactAssignmentRulesRouter } = await import("./contact-assignment-rules.js");
  await app.register(contactAssignmentRulesRouter, { prefix: "/v1" });
  return app;
}

describe("contact-assignment-rules API", () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.resetModules(); vi.clearAllMocks();
    auth = { userId: "u1", organizationId: "org-1", role: "admin", permissions: {} };
    app = await buildApp();
  });
  afterEach(async () => { await app.close(); });

  it("GET lists rules ordered by sortOrder", async () => {
    mockPrisma.contactAssignmentRule.findMany.mockResolvedValue([{ id: "r1" }]);
    const res = await app.inject({ method: "GET", url: "/v1/contact-assignment-rules" });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.contactAssignmentRule.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId: "org-1" }, orderBy: { sortOrder: "asc" },
    }));
  });

  it("POST creates a rule with sortOrder = max + 1 (valid user assignee)", async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ id: "user-9" });
    mockPrisma.contactAssignmentRule.aggregate.mockResolvedValue({ _max: { sortOrder: 2 } });
    mockPrisma.contactAssignmentRule.create.mockResolvedValue({ id: "r2" });
    const res = await app.inject({ method: "POST", url: "/v1/contact-assignment-rules", payload: { name: "R", trigger: "contact_created", assignType: "user", assignTo: "user-9" } });
    expect(res.statusCode).toBe(201);
    expect(mockPrisma.contactAssignmentRule.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ organizationId: "org-1", assignTo: "user-9", sortOrder: 3 }),
    }));
  });

  it("POST returns 400 when assignee is not in the org", async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);
    const res = await app.inject({ method: "POST", url: "/v1/contact-assignment-rules", payload: { name: "R", trigger: "contact_created", assignType: "user", assignTo: "bad" } });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: { code: string } }>().error.code).toBe("INVALID_ASSIGNEE");
  });

  it("POST returns 403 without manage_contacts", async () => {
    auth = { userId: "u", organizationId: "org-1", role: "agent", permissions: { other: "allow" } };
    app = await buildApp();
    const res = await app.inject({ method: "POST", url: "/v1/contact-assignment-rules", payload: { name: "R", trigger: "contact_created", assignTo: "x" } });
    expect(res.statusCode).toBe(403);
  });

  it("DELETE returns 404 for a rule not in the org", async () => {
    mockPrisma.contactAssignmentRule.findFirst.mockResolvedValue(null);
    const res = await app.inject({ method: "DELETE", url: "/v1/contact-assignment-rules/bad" });
    expect(res.statusCode).toBe(404);
  });
});
