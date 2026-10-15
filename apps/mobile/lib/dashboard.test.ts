import { ApiError } from "./api";
import { attentionRoute, contactSaveError, deltaText, formatCount, formatDuration, isForbidden, pct, standingBanner } from "./dashboard";

describe("formatting", () => {
  it("formats counts with grouping and blanks", () => {
    expect(formatCount(1284)).toBe("1,284");
    expect(formatCount(0)).toBe("0");
    expect(formatCount(null)).toBe("—");
  });
  it("formats seconds as m s / h m", () => {
    expect(formatDuration(220)).toBe("3m 40s");
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(3720)).toBe("1h 2m");
    expect(formatDuration(null)).toBe("—");
  });
  it("describes deltas, treating lower as better for reply time", () => {
    expect(deltaText({ deltaPct: 12 })).toEqual({ text: "▲ 12%", tone: "good" });
    expect(deltaText({ deltaPct: -8 })).toEqual({ text: "▼ 8%", tone: "bad" });
    expect(deltaText({ deltaPct: 20 }, true)).toEqual({ text: "▲ 20%", tone: "bad" });
    expect(deltaText({ deltaPct: 0 })).toEqual({ text: "No change", tone: "flat" });
    expect(deltaText({ deltaPct: 0.3 })).toEqual({ text: "No change", tone: "flat" });
    expect(deltaText({ deltaPct: null })).toBeNull();
  });
  it("computes whole percentages safely", () => {
    expect(pct(71, 100)).toBe(71);
    expect(pct(1, 3)).toBe(33);
    expect(pct(5, 0)).toBe(0);
  });
});

describe("standingBanner", () => {
  it("is empty when billing is fine or unknown", () => {
    expect(standingBanner(undefined)).toBeNull();
    expect(standingBanner({ state: "ok", paused: false, dueAt: null, blockAt: null })).toBeNull();
  });
  const now = Date.parse("2026-10-15T00:00:00Z");
  it("warns before sending pauses", () => {
    const b = standingBanner({ state: "overdue", paused: false, dueAt: "2026-10-14T00:00:00Z", blockAt: "2026-10-21T00:00:00Z" }, now);
    expect(b?.tone).toBe("warning");
    expect(b?.title).toBe("Statement overdue");
    expect(b?.body).toMatch(/Sending will pause on/);
  });
  it("does not say paused in watch mode (blocked but not enforced)", () => {
    const b = standingBanner({ state: "blocked", paused: false, dueAt: "2026-10-01T00:00:00Z", blockAt: "2026-10-08T00:00:00Z" }, now);
    expect(b?.title).toBe("Statement overdue");
    expect(b?.tone).toBe("warning");
  });
  it("omits the pause date once blockAt has passed", () => {
    const b = standingBanner({ state: "overdue", paused: false, dueAt: "2026-10-01T00:00:00Z", blockAt: "2026-10-08T00:00:00Z" }, now);
    expect(b?.body).not.toMatch(/will pause/);
    expect(b?.body).toMatch(/An admin can pay it on the web dashboard/);
  });
  it("says sending is paused when blocked or cancelled", () => {
    expect(standingBanner({ state: "blocked", paused: true, dueAt: null, blockAt: null })?.title).toBe("Sending is paused");
    expect(standingBanner({ state: "cancelled", paused: true, dueAt: null, blockAt: null })?.title).toBe("This workspace is cancelled");
  });
});

describe("attentionRoute", () => {
  it("maps web links to app screens", () => {
    expect(attentionRoute("/inbox")).toBe("/inbox");
    expect(attentionRoute("/templates")).toBe("/templates");
    expect(attentionRoute("/messages")).toBeNull();
    expect(attentionRoute("/settings/whatsapp-account")).toBeNull();
    expect(attentionRoute("/settings/billing")).toBeNull();
  });
});

describe("errors", () => {
  it("recognises 403", () => {
    expect(isForbidden(new ApiError(403, "FORBIDDEN", "x"))).toBe(true);
    expect(isForbidden(new ApiError(500, "X", "x"))).toBe(false);
    expect(isForbidden(new Error("x"))).toBe(false);
  });
  it("explains contact save failures", () => {
    expect(contactSaveError(new ApiError(409, "DUPLICATE_PHONE", "x"))).toBe("A contact with this phone number already exists.");
    expect(contactSaveError(new ApiError(402, "PLAN_LIMIT_REACHED", "x"))).toBe("Your plan's contact limit is reached. An admin can change the plan on the web dashboard.");
    expect(contactSaveError(new ApiError(403, "FORBIDDEN", "x"))).toBe("You don't have permission to add or edit contacts.");
    expect(contactSaveError(new ApiError(400, "INVALID_PHONE", "Phone number is invalid"))).toBe("Phone number is invalid");
    expect(contactSaveError(new TypeError("Network request failed"))).toBe("Couldn't save. Check your connection and try again.");
  });
});
