import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

vi.mock("../lib/search.js", () => ({
  indexContact: vi.fn().mockResolvedValue(undefined),
  removeContact: vi.fn().mockResolvedValue(undefined),
  searchContacts: vi.fn().mockResolvedValue([]),
}));

const mockPrisma = {
  contact: {
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
  const { contactsRouter } = await import("./contacts.js");
  await app.register(contactsRouter, { prefix: "/v1" });
  return app;
}

describe("GET /v1/contacts", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns contacts for the authenticated org", async () => {
    mockPrisma.contact.findMany.mockResolvedValue([
      { id: "c-1", organizationId: "org-1", phoneNumber: "+919000000001", name: "Alice" },
    ]);
    const res = await app.inject({ method: "GET", url: "/v1/contacts" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: unknown[] }>();
    expect(body.data).toHaveLength(1);
    expect(mockPrisma.contact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: "org-1" }) })
    );
  });
});

describe("POST /v1/contacts", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("creates a contact and returns 201", async () => {
    const created = { id: "c-2", organizationId: "org-1", phoneNumber: "+919000000002", name: "Bob", email: null, lifecycleStage: "lead" };
    mockPrisma.contact.create.mockResolvedValue(created);
    const res = await app.inject({
      method: "POST",
      url: "/v1/contacts",
      payload: { phoneNumber: "+919000000002", name: "Bob" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json<{ data: { id: string } }>().data.id).toBe("c-2");
  });
});

describe("DELETE /v1/contacts/:id", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns 404 when contact not in org", async () => {
    mockPrisma.contact.findFirst.mockResolvedValue(null);
    const res = await app.inject({ method: "DELETE", url: "/v1/contacts/c-999" });
    expect(res.statusCode).toBe(404);
  });

  it("deletes and returns 204", async () => {
    mockPrisma.contact.findFirst.mockResolvedValue({ id: "c-1", organizationId: "org-1" });
    mockPrisma.contact.delete.mockResolvedValue({});
    const res = await app.inject({ method: "DELETE", url: "/v1/contacts/c-1" });
    expect(res.statusCode).toBe(204);
  });
});

describe("GET /v1/contacts/export", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns CSV with correct headers and data", async () => {
    mockPrisma.contact.findMany.mockResolvedValue([
      { id: "c-1", organizationId: "org-1", phoneNumber: "+919000000001", name: "Alice", email: "alice@example.com", lifecycleStage: "lead", tags: [], createdAt: new Date() },
    ]);
    const res = await app.inject({ method: "GET", url: "/v1/contacts/export" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.body).toContain("phoneNumber");
    expect(res.body).toContain("+919000000001");
  });
});
