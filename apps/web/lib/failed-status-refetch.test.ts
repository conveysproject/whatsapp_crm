import { describe, it, expect, vi, afterEach } from "vitest";
import { shouldRefetchForFailedStatus, createCoalescer } from "./failed-status-refetch";

const cache = { pages: [{ data: [{ whatsappMessageId: "w1" }, { whatsappMessageId: null }] }, { data: [{ whatsappMessageId: "w2" }] }] };

describe("shouldRefetchForFailedStatus", () => {
  it("is true only when a cached page of this thread holds the wamid", () => {
    expect(shouldRefetchForFailedStatus(cache, "w1")).toBe(true);
    expect(shouldRefetchForFailedStatus(cache, "w2")).toBe(true);
    expect(shouldRefetchForFailedStatus(cache, "other")).toBe(false);
  });
  it("is false for missing or malformed cache data", () => {
    for (const v of [undefined, null, {}, { pages: null }, { pages: [null, {}, { data: null }] }, "x"]) {
      expect(shouldRefetchForFailedStatus(v, "w1")).toBe(false);
    }
  });
  it("is false for an empty wamid", () => {
    expect(shouldRefetchForFailedStatus(cache, "")).toBe(false);
  });
});

describe("createCoalescer", () => {
  afterEach(() => vi.useRealTimers());
  it("collapses a burst into one trailing call and can be cancelled", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const c = createCoalescer(fn, 1000);
    for (let i = 0; i < 50; i++) c.trigger();
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(999);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    c.trigger();
    c.cancel();
    vi.advanceTimersByTime(5000);
    expect(fn).toHaveBeenCalledTimes(1);
    c.trigger();
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
