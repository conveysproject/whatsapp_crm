import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { rzpCreate, rzpCancel } = vi.hoisted(() => ({ rzpCreate: vi.fn(), rzpCancel: vi.fn() }));
vi.mock("razorpay", () => ({ default: vi.fn().mockImplementation(() => ({ paymentLink: { create: rzpCreate, cancel: rzpCancel } })) }));

import { currencyForPhone, currencyForOrg, orgCurrencyHints, createStatementPaymentLink, cancelStatementPaymentLink } from "./payment-links.js";

describe("currencyForPhone", () => {
  it("uses INR only for a complete Indian number", () => {
    for (const p of ["+91 98765 43210", "919876543210", "+91-98765-43210"]) expect(currencyForPhone(p), p).toBe("INR");
  });
  it("uses USD for everything else, including missing or odd numbers", () => {
    for (const p of [null, undefined, "", "+1 415 555 0100", "+971501234567", "+9198765", "9198765432101234"]) expect(currencyForPhone(p), String(p)).toBe("USD");
  });
});

describe("currencyForOrg", () => {
  const base = { settings: {}, location: null, wabaPhone: null };
  it("the owner's explicit choice wins over everything else", () => {
    expect(currencyForOrg({ settings: { billingCurrency: "INR" }, location: "London", wabaPhone: "+1 415 555 0100" })).toBe("INR");
    expect(currencyForOrg({ settings: { billingCurrency: "USD" }, location: "Pune, India", wabaPhone: "+91 98765 43210" })).toBe("USD");
  });
  it("then the connected WhatsApp number's country, even against the location", () => {
    expect(currencyForOrg({ ...base, wabaPhone: "+91 98765 43210" })).toBe("INR");
    expect(currencyForOrg({ ...base, wabaPhone: "+971 50 123 4567", location: "Pune, India" })).toBe("USD");
    expect(currencyForOrg({ ...base, wabaPhone: "+91 98765 43210", location: "London" })).toBe("INR");
  });
  it("without a WhatsApp number: a location that mentions India, else USD", () => {
    expect(currencyForOrg({ ...base, location: "Mumbai, India" })).toBe("INR");
    expect(currencyForOrg({ ...base, location: "INDIA" })).toBe("INR");
    expect(currencyForOrg({ ...base, wabaPhone: "", location: "Mumbai, India" })).toBe("INR");
    expect(currencyForOrg({ ...base, location: "Indiana, USA" })).toBe("USD");
    expect(currencyForOrg(base)).toBe("USD");
  });
  it("reads the WhatsApp number from the organization's vendor setting", () => {
    expect(orgCurrencyHints({ settings: {}, location: null, vendorSettings: [{ value: "+91 98765 43210" }] }).wabaPhone).toBe("+91 98765 43210");
    expect(orgCurrencyHints({ settings: {}, location: null, vendorSettings: [] }).wabaPhone).toBeNull();
  });
  it("ignores an invalid stored currency or malformed settings", () => {
    for (const settings of [{ billingCurrency: "EUR" }, { billingCurrency: 5 }, null, "x", []]) {
      expect(currencyForOrg({ ...base, settings })).toBe("USD");
    }
  });
});

describe("createStatementPaymentLink", () => {
  const base = { statementId: "s1", organizationId: "o1", amountMinor: 50000, description: "WBMSG fee", dueAt: new Date("2026-11-08T00:00:00Z"), customerEmail: "a@x.com" };
  let saved: Record<string, string | undefined>;
  beforeEach(() => {
    saved = { id: process.env["RAZORPAY_KEY_ID"], secret: process.env["RAZORPAY_KEY_SECRET"] };
    process.env["RAZORPAY_KEY_ID"] = "rzp_test";
    process.env["RAZORPAY_KEY_SECRET"] = "secret";
    rzpCreate.mockReset().mockResolvedValue({ id: "plink_1", short_url: "https://rzp.io/l/abc" });
  });
  afterEach(() => {
    if (saved["id"] === undefined) delete process.env["RAZORPAY_KEY_ID"]; else process.env["RAZORPAY_KEY_ID"] = saved["id"];
    if (saved["secret"] === undefined) delete process.env["RAZORPAY_KEY_SECRET"]; else process.env["RAZORPAY_KEY_SECRET"] = saved["secret"];
  });

  it("creates a single-payment Razorpay link in paise, tagged with the statement id", async () => {
    const link = await createStatementPaymentLink({ ...base, currency: "INR" });
    expect(link).toEqual({ provider: "razorpay", url: "https://rzp.io/l/abc", ref: "plink_1" });
    const arg = rzpCreate.mock.calls[0]![0];
    expect(arg).toMatchObject({ amount: 50000, currency: "INR", accept_partial: false, reference_id: "s1", notes: { statementId: "s1", organizationId: "o1", kind: "usage_statement" } });
    expect(arg.notify).toEqual({ sms: false, email: false });
  });
  it("creates a USD link through Razorpay too, in cents", async () => {
    const link = await createStatementPaymentLink({ ...base, currency: "USD", amountMinor: 500 });
    expect(link).toEqual({ provider: "razorpay", url: "https://rzp.io/l/abc", ref: "plink_1" });
    expect(rzpCreate.mock.calls[0]![0]).toMatchObject({ amount: 500, currency: "USD", reference_id: "s1" });
  });
  it("fails clearly when Razorpay refuses a USD link (international payments not active yet)", async () => {
    rzpCreate.mockRejectedValue(new Error("International payments are not enabled"));
    await expect(createStatementPaymentLink({ ...base, currency: "USD" })).rejects.toThrow("not enabled");
  });
  it("refuses a non-positive or fractional amount before calling any gateway", async () => {
    for (const amountMinor of [0, -5, 10.5]) {
      await expect(createStatementPaymentLink({ ...base, currency: "INR", amountMinor })).rejects.toThrow("positive");
    }
    expect(rzpCreate).not.toHaveBeenCalled();
  });
  it("fails clearly when Razorpay keys are missing or the gateway returns no link", async () => {
    delete process.env["RAZORPAY_KEY_ID"];
    await expect(createStatementPaymentLink({ ...base, currency: "INR" })).rejects.toThrow("not configured");
    process.env["RAZORPAY_KEY_ID"] = "rzp_test";
    rzpCreate.mockResolvedValue({});
    await expect(createStatementPaymentLink({ ...base, currency: "INR" })).rejects.toThrow("no link");
    await expect(createStatementPaymentLink({ ...base, currency: "USD" })).rejects.toThrow("no link");
  });
});

describe("cancelStatementPaymentLink", () => {
  beforeEach(() => {
    process.env["RAZORPAY_KEY_ID"] = "rzp_test";
    process.env["RAZORPAY_KEY_SECRET"] = "secret";
    rzpCancel.mockReset().mockResolvedValue({});
  });
  it("cancels a Razorpay link and ignores any other provider", async () => {
    await cancelStatementPaymentLink("razorpay", "plink_1");
    expect(rzpCancel).toHaveBeenCalledWith("plink_1");
    rzpCancel.mockClear();
    await cancelStatementPaymentLink("stripe", "plink_s");
    expect(rzpCancel).not.toHaveBeenCalled();
  });
  it("does nothing without a provider and link", async () => {
    await cancelStatementPaymentLink(null, null);
    await cancelStatementPaymentLink("razorpay", null);
    expect(rzpCancel).not.toHaveBeenCalled();
  });
});
