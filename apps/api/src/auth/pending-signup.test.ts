import { beforeEach, describe, expect, it, vi } from "vitest";

const r = vi.hoisted(() => ({ set: vi.fn(), get: vi.fn(), del: vi.fn() }));
vi.mock("../lib/redis.js", () => ({ redis: r }));

import { deletePendingSignup, loadPendingSignup, savePendingSignup } from "./pending-signup.js";

const data = {
  passwordHash: "$argon2id$x",
  firstName: "A",
  lastName: "B",
  business: { companyName: "Co", companyWebsite: "", companyLocation: "", industry: "i", subCategory: "", revenue: "r" },
};

describe("pending signup store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("saves with 30 min TTL and NX under a normalized key", async () => {
    r.set.mockResolvedValue("OK");
    expect(await savePendingSignup(" Foo@X.com ", data)).toBe("created");
    expect(r.set).toHaveBeenCalledWith("auth:pending-signup:foo@x.com", JSON.stringify(data), "EX", 1800, "NX");
  });

  it("reports exists when NX refuses", async () => {
    r.set.mockResolvedValue(null);
    expect(await savePendingSignup("foo@x.com", data)).toBe("exists");
  });

  it("loads, tolerates missing and corrupt entries, and deletes", async () => {
    r.get.mockResolvedValueOnce(JSON.stringify(data)).mockResolvedValueOnce(null).mockResolvedValueOnce("{bad");
    expect(await loadPendingSignup("foo@x.com")).toEqual(data);
    expect(await loadPendingSignup("foo@x.com")).toBeNull();
    expect(await loadPendingSignup("foo@x.com")).toBeNull();
    await deletePendingSignup("Foo@X.com");
    expect(r.del).toHaveBeenCalledWith("auth:pending-signup:foo@x.com");
  });
});
