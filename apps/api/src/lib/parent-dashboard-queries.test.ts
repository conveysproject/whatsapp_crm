import { describe, it, expect, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  getChildrenOverview,
  getChildStats,
  getChildMessages,
  ChildNotFoundError,
} from "./parent-dashboard-queries.js";

const range = { from: new Date("2026-10-01T00:00:00Z"), to: new Date("2026-10-10T00:00:00Z") };

function makePrisma(opts: { children: Array<{ id: string; parentOrganizationId: string | null }> }) {
  const queryRaw = vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?");
    if (text.includes("FROM organizations")) {
      return (values[0] as string[]).map((id) => ({ id, name: `Name ${id}`, waba_connected: id === "c1" }));
    }
    if (text.includes("max(m.created_at)")) {
      return (values[0] as string[]).map((id) => ({ organization_id: id, last_activity_at: new Date("2026-10-09T00:00:00Z") }));
    }
    if (text.includes("GROUP BY m.organization_id")) {
      return (values[0] as string[]).map((id) => ({ organization_id: id, sent: 10, delivered: 8, read: 4, failed: 2, received: 5 }));
    }
    throw new Error("unexpected query " + text);
  });
  const prisma = {
    $queryRaw: queryRaw,
    organization: {
      findMany: vi.fn(async ({ where }: { where: { parentOrganizationId: string } }) =>
        opts.children.filter((c) => c.parentOrganizationId === where.parentOrganizationId).map((c) => ({ id: c.id })),
      ),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const c = opts.children.find((x) => x.id === where.id);
        return c ? { parentOrganizationId: c.parentOrganizationId } : null;
      }),
    },
    message: { findMany: vi.fn(async () => []) },
  };
  return { prisma: prisma as unknown as PrismaClient, queryRaw, raw: prisma };
}

const kids = [
  { id: "c1", parentOrganizationId: "p1" },
  { id: "c2", parentOrganizationId: "p1" },
  { id: "x1", parentOrganizationId: "p2" },
];

describe("getChildrenOverview", () => {
  it("passes exactly the ids from getChildOrgIds to every query", async () => {
    const { prisma, queryRaw } = makePrisma({ children: kids });
    const out = await getChildrenOverview(prisma, "p1", range);
    expect(queryRaw).toHaveBeenCalledTimes(3);
    for (const call of queryRaw.mock.calls) {
      expect(call[1]).toEqual(["c1", "c2"]);
    }
    expect(out.map((o) => o.orgId)).toEqual(["c1", "c2"]);
    expect(out[0]).toMatchObject({ sent: 10, delivered: 8, read: 4, failed: 2, received: 5, failureRate: 0.167, wabaConnected: true, qualityRating: null });
    expect(out[1]?.wabaConnected).toBe(false);
  });

  it("makes no query when there are no children", async () => {
    const { prisma, queryRaw } = makePrisma({ children: kids });
    expect(await getChildrenOverview(prisma, "nobody", range)).toEqual([]);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("never selects the access token", async () => {
    const { prisma, queryRaw } = makePrisma({ children: kids });
    const out = await getChildrenOverview(prisma, "p1", range);
    for (const call of queryRaw.mock.calls) {
      const sql = (call[0] as TemplateStringsArray).join("?");
      expect(sql).not.toMatch(/SELECT[^;]*\bwaba_access_token\b\s*(,|FROM|AS)/i);
    }
    expect(JSON.stringify(out)).not.toContain("wabaAccessToken");
  });

  it("treats zero sent as zero failure rate", async () => {
    const { prisma, queryRaw } = makePrisma({ children: kids });
    queryRaw.mockImplementation(async (strings: TemplateStringsArray) => {
      const t = strings.join("?");
      if (t.includes("FROM organizations")) return [{ id: "c1", name: "A", waba_connected: false }];
      return [];
    });
    const out = await getChildrenOverview(prisma, "p1", range);
    expect(out[0]).toMatchObject({ sent: 0, failureRate: 0, lastActivityAt: null });
  });
});

describe("getChildStats", () => {
  it("scopes to exactly the one child", async () => {
    const { prisma, queryRaw } = makePrisma({ children: kids });
    const s = await getChildStats(prisma, "p1", "c1", range);
    expect(s.orgId).toBe("c1");
    for (const call of queryRaw.mock.calls) expect(call[1]).toEqual(["c1"]);
  });
  it.each([["x1"], ["p1"], ["ghost"]])("throws ChildNotFoundError for %s", async (id) => {
    const { prisma, queryRaw } = makePrisma({ children: kids });
    await expect(getChildStats(prisma, "p1", id, range)).rejects.toBeInstanceOf(ChildNotFoundError);
    expect(queryRaw).not.toHaveBeenCalled();
  });
});

describe("getChildMessages", () => {
  it("queries only the child org, paginates, and returns a next cursor", async () => {
    const { prisma, raw } = makePrisma({ children: kids });
    const rows = Array.from({ length: 3 }, (_, i) => ({
      id: `m${i}`, direction: "inbound", contentType: "text", body: "hi", status: "read", isSystemMessage: false,
      sentAt: new Date(), createdAt: new Date(), conversation: { contact: { phoneNumber: "+1", name: "A" } },
    }));
    raw.message.findMany.mockResolvedValueOnce(rows as never);
    const out = await getChildMessages(prisma, "p1", "c1", { cursor: "m0", limit: 2 });
    const arg = (raw.message.findMany.mock.calls[0] as unknown as [Record<string, any>])[0];
    expect(arg.where).toEqual({ organizationId: "c1" });
    expect(arg.take).toBe(3);
    expect(arg.cursor).toEqual({ id: "m0" });
    expect(out.items).toHaveLength(2);
    expect(out.nextCursor).toBe("m2");
    expect(out.items[0]).toMatchObject({ id: "m0", body: "hi", contactPhone: "+1", contactName: "A" });
  });
  it("throws for a non-child without touching messages", async () => {
    const { prisma, raw } = makePrisma({ children: kids });
    await expect(getChildMessages(prisma, "p1", "x1", { limit: 10 })).rejects.toBeInstanceOf(ChildNotFoundError);
    expect(raw.message.findMany).not.toHaveBeenCalled();
  });
});
