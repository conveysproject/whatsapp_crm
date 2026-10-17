import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./seed-lead-statuses.js", () => ({ seedLeadStatuses: vi.fn().mockResolvedValue(undefined) }));

import { createWorkspace, BUSINESS_SCHEMA } from "./create-workspace.js";
import { seedLeadStatuses } from "./seed-lead-statuses.js";
import { DEFAULT_ROLE_PERMISSIONS, FIXED_PERMISSION_ROLES } from "./default-role-permissions.js";

const business = {
  companyName: "Acme", companyWebsite: "https://acme.test", companyLocation: "Paris",
  industry: "Retail", subCategory: "Shoes", revenue: "1M",
};

function makeTx() {
  return {
    organization: { create: vi.fn().mockResolvedValue({ id: "org_1" }) },
    user: { create: vi.fn().mockResolvedValue({}) },
    vendorSetting: { createMany: vi.fn().mockResolvedValue({}) },
  };
}

describe("createWorkspace", () => {
  const prev = process.env["REQUIRE_VENDOR_ACTIVATION"];
  beforeEach(() => { delete process.env["REQUIRE_VENDOR_ACTIVATION"]; vi.clearAllMocks(); });
  afterEach(() => {
    if (prev === undefined) delete process.env["REQUIRE_VENDOR_ACTIVATION"];
    else process.env["REQUIRE_VENDOR_ACTIVATION"] = prev;
  });

  it("creates org, seeds statuses, creates active admin and role settings", async () => {
    const tx = makeTx();
    const res = await createWorkspace(tx as never, { userId: "u1", email: "a@b.c", fullName: "A B", business });
    expect(res).toEqual({ organizationId: "org_1" });
    const orgArg = tx.organization.create.mock.calls[0]![0].data;
    expect(orgArg).toMatchObject({
      name: "Acme", website: business.companyWebsite, location: "Paris",
      industry: "Retail", subCategory: "Shoes", revenue: "1M",
    });
    expect(orgArg.registeredAt).toBeInstanceOf(Date);
    expect(orgArg.settings).toMatchObject({ website: business.companyWebsite, location: "Paris", industry: "Retail", subCategory: "Shoes", revenue: "1M" });
    expect(typeof orgArg.settings.registeredAt).toBe("string");
    expect(seedLeadStatuses).toHaveBeenCalledWith(tx, "org_1");
    expect(tx.user.create).toHaveBeenCalledWith({
      data: { id: "u1", organizationId: "org_1", email: "a@b.c", fullName: "A B", role: "admin", isActive: true },
    });
  });

  it("creates the admin inactive when REQUIRE_VENDOR_ACTIVATION=true", async () => {
    process.env["REQUIRE_VENDOR_ACTIVATION"] = "true";
    const tx = makeTx();
    await createWorkspace(tx as never, { userId: "u1", email: "a@b.c", fullName: "A B", business });
    expect(tx.user.create.mock.calls[0]![0].data.isActive).toBe(false);
  });

  it("seeds role permissions excluding fixed roles", async () => {
    const tx = makeTx();
    await createWorkspace(tx as never, { userId: "u1", email: "a@b.c", fullName: "A B", business });
    const arg = tx.vendorSetting.createMany.mock.calls[0]![0];
    expect(arg.skipDuplicates).toBe(true);
    const keys = arg.data.map((d: { key: string }) => d.key);
    for (const role of FIXED_PERMISSION_ROLES) expect(keys).not.toContain(`role_permissions_${role}`);
    const expected = Object.keys(DEFAULT_ROLE_PERMISSIONS).filter((r) => !FIXED_PERMISSION_ROLES.includes(r));
    expect(keys).toEqual(expected.map((r) => `role_permissions_${r}`));
    expect(arg.data[0].organizationId).toBe("org_1");
  });
});

describe("BUSINESS_SCHEMA", () => {
  it("keeps the validated business properties", () => {
    expect(Object.keys(BUSINESS_SCHEMA).sort()).toEqual(
      ["companyLocation", "companyName", "companyWebsite", "industry", "revenue", "subCategory"],
    );
    expect(BUSINESS_SCHEMA.companyName).toEqual({ type: "string", minLength: 1, maxLength: 255 });
  });
});
