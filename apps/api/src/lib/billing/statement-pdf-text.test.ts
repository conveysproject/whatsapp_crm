// Golden: the text the statement PDF writes for the seller (FROM block and footer) must not change when the seller
// constants are shared with the billing emails. pdfkit is replaced by a recorder so the text can be compared.
import { describe, it, expect, vi } from "vitest";

const { texts } = vi.hoisted(() => ({ texts: [] as string[] }));
vi.mock("pdfkit", () => {
  class FakeDoc {
    private handlers: Record<string, (c?: Buffer) => void> = {};
    y = 0;
    on(ev: string, cb: (c?: Buffer) => void) { this.handlers[ev] = cb; return this; }
    fontSize() { return this; }
    fillColor() { return this; }
    font() { return this; }
    moveDown() { return this; }
    moveTo() { return this; }
    lineTo() { return this; }
    strokeColor() { return this; }
    lineWidth() { return this; }
    stroke() { return this; }
    rect() { return this; }
    fill() { return this; }
    text(t: string) { texts.push(String(t)); return this; }
    end() { this.handlers["end"]?.(); }
  }
  return { default: FakeDoc };
});

import { buildStatementPdf, type StatementPdfInput } from "./statement-pdf.js";

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

describe("statement PDF seller text", () => {
  it("writes the seller block and the footer contact exactly as before", async () => {
    texts.length = 0;
    await buildStatementPdf(base);
    const i = texts.indexOf("FROM");
    expect(i).toBeGreaterThanOrEqual(0);
    expect(texts.slice(i, i + 5)).toEqual(["FROM", "Conveys Information Technology", "Pune", "GSTIN: 27AAPFU0939F1ZV", "info@conveys.in"]);
    expect(texts).toContain(
      "Meta's own WhatsApp message charges are billed to you directly by Meta and are not part of this statement. Questions about this statement: info@conveys.in.",
    );
  });
  it("falls back to the product name when no seller name is set", async () => {
    texts.length = 0;
    await buildStatementPdf({ ...base, seller: { legalName: "", address: "", gstin: "" } });
    const i = texts.indexOf("FROM");
    expect(texts.slice(i, i + 3)).toEqual(["FROM", "WBMSG", "info@conveys.in"]);
  });
});
