import { describe, it, expect, vi, afterEach } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { writeAdminAudit } from "./audit.js";

const flush = () => new Promise((r) => setImmediate(r)).then(() => new Promise((r) => setImmediate(r)));
const prismaWith = (create: unknown) => ({ adminAuditLog: { create } }) as unknown as PrismaClient;

afterEach(() => { vi.restoreAllMocks(); });

describe("writeAdminAudit never lets a failure escape", () => {
  it.each([
    ["rejects", vi.fn().mockRejectedValue(new Error("db down"))],
    ["throws synchronously", vi.fn(() => { throw new Error("bad input"); })],
    ["returns a non-promise (e.g. an unconfigured mock)", vi.fn(() => undefined)],
  ])("when create %s", async (_label, create) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => writeAdminAudit({ prisma: prismaWith(create), actorId: "a1", action: "test" })).not.toThrow();
    await flush();
    expect(create).toHaveBeenCalledOnce();
    if (_label !== "returns a non-promise (e.g. an unconfigured mock)") {
      expect(log).toHaveBeenCalledWith("[AUDIT WRITE FAILED]", expect.objectContaining({ action: "test", actorId: "a1" }));
    }
  });

  it("writes the audit row on success", async () => {
    const create = vi.fn().mockResolvedValue({});
    writeAdminAudit({ prisma: prismaWith(create), actorId: "a1", action: "user.update", targetId: "u2" });
    await flush();
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ actorId: "a1", action: "user.update", targetId: "u2" }) });
  });
});
