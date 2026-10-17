import { beforeEach, describe, expect, it, vi } from "vitest";

const r = vi.hoisted(() => ({ set: vi.fn(), get: vi.fn(), del: vi.fn() }));
vi.mock("../lib/redis.js", () => ({ redis: r }));

import { deletePendingSignup, loadPendingSignup, savePendingSignup } from "./pending-signup.js";

const data = {
  email: "foo@x.com",
  passwordHash: "$argon2id$x",
  firstName: "A",
  lastName: "B",
  business: { companyName: "Co", companyWebsite: "", companyLocation: "", industry: "i", subCategory: "", revenue: "r" },
};

describe("pending signup store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("saves under the signupId with a 30 min TTL", async () => {
    await savePendingSignup("sid1", data);
    expect(r.set).toHaveBeenCalledWith("auth:pending-signup:sid1", JSON.stringify(data), "EX", 1800);
  });

  it("loads valid entries and returns null for missing, corrupt or malformed ones", async () => {
    r.get
      .mockResolvedValueOnce(JSON.stringify(data))
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("{bad")
      .mockResolvedValueOnce(JSON.stringify({ ...data, passwordHash: 5 }))
      .mockResolvedValueOnce(JSON.stringify({ ...data, business: "x" }))
      .mockResolvedValueOnce(JSON.stringify({ ...data, email: undefined }));
    expect(await loadPendingSignup("sid1")).toEqual(data);
    for (let i = 0; i < 5; i++) expect(await loadPendingSignup("sid1")).toBeNull();
  });

  it("deletes by signupId", async () => {
    await deletePendingSignup("sid1");
    expect(r.del).toHaveBeenCalledWith("auth:pending-signup:sid1");
  });
});
