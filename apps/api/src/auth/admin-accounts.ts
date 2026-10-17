import type { Prisma } from "@prisma/client";
import { newAccountId, normalizeEmail } from "./ids.js";

/**
 * wbmsg mode: finds the auth account for an email or creates one that must set its
 * password (via Forgot password) before first sign-in. Never stores a password.
 * Runs on a transaction client so the account and the users row commit together.
 */
export async function ensureSuperAdminAccount(
  tx: Prisma.TransactionClient,
  input: { email: string; firstName: string; lastName: string },
): Promise<{ id: string; created: boolean }> {
  const email = normalizeEmail(input.email);
  const existing = await tx.authAccount.findUnique({ where: { email }, select: { id: true } });
  if (existing) return { id: existing.id, created: false };
  const id = newAccountId();
  await tx.authAccount.create({
    data: {
      id,
      email,
      firstName: input.firstName,
      lastName: input.lastName,
      emailVerifiedAt: new Date(),
      mustSetPassword: true,
    },
  });
  return { id, created: true };
}
