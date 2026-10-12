import PDFDocument from "pdfkit";

export interface StatementPdfInput {
  invoiceNumber: string;
  issuedAt: Date | null;
  dueAt: Date | null;
  status: string;
  /** When the payment arrived and the gateway's payment id; shown only for a paid statement. */
  paidAt: Date | null;
  paymentReference: string | null;
  periodStart: Date;
  /** Last day of the billing period (inclusive). */
  periodEnd: Date;
  seller: { legalName: string; address: string; gstin: string };
  buyer: { name: string; legalName: string; gstin: string; address: string; email: string };
  messages: number;
  bandName: string;
  currency: "INR" | "USD";
  /** Minor units. */
  baseMinor: number;
  taxMinor: number;
  taxRatePercent: number | null;
  totalMinor: number;
}

/** "WB-202610-1A2B3C": month of the cycle start plus the start of the statement id. Not a statutory sequential series. */
export function invoiceNumberFor(cycleKey: string, statementId: string): string {
  return `WB-${cycleKey.slice(0, 7).replace("-", "")}-${statementId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 6).toUpperCase()}`;
}

// The built-in PDF fonts have no rupee sign, so amounts are written with the currency code.
export function pdfMoney(currency: string, minor: number): string {
  return `${currency} ${(minor / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dateText(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

const STATUS_TEXT: Record<string, string> = { issued: "Payment due", paid: "Paid", no_payment: "No payment needed" };

/** Builds a one-page statement / invoice PDF in memory. Contains no payment link and no card data. */
export function buildStatementPdf(i: StatementPdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50, info: { Title: `WBMSG statement ${i.invoiceNumber}`, Author: i.seller.legalName || "WBMSG" } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const grey = "#555555";
    doc.fontSize(20).fillColor("#111111").text("Statement / Invoice", { align: "left" });
    doc.moveDown(0.3).fontSize(10).fillColor(grey)
      .text(`Number: ${i.invoiceNumber}`)
      .text(`Issued: ${i.issuedAt ? dateText(i.issuedAt) : "-"}`)
      .text(`Billing period: ${dateText(i.periodStart)} to ${dateText(i.periodEnd)}`)
      .text(`Status: ${STATUS_TEXT[i.status] ?? i.status}${i.status === "issued" && i.dueAt ? `, due ${dateText(i.dueAt)}` : ""}`);
    if (i.status === "paid") {
      if (i.paidAt) doc.text(`Paid on: ${dateText(i.paidAt)}`);
      if (i.paymentReference) doc.text(`Payment reference: ${i.paymentReference}`);
    }

    doc.moveDown(1);
    const top = doc.y;
    doc.fontSize(9).fillColor(grey).text("FROM", 50, top);
    doc.fontSize(11).fillColor("#111111").text(i.seller.legalName || "WBMSG", 50, top + 12, { width: 230 });
    doc.fontSize(9).fillColor(grey);
    if (i.seller.address) doc.text(i.seller.address, { width: 230 });
    if (i.seller.gstin) doc.text(`GSTIN: ${i.seller.gstin}`, { width: 230 });
    doc.text("info@conveys.in", { width: 230 });
    const leftEnd = doc.y;

    doc.fontSize(9).fillColor(grey).text("BILLED TO", 320, top);
    doc.fontSize(11).fillColor("#111111").text(i.buyer.legalName || i.buyer.name, 320, top + 12, { width: 225 });
    doc.fontSize(9).fillColor(grey);
    if (i.buyer.address) doc.text(i.buyer.address, 320, doc.y, { width: 225 });
    if (i.buyer.gstin) doc.text(`GSTIN: ${i.buyer.gstin}`, 320, doc.y, { width: 225 });
    if (i.buyer.email) doc.text(i.buyer.email, 320, doc.y, { width: 225 });
    doc.y = Math.max(doc.y, leftEnd) + 24;

    // Line items
    const y0 = doc.y;
    doc.moveTo(50, y0).lineTo(545, y0).strokeColor("#cccccc").stroke();
    doc.fontSize(9).fillColor(grey).text("Description", 50, y0 + 8).text("Amount", 445, y0 + 8, { width: 100, align: "right" });
    doc.moveTo(50, y0 + 24).lineTo(545, y0 + 24).stroke();
    doc.fontSize(10).fillColor("#111111").text(
      `WBMSG messaging fee, ${i.bandName}. ${i.messages.toLocaleString("en-US")} messages counted in the period (messages Meta charges for).`,
      50, y0 + 32, { width: 380 },
    );
    doc.text(pdfMoney(i.currency, i.baseMinor), 445, y0 + 32, { width: 100, align: "right" });
    let y = Math.max(doc.y, y0 + 52) + 8;
    doc.moveTo(50, y).lineTo(545, y).strokeColor("#cccccc").stroke();
    y += 10;
    if (i.taxMinor > 0) {
      doc.fontSize(10).fillColor(grey).text(`GST${i.taxRatePercent ? ` (${i.taxRatePercent}%)` : ""}`, 320, y, { width: 120, align: "right" });
      doc.fillColor("#111111").text(pdfMoney(i.currency, i.taxMinor), 445, y, { width: 100, align: "right" });
      y += 18;
    }
    doc.fontSize(12).fillColor("#111111").text("Total", 320, y, { width: 120, align: "right" });
    doc.text(pdfMoney(i.currency, i.totalMinor), 445, y, { width: 100, align: "right" });

    doc.fontSize(9).fillColor(grey).text(
      "Meta's own WhatsApp message charges are billed to you directly by Meta and are not part of this statement. " +
      "Questions about this statement: info@conveys.in.",
      50, y + 50, { width: 495 },
    );
    doc.end();
  });
}
