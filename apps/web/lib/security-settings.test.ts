import { describe, it, expect } from "vitest";
import { clientLabel, relativeTime, summarizeUserAgent, deviceTitle } from "./security-settings";

describe("clientLabel", () => {
  it("maps known clients", () => {
    expect(clientLabel("web")).toBe("Web");
    expect(clientLabel("mobile")).toBe("Mobile");
    expect(clientLabel("admin")).toBe("Admin");
  });
  it("falls back for unknown values", () => {
    expect(clientLabel("toaster")).toBe("Other");
  });
});

describe("relativeTime", () => {
  const now = new Date("2026-10-17T12:00:00Z");
  it("handles recent, minutes, hours, days", () => {
    expect(relativeTime(now, "2026-10-17T11:59:40Z")).toBe("Just now");
    expect(relativeTime(now, "2026-10-17T11:55:00Z")).toBe("5 minutes ago");
    expect(relativeTime(now, "2026-10-17T11:59:00Z")).toBe("1 minute ago");
    expect(relativeTime(now, "2026-10-17T09:00:00Z")).toBe("3 hours ago");
    expect(relativeTime(now, "2026-10-16T11:00:00Z")).toBe("1 day ago");
    expect(relativeTime(now, "2026-10-10T12:00:00Z")).toBe("7 days ago");
  });
  it("uses a date after 30 days and tolerates bad/future input", () => {
    expect(relativeTime(now, "2026-08-01T12:00:00Z")).toBe("1 Aug 2026");
    expect(relativeTime(now, "2026-10-17T12:05:00Z")).toBe("Just now");
    expect(relativeTime(now, "nonsense")).toBe("Unknown");
    expect(relativeTime(now, null)).toBe("Unknown");
  });
});

describe("summarizeUserAgent", () => {
  it("summarises browser and OS", () => {
    expect(summarizeUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36")).toBe("Chrome on Windows");
    expect(summarizeUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15")).toBe("Safari on macOS");
    expect(summarizeUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1")).toBe("Safari on iOS");
    expect(summarizeUserAgent("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120.0 Safari/537.36 Edg/120.0")).toBe("Edge on Windows");
  });
  it("returns null when empty", () => {
    expect(summarizeUserAgent("")).toBeNull();
    expect(summarizeUserAgent(null)).toBeNull();
  });
});

describe("deviceTitle", () => {
  it("prefers the device label, then the user agent, then the client", () => {
    expect(deviceTitle({ client: "mobile", deviceLabel: "Pixel 8" })).toBe("Pixel 8");
    expect(deviceTitle({ client: "web", deviceLabel: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/17.0 Safari/605.1.15" })).toBe("Safari on macOS");
    expect(deviceTitle({ client: "web", deviceLabel: null })).toBe("Web session");
  });
});
