import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const evaluateSegment = vi.fn();
vi.mock("../lib/segment-evaluator.js", () => ({ evaluateSegment: (...a: unknown[]) => evaluateSegment(...a) }));

const segmentFindFirst = vi.fn();
const groupContactFindMany = vi.fn();
const contactCount = vi.fn();
const mockPrisma = { segment: { findFirst: segmentFindFirst }, groupContact: { findMany: groupContactFindMany }, contact: { count: contactCount } };

async function buildAs(role: string, permissions: Record<string, string> = {}, organizationId = "org-1"): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (r) => {
    r.auth = { userId: "u-1", organizationId, role: role as never, permissions, teamId: null, teamRole: null };
  });
  const { campaignAudienceRouter } = await import("./campaign-audience.js");
  await app.register(campaignAudienceRouter, { prefix: "/v1" });
  return app;
}

const post = (app: FastifyInstance, payload: unknown) => app.inject({ method: "POST", url: "/v1/campaigns/audience-size", payload: payload as object });

describe("POST /v1/campaigns/audience-size", () => {
  beforeEach(() => {
    [evaluateSegment, segmentFindFirst, groupContactFindMany, contactCount].forEach((m) => m.mockReset());
  });

  it("refuses roles without campaign access before any query", async () => {
    const app = await buildAs("agent");
    expect((await post(app, { mode: "all" })).statusCode).toBe(403);
    expect(contactCount).not.toHaveBeenCalled();
    await app.close();
  });
  it("counts every contact who has not opted out, in the callers organization only", async () => {
    contactCount.mockResolvedValue(1234);
    const app = await buildAs("admin", {}, "org-7");
    expect((await post(app, { mode: "all" })).json<{ data: { count: number } }>().data.count).toBe(1234);
    expect(contactCount).toHaveBeenCalledWith({ where: { organizationId: "org-7", whatsappOptOut: false } });
    await app.close();
  });
  it("counts distinct phone numbers across groups and restricts to the callers organization", async () => {
    groupContactFindMany.mockResolvedValue([
      { contact: { phoneNumber: "+911" } }, { contact: { phoneNumber: "+912" } }, { contact: { phoneNumber: "+911" } },
    ]);
    const app = await buildAs("admin", {}, "org-7");
    expect((await post(app, { mode: "groups", groupIds: ["g1", "g2"] })).json<{ data: { count: number } }>().data.count).toBe(2);
    expect(groupContactFindMany.mock.calls[0]![0].where).toEqual({ contactGroupId: { in: ["g1", "g2"] }, contactGroup: { organizationId: "org-7" } });
    await app.close();
  });
  it("validates groups: missing, empty, non-text or too many", async () => {
    const app = await buildAs("admin");
    for (const body of [{ mode: "groups" }, { mode: "groups", groupIds: [] }, { mode: "groups", groupIds: [1] }, { mode: "groups", groupIds: Array(201).fill("g") }]) {
      expect((await post(app, body)).statusCode, JSON.stringify(body)).toBe(400);
    }
    expect(groupContactFindMany).not.toHaveBeenCalled();
    await app.close();
  });
  it("counts a segment only when it belongs to the callers organization", async () => {
    segmentFindFirst.mockResolvedValue({ id: "s1", filters: [] });
    evaluateSegment.mockResolvedValue({ contacts: [{ phoneNumber: "+911" }, { phoneNumber: "+912" }] });
    const app = await buildAs("admin", {}, "org-7");
    expect((await post(app, { mode: "segment", segmentId: "s1" })).json<{ data: { count: number } }>().data.count).toBe(2);
    expect(segmentFindFirst).toHaveBeenCalledWith({ where: { id: "s1", organizationId: "org-7" } });
    segmentFindFirst.mockResolvedValue(null);
    expect((await post(app, { mode: "segment", segmentId: "other-org" })).statusCode).toBe(404);
    expect((await post(app, { mode: "segment" })).statusCode).toBe(400);
    await app.close();
  });
  it("rejects an unknown mode", async () => {
    const app = await buildAs("admin");
    expect((await post(app, { mode: "everything" })).statusCode).toBe(400);
    expect((await post(app, {})).statusCode).toBe(400);
    await app.close();
  });
});
