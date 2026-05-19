import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const mockPrisma = {
  contactGroup: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  groupContact: {
    createMany: vi.fn(),
    deleteMany: vi.fn(),
    findMany: vi.fn(),
  },
};

const mockAuth = { userId: "user-1", organizationId: "org-1", role: "admin" as const, permissions: {} };

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (req) => { req.auth = mockAuth; });
  const { contactGroupsRouter } = await import("./contact-groups.js");
  await app.register(contactGroupsRouter, { prefix: "/v1" });
  return app;
}

describe("GET /v1/contact-groups", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns active groups by default", async () => {
    mockPrisma.contactGroup.findMany.mockResolvedValue([
      { id: "g-1", organizationId: "org-1", title: "VIP Clients", isArchived: false },
    ]);
    const res = await app.inject({ method: "GET", url: "/v1/contact-groups" });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: unknown[] }>().data).toHaveLength(1);
    expect(mockPrisma.contactGroup.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: "org-1", isArchived: false } })
    );
  });

  it("returns archived groups when ?archived=true", async () => {
    mockPrisma.contactGroup.findMany.mockResolvedValue([]);
    const res = await app.inject({ method: "GET", url: "/v1/contact-groups?archived=true" });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.contactGroup.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: "org-1", isArchived: true } })
    );
  });
});

describe("POST /v1/contact-groups", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("creates a group and returns 201", async () => {
    const created = { id: "g-2", organizationId: "org-1", title: "Delhi Clients", description: null, isArchived: false };
    mockPrisma.contactGroup.create.mockResolvedValue(created);
    const res = await app.inject({
      method: "POST",
      url: "/v1/contact-groups",
      payload: { title: "Delhi Clients" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json<{ data: { id: string } }>().data.id).toBe("g-2");
  });
});

describe("POST /v1/contact-groups/:id/archive", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("archives a group", async () => {
    mockPrisma.contactGroup.findFirst.mockResolvedValue({ id: "g-1", organizationId: "org-1" });
    mockPrisma.contactGroup.update.mockResolvedValue({ id: "g-1", isArchived: true });
    const res = await app.inject({ method: "POST", url: "/v1/contact-groups/g-1/archive" });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.contactGroup.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isArchived: true } })
    );
  });
});

describe("POST /v1/contact-groups/:id/contacts", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("bulk-adds contacts to group", async () => {
    mockPrisma.contactGroup.findFirst.mockResolvedValue({ id: "g-1", organizationId: "org-1" });
    mockPrisma.groupContact.createMany.mockResolvedValue({ count: 3 });
    const res = await app.inject({
      method: "POST",
      url: "/v1/contact-groups/g-1/contacts",
      payload: { contactIds: ["c-1", "c-2", "c-3"] },
    });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.groupContact.createMany).toHaveBeenCalledWith({
      data: [
        { contactGroupId: "g-1", contactId: "c-1" },
        { contactGroupId: "g-1", contactId: "c-2" },
        { contactGroupId: "g-1", contactId: "c-3" },
      ],
      skipDuplicates: true,
    });
  });
});

describe("PUT /v1/contact-groups/:id", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("updates title and returns the updated group", async () => {
    mockPrisma.contactGroup.findFirst.mockResolvedValue({ id: "g-1", organizationId: "org-1" });
    mockPrisma.contactGroup.update.mockResolvedValue({ id: "g-1", title: "Updated Name" });
    const res = await app.inject({
      method: "PUT",
      url: "/v1/contact-groups/g-1",
      payload: { title: "Updated Name" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: { title: string } }>().data.title).toBe("Updated Name");
  });

  it("returns 404 when group not found in org", async () => {
    mockPrisma.contactGroup.findFirst.mockResolvedValue(null);
    const res = await app.inject({ method: "PUT", url: "/v1/contact-groups/bad", payload: { title: "x" } });
    expect(res.statusCode).toBe(404);
  });
});

describe("DELETE /v1/contact-groups/:id/contacts", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("bulk-removes contacts from group", async () => {
    mockPrisma.contactGroup.findFirst.mockResolvedValue({ id: "g-1", organizationId: "org-1" });
    mockPrisma.groupContact.deleteMany.mockResolvedValue({ count: 2 });
    const res = await app.inject({
      method: "DELETE",
      url: "/v1/contact-groups/g-1/contacts",
      payload: { contactIds: ["c-1", "c-2"] },
    });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.groupContact.deleteMany).toHaveBeenCalledWith({
      where: { contactGroupId: "g-1", contactId: { in: ["c-1", "c-2"] } },
    });
  });
});
