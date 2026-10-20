import { describe, it, expect, vi, afterEach } from "vitest";
import type { Prisma, PrismaClient } from "@prisma/client";
import {
  parentOrgsEnabled,
  getChildOrgIds,
  isChildOf,
  getParentOf,
  canBeParent,
  linkChild,
  unlinkChild,
  ParentLinkError,
} from "./parent-orgs.js";

type OrgRow = { isParent: boolean; parentOrganizationId: string | null } | null;

function makePrisma(
  opts: { orgs?: Record<string, OrgRow>; childCount?: number; findMany?: unknown[]; updateCount?: number } = {}
) {
  const orgs = opts.orgs ?? {};
  const tx = {
    $queryRaw: vi.fn(async () => []),
    organization: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => orgs[where.id] ?? null),
      count: vi.fn(async () => opts.childCount ?? 0),
      updateMany: vi.fn(async () => ({ count: opts.updateCount ?? 1 })),
    },
    parentAuditEvent: { create: vi.fn(async () => ({})) },
  };
  const prisma = {
    organization: {
      findMany: vi.fn(async () => opts.findMany ?? []),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => orgs[where.id] ?? null),
    },
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  return { prisma: prisma as unknown as PrismaClient, tx, raw: prisma };
}

afterEach(() => {
  delete process.env["PARENT_ORGS_ENABLED"];
});

describe("parentOrgsEnabled", () => {
  it("is false unless env is exactly 'true'", () => {
    expect(parentOrgsEnabled()).toBe(false);
    process.env["PARENT_ORGS_ENABLED"] = "1";
    expect(parentOrgsEnabled()).toBe(false);
    process.env["PARENT_ORGS_ENABLED"] = "TRUE";
    expect(parentOrgsEnabled()).toBe(false);
    process.env["PARENT_ORGS_ENABLED"] = "true";
    expect(parentOrgsEnabled()).toBe(true);
  });
});

describe("getChildOrgIds", () => {
  it("filters by parentOrganizationId and returns ids", async () => {
    const { prisma, raw } = makePrisma({ findMany: [{ id: "c1" }, { id: "c2" }] });
    expect(await getChildOrgIds(prisma, "p1")).toEqual(["c1", "c2"]);
    expect(raw.organization.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { parentOrganizationId: "p1" } })
    );
  });
});

describe("isChildOf", () => {
  it("is true when the child's parent matches", async () => {
    const { prisma } = makePrisma({ orgs: { c1: { isParent: false, parentOrganizationId: "p1" } } });
    expect(await isChildOf(prisma, "p1", "c1")).toBe(true);
  });
  it("is false for an unrelated org", async () => {
    const { prisma } = makePrisma({ orgs: { x: { isParent: false, parentOrganizationId: "other" } } });
    expect(await isChildOf(prisma, "p1", "x")).toBe(false);
  });
  it("is false for itself", async () => {
    const { prisma, raw } = makePrisma({ orgs: { p1: { isParent: true, parentOrganizationId: null } } });
    expect(await isChildOf(prisma, "p1", "p1")).toBe(false);
    expect(raw.organization.findUnique).not.toHaveBeenCalled();
  });
  it("is false for a missing org", async () => {
    const { prisma } = makePrisma();
    expect(await isChildOf(prisma, "p1", "nope")).toBe(false);
  });
});

describe("getParentOf", () => {
  it("returns the parent id and name", async () => {
    const { prisma, raw } = makePrisma();
    raw.organization.findUnique.mockResolvedValueOnce({
      parentOrganization: { id: "p1", name: "Agency" },
    } as never);
    expect(await getParentOf(prisma, "c1")).toEqual({ id: "p1", name: "Agency" });
  });
  it("returns null when there is no parent", async () => {
    const { prisma, raw } = makePrisma();
    raw.organization.findUnique.mockResolvedValueOnce({ parentOrganization: null } as never);
    expect(await getParentOf(prisma, "c1")).toBeNull();
  });
});

describe("canBeParent", () => {
  it("true only when isParent and no parent", async () => {
    const { prisma } = makePrisma({
      orgs: {
        ok: { isParent: true, parentOrganizationId: null },
        notParent: { isParent: false, parentOrganizationId: null },
        hasParent: { isParent: true, parentOrganizationId: "z" },
      },
    });
    expect(await canBeParent(prisma, "ok")).toBe(true);
    expect(await canBeParent(prisma, "notParent")).toBe(false);
    expect(await canBeParent(prisma, "hasParent")).toBe(false);
    expect(await canBeParent(prisma, "missing")).toBe(false);
  });
});

describe("linkChild", () => {
  const okParent = { isParent: true, parentOrganizationId: null };
  const freeChild = { isParent: false, parentOrganizationId: null };

  it("links in one transaction and writes a 'linked' audit row", async () => {
    const { prisma, tx, raw } = makePrisma({ orgs: { p1: okParent, c1: freeChild } });
    await linkChild(prisma, "p1", "c1", "u1");
    expect(raw.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.organization.updateMany).toHaveBeenCalledWith({
      where: { id: "c1", parentOrganizationId: null },
      data: { parentOrganizationId: "p1" },
    });
    expect(tx.parentAuditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        parentOrganizationId: "p1",
        childOrganizationId: "c1",
        actorUserId: "u1",
        action: "linked",
      }),
    });
  });

  // Prisma's interactive-transaction client has $transaction (nested = savepoint); model it as
  // a client whose $transaction runs the callback on itself.
  function asTxClient(tx: Record<string, unknown>) {
    return Object.assign(tx, { $transaction: vi.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(tx)) });
  }

  it("works on a transaction client (nested $transaction), still locking and compare-and-set", async () => {
    const { tx } = makePrisma({ orgs: { p1: okParent, c1: freeChild } });
    await linkChild(asTxClient(tx) as unknown as Prisma.TransactionClient, "p1", "c1", "u1");
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.organization.updateMany).toHaveBeenCalledWith({
      where: { id: "c1", parentOrganizationId: null },
      data: { parentOrganizationId: "p1" },
    });
    expect(tx.parentAuditEvent.create).toHaveBeenCalledTimes(1);
  });

  it("transaction-client path still rejects an invalid link", async () => {
    const { tx } = makePrisma({ orgs: { p1: { isParent: false, parentOrganizationId: null }, c1: freeChild } });
    await expect(linkChild(asTxClient(tx) as unknown as Prisma.TransactionClient, "p1", "c1", "u1")).rejects.toMatchObject({
      code: "PARENT_NOT_ENABLED",
    });
  });

  async function expectCode(p: Promise<unknown>, code: string) {
    await expect(p).rejects.toBeInstanceOf(ParentLinkError);
    await expect(p).rejects.toMatchObject({ name: "ParentLinkError", code });
  }

  it("locks both rows (stable order, FOR UPDATE) before any read", async () => {
    const { prisma, tx } = makePrisma({ orgs: { p1: okParent, c1: freeChild } });
    await linkChild(prisma, "p1", "c1", "u1");
    const lockOrder = tx.$queryRaw.mock.invocationCallOrder[0]!;
    expect(lockOrder).toBeLessThan(tx.organization.findUnique.mock.invocationCallOrder[0]!);
    expect(lockOrder).toBeLessThan(tx.organization.count.mock.invocationCallOrder[0]!);
    const call = tx.$queryRaw.mock.calls[0] as unknown as [TemplateStringsArray, ...string[]];
    expect(call[0].join("?")).toContain("ORDER BY id FOR UPDATE");
    expect(call.slice(1)).toEqual(["p1", "c1"]);
  });

  it("throws CHILD_ALREADY_LINKED and writes no audit row when a concurrent link won (count 0)", async () => {
    const { prisma, tx } = makePrisma({ orgs: { p1: okParent, c1: freeChild }, updateCount: 0 });
    await expectCode(linkChild(prisma, "p1", "c1", "u1"), "CHILD_ALREADY_LINKED");
    expect(tx.parentAuditEvent.create).not.toHaveBeenCalled();
  });

  it("throws PARENT_NOT_ENABLED when parent is not isParent", async () => {
    const { prisma, tx } = makePrisma({ orgs: { p1: { isParent: false, parentOrganizationId: null }, c1: freeChild } });
    await expectCode(linkChild(prisma, "p1", "c1", null), "PARENT_NOT_ENABLED");
    expect(tx.organization.updateMany).not.toHaveBeenCalled();
  });
  it("throws PARENT_HAS_PARENT when the parent has a parent", async () => {
    const { prisma, tx } = makePrisma({ orgs: { p1: { isParent: true, parentOrganizationId: "g" }, c1: freeChild } });
    await expectCode(linkChild(prisma, "p1", "c1", null), "PARENT_HAS_PARENT");
    expect(tx.organization.updateMany).not.toHaveBeenCalled();
  });
  it("throws CHILD_ALREADY_LINKED when the child already has a parent", async () => {
    const { prisma, tx } = makePrisma({
      orgs: { p1: okParent, c1: { isParent: false, parentOrganizationId: "other" } },
    });
    await expectCode(linkChild(prisma, "p1", "c1", null), "CHILD_ALREADY_LINKED");
    expect(tx.organization.updateMany).not.toHaveBeenCalled();
  });
  it("throws CHILD_HAS_CHILDREN when the child has children", async () => {
    const { prisma, tx } = makePrisma({ orgs: { p1: okParent, c1: freeChild }, childCount: 2 });
    await expectCode(linkChild(prisma, "p1", "c1", null), "CHILD_HAS_CHILDREN");
    expect(tx.organization.updateMany).not.toHaveBeenCalled();
  });
  it("throws SELF_LINK when parent and child are the same org", async () => {
    const { prisma } = makePrisma({ orgs: { p1: okParent } });
    await expectCode(linkChild(prisma, "p1", "p1", null), "SELF_LINK");
  });
  it("throws ORG_NOT_FOUND when an org is missing", async () => {
    const { prisma } = makePrisma({ orgs: { p1: okParent } });
    await expectCode(linkChild(prisma, "p1", "ghost", null), "ORG_NOT_FOUND");
  });
});

describe("unlinkChild", () => {
  it.each([
    ["parent", "unlinked_by_parent"],
    ["child", "unlinked_by_child"],
  ] as const)("clears the column and audits by %s", async (by, action) => {
    const { prisma, tx, raw } = makePrisma({ orgs: { c1: { isParent: false, parentOrganizationId: "p1" } } });
    await unlinkChild(prisma, "c1", by, "u1");
    expect(raw.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.organization.updateMany).toHaveBeenCalledWith({
      where: { id: "c1", parentOrganizationId: "p1" },
      data: { parentOrganizationId: null },
    });
    expect(tx.parentAuditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        parentOrganizationId: "p1",
        childOrganizationId: "c1",
        actorUserId: "u1",
        action,
      }),
    });
  });

  it("locks the child row before reading it", async () => {
    const { prisma, tx } = makePrisma({ orgs: { c1: { isParent: false, parentOrganizationId: "p1" } } });
    await unlinkChild(prisma, "c1", "parent", "u1");
    const lockOrder = tx.$queryRaw.mock.invocationCallOrder[0]!;
    const readOrder = tx.organization.findUnique.mock.invocationCallOrder[0]!;
    expect(lockOrder).toBeLessThan(readOrder);
    const sql = (tx.$queryRaw.mock.calls[0] as unknown as [TemplateStringsArray])[0].join("?");
    expect(sql).toContain("FOR UPDATE");
  });

  it("throws NOT_A_CHILD and writes no audit row when a concurrent unlink won (count 0)", async () => {
    const { prisma, tx } = makePrisma({
      orgs: { c1: { isParent: false, parentOrganizationId: "p1" } },
      updateCount: 0,
    });
    await expect(unlinkChild(prisma, "c1", "child", "u1")).rejects.toMatchObject({ code: "NOT_A_CHILD" });
    expect(tx.parentAuditEvent.create).not.toHaveBeenCalled();
  });

  it("throws NOT_A_CHILD when the org has no parent", async () => {
    const { prisma, tx } = makePrisma({ orgs: { c1: { isParent: false, parentOrganizationId: null } } });
    await expect(unlinkChild(prisma, "c1", "parent", "u1")).rejects.toMatchObject({ code: "NOT_A_CHILD" });
    expect(tx.organization.updateMany).not.toHaveBeenCalled();
  });
});
