import type { Prisma, PrismaClient } from "@prisma/client";

export type ParentLinkErrorCode =
  | "PARENT_NOT_ENABLED"
  | "PARENT_HAS_PARENT"
  | "CHILD_ALREADY_LINKED"
  | "CHILD_HAS_CHILDREN"
  | "NOT_A_CHILD"
  | "SELF_LINK"
  | "ORG_NOT_FOUND";

export class ParentLinkError extends Error {
  readonly code: ParentLinkErrorCode;
  constructor(code: ParentLinkErrorCode) {
    super(code);
    this.name = "ParentLinkError";
    this.code = code;
  }
}

export function parentOrgsEnabled(): boolean {
  return process.env["PARENT_ORGS_ENABLED"] === "true";
}

export async function getChildOrgIds(prisma: PrismaClient, parentOrgId: string): Promise<string[]> {
  const rows = await prisma.organization.findMany({
    where: { parentOrganizationId: parentOrgId },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

export async function isChildOf(prisma: PrismaClient, parentOrgId: string, childOrgId: string): Promise<boolean> {
  if (parentOrgId === childOrgId) return false;
  const child = await prisma.organization.findUnique({
    where: { id: childOrgId },
    select: { parentOrganizationId: true },
  });
  return child?.parentOrganizationId === parentOrgId;
}

export async function getParentOf(
  prisma: PrismaClient,
  childOrgId: string
): Promise<{ id: string; name: string } | null> {
  const org = await prisma.organization.findUnique({
    where: { id: childOrgId },
    select: { parentOrganization: { select: { id: true, name: true } } },
  });
  return org?.parentOrganization ?? null;
}

export async function canBeParent(prisma: PrismaClient, orgId: string): Promise<boolean> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { isParent: true, parentOrganizationId: true },
  });
  return !!org && org.isParent && org.parentOrganizationId === null;
}

/**
 * Accepts a PrismaClient (opens its own transaction) or a Prisma.TransactionClient
 * (already inside the caller's transaction, which cannot nest: runs directly on it).
 */
export async function linkChild(
  client: PrismaClient | Prisma.TransactionClient,
  parentOrgId: string,
  childOrgId: string,
  actorUserId: string | null
): Promise<void> {
  if (parentOrgId === childOrgId) throw new ParentLinkError("SELF_LINK");
  const run = async (tx: Prisma.TransactionClient) => {
    // Lock both rows in a stable order so concurrent links/unlinks serialize.
    await tx.$queryRaw`SELECT id FROM organizations WHERE id IN (${parentOrgId}, ${childOrgId}) ORDER BY id FOR UPDATE`;
    const select = { isParent: true, parentOrganizationId: true } as const;
    const parent = await tx.organization.findUnique({ where: { id: parentOrgId }, select });
    const child = await tx.organization.findUnique({ where: { id: childOrgId }, select });
    if (!parent || !child) throw new ParentLinkError("ORG_NOT_FOUND");
    if (!parent.isParent) throw new ParentLinkError("PARENT_NOT_ENABLED");
    if (parent.parentOrganizationId !== null) throw new ParentLinkError("PARENT_HAS_PARENT");
    if (child.parentOrganizationId !== null) throw new ParentLinkError("CHILD_ALREADY_LINKED");
    const grandchildren = await tx.organization.count({ where: { parentOrganizationId: childOrgId } });
    if (grandchildren > 0) throw new ParentLinkError("CHILD_HAS_CHILDREN");

    const r = await tx.organization.updateMany({
      where: { id: childOrgId, parentOrganizationId: null },
      data: { parentOrganizationId: parentOrgId },
    });
    if (r.count !== 1) throw new ParentLinkError("CHILD_ALREADY_LINKED");
    await tx.parentAuditEvent.create({
      data: { parentOrganizationId: parentOrgId, childOrganizationId: childOrgId, actorUserId, action: "linked" },
    });
  };
  if ("$transaction" in client && typeof client.$transaction === "function") {
    await client.$transaction(run);
  } else {
    await run(client as Prisma.TransactionClient);
  }
}

export async function unlinkChild(
  prisma: PrismaClient,
  childOrgId: string,
  by: "parent" | "child",
  actorUserId: string
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${childOrgId} FOR UPDATE`;
    const child = await tx.organization.findUnique({
      where: { id: childOrgId },
      select: { parentOrganizationId: true },
    });
    const parentId = child?.parentOrganizationId;
    if (!parentId) throw new ParentLinkError("NOT_A_CHILD");

    const r = await tx.organization.updateMany({
      where: { id: childOrgId, parentOrganizationId: parentId },
      data: { parentOrganizationId: null },
    });
    if (r.count !== 1) throw new ParentLinkError("NOT_A_CHILD");
    await tx.parentAuditEvent.create({
      data: {
        parentOrganizationId: parentId,
        childOrganizationId: childOrgId,
        actorUserId,
        action: by === "parent" ? "unlinked_by_parent" : "unlinked_by_child",
      },
    });
  });
}
