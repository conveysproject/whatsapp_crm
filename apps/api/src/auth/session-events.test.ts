import { beforeEach, describe, expect, it, vi } from "vitest";
import { emitSessionsRevoked, onSessionsRevoked, resetSessionListenersForTests } from "./session-events.js";

beforeEach(() => resetSessionListenersForTests());

describe("session-events", () => {
  it("delivers ids to every listener and unsubscribes", () => {
    const a = vi.fn();
    const b = vi.fn();
    const offA = onSessionsRevoked(a);
    onSessionsRevoked(b);
    emitSessionsRevoked(["s1", "s2"]);
    expect(a).toHaveBeenCalledWith(["s1", "s2"]);
    expect(b).toHaveBeenCalledWith(["s1", "s2"]);
    offA();
    emitSessionsRevoked(["s3"]);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
  });

  it("is a no-op for an empty list", () => {
    const a = vi.fn();
    onSessionsRevoked(a);
    emitSessionsRevoked([]);
    expect(a).not.toHaveBeenCalled();
  });

  it("catches and logs listener errors by name only, and keeps going", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const good = vi.fn();
    onSessionsRevoked(() => {
      throw new TypeError("secret detail");
    });
    onSessionsRevoked(good);
    expect(() => emitSessionsRevoked(["s1"])).not.toThrow();
    expect(good).toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith("auth: session revoke listener failed", "TypeError");
    warn.mockRestore();
  });
});
