import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const mockEvaluateSegment = vi.fn();
vi.mock("../lib/segment-evaluator.js", () => ({
  evaluateSegment: mockEvaluateSegment,
}));

const mockPrisma = {
  contact: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn().mockResolvedValue(0),
  },
  contactGroup: {
    findMany: vi.fn(),
  },
  groupContact: {
    createMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  conversation: {
    updateMany: vi.fn(),
  },
  vendorSetting: {
    findFirst: vi.fn().mockResolvedValue(null),
  },
  contactCustomField: {
    findMany: vi.fn().mockResolvedValue([]),
  },
  segment: {
    findFirst: vi.fn().mockResolvedValue(null),
  },
  leadStatus: {
    findFirst: vi.fn(),
  },
  organization: {
    findUnique: vi.fn().mockResolvedValue({ settings: {} }),
  },
  flow: {
    findMany: vi.fn().mockResolvedValue([]),
  },
  user: {
    findMany: vi.fn().mockResolvedValue([]),
  },
  team: {
    findFirst: vi.fn().mockResolvedValue(null),
  },
  $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
};

const mockAuth = {
  userId: "user-1",
  organizationId: "org-1",
  role: "admin" as const,
  permissions: {},
  teamId: null as string | null,
  teamRole: null as "lead" | "member" | null,
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

async function buildAppAsViewer(): Promise<FastifyInstance> {
  const app = Fastify();
  app.decorateRequest("auth", null);
  app.addHook("preHandler", async (request) => {
    (request as unknown as { auth: { userId: string; organizationId: string; role: string; permissions: Record<string, string> } }).auth = {
      userId: mockAuth.userId,
      organizationId: mockAuth.organizationId,
      role: "member",
      permissions: {}, // no contacts_access
    };
  });
  app.register(async (instance) => {
    instance.decorate("prisma", mockPrisma as unknown as PrismaClient);
    const { contactsRouter } = await import("./contacts.js");
    await instance.register(contactsRouter);
  }, { prefix: "/v1" });
  await app.ready();
  return app;
}

async function buildAppAsAgent(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (request) => {
    request.auth = {
      userId: "agent-1",
      organizationId: "org-1",
      role: "agent" as const,
      permissions: { contacts_access: "allow" },
      teamId: null,
      teamRole: null,
    };
  });
  const { contactsRouter } = await import("./contacts.js");
  await app.register(contactsRouter, { prefix: "/v1" });
  return app;
}

describe("GET /v1/contacts/tags", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns deduplicated sorted tags for org", async () => {
    mockPrisma.contact.findMany.mockResolvedValue([
      { tags: ["VIP", "customer"] },
      { tags: ["VIP", "prospect"] },
      { tags: [] },
    ]);
    const res = await app.inject({ method: "GET", url: "/v1/contacts/tags" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: string[] }>();
    expect(body.data).toEqual(["VIP", "customer", "prospect"]);
  });

  it("returns empty array when no tags exist", async () => {
    mockPrisma.contact.findMany.mockResolvedValue([{ tags: [] }, { tags: [] }]);
    const res = await app.inject({ method: "GET", url: "/v1/contacts/tags" });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: string[] }>().data).toEqual([]);
  });
});

describe("GET /v1/contacts", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns contacts for the authenticated org", async () => {
    mockPrisma.contact.findMany.mockResolvedValue([
      { id: "c-1", organizationId: "org-1", phoneNumber: "919000000001", name: "Alice" },
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
    const created = { id: "c-2", organizationId: "org-1", phoneNumber: "919000000002", name: "Bob", email: null };
    mockPrisma.contact.create.mockResolvedValue(created);
    const res = await app.inject({
      method: "POST",
      url: "/v1/contacts",
      payload: { phoneNumber: "919000000002", name: "Bob" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json<{ data: { id: string } }>().data.id).toBe("c-2");
  });

  it("creates a contact with leadStatusId", async () => {
    const created = { id: "c-3", organizationId: "org-1", phoneNumber: "919000000003", name: "Carol", leadStatusId: "ls-1" };
    mockPrisma.leadStatus.findFirst.mockResolvedValue({ id: "ls-1", organizationId: "org-1", name: "New Lead" });
    mockPrisma.contact.create.mockResolvedValue(created);
    const res = await app.inject({
      method: "POST",
      url: "/v1/contacts",
      payload: { phoneNumber: "919000000003", name: "Carol", leadStatusId: "ls-1" },
    });
    expect(res.statusCode).toBe(201);
    expect(mockPrisma.contact.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ leadStatusId: "ls-1" }) })
    );
  });

  it("applies the org default lead status when none is provided", async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({ settings: { contactConfig: { defaultLeadStatusId: "ls-def" } } });
    mockPrisma.leadStatus.findFirst.mockResolvedValue({ id: "ls-def" });
    mockPrisma.contact.create.mockResolvedValue({ id: "c-9", organizationId: "org-1", phoneNumber: "919000000009", leadStatusId: "ls-def" });
    const res = await app.inject({
      method: "POST",
      url: "/v1/contacts",
      payload: { phoneNumber: "919000000009" },
    });
    expect(res.statusCode).toBe(201);
    expect(mockPrisma.contact.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ leadStatusId: "ls-def" }) })
    );
  });

  it("sets closureDeadline when a status is assigned and closureDeadlineDays is configured", async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({ settings: { contactConfig: { defaultLeadStatusId: "ls-def", closureDeadlineDays: 7 } } });
    mockPrisma.leadStatus.findFirst.mockResolvedValue({ id: "ls-def" });
    mockPrisma.contact.create.mockResolvedValue({ id: "c-10", organizationId: "org-1", phoneNumber: "919000000010" });
    const res = await app.inject({ method: "POST", url: "/v1/contacts", payload: { phoneNumber: "919000000010" } });
    expect(res.statusCode).toBe(201);
    const arg = mockPrisma.contact.create.mock.calls[0][0] as { data: { closureDeadline?: unknown } };
    expect(arg.data.closureDeadline).toBeInstanceOf(Date);
  });

  it("rejects create with a leadStatusId from another org", async () => {
    mockPrisma.leadStatus.findFirst.mockResolvedValue(null);
    const res = await app.inject({
      method: "POST",
      url: "/v1/contacts",
      payload: { phoneNumber: "919000000004", name: "Dave", leadStatusId: "bad" },
    });
    expect(res.statusCode).toBe(400);
    expect(mockPrisma.contact.create).not.toHaveBeenCalled();
  });
});

describe("PATCH /v1/contacts/:id — leadStatusId", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("updates a contact's leadStatusId", async () => {
    const existing = { id: "c-1", organizationId: "org-1", phoneNumber: "919000000001", tags: [], leadStatusId: "ls-1" };
    const updated = { ...existing, leadStatusId: "ls-2", phoneNumber: "919000000001" };
    mockPrisma.contact.findFirst.mockResolvedValue(existing);
    mockPrisma.leadStatus.findFirst.mockResolvedValue({ id: "ls-2", organizationId: "org-1", name: "Qualified" });
    mockPrisma.contact.update.mockResolvedValue(updated);
    const res = await app.inject({
      method: "PATCH",
      url: "/v1/contacts/c-1",
      payload: { leadStatusId: "ls-2" },
    });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.contact.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ leadStatusId: "ls-2" }) })
    );
  });

  it("rejects PATCH with a leadStatusId from another org", async () => {
    const existing = { id: "c-1", organizationId: "org-1", phoneNumber: "919000000001", tags: [], leadStatusId: "ls-1" };
    mockPrisma.contact.findFirst.mockResolvedValue(existing);
    mockPrisma.leadStatus.findFirst.mockResolvedValue(null);
    const res = await app.inject({
      method: "PATCH",
      url: "/v1/contacts/c-1",
      payload: { leadStatusId: "bad" },
    });
    expect(res.statusCode).toBe(400);
    expect(mockPrisma.contact.update).not.toHaveBeenCalled();
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
    mockPrisma.contact.update.mockResolvedValue({});
    mockPrisma.conversation.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.groupContact.deleteMany.mockResolvedValue({ count: 0 });
    const res = await app.inject({ method: "DELETE", url: "/v1/contacts/c-1" });
    expect(res.statusCode).toBe(204);
  });
});

describe("GET /v1/contacts/export", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns CSV with correct headers and data", async () => {
    mockPrisma.contactCustomField.findMany.mockResolvedValue([]);
    mockPrisma.contact.findMany.mockResolvedValue([
      { id: "c-1", organizationId: "org-1", phoneNumber: "919000000001", firstName: "Alice", lastName: null, email: "alice@example.com", countryCode: "IN", leadStatus: null, tags: [], notes: null, createdAt: new Date(), groupContacts: [], customFields: {} },
    ]);
    const res = await app.inject({ method: "GET", url: "/v1/contacts/export" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.body).toContain("Full Phone");
    expect(res.body).toContain("919000000001");
  });
});

describe("contacts section gate (D15)", () => {
  async function buildAppAs(permissions: Record<string, string>, role = "agent"): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    app.decorate("prisma", mockPrisma as unknown as PrismaClient);
    app.addHook("onRequest", async (r) => {
      r.auth = { userId: "u-9", organizationId: "org-1", role: role as typeof mockAuth.role, permissions, teamId: null, teamRole: null };
    });
    const { contactsRouter } = await import("./contacts.js");
    await app.register(contactsRouter, { prefix: "/v1" });
    return app;
  }

  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

  it("returns 403 when the role lacks contacts_access", async () => {
    const app = await buildAppAs({ campaigns_access: "allow" }); // no contacts_access
    const res = await app.inject({ method: "GET", url: "/v1/contacts" });
    expect(res.statusCode).toBe(403);
    expect(mockPrisma.contact.findMany).not.toHaveBeenCalled();
    await app.close();
  });

  it("allows the read when the role has contacts_access", async () => {
    mockPrisma.contact.findMany.mockResolvedValue([]);
    const app = await buildAppAs({ contacts_access: "allow" });
    const res = await app.inject({ method: "GET", url: "/v1/contacts" });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it("admin bypasses the section gate even with empty permissions", async () => {
    mockPrisma.contact.findMany.mockResolvedValue([]);
    const app = await buildAppAs({}, "admin");
    const res = await app.inject({ method: "GET", url: "/v1/contacts" });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it("blocks export when contacts_export sub is off (parent on)", async () => {
    const app = await buildAppAs({ contacts_access: "allow" }); // export sub off
    const res = await app.inject({ method: "GET", url: "/v1/contacts/export" });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("blocks delete when contacts_delete sub is off (parent on)", async () => {
    const app = await buildAppAs({ contacts_access: "allow" }); // delete sub off
    const res = await app.inject({ method: "DELETE", url: "/v1/contacts/c-1" });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("blocks contact create when contacts_add sub is off (parent on)", async () => {
    const app = await buildAppAs({ contacts_access: "allow" }); // contacts_add sub off
    const res = await app.inject({
      method: "POST",
      url: "/v1/contacts",
      payload: { phoneNumber: "919000000001", firstName: "Test" },
    });
    expect(res.statusCode).toBe(403);
    expect(mockPrisma.contact.create).not.toHaveBeenCalled();
    await app.close();
  });
});

describe("POST /v1/contacts/:id/block", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("sets waBlockedAt on the contact", async () => {
    mockPrisma.contact.findFirst = vi.fn().mockResolvedValue({ id: "c-1", organizationId: "org-1" });
    mockPrisma.contact.update = vi.fn().mockResolvedValue({ id: "c-1", waBlockedAt: new Date() });
    const res = await app.inject({ method: "POST", url: "/v1/contacts/c-1/block" });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.contact.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ waBlockedAt: expect.any(Date) }) })
    );
  });
});

describe("POST /v1/contacts/:id/unblock", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("clears waBlockedAt on the contact", async () => {
    mockPrisma.contact.findFirst = vi.fn().mockResolvedValue({ id: "c-1", organizationId: "org-1" });
    mockPrisma.contact.update = vi.fn().mockResolvedValue({ id: "c-1", waBlockedAt: null });
    const res = await app.inject({ method: "POST", url: "/v1/contacts/c-1/unblock" });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.contact.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { waBlockedAt: null } })
    );
  });
});

describe("POST /v1/contacts/:id/toggle-bot", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("sets disableBot to true", async () => {
    mockPrisma.contact.findFirst = vi.fn().mockResolvedValue({ id: "c-1", organizationId: "org-1" });
    mockPrisma.contact.update = vi.fn().mockResolvedValue({ id: "c-1", disableBot: true });
    const res = await app.inject({
      method: "POST",
      url: "/v1/contacts/c-1/toggle-bot",
      payload: { disabled: true },
    });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.contact.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { disableBot: true } })
    );
  });
});

describe("PUT /v1/contacts/:id/notes", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("updates the contact notes", async () => {
    mockPrisma.contact.findFirst = vi.fn().mockResolvedValue({ id: "c-1", organizationId: "org-1" });
    mockPrisma.contact.update = vi.fn().mockResolvedValue({ id: "c-1", notes: "VIP customer" });
    const res = await app.inject({
      method: "PUT",
      url: "/v1/contacts/c-1/notes",
      payload: { notes: "VIP customer" },
    });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.contact.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { notes: "VIP customer" } })
    );
  });
});

describe("POST /v1/contacts/bulk/assign-groups", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("bulk assigns contacts to groups", async () => {
    mockPrisma.contactGroup.findMany.mockResolvedValue([{ id: "g-1" }, { id: "g-2" }, { id: "g-3" }]);
    mockPrisma.groupContact.createMany.mockResolvedValue({ count: 6 });
    const res = await app.inject({
      method: "POST",
      url: "/v1/contacts/bulk/assign-groups",
      payload: { contactIds: ["c-1", "c-2"], groupIds: ["g-1", "g-2", "g-3"] },
    });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.groupContact.createMany).toHaveBeenCalledTimes(1);
  });
});

describe("contact visibility — agent scoping", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildAppAsAgent(); });
  afterEach(async () => { await app.close(); });

  it("scopes contact list to assigned-only for a plain agent", async () => {
    mockPrisma.contact.findMany.mockResolvedValue([]);
    const res = await app.inject({ method: "GET", url: "/v1/contacts" });
    expect(res.statusCode).toBe(200);
    const callArg = mockPrisma.contact.findMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(callArg.where.assignedUserId).toBe("agent-1");
  });
});

describe("DELETE /v1/contacts/bulk/unassign-groups", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("bulk removes contacts from groups", async () => {
    mockPrisma.contactGroup.findMany.mockResolvedValue([{ id: "g-1" }, { id: "g-2" }]);
    mockPrisma.groupContact.deleteMany.mockResolvedValue({ count: 4 });
    const res = await app.inject({
      method: "DELETE",
      url: "/v1/contacts/bulk/unassign-groups",
      payload: { contactIds: ["c-1", "c-2"], groupIds: ["g-1", "g-2"] },
    });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.groupContact.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { contactGroupId: { in: ["g-1", "g-2"] }, contactId: { in: ["c-1", "c-2"] } } })
    );
  });
});

describe("GET /v1/contacts/export (format param)", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns CSV content type", async () => {
    mockPrisma.contact.findMany.mockResolvedValue([
      { id: "c-1", firstName: "Priya", lastName: "Shah", phoneNumber: "919000000001", email: "priya@example.com", countryCode: "IN", createdAt: new Date("2025-01-01") },
    ]);
    const res = await app.inject({ method: "GET", url: "/v1/contacts/export?format=csv" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
  });

  it("returns JSON when format=json", async () => {
    mockPrisma.contact.findMany.mockResolvedValue([]);
    const res = await app.inject({ method: "GET", url: "/v1/contacts/export?format=json" });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: unknown[] }>().data).toEqual([]);
  });
});

describe("GET /v1/contacts/export/count", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns 403 without manage_contacts permission", async () => {
    (mockAuth as { role: string }).role = "member";
    mockAuth.permissions = { some_other_key: "allow" }; // non-empty = full enforcement, manage_contacts absent
    const res = await app.inject({ method: "GET", url: "/v1/contacts/export/count" });
    expect(res.statusCode).toBe(403);
    mockAuth.role = "admin" as const;
    mockAuth.permissions = {};
  });

  it("returns 403 when export_contacts sub-permission is explicitly denied", async () => {
    (mockAuth as { role: string }).role = "member";
    mockAuth.permissions = { manage_contacts: "allow", "manage_contacts@export_contacts": "deny" };
    const res = await app.inject({ method: "GET", url: "/v1/contacts/export/count" });
    expect(res.statusCode).toBe(403);
    mockAuth.role = "admin" as const;
    mockAuth.permissions = {};
  });

  it("returns count for org with no filters", async () => {
    mockAuth.permissions = { manage_contacts: "allow", "manage_contacts.export_contacts": "allow" };
    mockPrisma.contact.count.mockResolvedValue(42);
    const res = await app.inject({ method: "GET", url: "/v1/contacts/export/count" });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: { count: number } }>().data.count).toBe(42);
    mockAuth.permissions = {};
  });

  it("applies leadStatusId filter", async () => {
    mockAuth.permissions = { manage_contacts: "allow", "manage_contacts.export_contacts": "allow" };
    mockPrisma.contact.count.mockResolvedValue(5);
    const res = await app.inject({
      method: "GET",
      url: "/v1/contacts/export/count?leadStatusId=ls-1&leadStatusId=ls-2",
    });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.contact.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ leadStatusId: { in: ["ls-1", "ls-2"] } }),
      })
    );
    mockAuth.permissions = {};
  });

  it("applies tags filter (hasEvery)", async () => {
    mockAuth.permissions = { manage_contacts: "allow", "manage_contacts.export_contacts": "allow" };
    mockPrisma.contact.count.mockResolvedValue(3);
    const res = await app.inject({
      method: "GET",
      url: "/v1/contacts/export/count?tags=vip&tags=premium",
    });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.contact.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tags: { hasEvery: ["vip", "premium"] } }),
      })
    );
    mockAuth.permissions = {};
  });

  it("resolves segmentId via evaluateSegment and filters by IDs", async () => {
    mockAuth.permissions = { manage_contacts: "allow", "manage_contacts.export_contacts": "allow" };
    mockPrisma.segment.findFirst.mockResolvedValue({
      id: "seg-1", organizationId: "org-1", filters: [], match: "all",
    });
    mockEvaluateSegment.mockResolvedValue({
      count: 1,
      contacts: [{ id: "c-1", firstName: null, lastName: null, phoneNumber: "919" }],
    });
    mockPrisma.contact.count.mockResolvedValue(1);
    const res = await app.inject({
      method: "GET",
      url: "/v1/contacts/export/count?segmentId=seg-1",
    });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.contact.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: ["c-1"] } }),
      })
    );
    mockAuth.permissions = {};
  });

  it("applies groupIds filter (OR across groups)", async () => {
    mockAuth.permissions = { manage_contacts: "allow", "manage_contacts.export_contacts": "allow" };
    mockPrisma.contact.count.mockResolvedValue(7);
    const res = await app.inject({
      method: "GET",
      url: "/v1/contacts/export/count?groupIds=g-1&groupIds=g-2",
    });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.contact.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          groupContacts: { some: { contactGroupId: { in: ["g-1", "g-2"] } } },
        }),
      })
    );
    mockAuth.permissions = {};
  });

  it("applies custom field filter via customFields JSON blob (in export/count)", async () => {
    mockAuth.permissions = { manage_contacts: "allow", "manage_contacts.export_contacts": "allow" };
    mockPrisma.contactCustomField.findMany.mockResolvedValue([{ id: "cf-1", inputName: "Plan" }]);
    mockPrisma.contact.count.mockResolvedValue(2);
    const res = await app.inject({
      method: "GET",
      url: "/v1/contacts/export/count?cf%5Bcf-1%5D=Gold",
    });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.contact.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            { customFields: { path: ["Plan"], string_contains: "Gold" } },
          ]),
        }),
      })
    );
    mockAuth.permissions = {};
  });
});

describe("GET /v1/contacts/export (new rich CSV)", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  const makeContact = (overrides: Record<string, unknown> = {}) => ({
    id: "c-1",
    firstName: "Priya",
    lastName: "Shah",
    phoneNumber: "919000000001",
    email: "priya@example.com",
    countryCode: "IN",
    leadStatus: { name: "New Lead" },
    tags: ["vip", "premium"],
    notes: "VIP customer\nnew line",
    createdAt: new Date("2026-01-15T10:30:00.000Z"),
    groupContacts: [{ contactGroup: { title: "VIP Customers" } }, { contactGroup: { title: "Delhi" } }],
    customFields: {},
    ...overrides,
  });

  it("returns CSV with new rich column headers", async () => {
    mockAuth.permissions = { manage_contacts: "allow", "manage_contacts.export_contacts": "allow" };
    mockPrisma.contactCustomField.findMany.mockResolvedValue([]);
    mockPrisma.contact.findMany.mockResolvedValue([makeContact()]);
    const res = await app.inject({ method: "GET", url: "/v1/contacts/export" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.body).toContain("Full Phone");
    expect(res.body).toContain("Lead Status");
    expect(res.body).toContain("Groups");
    expect(res.body).toContain("Notes");
    mockAuth.permissions = {};
  });

  it("pipe-separates tags and groups", async () => {
    mockAuth.permissions = { manage_contacts: "allow", "manage_contacts.export_contacts": "allow" };
    mockPrisma.contactCustomField.findMany.mockResolvedValue([]);
    mockPrisma.contact.findMany.mockResolvedValue([makeContact()]);
    const res = await app.inject({ method: "GET", url: "/v1/contacts/export" });
    expect(res.body).toContain("vip|premium");
    expect(res.body).toContain("VIP Customers|Delhi");
    mockAuth.permissions = {};
  });

  it("replaces newlines in notes with space", async () => {
    mockAuth.permissions = { manage_contacts: "allow", "manage_contacts.export_contacts": "allow" };
    mockPrisma.contactCustomField.findMany.mockResolvedValue([]);
    mockPrisma.contact.findMany.mockResolvedValue([makeContact()]);
    const res = await app.inject({ method: "GET", url: "/v1/contacts/export" });
    expect(res.body).toContain("VIP customer new line");
    expect(res.body).not.toContain("VIP customer\nnew line");
    mockAuth.permissions = {};
  });

  it("prefixes phone with = to prevent Excel injection", async () => {
    mockAuth.permissions = { manage_contacts: "allow", "manage_contacts.export_contacts": "allow" };
    mockPrisma.contactCustomField.findMany.mockResolvedValue([]);
    mockPrisma.contact.findMany.mockResolvedValue([makeContact()]);
    const res = await app.inject({ method: "GET", url: "/v1/contacts/export" });
    expect(res.body).toContain("919000000001");
    expect(res.body).toContain('="');
    mockAuth.permissions = {};
  });

  it("adds one column per active custom field and fills values", async () => {
    mockAuth.permissions = { manage_contacts: "allow", "manage_contacts.export_contacts": "allow" };
    mockPrisma.contactCustomField.findMany.mockResolvedValue([
      { id: "cf-1", inputName: "Company Size", isActive: true },
      { id: "cf-2", inputName: "Industry", isActive: true },
    ]);
    mockPrisma.contact.findMany.mockResolvedValue([
      makeContact({ customFields: { "cf-1": "Large" } }),
    ]);
    const res = await app.inject({ method: "GET", url: "/v1/contacts/export" });
    expect(res.body).toContain("Company Size");
    expect(res.body).toContain("Industry");
    expect(res.body).toContain("Large");
    mockAuth.permissions = {};
  });

  it("applies leadStatusId filter", async () => {
    mockAuth.permissions = { manage_contacts: "allow", "manage_contacts.export_contacts": "allow" };
    mockPrisma.contactCustomField.findMany.mockResolvedValue([]);
    mockPrisma.contact.findMany.mockResolvedValue([]);
    await app.inject({ method: "GET", url: "/v1/contacts/export?leadStatusId=ls-1" });
    expect(mockPrisma.contact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ leadStatusId: { in: ["ls-1"] } }),
      })
    );
    mockAuth.permissions = {};
  });

  it("includes date in Content-Disposition filename", async () => {
    mockAuth.permissions = { manage_contacts: "allow", "manage_contacts.export_contacts": "allow" };
    mockPrisma.contactCustomField.findMany.mockResolvedValue([]);
    mockPrisma.contact.findMany.mockResolvedValue([]);
    const res = await app.inject({ method: "GET", url: "/v1/contacts/export" });
    const dateStr = new Date().toISOString().split("T")[0]!;
    expect(res.headers["content-disposition"]).toContain(`contacts-${dateStr}.csv`);
    mockAuth.permissions = {};
  });
});

describe("contact field masking (D8)", () => {
  async function buildAppAs(permissions: Record<string, string>): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    app.decorate("prisma", mockPrisma as unknown as PrismaClient);
    app.addHook("onRequest", async (r) => {
      r.auth = { userId: "u-9", organizationId: "org-1", role: "agent" as const, permissions, teamId: null, teamRole: null };
    });
    const { contactsRouter } = await import("./contacts.js");
    await app.register(contactsRouter, { prefix: "/v1" });
    return app;
  }

  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

  it("masks phone + email when hide_phone_number@hide_contact_fields is allow", async () => {
    mockPrisma.contact.findMany.mockResolvedValue([
      { id: "c-1", phoneNumber: "919876543210", email: "user@example.com", tags: [], assignedUserId: null, firstName: "A", lastName: "B", createdAt: new Date() },
    ]);
    mockPrisma.contact.count.mockResolvedValue(1);
    mockPrisma.user.findMany.mockResolvedValue([]);
    const app = await buildAppAs({
      contacts_access: "allow",
      "hide_phone_number@hide_contact_fields": "allow",
    });
    const res = await app.inject({ method: "GET", url: "/v1/contacts" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: Array<{ phoneNumber: string; email: string }> }>();
    expect(body.data[0].phoneNumber).not.toBe("919876543210");
    expect(body.data[0].phoneNumber).toMatch(/X/);
    expect(body.data[0].email).not.toBe("user@example.com");
    await app.close();
  });

  it("does NOT mask when hide_phone_number@hide_contact_fields is absent", async () => {
    mockPrisma.contact.findMany.mockResolvedValue([
      { id: "c-1", phoneNumber: "919876543210", email: "user@example.com", tags: [], assignedUserId: null, firstName: "A", lastName: "B", createdAt: new Date() },
    ]);
    mockPrisma.contact.count.mockResolvedValue(1);
    mockPrisma.user.findMany.mockResolvedValue([]);
    const app = await buildAppAs({ contacts_access: "allow" }); // no masking key
    const res = await app.inject({ method: "GET", url: "/v1/contacts" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: Array<{ phoneNumber: string }> }>();
    expect(body.data[0].phoneNumber).toBe("919876543210");
    await app.close();
  });
});

describe("GET /v1/contacts — Contact Data Privacy masking", () => {
  async function buildAppAs(permissions: Record<string, string>): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    app.decorate("prisma", mockPrisma as unknown as PrismaClient);
    app.addHook("onRequest", async (request) => {
      request.auth = { userId: "user-1", organizationId: "org-1", role: "agent" as const, permissions: { contacts_access: "allow", ...permissions }, teamId: null, teamRole: null };
    });
    const { contactsRouter } = await import("./contacts.js");
    await app.register(contactsRouter, { prefix: "/v1" });
    return app;
  }

  const contact = {
    id: "c-1",
    organizationId: "org-1",
    phoneNumber: "919000000001",
    email: "alice@example.com",
    firstName: "Alice",
    lastName: null,
    tags: [],
    assignedUserId: null,
  };

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mockPrisma.contact.findMany.mockResolvedValue([contact]);
    mockPrisma.contact.count.mockResolvedValue(1);
    mockPrisma.user.findMany.mockResolvedValue([]);
  });

  it("hides phone but NOT email when only hide_phone_only is set", async () => {
    const app = await buildAppAs({
      "hide_phone_number": "allow",
      "hide_phone_number@hide_phone_only": "allow",
    });
    const res = await app.inject({ method: "GET", url: "/v1/contacts" });
    expect(res.statusCode).toBe(200);
    const items = res.json<{ data: Array<{ phoneNumber: string; email: string }> }>().data;
    expect(items[0]?.phoneNumber).not.toBe("919000000001"); // masked
    expect(items[0]?.email).toBe("alice@example.com"); // NOT masked
    await app.close();
  });

  it("hides both phone AND email when hide_contact_fields is set", async () => {
    const app = await buildAppAs({
      "hide_phone_number": "allow",
      "hide_phone_number@hide_contact_fields": "allow",
    });
    const res = await app.inject({ method: "GET", url: "/v1/contacts" });
    expect(res.statusCode).toBe(200);
    const items = res.json<{ data: Array<{ phoneNumber: string; email: string }> }>().data;
    expect(items[0]?.phoneNumber).not.toBe("919000000001"); // masked
    expect(items[0]?.email).not.toBe("alice@example.com"); // masked
    await app.close();
  });

  it("hides both phone AND email when both toggles are set (union)", async () => {
    const app = await buildAppAs({
      "hide_phone_number": "allow",
      "hide_phone_number@hide_phone_only": "allow",
      "hide_phone_number@hide_contact_fields": "allow",
    });
    const res = await app.inject({ method: "GET", url: "/v1/contacts" });
    expect(res.statusCode).toBe(200);
    const items = res.json<{ data: Array<{ phoneNumber: string; email: string }> }>().data;
    expect(items[0]?.phoneNumber).not.toBe("919000000001"); // masked
    expect(items[0]?.email).not.toBe("alice@example.com"); // masked
    await app.close();
  });

  it("shows raw phone AND email when neither toggle is set", async () => {
    const app = await buildAppAs({});
    const res = await app.inject({ method: "GET", url: "/v1/contacts" });
    expect(res.statusCode).toBe(200);
    const items = res.json<{ data: Array<{ phoneNumber: string; email: string }> }>().data;
    expect(items[0]?.phoneNumber).toBe("919000000001");
    expect(items[0]?.email).toBe("alice@example.com");
    await app.close();
  });
});

describe("POST /v1/contacts — salesCycleEnteredAt", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("sets salesCycleEnteredAt when contact is created with a lead status", async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({ settings: {} });
    mockPrisma.leadStatus.findFirst.mockResolvedValue({ id: "ls-1" });
    mockPrisma.contact.create.mockResolvedValue({ id: "c-1", organizationId: "org-1", phoneNumber: "919000000001", leadStatusId: "ls-1" });
    const res = await app.inject({ method: "POST", url: "/v1/contacts", payload: { phoneNumber: "919000000001", leadStatusId: "ls-1" } });
    expect(res.statusCode).toBe(201);
    const createArg = mockPrisma.contact.create.mock.calls.at(-1)![0] as { data: Record<string, unknown> };
    expect(createArg.data["salesCycleEnteredAt"]).toBeInstanceOf(Date);
  });

  it("does NOT set salesCycleEnteredAt when contact is created without a lead status", async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({ settings: {} });
    mockPrisma.contact.create.mockResolvedValue({ id: "c-2", organizationId: "org-1", phoneNumber: "919000000002" });
    const res = await app.inject({ method: "POST", url: "/v1/contacts", payload: { phoneNumber: "919000000002" } });
    expect(res.statusCode).toBe(201);
    const createArg = mockPrisma.contact.create.mock.calls.at(-1)![0] as { data: Record<string, unknown> };
    expect(createArg.data["salesCycleEnteredAt"]).toBeUndefined();
  });
});

describe("PATCH /v1/contacts/:id — salesCycleEnteredAt", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("sets salesCycleEnteredAt when status first assigned via PATCH", async () => {
    const existing = { id: "c-1", organizationId: "org-1", phoneNumber: "919000000001", tags: [], leadStatusId: null };
    mockPrisma.contact.findFirst.mockResolvedValue(existing);
    mockPrisma.leadStatus.findFirst.mockResolvedValue({ id: "ls-2" });
    mockPrisma.contact.update.mockResolvedValue({ ...existing, leadStatusId: "ls-2" });
    const res = await app.inject({ method: "PATCH", url: "/v1/contacts/c-1", payload: { leadStatusId: "ls-2" } });
    expect(res.statusCode).toBe(200);
    const updateArg = mockPrisma.contact.update.mock.calls.at(-1)![0] as { data: Record<string, unknown> };
    expect(updateArg.data["salesCycleEnteredAt"]).toBeInstanceOf(Date);
  });

  it("does NOT overwrite salesCycleEnteredAt when status changes from one to another", async () => {
    const existing = { id: "c-1", organizationId: "org-1", phoneNumber: "919000000001", tags: [], leadStatusId: "ls-1" };
    mockPrisma.contact.findFirst.mockResolvedValue(existing);
    mockPrisma.leadStatus.findFirst.mockResolvedValue({ id: "ls-2" });
    mockPrisma.contact.update.mockResolvedValue({ ...existing, leadStatusId: "ls-2" });
    const res = await app.inject({ method: "PATCH", url: "/v1/contacts/c-1", payload: { leadStatusId: "ls-2" } });
    expect(res.statusCode).toBe(200);
    const updateArg = mockPrisma.contact.update.mock.calls.at(-1)![0] as { data: Record<string, unknown> };
    expect(updateArg.data["salesCycleEnteredAt"]).toBeUndefined();
  });
});

describe("PATCH /v1/contacts/:id — closureDeadline", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("sets closureDeadline and resets closureAlertedAt", async () => {
    const existing = { id: "c-1", organizationId: "org-1", phoneNumber: "919000000001", tags: [], leadStatusId: "ls-1" };
    mockPrisma.contact.findFirst.mockResolvedValue(existing);
    mockPrisma.contact.update.mockResolvedValue({ ...existing, closureDeadline: new Date("2026-08-01") });
    const res = await app.inject({
      method: "PATCH",
      url: "/v1/contacts/c-1",
      payload: { closureDeadline: "2026-08-01T00:00:00.000Z" },
    });
    expect(res.statusCode).toBe(200);
    const updateArg = mockPrisma.contact.update.mock.calls.at(-1)![0] as { data: Record<string, unknown> };
    expect(updateArg.data["closureDeadline"]).toBeInstanceOf(Date);
    expect(updateArg.data["closureAlertedAt"]).toBeNull();
  });

  it("clears closureDeadline when null is sent", async () => {
    const existing = { id: "c-1", organizationId: "org-1", phoneNumber: "919000000001", tags: [], leadStatusId: "ls-1" };
    mockPrisma.contact.findFirst.mockResolvedValue(existing);
    mockPrisma.contact.update.mockResolvedValue({ ...existing, closureDeadline: null });
    const res = await app.inject({
      method: "PATCH",
      url: "/v1/contacts/c-1",
      payload: { closureDeadline: null },
    });
    expect(res.statusCode).toBe(200);
    const updateArg = mockPrisma.contact.update.mock.calls.at(-1)![0] as { data: Record<string, unknown> };
    expect(updateArg.data["closureDeadline"]).toBeNull();
    expect(updateArg.data["closureAlertedAt"]).toBeNull();
  });

  it("rejects an invalid date string with 400", async () => {
    const existing = { id: "c-1", organizationId: "org-1", phoneNumber: "919000000001", tags: [], leadStatusId: "ls-1" };
    mockPrisma.contact.findFirst.mockResolvedValue(existing);
    const res = await app.inject({
      method: "PATCH",
      url: "/v1/contacts/c-1",
      payload: { closureDeadline: "not-a-date" },
    });
    expect(res.statusCode).toBe(400);
    expect(mockPrisma.contact.update).not.toHaveBeenCalled();
  });
});

describe("GET /v1/contacts — non-sales closure visibility", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildAppAsViewer(); });
  afterEach(async () => { await app.close(); });

  it("returns 403 when user lacks contacts_access and feature is disabled", async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({ settings: {} });
    const res = await app.inject({ method: "GET", url: "/v1/contacts" });
    expect(res.statusCode).toBe(403);
  });

  it("returns 403 when nonSalesClosureVisible is true but closureLeadStatusIds is empty", async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({
      settings: { contactConfig: { nonSalesClosureVisible: true, closureLeadStatusIds: [] } },
    });
    const res = await app.inject({ method: "GET", url: "/v1/contacts" });
    expect(res.statusCode).toBe(403);
  });

  it("returns filtered contacts when nonSalesClosureVisible is true and closureLeadStatusIds is set", async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({
      settings: { contactConfig: { nonSalesClosureVisible: true, closureLeadStatusIds: ["ls-closed"] } },
    });
    mockPrisma.contact.findMany.mockResolvedValue([
      { id: "c-1", organizationId: "org-1", phoneNumber: "919000000001", tags: [], leadStatusId: "ls-closed",
        leadStatus: { id: "ls-closed", name: "Closed Won", color: "#10B981" }, groupContacts: [], assignedUserId: null },
    ]);
    mockPrisma.user.findMany.mockResolvedValue([]);
    const res = await app.inject({ method: "GET", url: "/v1/contacts" });
    expect(res.statusCode).toBe(200);
    const json = res.json() as { data: unknown[] };
    expect(json.data).toHaveLength(1);
    // Verify the Prisma query included the closure filter
    const findArg = mockPrisma.contact.findMany.mock.calls.at(-1)![0] as { where: Record<string, unknown> };
    expect(findArg.where["leadStatusId"]).toEqual({ in: ["ls-closed"] });
  });

  it("still blocks non-sales users from POST /contacts", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/contacts", payload: { phoneNumber: "919000000099" } });
    expect(res.statusCode).toBe(403);
  });
});
