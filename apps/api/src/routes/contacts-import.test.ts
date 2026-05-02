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
});
