import { describe, it, expect, vi, beforeEach } from "vitest";

const { sendMail, sendOrgMail, prismaMock } = vi.hoisted(() => ({
  sendMail: vi.fn(),
  sendOrgMail: vi.fn(),
  prismaMock: {
    organization: { findMany: vi.fn(), findUnique: vi.fn() },
    contact: { findMany: vi.fn(), update: vi.fn() },
    notification: { create: vi.fn() },
    user: { findFirst: vi.fn() },
  },
}));

vi.mock("bullmq", () => ({
  Queue: class { on() {} add() {} },
  Worker: class { on() {} },
}));
vi.mock("../lib/queue.js", () => ({ redisConnection: {} }));
vi.mock("../lib/redis.js", () => ({ redis: { eval: vi.fn() } }));
vi.mock("../lib/prisma.js", () => ({ prisma: prismaMock }));
vi.mock("../lib/mail.js", () => ({ sendMail: (...a: unknown[]) => sendMail(...a) }));
vi.mock("../lib/email/org-mail.js", () => ({ sendOrgMail: (...a: unknown[]) => sendOrgMail(...a) }));
vi.mock("../lib/push.js", () => ({ pushToUser: vi.fn() }));

import { processClosureDeadlines } from "./closure-deadline.worker.js";

describe("golden: closure deadline email (default organization)", () => {
  beforeEach(() => {
    sendMail.mockReset().mockResolvedValue(undefined);
    sendOrgMail.mockReset().mockResolvedValue(undefined);
    prismaMock.organization.findUnique.mockReset();
    prismaMock.organization.findMany.mockReset().mockResolvedValue([{ id: "org-1", settings: { contactConfig: { closureDeadlineDays: 5 } } }]);
    // first findMany = backfill (none), second = overdue contacts
    prismaMock.contact.findMany.mockReset().mockResolvedValueOnce([]).mockResolvedValueOnce([
      { id: "c1", name: 'Ann <b>"X"</b> & Co', phoneNumber: "+15550001", assignedUserId: "u1" },
    ]);
    prismaMock.contact.update.mockReset().mockResolvedValue({});
    prismaMock.notification.create.mockReset().mockResolvedValue({});
    prismaMock.user.findFirst.mockReset().mockResolvedValue({ email: "owner@x.com" });
  });

  it("sends the exact same message", async () => {
    await processClosureDeadlines();
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0]![0]).toMatchInlineSnapshot(`
      {
        "html": "<p>The contact <strong>Ann &lt;b&gt;&quot;X&quot;&lt;/b&gt; &amp; Co</strong> has passed its closure deadline without reaching a closure status.</p><p>Please review and update the contact.</p>",
        "subject": "Closure deadline passed: Ann <b>"X"</b> & Co",
        "to": "owner@x.com",
      }
    `);
  });

  it("for a client of an approved parent the email follows the parent: the client's org id, never the parent's", async () => {
    const brand = { isParent: false, whiteLabelEnabled: false, brandName: null, brandColor: null, brandSupportEmail: null, brandHidePoweredBy: false, slug: null, logoImage: null, smallLogoImage: null, favicon: null, darkLogoImage: null, darkSmallLogoImage: null, darkFavicon: null,
      parentOrganization: { isParent: true, whiteLabelEnabled: true, brandName: "Acme Messaging", brandColor: "#112233", brandSupportEmail: "help@acme.test", brandHidePoweredBy: false, slug: "acme", logoImage: null, smallLogoImage: null, favicon: null, darkLogoImage: null, darkSmallLogoImage: null, darkFavicon: null } };
    prismaMock.organization.findUnique
      .mockResolvedValueOnce({ parentOrganizationId: "parent-1", parentOrganization: { whiteLabelEnabled: true } })
      .mockResolvedValueOnce(brand);
    await processClosureDeadlines();
    expect(sendMail).not.toHaveBeenCalled();
    expect(sendOrgMail).toHaveBeenCalledTimes(1);
    const args = sendOrgMail.mock.calls[0]![1];
    expect(args.orgId).toBe("org-1");
    expect(args.to).toBe("owner@x.com");
    expect(args.brand).toMatchObject({ name: "Acme Messaging" });
    expect(args.html).toContain("Sold by Conveys Information Technology, info@conveys.in");
    expect(args.subject).not.toMatch(/[\r\n]/);
  });

  it("for the parent's own organization the email is unchanged and not routed through a provider", async () => {
    prismaMock.organization.findUnique.mockResolvedValueOnce({ parentOrganizationId: null, parentOrganization: null });
    await processClosureDeadlines();
    expect(sendOrgMail).not.toHaveBeenCalled();
    expect(sendMail).toHaveBeenCalledTimes(1);
  });
});
