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
  const existing = await tx.authAccount.findUnique({ where: { email }, select: { id: true, emailVerifiedAt: true } });
  if (existing) {
    // Promoting an existing account: drop any password it had, so the operator must set one via Forgot password.
    await tx.authAccount.update({
      where: { id: existing.id },
      data: {
        passwordHash: null,
        mustSetPassword: true,
        emailVerifiedAt: existing.emailVerifiedAt ?? new Date(),
        status: "active",
      },
    });
    return { id: existing.id, created: false };
  }
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

export function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "P2002";
}

/** Thrown inside the transaction when a users row already exists for the account, so nothing is committed. */
export class SuperAdminConflictError extends Error {}

/** Call before ensureSuperAdminAccount: throws if the email's existing account already has a users row. */
export async function assertNoUserForEmail(tx: Prisma.TransactionClient, rawEmail: string): Promise<void> {
  const account = await tx.authAccount.findUnique({ where: { email: normalizeEmail(rawEmail) }, select: { id: true } });
  if (!account) return;
  const clash = await tx.user.findUnique({ where: { id: account.id }, select: { id: true } });
  if (clash) throw new SuperAdminConflictError();
}
