import type { Prisma } from "@prisma/client";

/** Row lock on the auth account for the rest of the transaction (serializes method add/remove checks). */
export async function lockAccount(tx: Prisma.TransactionClient, accountId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM auth_accounts WHERE id = ${accountId} FOR UPDATE`;
}
