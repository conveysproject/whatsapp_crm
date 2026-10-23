import type { PrismaClient } from "@prisma/client";
import { brandAndOrgForAccountEmail } from "../lib/email-brand.js";
import { sendOrgMail } from "../lib/email/org-mail.js";
import { sendCodeEmail, sendPasswordChangedEmail, type MailDeliver } from "./emails.js";
import type { CodePurpose } from "./codes.js";

// A known account sends through its organization's provider when one applies (sendOrgMail); otherwise that is
// the same default call as before.
const orgDeliver =
  (prisma: PrismaClient, orgId: string): MailDeliver =>
  (m) =>
    sendOrgMail(prisma, { orgId, ...m });

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
  const { brand, orgId } = await brandAndOrgForAccountEmail(prisma, to);
  // Unknown account: the call is identical to the unbranded one (default sender, default path).
  if (!orgId) return sendCodeEmail(to, purpose, code, ...(lead === undefined ? [] : [lead]));
  return sendCodeEmail(to, purpose, code, lead, brand.isDefault ? undefined : brand, orgDeliver(prisma, orgId));
}

export async function sendPasswordChangedToAccount(prisma: PrismaClient, to: string): Promise<void> {
  const { brand, orgId } = await brandAndOrgForAccountEmail(prisma, to);
  if (!orgId) return sendPasswordChangedEmail(to);
  return sendPasswordChangedEmail(to, brand.isDefault ? undefined : brand, orgDeliver(prisma, orgId));
}
