import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";

const { sendMail } = vi.hoisted(() => ({ sendMail: vi.fn() }));
vi.mock("../mail.js", () => ({ sendMail, isEmailConfigured: () => true }));
import { notifyPaymentFailed } from "./payment-failed-email.js";

const prisma = { user: { findMany: vi.fn() } } as unknown as PrismaClient;
const findMany = prisma.user.findMany as ReturnType<typeof vi.fn>;

describe("notifyPaymentFailed", () => {
  beforeEach(() => {
    findMany.mockReset();
    sendMail.mockReset();
  });

  it("emails the active admins of the org only", async () => {
    findMany.mockResolvedValue([{ email: "a@x.com" }, { email: "b@x.com" }]);
    await notifyPaymentFailed(prisma, "org-1", new Date("2026-10-17T00:00:00Z"));
    expect(findMany).toHaveBeenCalledWith({ where: { organizationId: "org-1", role: "admin", isActive: true }, select: { email: true } });
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: ["a@x.com", "b@x.com"], subject: expect.stringContaining("WBMSG") }));
    expect(String(sendMail.mock.calls[0]![0].html)).toContain("17");
  });

  it("does nothing when there are no admins", async () => {
    findMany.mockResolvedValue([]);
    await notifyPaymentFailed(prisma, "org-1", new Date());
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("never throws when sending fails", async () => {
    findMany.mockResolvedValue([{ email: "a@x.com" }]);
    sendMail.mockRejectedValue(new Error("smtp down"));
    await expect(notifyPaymentFailed(prisma, "org-1", new Date())).resolves.toBeUndefined();
  });
});
