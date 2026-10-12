import { describe, it, expect } from "vitest";
import { buildStatementPdf, invoiceNumberFor, pdfMoney, type StatementPdfInput } from "./statement-pdf.js";

const base: StatementPdfInput = {
  invoiceNumber: "WB-202610-1A2B3C",
  issuedAt: new Date("2026-11-14T00:50:00Z"),
  dueAt: new Date("2026-11-21T00:50:00Z"),
  status: "issued",
  paidAt: null,
  paymentReference: null,
  periodStart: new Date("2026-10-14T00:00:00Z"),
  periodEnd: new Date("2026-11-13T00:00:00Z"),
  seller: { legalName: "Conveys Information Technology", address: "Pune", gstin: "27AAPFU0939F1ZV" },
  buyer: { name: "Acme", legalName: "Acme Retail Pvt Ltd", gstin: "29ABCDE1234F1Z5", address: "12 MG Road", email: "accounts@acme.in" },
  messages: 3240, bandName: "Band 1", currency: "INR", baseMinor: 50000, taxMinor: 9000, taxRatePercent: 18, totalMinor: 59000,
};

describe("buildStatementPdf", () => {
  it("produces a real PDF document", async () => {
    const pdf = await buildStatementPdf(base);
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1500);
    expect(pdf.subarray(-8).toString("latin1")).toContain("%%EOF");
  });
  it("renders a paid statement with its payment date and reference", async () => {
    const pdf = await buildStatementPdf({ ...base, status: "paid", paidAt: new Date("2026-11-15T07:00:00Z"), paymentReference: "pay_TmziVzjESa0MIG" });
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1500);
  });
  it("copes with no tax, no billing details, a paid status and very long text", async () => {
    const minimal = await buildStatementPdf({
      ...base, taxMinor: 0, taxRatePercent: null, totalMinor: 50000, status: "paid", dueAt: null, issuedAt: null,
      seller: { legalName: "", address: "", gstin: "" },
      buyer: { name: "x".repeat(300), legalName: "", gstin: "", address: "y\n".repeat(80), email: "" },
    });
    expect(minimal.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    const usd = await buildStatementPdf({ ...base, currency: "USD", baseMinor: 500, taxMinor: 0, taxRatePercent: null, totalMinor: 500 });
    expect(usd.length).toBeGreaterThan(1500);
  });
});

describe("helpers", () => {
  it("builds a stable invoice number from the cycle and the statement id", () => {
    expect(invoiceNumberFor("2026-10-14", "ab12-cd34-ef56")).toBe("WB-202610-AB12CD");
    expect(invoiceNumberFor("2026-10-14", "ab12-cd34-ef56")).toBe(invoiceNumberFor("2026-10-14", "ab12-cd34-ef56"));
  });
  it("formats money with the currency code because the PDF font has no rupee sign", () => {
    expect(pdfMoney("INR", 59000)).toBe("INR 590.00");
    expect(pdfMoney("USD", 500)).toBe("USD 5.00");
    expect(pdfMoney("INR", 0)).toBe("INR 0.00");
  });
});
