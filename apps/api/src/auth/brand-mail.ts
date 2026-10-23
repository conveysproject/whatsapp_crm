import type { PrismaClient } from "@prisma/client";
import { brandAndOrgForAccountEmail } from "../lib/email-brand.js";
import { sendOrgMail } from "../lib/email/org-mail.js";
import { sendCodeEmail, sendPasswordChangedEmail, type MailDeliver } from "./emails.js";
import type { CodePurpose } from "./codes.js";

// A parent's own users send through the parent's provider when one applies (sendOrgMail). A CLIENT's sign-in and
// reset codes never do: the parent controls that mail server and could read a code and take over the client's
// account. Those go through our default sender, still carrying the parent's brand. Any lookup failure means the
// default sender too.
const orgDeliver =
  (prisma: PrismaClient, orgId: string): MailDeliver =>
  (m) =>
    sendOrgMail(prisma, { orgId, ...m });

async function deliverFor(prisma: PrismaClient, orgId: string): Promise<MailDeliver | undefined> {
  try {
    const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { parentOrganizationId: true } });
    if (!org || org.parentOrganizationId) return undefined;
    return orgDeliver(prisma, orgId);
  } catch {
    return undefined;
  }
}

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
  return sendCodeEmail(to, purpose, code, lead, brand.isDefault ? undefined : brand, await deliverFor(prisma, orgId));
}

export async function sendPasswordChangedToAccount(prisma: PrismaClient, to: string): Promise<void> {
  const { brand, orgId } = await brandAndOrgForAccountEmail(prisma, to);
  if (!orgId) return sendPasswordChangedEmail(to);
  return sendPasswordChangedEmail(to, brand.isDefault ? undefined : brand, await deliverFor(prisma, orgId));
}
