import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import type { PrismaClient } from "@prisma/client";

const mockRedisGet = vi.fn();
const mockRedisSet = vi.fn().mockResolvedValue("OK");
const mockRedisDel = vi.fn().mockResolvedValue(1);

vi.mock("../lib/redis.js", () => ({
  redis: { get: mockRedisGet, set: mockRedisSet, del: mockRedisDel },
}));

vi.mock("../lib/queue.js", () => ({
  contactImportQueue: { add: vi.fn().mockResolvedValue({ id: "job-1" }) },
  redisConnection: {},
}));

const mockPrisma = {
  contact: { findMany: vi.fn().mockResolvedValue([]) },
  contactImport: {
    create: vi.fn().mockResolvedValue({
      id: "import-1",
      organizationId: "org-1",
      status: "pending",
      totalRows: 2,
    }),
  },
};

const mockAuth = { userId: "user-1", organizationId: "org-1", role: "admin" as const };

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (request) => { request.auth = mockAuth; });
  const { contactsImportRouter } = await import("./contacts-import.js");
  await app.register(contactsImportRouter, { prefix: "/v1" });
  return app;
}

describe("POST /v1/contacts/import/upload", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("parses CSV headers and returns sessionId and columns", async () => {
    const boundary = "----TestBoundary123";
    const csvContent = "Name,Phone Number,Country Code,Email\r\nAlice,9000000001,91,alice@example.com";
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="contacts.csv"',
      "Content-Type: text/csv",
      "",
      csvContent,
      `--${boundary}--`,
    ].join("\r\n");

    const res = await app.inject({
      method: "POST",
      url: "/v1/contacts/import/upload",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });

    expect(res.statusCode).toBe(200);
    const data = res.json<{ data: { sessionId: string; columns: string[]; sampleRows: Record<string, string>[] } }>().data;
    expect(data.sessionId).toBeTruthy();
    expect(data.columns).toEqual(["Name", "Phone Number", "Country Code", "Email"]);
    expect(data.sampleRows).toHaveLength(1);
    expect(data.sampleRows[0]).toMatchObject({ Name: "Alice", "Phone Number": "9000000001" });
    expect(mockRedisSet).toHaveBeenCalledWith(
      expect.stringContaining("import:csv:"),
      expect.any(String),
      "EX",
      1800
    );
  });

  it("returns 400 when no file is attached", async () => {
    const boundary = "----TestBoundary123";
    const res = await app.inject({
      method: "POST",
      url: "/v1/contacts/import/upload",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: `--${boundary}--`,
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when field name is not 'file'", async () => {
    const boundary = "----TestBoundary123";
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="upload"; filename="contacts.csv"',
      "Content-Type: text/csv",
      "",
      "Name,Phone\r\nAlice,+919000000001",
      `--${boundary}--`,
    ].join("\r\n");
    const res = await app.inject({
      method: "POST",
      url: "/v1/contacts/import/upload",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: { code: string } }>().error.code).toBe("INVALID_FIELD");
  });
});

describe("POST /v1/contacts/import/analyze", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  const SESSION_ID = "test-session-id";

  it("returns 404 when session not found in Redis", async () => {
    mockRedisGet.mockResolvedValueOnce(null);
    const res = await app.inject({
      method: "POST",
      url: "/v1/contacts/import/analyze",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ sessionId: SESSION_ID, fieldMapping: [{ csvColumn: "Phone", dbField: "fullPhoneNumber" }] }),
    });
    expect(res.statusCode).toBe(404);
  });

  it("counts unique phones, duplicates in CSV, and existing contacts", async () => {
    const csv = "Full Phone\n+919000000001\n+919000000002\n+919000000001";
    mockRedisGet.mockResolvedValueOnce(csv);
    mockPrisma.contact.findMany.mockResolvedValueOnce([{ phoneNumber: "+919000000001" }]);

    const res = await app.inject({
      method: "POST",
      url: "/v1/contacts/import/analyze",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({
        sessionId: SESSION_ID,
        fieldMapping: [{ csvColumn: "Full Phone", dbField: "fullPhoneNumber" }],
      }),
    });

    expect(res.statusCode).toBe(200);
    const data = res.json<{ data: { totalRows: number; newContacts: number; duplicatesInCsv: number; existingInDb: number } }>().data;
    expect(data.totalRows).toBe(3);
    expect(data.duplicatesInCsv).toBe(1);
    expect(data.existingInDb).toBe(1);
    expect(data.newContacts).toBe(1);
  });

  it("falls back from fullPhone to splitPhone when fullPhone cell is empty", async () => {
    const csv = "Full Phone,Phone Number,Country Code\n+919000000001,,\n,9000000002,91";
    mockRedisGet.mockResolvedValueOnce(csv);
    mockPrisma.contact.findMany.mockResolvedValueOnce([]);

    const res = await app.inject({
      method: "POST",
      url: "/v1/contacts/import/analyze",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({
        sessionId: SESSION_ID,
        fieldMapping: [
          { csvColumn: "Full Phone", dbField: "fullPhoneNumber" },
          { csvColumn: "Phone Number", dbField: "phoneNumber" },
          { csvColumn: "Country Code", dbField: "countryCode" },
        ],
      }),
    });

    expect(res.statusCode).toBe(200);
    const data = res.json<{ data: { totalRows: number; newContacts: number } }>().data;
    expect(data.totalRows).toBe(2);
    expect(data.newContacts).toBe(2);
  });

  it("skips rows where both fullPhone and splitPhone are invalid", async () => {
    const csv = "Full Phone,Phone Number,Country Code\nbadvalue,,\n,badphone,badcc";
    mockRedisGet.mockResolvedValueOnce(csv);
    mockPrisma.contact.findMany.mockResolvedValueOnce([]);

    const res = await app.inject({
      method: "POST",
      url: "/v1/contacts/import/analyze",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({
        sessionId: SESSION_ID,
        fieldMapping: [
          { csvColumn: "Full Phone", dbField: "fullPhoneNumber" },
          { csvColumn: "Phone Number", dbField: "phoneNumber" },
          { csvColumn: "Country Code", dbField: "countryCode" },
        ],
      }),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: { newContacts: number } }>().data.newContacts).toBe(0);
  });
});

describe("POST /v1/contacts/import/start", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("creates a DB record, enqueues BullMQ job, and returns importToken", async () => {
    const { contactImportQueue } = await import("../lib/queue.js");

    const res = await app.inject({
      method: "POST",
      url: "/v1/contacts/import/start",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({
        sessionId: "sess-1",
        fieldMapping: [{ csvColumn: "Phone", dbField: "fullPhoneNumber" }],
        batchTags: ["vip"],
        lifecycleStage: "lead",
        updateExisting: false,
        totalRows: 100,
      }),
    });

    expect(res.statusCode).toBe(200);
    const data = res.json<{ data: { importJobId: string; importToken: string } }>().data;
    expect(data.importJobId).toBe("import-1");
    expect(typeof data.importToken).toBe("string");
    expect(data.importToken.startsWith("import-1:")).toBe(true);
    expect(mockPrisma.contactImport.create).toHaveBeenCalledOnce();
    expect(vi.mocked(contactImportQueue.add)).toHaveBeenCalledOnce();
  });
});

describe("DELETE /v1/contacts/import/session/:sessionId", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("deletes the Redis session key and returns 204", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/v1/contacts/import/session/some-session-id",
    });
    expect(res.statusCode).toBe(204);
    expect(mockRedisDel).toHaveBeenCalledWith("import:csv:some-session-id");
  });
});
