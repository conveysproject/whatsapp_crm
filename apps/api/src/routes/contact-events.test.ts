import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const mockPrisma = {
  contact: { findFirst: vi.fn() },
  contactEvent: {
    create: vi.fn(),
    findMany: vi.fn(),
    groupBy: vi.fn(),
  },
};

const mockAuth = { userId: "user-1", organizationId: "org-1", role: "admin" as const, permissions: {}, teamId: null as string | null, teamRole: null as "lead" | "member" | null };

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (request) => { request.auth = mockAuth; });
  const { contactEventsRouter } = await import("./contact-events.js");
  await app.register(contactEventsRouter, { prefix: "/v1" });
  return app;
}

describe("POST /v1/contacts/:id/events", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("creates event for contact in same org", async () => {
    mockPrisma.contact.findFirst.mockResolvedValue({ id: "c-1", organizationId: "org-1" });
    mockPrisma.contactEvent.create.mockResolvedValue({
      id: "ev-1", contactId: "c-1", organizationId: "org-1",
      name: "flow_completed", properties: { flowId: "f-1" }, occurredAt: new Date(),
    });
    const res = await app.inject({
      method: "POST",
      url: "/v1/contacts/c-1/events",
      payload: { name: "flow_completed", properties: { flowId: "f-1" } },
    });
    expect(res.statusCode).toBe(201);
    expect(mockPrisma.contactEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: "flow_completed", organizationId: "org-1", contactId: "c-1" }),
      })
    );
  });

  it("returns 404 when contact not in org", async () => {
    mockPrisma.contact.findFirst.mockResolvedValue(null);
    const res = await app.inject({
      method: "POST",
      url: "/v1/contacts/unknown/events",
      payload: { name: "flow_completed" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns 403 when user lacks contacts_access", async () => {
    vi.resetModules(); vi.clearAllMocks();
    const appDeny = Fastify({ logger: false });
    appDeny.decorate("prisma", mockPrisma as unknown as PrismaClient);
    appDeny.addHook("onRequest", async (request) => {
      request.auth = { userId: "u-2", organizationId: "org-1", role: "agent" as const, permissions: {}, teamId: null, teamRole: null };
    });
    const { contactEventsRouter } = await import("./contact-events.js");
    await appDeny.register(contactEventsRouter, { prefix: "/v1" });
    const res = await appDeny.inject({
      method: "POST", url: "/v1/contacts/c-1/events",
      payload: { name: "test_event" },
    });
    expect(res.statusCode).toBe(403);
    await appDeny.close();
  });
});

describe("GET /v1/contacts/events/names", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns distinct event names sorted", async () => {
    mockPrisma.contactEvent.groupBy.mockResolvedValue([
      { name: "flow_completed" },
      { name: "campaign_sent" },
    ]);
    const res = await app.inject({ method: "GET", url: "/v1/contacts/events/names" });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: string[] }>().data).toEqual(["campaign_sent", "flow_completed"]);
  });
});

describe("GET /v1/contacts/events/:name/properties", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns distinct property keys for event name", async () => {
    mockPrisma.contactEvent.findMany.mockResolvedValue([
      { properties: { flowId: "f-1", flowName: "Onboarding" } },
      { properties: { flowId: "f-2" } },
    ]);
    const res = await app.inject({ method: "GET", url: "/v1/contacts/events/flow_completed/properties" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: string[] }>();
    expect(body.data).toContain("flowId");
    expect(body.data).toContain("flowName");
  });
});
