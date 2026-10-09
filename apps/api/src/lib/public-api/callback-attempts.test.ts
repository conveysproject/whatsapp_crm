import { describe, it, expect, vi, afterEach } from "vitest";
import { recordCallbackAttempt } from "./callback-attempts.js";

const attempt = { organizationId: "o", apiKeyId: "k", url: "https://c.example.com/cb", method: "POST", fields: { MessageUUID: "m1", Status: "sent" }, attempt: 1, outcome: "delivered" as const, httpStatus: 200, durationMs: 12 };
const prismaWith = (create: unknown) => ({ apiCallbackAttempt: { create } }) as never;
const dataOf = (create: ReturnType<typeof vi.fn>) => create.mock.calls[0]![0].data as Record<string, unknown>;

afterEach(() => { delete process.env["API_PAYLOAD_LOGGING_ENABLED"]; vi.useRealTimers(); });

describe("recordCallbackAttempt", () => {
  it("does nothing when the flag is off", async () => {
    const create = vi.fn();
    await recordCallbackAttempt(prismaWith(create), attempt);
    expect(create).not.toHaveBeenCalled();
  });

  it("writes one row with the message id taken from MessageUUID and the url without its query string", async () => {
    process.env["API_PAYLOAD_LOGGING_ENABLED"] = "true";
    const create = vi.fn().mockResolvedValue({});
    await recordCallbackAttempt(prismaWith(create), { ...attempt, url: "https://c.example.com/cb?secret=1" });
    expect(create).toHaveBeenCalledTimes(1);
    expect(dataOf(create)).toMatchObject({ organizationId: "o", apiKeyId: "k", messageId: "m1", url: "https://c.example.com/cb", outcome: "delivered", httpStatus: 200, attempt: 1, fields: { MessageUUID: "m1", Status: "sent" } });
  });

  it("removes userinfo, query and fragment from the stored url", async () => {
    process.env["API_PAYLOAD_LOGGING_ENABLED"] = "true";
    const create = vi.fn().mockResolvedValue({});
    await recordCallbackAttempt(prismaWith(create), { ...attempt, url: "https://user:pa55@c.example.com:8443/cb?token=abc#frag" });
    expect(dataOf(create)["url"]).toBe("https://c.example.com:8443/cb");
  });

  it("removes userinfo and query even from a url that does not parse", async () => {
    process.env["API_PAYLOAD_LOGGING_ENABLED"] = "true";
    const create = vi.fn().mockResolvedValue({});
    await recordCallbackAttempt(prismaWith(create), { ...attempt, url: "https://user:pa55@[bad/cb?token=abc" });
    const stored = String(dataOf(create)["url"]);
    expect(stored).not.toContain("pa55");
    expect(stored).not.toContain("token");
  });

  it("strips NUL and lone surrogates from url, reason and field values", async () => {
    process.env["API_PAYLOAD_LOGGING_ENABLED"] = "true";
    const create = vi.fn().mockResolvedValue({});
    await recordCallbackAttempt(prismaWith(create), {
      ...attempt, url: "https://c.example.com/c\u0000b\uD800", reason: "bad\u0000\uDC00reason", fields: { MessageUUID: "m\u00001", ErrorMessage: "x\uD800y" }, outcome: "dropped",
    });
    const d = dataOf(create);
    expect(JSON.stringify(d)).not.toMatch(/\\u0000|\\ud800|\\udc00/i);
    expect(d["url"]).toBe("https://c.example.com/cb");
    expect(d["reason"]).toBe("badreason");
    expect(d["fields"]).toEqual({ MessageUUID: "m1", ErrorMessage: "xy" });
    expect(d["messageId"]).toBe("m1");
  });

  it("keeps a short reason and leaves it null when absent", async () => {
    process.env["API_PAYLOAD_LOGGING_ENABLED"] = "true";
    const create = vi.fn().mockResolvedValue({});
    await recordCallbackAttempt(prismaWith(create), attempt);
    expect(dataOf(create)["reason"]).toBeNull();
    expect(dataOf(create)["httpStatus"]).toBe(200);
  });

  it("stores oversized fields as the first 20 keys with values cut to 200 chars", async () => {
    process.env["API_PAYLOAD_LOGGING_ENABLED"] = "true";
    const create = vi.fn().mockResolvedValue({});
    const fields: Record<string, string> = { MessageUUID: "m1" };
    for (let i = 0; i < 40; i++) fields[`F${i}`] = "x".repeat(500);
    await recordCallbackAttempt(prismaWith(create), { ...attempt, fields });
    const stored = dataOf(create)["fields"] as Record<string, string>;
    expect(Object.keys(stored)).toHaveLength(20);
    expect(Object.keys(stored)[0]).toBe("MessageUUID");
    expect(Object.values(stored).every((v) => v.length <= 200)).toBe(true);
    expect(dataOf(create)["messageId"]).toBe("m1");
  });

  it("leaves fields within the cap untouched", async () => {
    process.env["API_PAYLOAD_LOGGING_ENABLED"] = "true";
    const create = vi.fn().mockResolvedValue({});
    const fields = { MessageUUID: "m1", ErrorMessage: "y".repeat(1000) };
    await recordCallbackAttempt(prismaWith(create), { ...attempt, fields });
    expect(dataOf(create)["fields"]).toEqual(fields);
  });

  it("never throws when the database fails", async () => {
    process.env["API_PAYLOAD_LOGGING_ENABLED"] = "true";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(recordCallbackAttempt(prismaWith(vi.fn().mockRejectedValue(new Error("db"))), attempt)).resolves.toBeUndefined();
    warn.mockRestore();
  });

  it("never throws when create throws synchronously", async () => {
    process.env["API_PAYLOAD_LOGGING_ENABLED"] = "true";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(recordCallbackAttempt(prismaWith(vi.fn(() => { throw new Error("boom"); })), attempt)).resolves.toBeUndefined();
    warn.mockRestore();
  });

  it("gives up on a hung database instead of blocking the delivery", async () => {
    process.env["API_PAYLOAD_LOGGING_ENABLED"] = "true";
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const p = recordCallbackAttempt(prismaWith(vi.fn(() => new Promise(() => {}))), attempt);
    await vi.advanceTimersByTimeAsync(5001);
    await expect(p).resolves.toBeUndefined();
    warn.mockRestore();
  });
});
