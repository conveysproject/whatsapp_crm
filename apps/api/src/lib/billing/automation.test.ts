import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";

const { sendMail, issueStatements, ensurePaymentLinks } = vi.hoisted(() => ({ sendMail: vi.fn(), issueStatements: vi.fn(), ensurePaymentLinks: vi.fn() }));
vi.mock("../mail.js", () => ({ sendMail }));
vi.mock("../prisma.js", () => ({ prisma: {} }));
vi.mock("./statements.js", () => ({ issueStatements }));
vi.mock("./statement-payment.js", () => ({ ensurePaymentLinks }));

import { buildOwnerSummary, runBlockingSweep, runBillingAutomation } from "./automation.js";
import { DEFAULT_BILLING_CONFIG } from "./bands.js";

const DAY = 86_400_000;
const now = new Date("2026-11-20T01:00:00Z");

describe("buildOwnerSummary", () => {
  const empty = { mode: "watch", autoIssue: true, issued: [], paid: [], overdue: [], newlyBlocked: [], wouldBlock: [], noLink: [] };
  it("sends nothing on a quiet day", () => {
    expect(buildOwnerSummary(empty)).toBeNull();
  });
  it("lists only the sections that have rows, escapes names and shows the mode", () => {
    const s = buildOwnerSummary({ ...empty, paid: ["Acme <b>: x"], newlyBlocked: ["Beta: 2026-10-14"] })!;
    expect(s.subject).toContain("1 paid");
    expect(s.subject).toContain("1 newly blocked");
    expect(s.html).toContain("Acme &lt;b&gt;: x");
    expect(s.html).not.toContain("<b>: x");
    expect(s.html).toContain("Payments received");
    expect(s.html).not.toContain("Overdue now");
    expect(s.html).toContain("watch");
  });
  it("caps a long list at 25 and says how many more", () => {
    const s = buildOwnerSummary({ ...empty, overdue: Array.from({ length: 30 }, (_, i) => `Org ${i}`) })!;
    expect(s.html).toContain("and 5 more");
  });
});

describe("runBlockingSweep", () => {
  const stFindMany = vi.fn();
  const orgFindMany = vi.fn();
  const evFindMany = vi.fn();
  const evCreateMany = vi.fn();
  const userFindMany = vi.fn();
  const prisma = {
    billingStatement: { findMany: stFindMany },
    organization: { findMany: orgFindMany },
    billingAlertEvent: { findMany: evFindMany, createMany: evCreateMany },
    user: { findMany: userFindMany },
  } as unknown as PrismaClient;

  beforeEach(() => {
    [stFindMany, orgFindMany, evFindMany, evCreateMany, userFindMany, sendMail].forEach((m) => m.mockReset());
    stFindMany.mockResolvedValue([{ organizationId: "o1", month: "2026-10-14" }, { organizationId: "o2", month: "2026-10-14" }, { organizationId: "own", month: "2026-10-12" }]);
    orgFindMany.mockResolvedValue([
      { id: "o1", name: "Acme", settings: {} },
      { id: "o2", name: "Paused Co", settings: { billingBlock: { pauseUntil: "2026-12-31" } } },
      { id: "own", name: "Conveys Information Technology", settings: {} },
    ]);
    evFindMany.mockResolvedValue([]);
    evCreateMany.mockResolvedValue({ count: 1 });
    userFindMany.mockResolvedValue([{ email: "a@x.com" }]);
  });

  it("does nothing when blocking is off", async () => {
    expect(await runBlockingSweep(prisma, "off", now)).toEqual({ blocked: [], wouldBlock: [] });
    expect(stFindMany).not.toHaveBeenCalled();
  });
  it("looks only at issued statements with a link that are 7 or more days past due", async () => {
    await runBlockingSweep(prisma, "enforce", now);
    expect(stFindMany.mock.calls[0]![0].where).toEqual({ status: "issued", paymentUrl: { not: null }, dueAt: { lte: new Date(now.getTime() - 7 * DAY) } });
  });
  it("in enforce mode blocks and tells only a live customer, skipping paused and own organizations", async () => {
    const res = await runBlockingSweep(prisma, "enforce", now);
    expect(res.blocked).toEqual([{ organizationId: "o1", month: "2026-10-14" }]);
    expect(evCreateMany.mock.calls[0]![0].data).toEqual([{ organizationId: "o1", month: "2026-10-14", kind: "blocked", messages: 0 }]);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0]![0]).toMatchObject({ to: ["a@x.com"], subject: expect.stringContaining("sending is paused") });
  });
  it("in watch mode records would-block and emails no customer", async () => {
    const res = await runBlockingSweep(prisma, "watch", now);
    expect(res.wouldBlock).toHaveLength(1);
    expect(evCreateMany.mock.calls[0]![0].data[0].kind).toBe("would_block");
    expect(sendMail).not.toHaveBeenCalled();
  });
  it("announces each customer only once: an already recorded block is not repeated", async () => {
    evFindMany.mockResolvedValue([{ organizationId: "o1", month: "2026-10-14" }]);
    expect(await runBlockingSweep(prisma, "enforce", now)).toEqual({ blocked: [], wouldBlock: [] });
    expect(evCreateMany).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });
  it("sends the notice to the billing email when the customer has set one", async () => {
    orgFindMany.mockResolvedValue([{ id: "o1", name: "Acme", settings: { billing: { billingEmail: "accounts@acme.in" } } }]);
    stFindMany.mockResolvedValue([{ organizationId: "o1", month: "2026-10-14" }]);
    await runBlockingSweep(prisma, "enforce", now);
    expect(sendMail.mock.calls[0]![0].to).toEqual(["accounts@acme.in"]);
  });
});

describe("runBillingAutomation", () => {
  const stFindMany = vi.fn();
  const settingFindUnique = vi.fn();
  const orgFindMany = vi.fn();
  const cancelFindMany = vi.fn();
  const prisma = {
    billingSetting: { findUnique: settingFindUnique },
    billingStatement: { findMany: stFindMany },
    organization: { findMany: orgFindMany },
    billingAlertEvent: { findMany: vi.fn().mockResolvedValue([]), createMany: vi.fn() },
    billingCancellation: { findMany: cancelFindMany },
    user: { findMany: vi.fn().mockResolvedValue([]) },
  } as unknown as PrismaClient;

  beforeEach(() => {
    [stFindMany, settingFindUnique, orgFindMany, sendMail, issueStatements, ensurePaymentLinks, cancelFindMany].forEach((m) => m.mockReset());
    cancelFindMany.mockResolvedValue([]);
    stFindMany.mockResolvedValue([]);
    orgFindMany.mockResolvedValue([]);
    issueStatements.mockResolvedValue({ configured: true, issued: 2, noPayment: 1, customQuote: 0 });
    ensurePaymentLinks.mockResolvedValue(2);
  });

  it("issues nothing automatically while the switch is off", async () => {
    settingFindUnique.mockResolvedValue({ value: { ...DEFAULT_BILLING_CONFIG, autoIssueEnabled: false } });
    const res = await runBillingAutomation(prisma, now);
    expect(issueStatements).not.toHaveBeenCalled();
    expect(res.issued).toBe(0);
  });
  it("issues statements and creates payment links when the switch is on", async () => {
    settingFindUnique.mockResolvedValue({ value: { ...DEFAULT_BILLING_CONFIG, autoIssueEnabled: true } });
    const res = await runBillingAutomation(prisma, now);
    expect(issueStatements).toHaveBeenCalledTimes(1);
    expect(res).toMatchObject({ issued: 2, links: 2 });
  });
  it("emails the owner a summary when something happened, and nothing on a quiet day", async () => {
    settingFindUnique.mockResolvedValue({ value: { ...DEFAULT_BILLING_CONFIG } });
    expect((await runBillingAutomation(prisma, now)).summarySent).toBe(false);
    expect(sendMail).not.toHaveBeenCalled();
    stFindMany.mockImplementation(async (args: { where: { paidAt?: unknown } }) => (args.where.paidAt ? [{ organizationId: "o1", month: "2026-10-14", amountMinor: 50000, currency: "INR" }] : []));
    orgFindMany.mockResolvedValue([{ id: "o1", name: "Acme" }]);
    expect((await runBillingAutomation(prisma, now)).summarySent).toBe(true);
    expect(sendMail.mock.calls[0]![0].to).toBe("info@conveys.in");
    expect(sendMail.mock.calls[0]![0].html).toContain("Acme");
  });
  it("tells the owner about cancellation requests and cancelled accounts whose data is due for deletion", async () => {
    settingFindUnique.mockResolvedValue({ value: { ...DEFAULT_BILLING_CONFIG } });
    orgFindMany.mockResolvedValue([{ id: "o1", name: "Leaver Co" }, { id: "o2", name: "Gone Co" }]);
    cancelFindMany.mockImplementation(async (args: { where: { status: string } }) =>
      args.where.status === "requested"
        ? [{ organizationId: "o1", requestedAt: new Date("2026-11-19T00:00:00Z") }]
        : [{ organizationId: "o2", approvedAt: new Date("2026-10-01T00:00:00Z") }]);
    expect((await runBillingAutomation(prisma, now)).summarySent).toBe(true);
    const html = sendMail.mock.calls[0]![0].html as string;
    expect(html).toContain("Cancellation requests waiting for your approval");
    expect(html).toContain("Leaver Co");
    expect(html).toContain("delete their data");
    expect(html).toContain("Gone Co");
  });
  it("one failing step never stops the others", async () => {
    settingFindUnique.mockResolvedValue({ value: { ...DEFAULT_BILLING_CONFIG, autoIssueEnabled: true } });
    issueStatements.mockRejectedValue(new Error("boom"));
    stFindMany.mockRejectedValue(new Error("db down"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(runBillingAutomation(prisma, now)).resolves.toMatchObject({ issued: 0, summarySent: false });
    warn.mockRestore();
  });
});
