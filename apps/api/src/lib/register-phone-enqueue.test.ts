import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { PrismaClient } from "@prisma/client";

const enqueueRegisterCheck = vi.fn().mockResolvedValue(undefined);
vi.mock("../workers/register-phone.worker.js", () => ({ enqueueRegisterCheck }));

const deleteMany = vi.fn().mockResolvedValue({ count: 0 });
const prisma = { vendorSetting: { deleteMany } } as unknown as PrismaClient;

describe("register-phone enqueue helpers", () => {
  const original = process.env["AUTO_REGISTER_PHONE_ENABLED"];
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => {
    if (original === undefined) delete process.env["AUTO_REGISTER_PHONE_ENABLED"];
    else process.env["AUTO_REGISTER_PHONE_ENABLED"] = original;
  });

  it("does nothing while the flag is off (no DB write, no queue)", async () => {
    delete process.env["AUTO_REGISTER_PHONE_ENABLED"];
    const { onWhatsappConnected, onPhoneStatusPending } = await import("./register-phone-enqueue.js");
    await onWhatsappConnected(prisma, "org-1");
    await onPhoneStatusPending("org-1");
    expect(deleteMany).not.toHaveBeenCalled();
    expect(enqueueRegisterCheck).not.toHaveBeenCalled();
  });

  it("on connect with the flag on: clears retry state for that org only, then enqueues one check", async () => {
    process.env["AUTO_REGISTER_PHONE_ENABLED"] = "true";
    const { onWhatsappConnected } = await import("./register-phone-enqueue.js");
    await onWhatsappConnected(prisma, "org-1");
    expect(deleteMany).toHaveBeenCalledTimes(1);
    const arg = deleteMany.mock.calls[0]![0] as { where: { organizationId: string; key: { in: string[] } } };
    expect(arg.where.organizationId).toBe("org-1");
    expect(arg.where.key.in).toContain("wa_register_done");
    expect(arg.where.key.in).not.toContain("wa_register_pin");
    expect(enqueueRegisterCheck).toHaveBeenCalledWith("org-1");
  });

  it("an enqueue failure never throws to the caller", async () => {
    process.env["AUTO_REGISTER_PHONE_ENABLED"] = "true";
    enqueueRegisterCheck.mockRejectedValueOnce(new Error("redis down"));
    const { onPhoneStatusPending } = await import("./register-phone-enqueue.js");
    await expect(onPhoneStatusPending("org-1")).resolves.toBeUndefined();
  });
});
