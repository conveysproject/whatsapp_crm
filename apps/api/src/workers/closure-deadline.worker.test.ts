import { describe, it, expect, vi, beforeEach } from "vitest";

const { sendMail, prismaMock } = vi.hoisted(() => ({
  sendMail: vi.fn(),
  prismaMock: {
    organization: { findMany: vi.fn() },
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
vi.mock("../lib/push.js", () => ({ pushToUser: vi.fn() }));

import { processClosureDeadlines } from "./closure-deadline.worker.js";

describe("golden: closure deadline email (default organization)", () => {
  beforeEach(() => {
    sendMail.mockReset().mockResolvedValue(undefined);
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
});
