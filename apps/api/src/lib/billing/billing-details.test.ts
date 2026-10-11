import { describe, it, expect } from "vitest";
import { parseBillingDetails, readBillingDetails, statementRecipients, EMPTY_BILLING_DETAILS } from "./billing-details.js";

const ok = { billingEmail: "accounts@acme.in", legalName: "Acme Retail Pvt Ltd", gstin: "27AAPFU0939F1ZV", address: "12 MG Road, Pune 411001" };

describe("parseBillingDetails", () => {
  it("accepts valid details and normalises the GST number to upper case", () => {
    const r = parseBillingDetails({ ...ok, gstin: "27aapfu0939f1zv", billingEmail: "  accounts@acme.in " });
    expect(r).toEqual({ ok: true, details: ok });
  });
  it("accepts empty values, which clear a field", () => {
    expect(parseBillingDetails({ billingEmail: "", legalName: "", gstin: "", address: "" })).toEqual({ ok: true, details: EMPTY_BILLING_DETAILS });
  });
  it("rejects a malformed email, GST number, or over-long text", () => {
    for (const bad of [
      { ...ok, billingEmail: "not-an-email" }, { ...ok, billingEmail: "a b@x.com" },
      { ...ok, gstin: "27AAPFU0939F1Z" }, { ...ok, gstin: "XXAAPFU0939F1ZV" }, { ...ok, gstin: "27AAPFU0939F0ZV" },
      { ...ok, legalName: "x".repeat(121) }, { ...ok, address: "x".repeat(301) },
    ]) expect(parseBillingDetails(bad).ok, JSON.stringify(bad)).toBe(false);
  });
  it("rejects non-text fields and non-objects", () => {
    for (const bad of [null, [], "x", { ...ok, gstin: 5 }, { ...ok, billingEmail: null }, { legalName: "a" }]) expect(parseBillingDetails(bad).ok, JSON.stringify(bad)).toBe(false);
  });
});

describe("readBillingDetails", () => {
  it("reads stored details and ignores anything malformed", () => {
    expect(readBillingDetails({ theme: "dark", billing: ok })).toEqual(ok);
    for (const s of [null, undefined, "x", [], {}, { billing: null }, { billing: [] }]) expect(readBillingDetails(s)).toEqual(EMPTY_BILLING_DETAILS);
    expect(readBillingDetails({ billing: { billingEmail: 5, gstin: "27AAPFU0939F1ZV" } })).toEqual({ ...EMPTY_BILLING_DETAILS, gstin: "27AAPFU0939F1ZV" });
  });
});

describe("statementRecipients", () => {
  it("prefers the billing email, falling back to the admins", () => {
    expect(statementRecipients(ok, ["a@x.com"])).toEqual(["accounts@acme.in"]);
    expect(statementRecipients(EMPTY_BILLING_DETAILS, ["a@x.com", "b@x.com"])).toEqual(["a@x.com", "b@x.com"]);
  });
});
