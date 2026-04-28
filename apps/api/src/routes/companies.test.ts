import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const mockPrisma = {
  company: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
};

const mockAuth = {
  userId: "user-1",
  organizationId: "org-1",
  role: "admin" as const,
};

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (request) => {
    request.auth = mockAuth;
  });
  const { companiesRouter } = await import("./companies.js");
  await app.register(companiesRouter, { prefix: "/v1" });
  return app;
}

describe("GET /v1/companies", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns companies for the authenticated org", async () => {
    mockPrisma.company.findMany.mockResolvedValue([
      { id: "co-1", organizationId: "org-1", name: "Acme Corp" },
    ]);
    const res = await app.inject({ method: "GET", url: "/v1/companies" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: unknown[] }>();
    expect(body.data).toHaveLength(1);
    expect(mockPrisma.company.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: "org-1" }) })
    );
  });
});

describe("POST /v1/companies", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("creates a company and returns 201", async () => {
    const created = { id: "co-2", organizationId: "org-1", name: "Globex", domain: null, industry: null };
    mockPrisma.company.create.mockResolvedValue(created);
    const res = await app.inject({
      method: "POST",
      url: "/v1/companies",
      payload: { name: "Globex" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json<{ data: { id: string } }>().data.id).toBe("co-2");
  });
});

describe("DELETE /v1/companies/:id", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns 404 when company not in org", async () => {
    mockPrisma.company.findFirst.mockResolvedValue(null);
    const res = await app.inject({ method: "DELETE", url: "/v1/companies/co-999" });
    expect(res.statusCode).toBe(404);
  });

  it("deletes and returns 204", async () => {
    mockPrisma.company.findFirst.mockResolvedValue({ id: "co-1", organizationId: "org-1" });
    mockPrisma.company.delete.mockResolvedValue({});
    const res = await app.inject({ method: "DELETE", url: "/v1/companies/co-1" });
    expect(res.statusCode).toBe(204);
  });
});
