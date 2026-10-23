import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";

const { sendMail, sendOrgMail } = vi.hoisted(() => ({ sendMail: vi.fn(), sendOrgMail: vi.fn() }));
vi.mock("../mail.js", () => ({ sendMail: (...a: unknown[]) => sendMail(...a) }));
vi.mock("../redis.js", () => ({ redis: { eval: vi.fn() } }));
vi.mock("../email/org-mail.js", () => ({ sendOrgMail: (...a: unknown[]) => sendOrgMail(...a) }));

import { billingMailContext, sendBillingMail, brandBillingMessage, LEGAL_SELLER_LINE } from "./billing-mail.js";
import { LEGAL_SELLER_NAME, LEGAL_SELLER_EMAIL } from "./legal-seller.js";
import { DEFAULT_BILLING_CONFIG } from "./bands.js";

const PAY = "https://rzp.io/l/abc?x=WBMSG&amp;y=1";
const SUBJECT = "WBMSG statement: ₹500.00 due 27 November 2026";
const HTML = `<p>Your WBMSG statement for the billing period starting 2026-10-14 is ready.</p>
<p>3,240 messages counted (Band 1). Amount due: <strong>₹500.00</strong> by 27 November 2026.</p>
<p><a href="${PAY}">Pay securely online</a></p>
<p>WhatsApp's own message charges are billed to you directly by Meta; this statement is only the WBMSG fee.</p>`;

function brandRow(over: Record<string, unknown> = {}) {
  return {
    isParent: true, whiteLabelEnabled: true, brandName: "Acme Messaging", brandColor: "#112233",
    brandSupportEmail: "help@acme.test", brandHidePoweredBy: false, slug: "acme",
    logoImage: null, smallLogoImage: null, favicon: null, darkLogoImage: null, darkSmallLogoImage: null, darkFavicon: null,
    ...over,
  };
}

/** Fake prisma: the first organization lookup is the context query, the second is resolveBrand's. */
function fakePrisma(ctxRow: unknown, brand: unknown = { ...brandRow(), parentOrganization: null }) {
  const findUnique = vi.fn().mockResolvedValueOnce(ctxRow).mockResolvedValueOnce(brand);
  return { prisma: { organization: { findUnique } } as unknown as PrismaClient, findUnique };
}

const clientRow = { parentOrganizationId: "parent-1", parentOrganization: { whiteLabelEnabled: true } };
const clientBrand = { isParent: false, whiteLabelEnabled: false, brandName: null, brandColor: null, brandSupportEmail: null, brandHidePoweredBy: false, slug: null, logoImage: null, smallLogoImage: null, favicon: null, darkLogoImage: null, darkSmallLogoImage: null, darkFavicon: null, parentOrganization: brandRow() };

beforeEach(() => {
  sendMail.mockReset().mockResolvedValue(undefined);
  sendOrgMail.mockReset().mockResolvedValue(undefined);
});

describe("legal seller constants", () => {
  it("names the legal seller as the statement PDF does, with no invented tax identifier", () => {
    expect(LEGAL_SELLER_NAME).toBe("Conveys Information Technology");
    expect(LEGAL_SELLER_EMAIL).toBe("info@conveys.in");
    expect(LEGAL_SELLER_LINE).toBe("Conveys Information Technology, info@conveys.in");
    expect(LEGAL_SELLER_LINE).not.toMatch(/gst|\d{5}/i);
  });
  it("is the same source as the default seller of the billing config", () => {
    expect(DEFAULT_BILLING_CONFIG.seller.legalName).toBe(LEGAL_SELLER_NAME);
  });
});

describe("billingMailContext", () => {
  it("is branded for a client of an approved parent, using at most two queries", async () => {
    const { prisma, findUnique } = fakePrisma(clientRow, clientBrand);
    const ctx = await billingMailContext(prisma, "client-1");
    expect(ctx.orgId).toBe("client-1");
    expect(ctx.brand).toMatchObject({ name: "Acme Messaging", supportEmail: "help@acme.test", isDefault: false });
    expect(findUnique).toHaveBeenCalledTimes(2);
  });
  it.each([
    ["the parent's own organization", { parentOrganizationId: null, parentOrganization: null }],
    ["an organization without a parent", { parentOrganizationId: null, parentOrganization: null }],
    ["a client of a parent that is not approved", { parentOrganizationId: "p", parentOrganization: { whiteLabelEnabled: false } }],
    ["an unknown organization", null],
    ["a client whose parent row is missing", { parentOrganizationId: "p", parentOrganization: null }],
  ])("is the default for %s, after one query", async (_n, row) => {
    const { prisma, findUnique } = fakePrisma(row);
    expect(await billingMailContext(prisma, "o")).toEqual({ orgId: null });
    expect(findUnique).toHaveBeenCalledTimes(1);
  });
  it("is the default when the lookup throws, and never throws", async () => {
    const prisma = { organization: { findUnique: vi.fn().mockRejectedValue(new Error("db down")) } } as unknown as PrismaClient;
    await expect(billingMailContext(prisma, "o")).resolves.toEqual({ orgId: null });
    const { prisma: p2 } = fakePrisma(clientRow);
    (p2.organization.findUnique as unknown as ReturnType<typeof vi.fn>).mockReset().mockResolvedValueOnce(clientRow).mockRejectedValueOnce(new Error("brand failed"));
    await expect(billingMailContext(p2, "o")).resolves.toEqual({ orgId: null });
  });
  it("asks only for the parent flag, never for ids of other tenants", async () => {
    const { prisma, findUnique } = fakePrisma(clientRow, clientBrand);
    await billingMailContext(prisma, "client-1");
    expect(findUnique.mock.calls[0]![0]).toEqual({
      where: { id: "client-1" },
      select: { parentOrganizationId: true, parentOrganization: { select: { whiteLabelEnabled: true } } },
    });
  });
});

describe("sendBillingMail: default context", () => {
  it.each([
    ["parent's own organization", { parentOrganizationId: null, parentOrganization: null }],
    ["no parent", { parentOrganizationId: null, parentOrganization: null }],
    ["not approved parent", { parentOrganizationId: "p", parentOrganization: { whiteLabelEnabled: false } }],
    ["unknown org", null],
  ])("%s: sendMail gets the unchanged to, subject and html and nothing else", async (_n, row) => {
    const { prisma } = fakePrisma(row);
    await sendBillingMail(prisma, { orgId: "o1", to: ["a@x.com", "b@x.com"], subject: SUBJECT, html: HTML });
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail).toHaveBeenCalledWith({ to: ["a@x.com", "b@x.com"], subject: SUBJECT, html: HTML });
    expect(sendOrgMail).not.toHaveBeenCalled();
  });
  it("a lookup error is the default send, and a failing send still rejects as before", async () => {
    const prisma = { organization: { findUnique: vi.fn().mockRejectedValue(new Error("db")) } } as unknown as PrismaClient;
    await sendBillingMail(prisma, { orgId: "o1", to: "a@x.com", subject: SUBJECT, html: HTML });
    expect(sendMail).toHaveBeenCalledWith({ to: "a@x.com", subject: SUBJECT, html: HTML });
    sendMail.mockRejectedValue(new Error("mail down"));
    await expect(sendBillingMail(prisma, { orgId: "o1", to: "a@x.com", subject: SUBJECT, html: HTML })).rejects.toThrow("mail down");
  });
});

describe("sendBillingMail: client of an approved parent", () => {
  it("goes through sendOrgMail with the client's org id and the parent's brand, rebranded, with the legal line", async () => {
    const { prisma } = fakePrisma(clientRow, clientBrand);
    await sendBillingMail(prisma, { orgId: "client-1", to: ["a@x.com"], subject: SUBJECT, html: HTML });
    expect(sendMail).not.toHaveBeenCalled();
    expect(sendOrgMail).toHaveBeenCalledTimes(1);
    const [, args] = sendOrgMail.mock.calls[0]!;
    expect(args.orgId).toBe("client-1");
    expect(args.to).toBe("a@x.com");
    expect(args.brand).toMatchObject({ name: "Acme Messaging", supportEmail: "help@acme.test" });
    expect(args.subject).toBe("Acme Messaging statement: ₹500.00 due 27 November 2026");
    expect(args.html).toContain("Your Acme Messaging statement for the billing period");
    expect(args.html).toContain("only the Acme Messaging fee");
    expect(args.html).toContain(LEGAL_SELLER_LINE);
    expect(args.html).toContain("help@acme.test");
    // amounts, dates, statement figures and the payment link are untouched, including a WBMSG inside the link
    expect(args.html).toContain(`<a href="${PAY}">Pay securely online</a>`);
    expect(args.html).toContain("<strong>₹500.00</strong> by 27 November 2026");
    expect(args.html).toContain("3,240 messages counted (Band 1)");
    // no product name is left in the visible text outside the "Powered by" notice and the payment link
    const visible = args.html.replace(/<[^>]*>/g, " ").replace(/Powered by WBMSG/, "");
    expect(visible).not.toContain("WBMSG");
  });
  it("hidePoweredBy removes the notice but never the legal seller line", async () => {
    const { prisma } = fakePrisma(clientRow, { ...clientBrand, parentOrganization: brandRow({ brandHidePoweredBy: true }) });
    await sendBillingMail(prisma, { orgId: "client-1", to: "a@x.com", subject: SUBJECT, html: HTML });
    const html = sendOrgMail.mock.calls[0]![1].html as string;
    expect(html).not.toContain("Powered by");
    expect(html).toContain(LEGAL_SELLER_LINE);
  });
  it("sends one message per recipient, to exactly the same list, attempting all before reporting a failure", async () => {
    const { prisma } = fakePrisma(clientRow, clientBrand);
    sendOrgMail.mockRejectedValueOnce(new Error("first failed")).mockResolvedValue(undefined);
    await expect(sendBillingMail(prisma, { orgId: "client-1", to: ["a@x.com", "b@x.com", "c@x.com"], subject: SUBJECT, html: HTML })).rejects.toThrow("first failed");
    expect(sendOrgMail.mock.calls.map((c) => c[1].to)).toEqual(["a@x.com", "b@x.com", "c@x.com"]);
    expect(new Set(sendOrgMail.mock.calls.map((c) => c[1].orgId))).toEqual(new Set(["client-1"]));
  });
  it("the support email reaches the sender as the brand's Reply-To (via the brand passed to sendOrgMail)", async () => {
    const { prisma } = fakePrisma(clientRow, clientBrand);
    await sendBillingMail(prisma, { orgId: "client-1", to: "a@x.com", subject: SUBJECT, html: HTML });
    const { brandMailExtras } = await import("../email-brand.js");
    expect(brandMailExtras(sendOrgMail.mock.calls[0]![1].brand)).toEqual({ fromName: "Acme Messaging", replyTo: "help@acme.test" });
  });
});

describe("branded message safety", () => {
  const hostile = { name: 'Evil <script>alert(1)</script>\r\nBcc: x@evil.test "q" & Co', logoUrl: null, supportEmail: null, hidePoweredBy: false };
  it("escapes the brand name in the body and keeps CR/LF and angle brackets out of the subject", () => {
    const m = brandBillingMessage(hostile, SUBJECT, HTML);
    expect(m.subject).not.toMatch(/[\r\n<>]/);
    expect(m.subject.startsWith("Evil scriptalert(1)/script Bcc: x@evil.test")).toBe(true);
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("Evil &lt;script&gt;");
    expect(m.html).toContain("&quot;q&quot; &amp; Co");
    expect(m.html).toContain(LEGAL_SELLER_LINE);
  });
  it("does not rebrand inside tags or attributes", () => {
    const m = brandBillingMessage({ ...hostile, name: "Acme" }, "WBMSG", `<a href="https://x.test/WBMSG" title="WBMSG">WBMSG</a>`);
    expect(m.html.startsWith(`<a href="https://x.test/WBMSG" title="WBMSG">Acme</a>`)).toBe(true);
  });
  it("a brand name containing a replacement pattern is inserted literally", () => {
    const m = brandBillingMessage({ ...hostile, name: "A$&B$1" }, "WBMSG fee", "<p>WBMSG</p>");
    expect(m.subject).toBe("A$&B$1 fee");
    expect(m.html.startsWith("<p>A$&amp;B$1</p>")).toBe(true);
  });
});
