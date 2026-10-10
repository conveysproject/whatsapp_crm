import { describe, it, expect, vi } from "vitest";
import { normalizeUsage, gateLevel, fetchUsage, GATE_KEYS } from "./billing-usage";

describe("normalizeUsage", () => {
  it("returns null for non-object input", () => {
    expect(normalizeUsage(null)).toBeNull();
    expect(normalizeUsage("x")).toBeNull();
    expect(normalizeUsage(undefined)).toBeNull();
  });
  it("defaults every gate on a partial body and never throws", () => {
    const u = normalizeUsage({ plan: "pro", gates: { contacts: { current: 5, limit: 10, allowed: true }, flows: 3 } });
    expect(u?.plan).toBe("pro");
    expect(u?.gates.contacts).toEqual({ current: 5, limit: 10, allowed: true });
    expect(u?.gates.flows).toEqual({ current: 0, limit: null, allowed: true });
    expect(Object.keys(u?.gates ?? {})).toEqual([...GATE_KEYS]);
  });
  it("treats a non-numeric limit as unlimited and only allowed===false as blocked", () => {
    const u = normalizeUsage({ gates: { bots: 1, chatbots: { current: 2, limit: "x", allowed: false } } });
    expect(u?.gates.chatbots).toEqual({ current: 2, limit: null, allowed: false });
    expect(u?.plan).toBe("");
  });
});

describe("gateLevel", () => {
  it("is blue below 80%, amber at >= 80%, red when not allowed", () => {
    expect(gateLevel({ current: 79, limit: 100, allowed: true })).toBe("ok");
    expect(gateLevel({ current: 80, limit: 100, allowed: true })).toBe("warn");
    expect(gateLevel({ current: 100, limit: 100, allowed: false })).toBe("blocked");
    expect(gateLevel({ current: 9, limit: null, allowed: true })).toBe("ok");
    expect(gateLevel({ current: 1, limit: 0, allowed: true })).toBe("ok");
  });
});

describe("fetchUsage", () => {
  it("returns null on a non-ok response or network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
    expect(await fetchUsage(async () => "t")).toBeNull();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("net")));
    expect(await fetchUsage(async () => "t")).toBeNull();
  });
  it("normalizes data on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { plan: "starter", gates: {} } }) }));
    const u = await fetchUsage(async () => "t");
    expect(u?.plan).toBe("starter");
  });
});
