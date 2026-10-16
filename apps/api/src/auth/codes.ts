import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { normalizeEmail } from "./ids.js";

export type CodePurpose =
  | "email_verify"
  | "signin_email"
  | "signin_whatsapp"
  | "new_device"
  | "password_reset"
  | "phone_verify";

export type VerifyResult =
  | { ok: true; accountId: string | null; target: string }
  | { ok: false; reason: "invalid" | "expired" | "too_many_attempts" };

const CODE_TTL_MS = 600_000;
const MAX_ATTEMPTS = 5;
const THROTTLE_MAX = 3;
const THROTTLE_WINDOW_MS = 600_000;

type Db = Pick<PrismaClient, "authCode">;

function pepper(): string {
  const p = process.env["AUTH_CODE_PEPPER"];
  if (!p || Buffer.byteLength(p) < 32) {
    throw new Error("AUTH_CODE_PEPPER is missing or shorter than 32 bytes");
  }
  return p;
}

const PHONE_PURPOSES: ReadonlySet<CodePurpose> = new Set(["signin_whatsapp", "phone_verify"]);

function canonicalTarget(purpose: CodePurpose, target: string): string {
  return PHONE_PURPOSES.has(purpose) ? target.trim() : normalizeEmail(target);
}

function hashCode(purpose: string, target: string, code: string): string {
  return createHmac("sha256", pepper()).update(`${purpose}:${target}:${code}`).digest("hex");
}

export async function issueCode(
  prisma: Db,
  input: { purpose: CodePurpose; target: string; accountId?: string },
): Promise<{ code: string; codeId: string } | { error: "throttled" }> {
  pepper(); // fail fast on bad config
  const { purpose } = input;
  const target = canonicalTarget(purpose, input.target);
  const now = Date.now();

  const recent = await prisma.authCode.count({
    where: { purpose, target, createdAt: { gte: new Date(now - THROTTLE_WINDOW_MS) } },
  });
  if (recent >= THROTTLE_MAX) return { error: "throttled" };

  await prisma.authCode.updateMany({
    where: { purpose, target, consumedAt: null },
    data: { consumedAt: new Date(now) },
  });

  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const row = await prisma.authCode.create({
    data: {
      purpose,
      target,
      accountId: input.accountId ?? null,
      codeHash: hashCode(purpose, target, code),
      expiresAt: new Date(now + CODE_TTL_MS),
    },
  });
  return { code, codeId: row.id };
}

type CodeRow = {
  id: string;
  accountId: string | null;
  purpose: string;
  target: string;
  codeHash: string;
  attempts: number;
  expiresAt: Date;
  consumedAt: Date | null;
};

async function check(prisma: Db, row: CodeRow | null, code: string): Promise<VerifyResult> {
  if (!row || row.consumedAt) return { ok: false, reason: "invalid" };
  if (row.attempts >= MAX_ATTEMPTS) return { ok: false, reason: "too_many_attempts" };
  if (row.expiresAt.getTime() <= Date.now()) return { ok: false, reason: "expired" };

  // Count the attempt first (atomic guard on the cap) so concurrent guesses cannot exceed it.
  const claimed = await prisma.authCode.updateMany({
    where: { id: row.id, consumedAt: null, attempts: { lt: MAX_ATTEMPTS } },
    data: { attempts: { increment: 1 } },
  });
  if (claimed.count !== 1) return { ok: false, reason: "too_many_attempts" };

  const expected = Buffer.from(row.codeHash, "hex");
  const actual = Buffer.from(hashCode(row.purpose, row.target, code), "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return { ok: false, reason: "invalid" };
  }

  const consumed = await prisma.authCode.updateMany({
    where: { id: row.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (consumed.count !== 1) return { ok: false, reason: "invalid" };
  return { ok: true, accountId: row.accountId, target: row.target };
}

export async function verifyCode(
  prisma: Db,
  input: { purpose: CodePurpose; target: string; code: string },
): Promise<VerifyResult> {
  const row = await prisma.authCode.findFirst({
    where: { purpose: input.purpose, target: canonicalTarget(input.purpose, input.target), consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  return check(prisma, row, input.code);
}

export async function verifyCodeById(
  prisma: Db,
  input: { codeId: string; purpose: CodePurpose; code: string },
): Promise<VerifyResult> {
  const row = await prisma.authCode.findUnique({ where: { id: input.codeId } });
  if (!row || row.purpose !== input.purpose) return { ok: false, reason: "invalid" };
  return check(prisma, row, input.code);
}
