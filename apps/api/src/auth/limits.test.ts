import { beforeEach, describe, expect, it, vi } from "vitest";

const counts = new Map<string, number>();
vi.mock("../lib/redis.js", () => ({
  redis: {
    incr: vi.fn(async (k: string) => {
      counts.set(k, (counts.get(k) ?? 0) + 1);
      return counts.get(k)!;
    }),
    expire: vi.fn(async () => 1),
  },
}));

import { hitLimit } from "./limits.js";
import { redis } from "../lib/redis.js";

describe("hitLimit", () => {
  beforeEach(() => {
    counts.clear();
    vi.clearAllMocks();
  });

  it("allows up to max then reports over limit", async () => {
    for (let i = 0; i < 3; i++) expect(await hitLimit("k", 3, 60)).toBe(false);
    expect(await hitLimit("k", 3, 60)).toBe(true);
  });

  it("sets expiry only if none exists (NX)", async () => {
    await hitLimit("k2", 3, 60);
    expect(redis.expire).toHaveBeenCalledWith("k2", 60, "NX");
  });

  it("keys are independent", async () => {
    await hitLimit("a", 1, 60);
    expect(await hitLimit("b", 1, 60)).toBe(false);
  });
});
