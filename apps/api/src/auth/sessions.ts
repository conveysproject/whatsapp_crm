import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { redis } from "../lib/redis.js";
import { signAccessToken } from "./tokens.js";

const USER_TTL_MS = 30 * 24 * 3600_000;
const ADMIN_TTL_MS = 12 * 3600_000;
const GRACE_MS = 10_000;
const GRACE_TTL_S = 10;
const REVOKED_TTL_S = 600;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const newRefreshToken = () => randomBytes(32).toString("base64url");
const revokedKey = (sid: string) => `auth:revoked:${sid}`;
const graceKey = (prevToken: string) => `auth:grace:${sha256(prevToken)}`;

// The schema has no typ column: admin sessions are those created with client "admin".
const typOf = (client: string): "user" | "admin" => (client === "admin" ? "admin" : "user");

async function markRevoked(ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) => redis.set(revokedKey(id), "1", "EX", REVOKED_TTL_S)));
}

export async function createSession(
  prisma: PrismaClient,
  input: {
    accountId: string;
    client: "web" | "mobile" | "admin";
    typ: "user" | "admin";
    ip?: string;
    userAgent?: string;
    deviceLabel?: string;
  },
): Promise<{ sessionId: string; refreshToken: string; accessToken: string; expiresAt: Date }> {
  const sessionId = randomUUID();
  const refreshToken = newRefreshToken();
  const now = Date.now();
  const expiresAt = new Date(now + (input.typ === "admin" ? ADMIN_TTL_MS : USER_TTL_MS));
  await prisma.authSession.create({
    data: {
      id: sessionId,
      accountId: input.accountId,
      refreshTokenHash: sha256(refreshToken),
      familyId: randomUUID(),
      client: input.client,
      deviceLabel: input.deviceLabel ?? null,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      expiresAt,
    },
  });
  const accessToken = await signAccessToken({ sub: input.accountId, sid: sessionId, typ: input.typ });
  return { sessionId, refreshToken, accessToken, expiresAt };
}

type Pair = { refreshToken: string; accessToken: string; sessionId: string };

async function readGrace(prevToken: string): Promise<{ refreshToken: string; sessionId: string } | null> {
  const raw = await redis.get(graceKey(prevToken));
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return typeof v.refreshToken === "string" && typeof v.sessionId === "string" ? v : null;
  } catch {
    return null;
  }
}

async function pairFromGrace(accountId: string, client: string, g: { refreshToken: string; sessionId: string }): Promise<Pair> {
  const accessToken = await signAccessToken({ sub: accountId, sid: g.sessionId, typ: typOf(client) });
  return { refreshToken: g.refreshToken, accessToken, sessionId: g.sessionId };
}

async function revokeFamily(prisma: PrismaClient, familyId: string): Promise<void> {
  const rows = await prisma.authSession.findMany({
    where: { familyId, revokedAt: null },
    select: { id: true },
  });
  await prisma.authSession.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: "reuse_detected" },
  });
  await markRevoked(rows.map((r) => r.id));
}

export async function rotateRefreshToken(
  prisma: PrismaClient,
  refreshToken: string,
): Promise<Pair | { error: "invalid" | "reused" | "expired" }> {
  const hash = sha256(refreshToken);
  const now = new Date();

  const current = await prisma.authSession.findUnique({ where: { refreshTokenHash: hash } });
  if (current) {
    if (current.revokedAt) return { error: "invalid" };
    if (current.expiresAt.getTime() <= now.getTime()) return { error: "expired" };

    const next = newRefreshToken();
    const isAdmin = typOf(current.client) === "admin";
    const won = await prisma.$transaction(async (tx) => {
      const res = await tx.authSession.updateMany({
        where: { id: current.id, refreshTokenHash: hash, revokedAt: null },
        data: {
          refreshTokenHash: sha256(next),
          previousTokenHash: hash,
          rotatedAt: now,
          lastUsedAt: now,
          // admin sessions keep their absolute expiry; user sessions slide
          ...(isAdmin ? {} : { expiresAt: new Date(now.getTime() + USER_TTL_MS) }),
        },
      });
      return res.count === 1;
    });

    if (won) {
      await redis.set(
        graceKey(refreshToken),
        JSON.stringify({ refreshToken: next, sessionId: current.id }),
        "EX",
        GRACE_TTL_S,
      );
      const accessToken = await signAccessToken({
        sub: current.accountId,
        sid: current.id,
        typ: typOf(current.client),
      });
      return { refreshToken: next, accessToken, sessionId: current.id };
    }

    // Lost a race with a concurrent rotation: pick up the winner's pair.
    for (let i = 0; i < 5; i++) {
      const g = await readGrace(refreshToken);
      if (g) return pairFromGrace(current.accountId, current.client, g);
      await new Promise((r) => setTimeout(r, 40));
    }
    return { error: "invalid" };
  }

  const prev = await prisma.authSession.findFirst({ where: { previousTokenHash: hash } });
  if (!prev) return { error: "invalid" };
  if (prev.revokedAt) return { error: "invalid" };

  if (prev.rotatedAt && now.getTime() - prev.rotatedAt.getTime() <= GRACE_MS) {
    const g = await readGrace(refreshToken);
    if (g) return pairFromGrace(prev.accountId, prev.client, g);
  }
  await revokeFamily(prisma, prev.familyId);
  return { error: "reused" };
}

export async function revokeSession(prisma: PrismaClient, sessionId: string, reason: string): Promise<void> {
  await prisma.authSession.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
  await markRevoked([sessionId]);
}

export async function revokeAllSessions(
  prisma: PrismaClient,
  accountId: string,
  reason: string,
  exceptSessionId?: string,
): Promise<number> {
  const where = {
    accountId,
    revokedAt: null,
    ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
  };
  const rows = await prisma.authSession.findMany({ where, select: { id: true } });
  const res = await prisma.authSession.updateMany({
    where,
    data: { revokedAt: new Date(), revokedReason: reason },
  });
  await markRevoked(rows.map((r) => r.id));
  return res.count;
}

export async function isSessionRevoked(sessionId: string): Promise<boolean> {
  return (await redis.get(revokedKey(sessionId))) !== null;
}
