import { describe, it, expect } from "vitest";
import { statusBadge, isWhatsAppConnected, usagePercent, profileRows } from "./account-details";

describe("statusBadge", () => {
  it("maps known statuses", () => {
    expect(statusBadge("active")).toEqual({ label: "Active", tone: "green" });
    expect(statusBadge("banned")).toEqual({ label: "Suspended", tone: "red" });
  });
  it("falls back to a neutral badge for unknown values", () => {
    expect(statusBadge("pending_review")).toEqual({ label: "Pending review", tone: "gray" });
    expect(statusBadge("")).toEqual({ label: "Unknown", tone: "gray" });
  });
});

describe("isWhatsAppConnected", () => {
  it("needs both a WABA id and a phone number id", () => {
    expect(isWhatsAppConnected({ whatsappBusinessAccountId: "1", phoneNumberId: "2" })).toBe(true);
    expect(isWhatsAppConnected({ whatsappBusinessAccountId: "1", phoneNumberId: null })).toBe(false);
    expect(isWhatsAppConnected({ whatsappBusinessAccountId: null, phoneNumberId: "2" })).toBe(false);
  });
});

describe("usagePercent", () => {
  it("clamps to 0-100", () => {
    expect(usagePercent(212, 500)).toBe(42);
    expect(usagePercent(900, 500)).toBe(100);
    expect(usagePercent(-5, 500)).toBe(0);
  });
  it("handles a zero allowance", () => { expect(usagePercent(10, 0)).toBe(100); expect(usagePercent(0, 0)).toBe(0); });
});

describe("profileRows", () => {
  it("drops empty fields and keeps order", () => {
    const rows = profileRows({ phone: "+91 99", website: "", location: null, industry: "Retail", facebookPageId: null, instagramAccountId: " " });
    expect(rows).toEqual([{ label: "Phone", value: "+91 99" }, { label: "Industry", value: "Retail" }]);
  });
});
