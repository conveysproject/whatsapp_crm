import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { rzpCreate, stripeCreate, rzpCancel, stripeUpdate } = vi.hoisted(() => ({ rzpCreate: vi.fn(), stripeCreate: vi.fn(), rzpCancel: vi.fn(), stripeUpdate: vi.fn() }));
vi.mock("razorpay", () => ({ default: vi.fn().mockImplementation(() => ({ paymentLink: { create: rzpCreate, cancel: rzpCancel } })) }));
vi.mock("../stripe.js", () => ({ getStripe: () => ({ paymentLinks: { create: stripeCreate, update: stripeUpdate } }) }));

import { currencyForPhone, createStatementPaymentLink, cancelStatementPaymentLink } from "./payment-links.js";

describe("currencyForPhone", () => {
  it("uses INR only for a complete Indian number", () => {
    for (const p of ["+91 98765 43210", "919876543210", "+91-98765-43210"]) expect(currencyForPhone(p), p).toBe("INR");
  });
  it("uses USD for everything else, including missing or odd numbers", () => {
    for (const p of [null, undefined, "", "+1 415 555 0100", "+971501234567", "+9198765", "9198765432101234"]) expect(currencyForPhone(p), String(p)).toBe("USD");
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
    stripeCreate.mockReset().mockResolvedValue({ id: "plink_s", url: "https://buy.stripe.com/x" });
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
  it("creates a one-use Stripe link in cents, tagged with the statement id", async () => {
    const link = await createStatementPaymentLink({ ...base, currency: "USD", amountMinor: 500 });
    expect(link).toEqual({ provider: "stripe", url: "https://buy.stripe.com/x", ref: "plink_s" });
    const arg = stripeCreate.mock.calls[0]![0];
    expect(arg.line_items[0].price_data).toMatchObject({ currency: "usd", unit_amount: 500 });
    expect(arg.metadata).toMatchObject({ statementId: "s1", kind: "usage_statement" });
    expect(arg.restrictions).toEqual({ completed_sessions: { limit: 1 } });
  });
  it("refuses a non-positive or fractional amount before calling any gateway", async () => {
    for (const amountMinor of [0, -5, 10.5]) {
      await expect(createStatementPaymentLink({ ...base, currency: "INR", amountMinor })).rejects.toThrow("positive");
    }
    expect(rzpCreate).not.toHaveBeenCalled();
    expect(stripeCreate).not.toHaveBeenCalled();
  });
  it("fails clearly when Razorpay keys are missing or the gateway returns no link", async () => {
    delete process.env["RAZORPAY_KEY_ID"];
    await expect(createStatementPaymentLink({ ...base, currency: "INR" })).rejects.toThrow("not configured");
    process.env["RAZORPAY_KEY_ID"] = "rzp_test";
    rzpCreate.mockResolvedValue({});
    await expect(createStatementPaymentLink({ ...base, currency: "INR" })).rejects.toThrow("no link");
    stripeCreate.mockResolvedValue({});
    await expect(createStatementPaymentLink({ ...base, currency: "USD" })).rejects.toThrow("no link");
  });
});

describe("cancelStatementPaymentLink", () => {
  beforeEach(() => {
    process.env["RAZORPAY_KEY_ID"] = "rzp_test";
    process.env["RAZORPAY_KEY_SECRET"] = "secret";
    rzpCancel.mockReset().mockResolvedValue({});
    stripeUpdate.mockReset().mockResolvedValue({});
  });
  it("cancels a Razorpay link and deactivates a Stripe link", async () => {
    await cancelStatementPaymentLink("razorpay", "plink_1");
    expect(rzpCancel).toHaveBeenCalledWith("plink_1");
    await cancelStatementPaymentLink("stripe", "plink_s");
    expect(stripeUpdate).toHaveBeenCalledWith("plink_s", { active: false });
  });
  it("does nothing without a provider and link", async () => {
    await cancelStatementPaymentLink(null, null);
    await cancelStatementPaymentLink("razorpay", null);
    expect(rzpCancel).not.toHaveBeenCalled();
    expect(stripeUpdate).not.toHaveBeenCalled();
  });
});
