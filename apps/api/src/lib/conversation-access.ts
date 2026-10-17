import type { FastifyInstance } from "fastify";
import { buildVisibilityWhere, type VisibilityAuth } from "./visibility.js";
import type { AuthContext } from "../types/fastify.js";

export async function conversationVisibilityWhere(
  prisma: FastifyInstance["prisma"],
  auth: AuthContext,
): Promise<Record<string, unknown> | undefined> {
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
    userId: auth.userId,
    role: auth.role,
    teamId: auth.teamId,
    teamRole: auth.teamRole,
    teamViewAll,
  };
  return buildVisibilityWhere(va, teamMemberIds, "assignedTo");
}

/**
 * Where-clause for any conversation-by-id lookup. Same rule as GET /conversations/:id:
 * agents with assigned_chats_only only reach conversations assigned to them.
 */
export async function conversationAccessWhere(
  prisma: FastifyInstance["prisma"],
  auth: AuthContext,
  id: string,
): Promise<Record<string, unknown>> {
  const base = { id, organizationId: auth.organizationId };
  if (auth.permissions["assigned_chats_only"] === "allow") return { ...base, assignedTo: auth.userId };
  const visWhere = await conversationVisibilityWhere(prisma, auth);
  return { ...base, ...(visWhere ?? {}) };
}

/**
 * Where-fragment for conversation *lists* (and messages via `conversation:`). Same rule as
 * GET /conversations: assigned_chats_only → own chats; otherwise team/role visibility.
 */
export async function conversationListWhere(
  prisma: FastifyInstance["prisma"],
  auth: AuthContext,
): Promise<Record<string, unknown> | undefined> {
  if (auth.permissions["assigned_chats_only"] === "allow") return { assignedTo: auth.userId };
  return conversationVisibilityWhere(prisma, auth);
}
