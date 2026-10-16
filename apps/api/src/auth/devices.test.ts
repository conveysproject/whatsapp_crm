import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { isTrustedDevice, trustDevice } from "./devices.js";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

function makePrisma(row: any = null) {
  return {
    authTrustedDevice: {
      create: vi.fn(async ({ data }: any) => data),
      findFirst: vi.fn(async () => row),
      update: vi.fn(async () => ({})),
    },
  } as any;
}

describe("trustDevice", () => {
  it("returns a 32-byte base64url id and stores only its hash with 90-day expiry", async () => {
    const prisma = makePrisma();
    const id = await trustDevice(prisma, "usr_a");
    expect(Buffer.from(id, "base64url")).toHaveLength(32);
    const data = prisma.authTrustedDevice.create.mock.calls[0][0].data;
    expect(data.accountId).toBe("usr_a");
    expect(data.deviceIdHash).toBe(sha(id));
    expect(JSON.stringify(data)).not.toContain(id);
    const days = (data.expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(89.9);
    expect(days).toBeLessThanOrEqual(90);
  });
});

describe("isTrustedDevice", () => {
  it("false for undefined deviceId without querying", async () => {
    const prisma = makePrisma();
    expect(await isTrustedDevice(prisma, "usr_a", undefined)).toBe(false);
    expect(prisma.authTrustedDevice.findFirst).not.toHaveBeenCalled();
  });

  it("false when no non-expired row exists", async () => {
    const prisma = makePrisma(null);
    expect(await isTrustedDevice(prisma, "usr_a", "dev")).toBe(false);
    const where = prisma.authTrustedDevice.findFirst.mock.calls[0][0].where;
    expect(where.accountId).toBe("usr_a");
    expect(where.deviceIdHash).toBe(sha("dev"));
    expect(where.expiresAt.gt).toBeInstanceOf(Date);
  });

  it("true and updates lastSeenAt when a row exists", async () => {
    const prisma = makePrisma({ id: "row1" });
    expect(await isTrustedDevice(prisma, "usr_a", "dev")).toBe(true);
    expect(prisma.authTrustedDevice.update.mock.calls[0][0].where).toEqual({ id: "row1" });
    expect(prisma.authTrustedDevice.update.mock.calls[0][0].data.lastSeenAt).toBeInstanceOf(Date);
  });
});
