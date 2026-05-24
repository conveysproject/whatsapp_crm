import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const mockField = {
  id: "field-1",
  organizationId: "org-1",
  inputName: "Company Size",
  fieldKey: "company_size",
  inputType: "text",
  description: null,
  placeholder: null,
  defaultValue: null,
  options: [],
  isRequired: false,
  isReadOnly: false,
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const mockPrisma = {
  contactCustomField: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn().mockResolvedValue(0),
  },
  vendorSetting: {
    findFirst: vi.fn().mockResolvedValue(null),
  },
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
  const { customFieldsRouter } = await import("./custom-fields.js");
  await app.register(customFieldsRouter, { prefix: "/v1" });
  return app;
}

describe("GET /v1/contacts/custom-fields", () => {
  let app: FastifyInstance;
  beforeEach(async () => { app = await buildApp(); });
  afterEach(async () => { await app.close(); vi.clearAllMocks(); });

  it("returns active fields by default", async () => {
    mockPrisma.contactCustomField.findMany.mockResolvedValue([mockField]);
    const res = await app.inject({ method: "GET", url: "/v1/contacts/custom-fields" });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { data: typeof mockField[] }).data).toHaveLength(1);
    expect(mockPrisma.contactCustomField.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: "org-1", isActive: true } })
    );
  });

  it("returns all fields including inactive when ?all=1", async () => {
    mockPrisma.contactCustomField.findMany.mockResolvedValue([mockField]);
    const res = await app.inject({ method: "GET", url: "/v1/contacts/custom-fields?all=1" });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.contactCustomField.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: "org-1" } })
    );
  });
});

describe("POST /v1/contacts/custom-fields", () => {
  let app: FastifyInstance;
  beforeEach(async () => { app = await buildApp(); });
  afterEach(async () => { await app.close(); vi.clearAllMocks(); });

  it("returns 400 when inputName is missing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/contacts/custom-fields",
      payload: { inputType: "text" },
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: { code: string } }).error.code).toBe("MISSING_FIELDS");
  });

  it("auto-generates fieldKey from inputName when fieldKey is omitted", async () => {
    mockPrisma.contactCustomField.create.mockResolvedValue(mockField);
    const res = await app.inject({
      method: "POST",
      url: "/v1/contacts/custom-fields",
      payload: { inputName: "Company Size", inputType: "text" },
    });
    expect(res.statusCode).toBe(201);
    expect(mockPrisma.contactCustomField.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ fieldKey: "company_size" }),
      })
    );
  });

  it("uses provided fieldKey when given", async () => {
    mockPrisma.contactCustomField.create.mockResolvedValue(mockField);
    await app.inject({
      method: "POST",
      url: "/v1/contacts/custom-fields",
      payload: { inputName: "Company Size", fieldKey: "co_size", inputType: "text" },
    });
    expect(mockPrisma.contactCustomField.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ fieldKey: "co_size" }),
      })
    );
  });

  it("saves all metadata fields", async () => {
    mockPrisma.contactCustomField.create.mockResolvedValue(mockField);
    await app.inject({
      method: "POST",
      url: "/v1/contacts/custom-fields",
      payload: {
        inputName: "Industry",
        inputType: "select",
        description: "Primary industry",
        placeholder: "Choose…",
        defaultValue: "Tech",
        options: ["Tech", "Finance", "Healthcare"],
        isRequired: true,
        isReadOnly: false,
      },
    });
    expect(mockPrisma.contactCustomField.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          description: "Primary industry",
          placeholder: "Choose…",
          defaultValue: "Tech",
          options: ["Tech", "Finance", "Healthcare"],
          isRequired: true,
          isReadOnly: false,
        }),
      })
    );
  });
});

describe("PATCH /v1/contacts/custom-fields/:id", () => {
  let app: FastifyInstance;
  beforeEach(async () => { app = await buildApp(); });
  afterEach(async () => { await app.close(); vi.clearAllMocks(); });

  it("returns 404 for unknown field", async () => {
    mockPrisma.contactCustomField.findFirst.mockResolvedValue(null);
    const res = await app.inject({
      method: "PATCH",
      url: "/v1/contacts/custom-fields/bad-id",
      payload: { inputName: "New Name" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("patches only provided fields", async () => {
    mockPrisma.contactCustomField.findFirst.mockResolvedValue(mockField);
    mockPrisma.contactCustomField.update.mockResolvedValue({ ...mockField, isActive: false });
    const res = await app.inject({
      method: "PATCH",
      url: "/v1/contacts/custom-fields/field-1",
      payload: { isActive: false },
    });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.contactCustomField.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: false } })
    );
  });

  it("patches options array", async () => {
    mockPrisma.contactCustomField.findFirst.mockResolvedValue(mockField);
    mockPrisma.contactCustomField.update.mockResolvedValue({ ...mockField, options: ["A", "B"] });
    await app.inject({
      method: "PATCH",
      url: "/v1/contacts/custom-fields/field-1",
      payload: { options: ["A", "B"] },
    });
    expect(mockPrisma.contactCustomField.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { options: ["A", "B"] } })
    );
  });
});
