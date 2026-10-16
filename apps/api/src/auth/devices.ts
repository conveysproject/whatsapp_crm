import { createHash, randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

const TRUST_TTL_MS = 90 * 24 * 3600_000;

type Db = Pick<PrismaClient, "authTrustedDevice">;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** True only for a non-expired trusted-device row of this account; refreshes lastSeenAt. */
export async function isTrustedDevice(
  prisma: Db,
  accountId: string,
  deviceId: string | undefined,
): Promise<boolean> {
  if (!deviceId) return false;
  const row = await prisma.authTrustedDevice.findFirst({
    where: { accountId, deviceIdHash: sha256(deviceId), expiresAt: { gt: new Date() } },
    select: { id: true },
  });
  if (!row) return false;
  await prisma.authTrustedDevice.update({ where: { id: row.id }, data: { lastSeenAt: new Date() } });
  return true;
}

/** Trust a new device for 90 days. Returns the plaintext deviceId; only its hash is stored. */
export async function trustDevice(prisma: Db, accountId: string): Promise<string> {
  const deviceId = randomBytes(32).toString("base64url");
  await prisma.authTrustedDevice.create({
    data: { accountId, deviceIdHash: sha256(deviceId), expiresAt: new Date(Date.now() + TRUST_TTL_MS) },
  });
  return deviceId;
}
