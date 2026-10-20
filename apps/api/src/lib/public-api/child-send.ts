import type { PrismaClient } from "@prisma/client";
import { canBeParent, getChildOrgIds, parentOrgsEnabled } from "../parent-orgs.js";

export const SEND_FOR_CHILDREN_SCOPE = "send_for_children";
const NUMBER_KEY = "current_phone_number_number";

/**
 * The key may not send for this number. `reason`:
 * - "not_entitled": the key lacks the scope, the feature flag is off or the org cannot be a parent. The route treats
 *   this exactly like today's behaviour (own number only, SRC_MISMATCH on a different src), so the scope stays invisible.
 * - "no_match": an entitled key named a number / WABA that is not exactly one of its own linked children. Unknown,
 *   unlinked, ambiguous and someone else's child are indistinguishable (one 403 body).
 */
export class ChildForbiddenError extends Error {
  constructor(readonly reason: "not_entitled" | "no_match") { super("FORBIDDEN_CHILD"); this.name = "ChildForbiddenError"; }
}

/** The resolved child is not ready to send (not active, or no connected number / token). Maps to 400 WHATSAPP_NOT_CONNECTED. */
export class ChildNotConnectedError extends Error {
  constructor() { super("WHATSAPP_NOT_CONNECTED"); this.name = "ChildNotConnectedError"; }
}

const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

/** Decides which organization a public-API send belongs to (PRD 6.1). Checks the link on every call; nothing is cached. */
export async function resolveSendTarget(
  prisma: PrismaClient,
  key: { id: string; organizationId: string; scopes: string[] },
  input: { src: string; wabaId?: string }
): Promise<{ organizationId: string; viaParentOrgId: string | null }> {
  const src = digits(input.src);
  const wabaId = input.wabaId?.trim() || undefined;

  const own = await prisma.vendorSetting.findFirst({ where: { organizationId: key.organizationId, key: NUMBER_KEY }, select: { value: true } });
  const ownDigits = digits(own?.value);
  if (!wabaId && src !== "" && ownDigits === src) return { organizationId: key.organizationId, viaParentOrgId: null };

  if (!key.scopes.includes(SEND_FOR_CHILDREN_SCOPE) || !parentOrgsEnabled() || !(await canBeParent(prisma, key.organizationId))) {
    throw new ChildForbiddenError("not_entitled");
  }
  if (src === "" && !wabaId) throw new ChildForbiddenError("no_match");

  const childIds = await getChildOrgIds(prisma, key.organizationId);
  if (childIds.length === 0) throw new ChildForbiddenError("no_match");
  const [children, numbers] = await Promise.all([
    prisma.organization.findMany({
      where: { id: { in: childIds }, parentOrganizationId: key.organizationId },
      select: { id: true, status: true, phoneNumberId: true, wabaAccessToken: true, whatsappBusinessAccountId: true },
    }),
    prisma.vendorSetting.findMany({ where: { organizationId: { in: childIds }, key: NUMBER_KEY }, select: { organizationId: true, value: true } }),
  ]);
  const numberOf = new Map(numbers.map((n) => [n.organizationId, digits(n.value)]));

  const matches = children.filter((c) =>
    (src === "" || numberOf.get(c.id) === src) && (!wabaId || c.whatsappBusinessAccountId === wabaId));
  if (matches.length !== 1) throw new ChildForbiddenError("no_match");

  const child = matches[0]!;
  if (child.status !== "active" || !child.phoneNumberId || !child.wabaAccessToken || !numberOf.get(child.id)) throw new ChildNotConnectedError();
  return { organizationId: child.id, viaParentOrgId: key.organizationId };
}
