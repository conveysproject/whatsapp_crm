import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const mockPrisma = {
  contact: { findMany: vi.fn(), update: vi.fn() },
};
const mockAuth = { userId: "user-1", organizationId: "org-1", role: "admin" as const, permissions: {}, teamId: null as string | null, teamRole: null as "lead" | "member" | null };

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (r) => { r.auth = mockAuth; });
  const { tagsRouter } = await import("./labels.js");
  await app.register(tagsRouter, { prefix: "/v1" });
  return app;
}

describe("GET /v1/tags", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns tag list for the org", async () => {
    mockPrisma.contact.findMany.mockResolvedValue([
      { tags: ["vip", "lead"] },
      { tags: ["vip"] },
    ]);
    const res = await app.inject({ method: "GET", url: "/v1/tags" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: Array<{ tag: string; count: number }> }>();
    expect(body.data.find((t) => t.tag === "vip")?.count).toBe(2);
  });
});

describe("settings_tags sub gate", () => {
  async function buildAppAs(permissions: Record<string, string>, role = "agent"): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    app.decorate("prisma", mockPrisma as unknown as PrismaClient);
    app.addHook("onRequest", async (r) => {
      r.auth = { userId: "u-9", organizationId: "org-1", role: role as typeof mockAuth.role, permissions, teamId: null, teamRole: null };
    });
    const { tagsRouter } = await import("./labels.js");
    await app.register(tagsRouter, { prefix: "/v1" });
    return app;
  }

  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

  it("blocks DELETE /tags/:tag when settings_tags sub is off (settings_access parent on)", async () => {
    const app = await buildAppAs({ settings_access: "allow" }); // settings_tags sub off
    const res = await app.inject({ method: "DELETE", url: "/v1/tags/vip" });
    expect(res.statusCode).toBe(403);
    expect(mockPrisma.contact.findMany).not.toHaveBeenCalled();
    await app.close();
  });

  it("allows DELETE when settings_tags sub is on", async () => {
    mockPrisma.contact.findMany.mockResolvedValue([]);
    const app = await buildAppAs({ settings_access: "allow", "settings_access@settings_tags": "allow" });
    const res = await app.inject({ method: "DELETE", url: "/v1/tags/vip" });
    expect(res.statusCode).toBe(204);
    await app.close();
  });

  it("admin bypasses settings_tags sub gate", async () => {
    mockPrisma.contact.findMany.mockResolvedValue([]);
    const app = await buildAppAs({}, "admin");
    const res = await app.inject({ method: "DELETE", url: "/v1/tags/vip" });
    expect(res.statusCode).toBe(204);
    await app.close();
  });
});

describe("PATCH /v1/tags/:tag (rename)", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("renames a tag across all contacts in the org", async () => {
    mockPrisma.contact.findMany.mockResolvedValue([
      { id: "c-1", tags: ["vip", "lead"] },
      { id: "c-2", tags: ["vip"] },
    ]);
    mockPrisma.contact.update.mockResolvedValue({});
    const res = await app.inject({
      method: "PATCH",
      url: "/v1/tags/vip",
      payload: { newTag: "premium" },
    });
    expect(res.statusCode).toBe(204);
    expect(mockPrisma.contact.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "c-1" }, data: { tags: ["premium", "lead"] } })
    );
    expect(mockPrisma.contact.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "c-2" }, data: { tags: ["premium"] } })
    );
  });

  it("returns 400 when newTag is missing", async () => {
    const res = await app.inject({ method: "PATCH", url: "/v1/tags/vip", payload: {} });
    expect(res.statusCode).toBe(400);
    expect(mockPrisma.contact.findMany).not.toHaveBeenCalled();
  });

  it("returns 403 when settings_tags sub-permission is missing", async () => {
    const restricted = Fastify({ logger: false });
    restricted.decorate("prisma", mockPrisma as unknown as PrismaClient);
    restricted.addHook("onRequest", async (r) => {
      r.auth = { userId: "u-2", organizationId: "org-1", role: "agent" as const, permissions: { settings_access: "allow" }, teamId: null, teamRole: null };
    });
    const { tagsRouter } = await import("./labels.js");
    await restricted.register(tagsRouter, { prefix: "/v1" });
    const res = await restricted.inject({ method: "PATCH", url: "/v1/tags/vip", payload: { newTag: "premium" } });
    expect(res.statusCode).toBe(403);
    await restricted.close();
  });
});
