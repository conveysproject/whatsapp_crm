import { describe, it, expect, vi, beforeEach } from "vitest";

const { redis } = vi.hoisted(() => ({ redis: { eval: vi.fn(), ttl: vi.fn() } }));
vi.mock("../queue.js", () => ({ redisConnection: redis }));
import { checkChildSendRate } from "./child-rate-limit.js";

describe("checkChildSendRate", () => {
  beforeEach(() => { vi.clearAllMocks(); delete process.env["PUBLIC_API_CHILD_RATE_LIMIT"]; });

  it("charges the cost in one atomic script call (INCRBY + EXPIRE together)", async () => {
    redis.eval.mockResolvedValue(20);
    expect(await checkChildSendRate("k1", "c1", 20)).toEqual({ allowed: true, retryAfterSeconds: 0 });
    const args = redis.eval.mock.calls[0]!;
    expect(String(args[0])).toContain("INCRBY");
    expect(String(args[0])).toContain("EXPIRE");
    expect(args.slice(1)).toEqual([1, "pub:keychild:k1:c1", 20, 60]);
  });

  it("blocks once the window total exceeds the limit and reports the TTL", async () => {
    process.env["PUBLIC_API_CHILD_RATE_LIMIT"] = "100";
    redis.eval.mockResolvedValue(101);
    redis.ttl.mockResolvedValue(42);
    expect(await checkChildSendRate("k1", "c1", 1)).toEqual({ allowed: false, retryAfterSeconds: 42 });
  });
});
