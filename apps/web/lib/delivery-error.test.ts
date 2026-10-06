import { describe, it, expect } from "vitest";
import { formatDeliveryError, shortDeliveryError } from "./delivery-error";

const full = { code: 131049, title: "Healthy ecosystem", message: "Blocked", details: "engagement" };

describe("formatDeliveryError", () => {
  it("formats every part", () => expect(formatDeliveryError(full)).toBe("131049: Healthy ecosystem — Blocked (engagement)"));
  it("omits missing parts", () => {
    expect(formatDeliveryError({ code: 5, title: null, message: null, details: null })).toBe("5");
    expect(formatDeliveryError({ code: null, title: "T", message: null, details: "d" })).toBe("T (d)");
  });
  it("is empty without an error", () => {
    expect(formatDeliveryError(null)).toBe("");
    expect(formatDeliveryError(undefined)).toBe("");
  });
});

describe("shortDeliveryError", () => {
  it("shows title and code", () => expect(shortDeliveryError(full)).toBe("Healthy ecosystem (code 131049)"));
  it("falls back to message, then code only", () => {
    expect(shortDeliveryError({ code: 1, title: null, message: "M", details: null })).toBe("M (code 1)");
    expect(shortDeliveryError({ code: 7, title: null, message: null, details: null })).toBe("Code 7");
    expect(shortDeliveryError({ code: null, title: "T", message: null, details: null })).toBe("T");
  });
  it("is empty without an error", () => {
    expect(shortDeliveryError(null)).toBe("");
    expect(shortDeliveryError({ code: null, title: null, message: null, details: null })).toBe("");
  });
});
