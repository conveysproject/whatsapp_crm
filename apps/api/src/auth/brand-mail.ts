import type { PrismaClient } from "@prisma/client";
import { brandForAccountEmail } from "../lib/email-brand.js";
import { sendCodeEmail, sendPasswordChangedEmail } from "./emails.js";
import type { CodePurpose } from "./codes.js";

// These run inside the already-background email work, never before the HTTP response, so the brand lookup
// adds no timing or response difference between known and unknown addresses. An unknown address resolves to
// the default brand and is mailed exactly as before (the call below is then identical to the unbranded one).

export async function sendCodeEmailToAccount(
  prisma: PrismaClient,
  to: string,
  purpose: CodePurpose,
  code: string,
  lead?: string,
): Promise<void> {
  const brand = await brandForAccountEmail(prisma, to);
  if (brand.isDefault) return sendCodeEmail(to, purpose, code, ...(lead === undefined ? [] : [lead]));
  return sendCodeEmail(to, purpose, code, lead, brand);
}

export async function sendPasswordChangedToAccount(prisma: PrismaClient, to: string): Promise<void> {
  const brand = await brandForAccountEmail(prisma, to);
  if (brand.isDefault) return sendPasswordChangedEmail(to);
  return sendPasswordChangedEmail(to, brand);
}
