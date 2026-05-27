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
  $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
};

const mockAuth = {
  userId: "user-1",
  organizationId: "org-1",
  role: "admin" as const,
  permissions: {},
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
      { id: "c-1", organizationId: "org-1", phoneNumber: "+919000000001", firstName: "Alice", lastName: null, email: "alice@example.com", countryCode: "IN", lifecycleStage: "lead", tags: [], notes: null, createdAt: new Date(), groupContacts: [], customFields: {} },
    ]);
    const res = await app.inject({ method: "GET", url: "/v1/contacts/export" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.body).toContain("Full Phone");
    expect(res.body).toContain("919000000001");
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
      { id: "c-1", firstName: "Priya", lastName: "Shah", phoneNumber: "+919000000001", email: "priya@example.com", countryCode: "IN", createdAt: new Date("2025-01-01") },
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

  it("applies lifecycleStage filter", async () => {
    mockAuth.permissions = { manage_contacts: "allow", "manage_contacts.export_contacts": "allow" };
    mockPrisma.contact.count.mockResolvedValue(5);
    const res = await app.inject({
      method: "GET",
      url: "/v1/contacts/export/count?lifecycleStage=lead&lifecycleStage=prospect",
    });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.contact.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ lifecycleStage: { in: ["lead", "prospect"] } }),
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
      contacts: [{ id: "c-1", firstName: null, lastName: null, phoneNumber: "+919", lifecycleStage: null }],
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
    phoneNumber: "+919000000001",
    email: "priya@example.com",
    countryCode: "IN",
    lifecycleStage: "lead",
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
    expect(res.body).toContain("Lifecycle Stage");
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

  it("applies lifecycleStage filter", async () => {
    mockAuth.permissions = { manage_contacts: "allow", "manage_contacts.export_contacts": "allow" };
    mockPrisma.contactCustomField.findMany.mockResolvedValue([]);
    mockPrisma.contact.findMany.mockResolvedValue([]);
    await app.inject({ method: "GET", url: "/v1/contacts/export?lifecycleStage=lead" });
    expect(mockPrisma.contact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ lifecycleStage: { in: ["lead"] } }),
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
