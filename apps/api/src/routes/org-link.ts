import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../lib/prisma.js";
import { getParentOf, parentOrgsEnabled, ParentLinkError, unlinkChild } from "../lib/parent-orgs.js";

const SESSION_LIMIT = 50;

const notFound = (reply: FastifyReply) =>
  reply.status(404).send({ error: { code: "NOT_FOUND", message: "Not found" } });

/** Flag first (404), then child-admin only. Both routes live under impersonation-guard blocked prefixes. */
async function childAdminGuard(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply | undefined> {
  if (!parentOrgsEnabled()) return notFound(reply);
  if (request.auth.role !== "admin") {
    return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Only an organization admin can do this" } });
  }
  return undefined;
}

export const orgLinkRoutes: FastifyPluginAsync = async (fastify) => {
  // Who is my parent, and when did parent users open my account. Name only: never the parent's id,
  // settings, tokens or users, and never a session's token, ip, user agent or elevation reason.
  fastify.get("/organization/parent-link", { preHandler: childAdminGuard }, async (request, reply) => {
    const organizationId = request.auth.organizationId;
    const parent = await getParentOf(prisma, organizationId);
    const logs = await prisma.impersonationLog.findMany({
      where: { organizationId, actorOrganizationId: { not: null } },
      orderBy: { startedAt: "desc" },
      take: SESSION_LIMIT,
      select: { id: true, actorId: true, startedAt: true, endedAt: true, mode: true },
    });
    const actorIds = [...new Set(logs.map((l) => l.actorId))];
    const actors = actorIds.length
      ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, fullName: true } })
      : [];
    const names = new Map(actors.map((u) => [u.id, u.fullName]));
    return reply.send({
      data: {
        parent: parent ? { name: parent.name } : null,
        sessions: logs.map((l) => ({
          id: l.id,
          startedAt: l.startedAt,
          endedAt: l.endedAt,
          mode: l.mode,
          actorName: names.get(l.actorId) || "Parent user",
        })),
      },
    });
  });

  fastify.post("/organization/leave-parent", { preHandler: childAdminGuard }, async (request, reply) => {
    try {
      await unlinkChild(prisma, request.auth.organizationId, "child", request.auth.userId);
    } catch (err) {
      if (err instanceof ParentLinkError) {
        if (err.code === "NOT_A_CHILD") {
          return reply.status(409).send({ error: { code: "NOT_LINKED", message: "This organization has no parent account." } });
        }
        if (err.code === "ORG_NOT_FOUND") return notFound(reply);
      }
      throw err;
    }
    return reply.send({ data: { left: true } });
  });
};
