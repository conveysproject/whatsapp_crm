import { describe, it, expect, vi } from "vitest";
import { INCR_WITH_TTL, incrWithTtl } from "./redis-counter.js";

describe("incrWithTtl", () => {
  it("increments and sets the expiry in ONE script call (no counter without a TTL)", async () => {
    const client = { eval: vi.fn().mockResolvedValue(3) };
    expect(await incrWithTtl(client, "k", 3600)).toBe(3);
    expect(client.eval).toHaveBeenCalledWith(INCR_WITH_TTL, 1, "k", 1, 3600);
    expect(INCR_WITH_TTL).toContain("INCRBY");
    expect(INCR_WITH_TTL).toContain("EXPIRE");
    // Repairs a key that somehow lost its TTL, not only the first hit.
    expect(INCR_WITH_TTL).toContain("TTL");
  });

  it("charges a cost of at least 1 and returns a number", async () => {
    const client = { eval: vi.fn().mockResolvedValue("7") };
    expect(await incrWithTtl(client, "k", 60, 0)).toBe(7);
    expect(client.eval).toHaveBeenCalledWith(INCR_WITH_TTL, 1, "k", 1, 60);
  });

  it("propagates a Redis failure (callers fail closed)", async () => {
    const client = { eval: vi.fn().mockRejectedValue(new Error("down")) };
    await expect(incrWithTtl(client, "k", 60)).rejects.toThrow("down");
  });
});
