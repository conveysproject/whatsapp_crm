import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { checkPublicApiAccess, MAX_ACTIVE_CREDENTIALS } from "./access.js";

const findFirst = vi.fn();
const prisma = { vendorSetting: { findFirst } } as unknown as PrismaClient;
const ENV = "PUBLIC_API_ALLOWED_ORGS";

describe("checkPublicApiAccess", () => {
  const orig = process.env[ENV];
  beforeEach(() => { vi.clearAllMocks(); delete process.env[ENV]; findFirst.mockResolvedValue(null); });
  afterEach(() => { if (orig === undefined) delete process.env[ENV]; else process.env[ENV] = orig; });

  it("caps active credentials at 10", () => { expect(MAX_ACTIVE_CREDENTIALS).toBe(10); });

  it.each([undefined, "", " ", ",", " , ,, "])("allows everyone when the allow-list is %j", async (v) => {
    if (v !== undefined) process.env[ENV] = v;
    expect(await checkPublicApiAccess(prisma, "org-1")).toEqual({ allowed: true });
  });

  it("allows a listed org and rejects an unlisted one", async () => {
    process.env[ENV] = "org-1,org-2";
    expect(await checkPublicApiAccess(prisma, "org-2")).toEqual({ allowed: true });
    expect(await checkPublicApiAccess(prisma, "org-3")).toEqual({ allowed: false, reason: "not_allowed" });
  });

  it("ignores whitespace and empty entries", async () => {
    process.env[ENV] = " org-1 , ,org-2 ,";
    expect(await checkPublicApiAccess(prisma, "org-1")).toEqual({ allowed: true });
    expect(await checkPublicApiAccess(prisma, "org-2")).toEqual({ allowed: true });
    expect(await checkPublicApiAccess(prisma, "")).toEqual({ allowed: false, reason: "not_allowed" });
  });

  it("reads the env var on every call", async () => {
    expect(await checkPublicApiAccess(prisma, "org-1")).toEqual({ allowed: true });
    process.env[ENV] = "other";
    expect(await checkPublicApiAccess(prisma, "org-1")).toEqual({ allowed: false, reason: "not_allowed" });
    process.env[ENV] = "org-1";
    expect(await checkPublicApiAccess(prisma, "org-1")).toEqual({ allowed: true });
  });

  it.each(["1", "true"])("kill switch %j blocks the org (org-scoped query)", async (value) => {
    findFirst.mockResolvedValue({ value });
    expect(await checkPublicApiAccess(prisma, "org-1")).toEqual({ allowed: false, reason: "blocked" });
    expect(findFirst).toHaveBeenCalledWith({ where: { organizationId: "org-1", key: "plan_feature_public_api_blocked" }, select: { value: true } });
  });

  it.each([{ value: "0" }, { value: "false" }, { value: "" }, null])("does not block for %j", async (row) => {
    findFirst.mockResolvedValue(row);
    expect(await checkPublicApiAccess(prisma, "org-1")).toEqual({ allowed: true });
  });

  it("a blocked org that is also allow-listed is still blocked", async () => {
    process.env[ENV] = "org-1";
    findFirst.mockResolvedValue({ value: "1" });
    expect(await checkPublicApiAccess(prisma, "org-1")).toEqual({ allowed: false, reason: "blocked" });
  });
});
