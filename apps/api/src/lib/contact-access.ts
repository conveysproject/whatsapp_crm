import type { PrismaClient } from "@prisma/client";
import { buildVisibilityWhere, type VisibilityAuth } from "./visibility.js";
import type { AuthContext } from "../types/fastify.js";

// Prisma `where` fragment limiting contacts to what the caller may see (undefined = all).
// Shared by the contacts routes and global search.
export async function contactVisibilityWhere(
  prisma: PrismaClient,
  auth: AuthContext,
): Promise<Record<string, unknown> | undefined> {
  // Org-wide roles short-circuit before any team lookup.
  if (auth.role === "superAdmin" || auth.role === "admin" || auth.role === "viewer") return undefined;
  let teamViewAll = false;
  let teamMemberIds: string[] = [];
  if (auth.teamId) {
    const [team, members] = await Promise.all([
      prisma.team.findFirst({ where: { id: auth.teamId, organizationId: auth.organizationId }, select: { viewAllContacts: true } }),
      prisma.user.findMany({ where: { organizationId: auth.organizationId, teamId: auth.teamId }, select: { id: true } }),
    ]);
    teamViewAll = team?.viewAllContacts ?? false;
    teamMemberIds = members.map((m) => m.id);
  }
  const va: VisibilityAuth = {
    userId: auth.userId, role: auth.role, teamId: auth.teamId, teamRole: auth.teamRole, teamViewAll,
  };
  return buildVisibilityWhere(va, teamMemberIds, "assignedUserId");
}
