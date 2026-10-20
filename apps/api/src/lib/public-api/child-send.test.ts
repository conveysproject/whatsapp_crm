import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { resolveSendTarget, ChildForbiddenError, ChildNotConnectedError } from "./child-send.js";

interface Org {
  id: string; parentOrganizationId: string | null; isParent: boolean; status: string;
  phoneNumberId: string | null; wabaAccessToken: string | null; whatsappBusinessAccountId: string | null; number: string | null;
}
const org = (id: string, over: Partial<Org> = {}): Org => ({
  id, parentOrganizationId: null, isParent: false, status: "active",
  phoneNumberId: `pn-${id}`, wabaAccessToken: "test-secret", whatsappBusinessAccountId: `waba-${id}`, number: null, ...over,
});

let orgs: Org[] = [];
const fakePrisma = {
  organization: {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => orgs.find((o) => o.id === where.id) ?? null),
    findMany: vi.fn(async ({ where }: { where: { id?: { in: string[] }; parentOrganizationId?: string } }) =>
      orgs.filter((o) => (!where.id || where.id.in.includes(o.id)) && (where.parentOrganizationId === undefined || o.parentOrganizationId === where.parentOrganizationId))),
  },
  vendorSetting: {
    findFirst: vi.fn(async ({ where }: { where: { organizationId: string } }) => {
      const o = orgs.find((x) => x.id === where.organizationId);
      return o?.number ? { value: o.number } : null;
    }),
    findMany: vi.fn(async ({ where }: { where: { organizationId: { in: string[] } } }) =>
      orgs.filter((o) => where.organizationId.in.includes(o.id) && o.number).map((o) => ({ organizationId: o.id, value: o.number }))),
  },
} as unknown as PrismaClient;

const KEY = { id: "key-1", organizationId: "parent-1", scopes: ["whatsapp", "send_for_children"] };
const NO_SCOPE = { ...KEY, scopes: ["whatsapp"] };
const ORIG = process.env["PARENT_ORGS_ENABLED"];
const byId = (id: string) => orgs.find((o) => o.id === id)!;

beforeEach(() => {
  process.env["PARENT_ORGS_ENABLED"] = "true";
  orgs = [
    org("parent-1", { isParent: true, number: "+1 415-555-0001" }),
    org("child-a", { parentOrganizationId: "parent-1", number: "+1 415-555-1111" }),
    org("child-b", { parentOrganizationId: "parent-1", number: "+1 415-555-2222" }),
    org("other-parent", { isParent: true, number: "+1 415-555-0002" }),
    org("other-child", { parentOrganizationId: "other-parent", number: "+1 415-555-3333" }),
  ];
});
afterEach(() => { if (ORIG === undefined) delete process.env["PARENT_ORGS_ENABLED"]; else process.env["PARENT_ORGS_ENABLED"] = ORIG; });

describe("resolveSendTarget", () => {
  it("own number returns the key org, no flag or scope needed", async () => {
    delete process.env["PARENT_ORGS_ENABLED"];
    expect(await resolveSendTarget(fakePrisma, NO_SCOPE, { src: "14155550001" })).toEqual({ organizationId: "parent-1", viaParentOrgId: null });
  });

  it("a child number without the scope throws (not_entitled)", async () => {
    const err = await resolveSendTarget(fakePrisma, NO_SCOPE, { src: "14155551111" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChildForbiddenError);
    expect((err as ChildForbiddenError).reason).toBe("not_entitled");
  });

  it("a child number with the scope returns the child and the parent", async () => {
    expect(await resolveSendTarget(fakePrisma, KEY, { src: "14155551111" })).toEqual({ organizationId: "child-a", viaParentOrgId: "parent-1" });
  });

  it("another parent's child number and an unknown number both throw the same no_match error", async () => {
    const a = await resolveSendTarget(fakePrisma, KEY, { src: "14155553333" }).catch((e: unknown) => e);
    const b = await resolveSendTarget(fakePrisma, KEY, { src: "14155559999" }).catch((e: unknown) => e);
    for (const e of [a, b]) { expect(e).toBeInstanceOf(ChildForbiddenError); expect((e as ChildForbiddenError).reason).toBe("no_match"); }
    expect((a as Error).message).toBe((b as Error).message);
  });

  it("wabaId mismatch throws; matching wabaId resolves", async () => {
    await expect(resolveSendTarget(fakePrisma, KEY, { src: "14155551111", wabaId: "waba-child-b" })).rejects.toBeInstanceOf(ChildForbiddenError);
    expect(await resolveSendTarget(fakePrisma, KEY, { src: "14155551111", wabaId: "waba-child-a" })).toEqual({ organizationId: "child-a", viaParentOrgId: "parent-1" });
  });

  it("wabaId only resolves to exactly one child; a foreign or ambiguous waba throws", async () => {
    expect(await resolveSendTarget(fakePrisma, KEY, { src: "", wabaId: "waba-child-b" })).toEqual({ organizationId: "child-b", viaParentOrgId: "parent-1" });
    await expect(resolveSendTarget(fakePrisma, KEY, { src: "", wabaId: "waba-other-child" })).rejects.toBeInstanceOf(ChildForbiddenError);
    byId("child-b").whatsappBusinessAccountId = "waba-child-a";
    await expect(resolveSendTarget(fakePrisma, KEY, { src: "", wabaId: "waba-child-a" })).rejects.toBeInstanceOf(ChildForbiddenError);
  });

  it("two children sharing a number throws", async () => {
    byId("child-b").number = "+1 415-555-1111";
    await expect(resolveSendTarget(fakePrisma, KEY, { src: "14155551111" })).rejects.toBeInstanceOf(ChildForbiddenError);
  });

  it("an unlinked child throws on the very next call (nothing cached)", async () => {
    await resolveSendTarget(fakePrisma, KEY, { src: "14155551111" });
    byId("child-a").parentOrganizationId = null;
    await expect(resolveSendTarget(fakePrisma, KEY, { src: "14155551111" })).rejects.toBeInstanceOf(ChildForbiddenError);
  });

  it("flag off: a child number is not_entitled (behaves as today)", async () => {
    delete process.env["PARENT_ORGS_ENABLED"];
    const err = await resolveSendTarget(fakePrisma, KEY, { src: "14155551111" }).catch((e: unknown) => e);
    expect((err as ChildForbiddenError).reason).toBe("not_entitled");
  });

  it("an org that cannot be a parent is not_entitled even with the scope", async () => {
    byId("parent-1").isParent = false;
    const err = await resolveSendTarget(fakePrisma, KEY, { src: "14155551111" }).catch((e: unknown) => e);
    expect((err as ChildForbiddenError).reason).toBe("not_entitled");
  });

  it("a linked child that is suspended or lacks a token is ChildNotConnectedError, never the parent number", async () => {
    byId("child-a").status = "suspended";
    await expect(resolveSendTarget(fakePrisma, KEY, { src: "14155551111" })).rejects.toBeInstanceOf(ChildNotConnectedError);
    byId("child-a").status = "active";
    byId("child-a").wabaAccessToken = null;
    await expect(resolveSendTarget(fakePrisma, KEY, { src: "14155551111" })).rejects.toBeInstanceOf(ChildNotConnectedError);
  });

  it("the parent's own number together with a child's wabaId does not fall back to the parent", async () => {
    await expect(resolveSendTarget(fakePrisma, KEY, { src: "14155550001", wabaId: "waba-child-a" })).rejects.toBeInstanceOf(ChildForbiddenError);
  });
});
