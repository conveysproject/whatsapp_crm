import type { FastifyPluginAsync } from "fastify";
import { canAccessSub } from "../lib/permissions.js";
import { invalidateAuthCache } from "../lib/auth-cache.js";
import { grantableRoles } from "../lib/role-grants.js";

interface MemberInput { userId: string; teamRole: "lead" | "member" }

// Same rule as invites/role changes: never move someone whose role you couldn't grant
// (e.g. a manager adding, removing or re-ranking an admin). See lib/role-grants.ts.
const PROTECTED_MEMBER = { error: { code: "ROLE_NOT_GRANTABLE", message: "You cannot move a member with a higher role than your own" } };

function outranks(actorRole: string, targetRole: string): boolean {
  return !grantableRoles(actorRole).includes(targetRole);
}

function requireTeamsPerm(request: { auth: { role: string; permissions: Record<string, string> } }): boolean {
  return canAccessSub(request.auth.role, request.auth.permissions, "settings_access", "settings_teams");
}

export const teamsRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/teams", async (request, reply) => {
    const { organizationId } = request.auth;
    const teams = await fastify.prisma.team.findMany({
      where: { organizationId },
      select: {
        id: true, name: true, description: true, viewAllContacts: true,
        members: { select: { id: true, fullName: true, email: true, role: true, teamRole: true } },
      },
      orderBy: { name: "asc" },
    });
    return reply.send({ data: teams });
  });

  fastify.post<{ Body: { name: string; members: MemberInput[]; viewAllContacts?: boolean } }>(
    "/teams",
    {
      schema: {
        body: {
          type: "object",
          required: ["name", "members"],
          properties: {
            name: { type: "string", minLength: 1 },
            viewAllContacts: { type: "boolean" },
            members: {
              type: "array",
              items: {
                type: "object",
                required: ["userId", "teamRole"],
                properties: {
                  userId: { type: "string" },
                  teamRole: { type: "string", enum: ["lead", "member"] },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      if (!requireTeamsPerm(request)) {
        return reply.status(403).send({ error: { code: "FORBIDDEN", message: "settings_teams permission required" } });
      }
      const { organizationId } = request.auth;
      const { name, members, viewAllContacts } = request.body;

      if (!members.some((m) => m.teamRole === "lead")) {
        return reply.status(400).send({ error: { code: "NO_LEAD", message: "A team must have at least one Lead" } });
      }

      const dup = await fastify.prisma.team.findFirst({ where: { organizationId, name }, select: { id: true } });
      if (dup) {
        return reply.status(409).send({ error: { code: "DUPLICATE_NAME", message: "A team with this name already exists" } });
      }

      const ids = members.map((m) => m.userId);
      const orgUsers = await fastify.prisma.user.findMany({ where: { organizationId, id: { in: ids } }, select: { id: true, role: true } });
      if (orgUsers.length !== ids.length) {
        return reply.status(400).send({ error: { code: "INVALID_MEMBER", message: "All members must belong to this organization" } });
      }
      if (orgUsers.some((u) => outranks(request.auth.role, u.role))) {
        return reply.status(403).send(PROTECTED_MEMBER);
      }

      const team = await fastify.prisma.team.create({
        data: { organizationId, name, viewAllContacts: viewAllContacts ?? false },
      });

      await fastify.prisma.$transaction(
        members.map((m) => fastify.prisma.user.update({ where: { id: m.userId, organizationId }, data: { teamId: team.id, teamRole: m.teamRole } })),
      );
      await Promise.all(members.map((m) => invalidateAuthCache(m.userId)));

      return reply.status(201).send({ data: { id: team.id } });
    },
  );

  fastify.patch<{ Params: { id: string }; Body: { name?: string; members?: MemberInput[]; viewAllContacts?: boolean } }>(
    "/teams/:id",
    async (request, reply) => {
      if (!requireTeamsPerm(request)) {
        return reply.status(403).send({ error: { code: "FORBIDDEN", message: "settings_teams permission required" } });
      }
      const { organizationId } = request.auth;
      const team = await fastify.prisma.team.findFirst({
        where: { id: request.params.id, organizationId },
        select: { id: true },
      });
      if (!team) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Team not found" } });
      }

      const { name, members, viewAllContacts } = request.body;

      if (members && !members.some((m) => m.teamRole === "lead")) {
        return reply.status(400).send({ error: { code: "NO_LEAD", message: "A team must have at least one Lead" } });
      }

      // Validate member org-membership BEFORE any write.
      let memberIds: string[] | undefined;
      let evicted: { id: string }[] = [];
      if (members) {
        memberIds = members.map((m) => m.userId);
        const orgUsers = await fastify.prisma.user.findMany({
          where: { organizationId, id: { in: memberIds } },
          select: { id: true, role: true, teamId: true, teamRole: true },
        });
        if (orgUsers.length !== memberIds.length) {
          return reply.status(400).send({ error: { code: "INVALID_MEMBER", message: "All members must belong to this organization" } });
        }
        // Capture evictees now (before any write) so protected ones block the whole edit.
        const evictees = await fastify.prisma.user.findMany({
          where: { organizationId, teamId: team.id, id: { notIn: memberIds } },
          select: { id: true, role: true },
        });
        const byId = new Map(orgUsers.map((u) => [u.id, u]));
        const changesProtected =
          evictees.some((u) => outranks(request.auth.role, u.role)) ||
          members.some((m) => {
            const u = byId.get(m.userId)!;
            return outranks(request.auth.role, u.role) && (u.teamId !== team.id || u.teamRole !== m.teamRole);
          });
        if (changesProtected) return reply.status(403).send(PROTECTED_MEMBER);
        evicted = evictees;
      }

      // All validation passed — now write.
      if (name !== undefined || viewAllContacts !== undefined) {
        await fastify.prisma.team.update({
          where: { id: team.id },
          data: {
            ...(name !== undefined ? { name } : {}),
            ...(viewAllContacts !== undefined ? { viewAllContacts } : {}),
          },
        });
      }

      if (members && memberIds) {
        // Drop members no longer listed, then upsert the listed ones.
        await fastify.prisma.user.updateMany({
          where: { organizationId, teamId: team.id, id: { notIn: memberIds } },
          data: { teamId: null, teamRole: null },
        });
        await fastify.prisma.$transaction(
          members.map((m) => fastify.prisma.user.update({ where: { id: m.userId, organizationId }, data: { teamId: team.id, teamRole: m.teamRole } })),
        );
        await Promise.all([...evicted.map((u) => u.id), ...memberIds].map((id) => invalidateAuthCache(id)));
      }

      return reply.send({ data: { id: team.id } });
    },
  );

  fastify.delete<{ Params: { id: string } }>("/teams/:id", async (request, reply) => {
    if (!requireTeamsPerm(request)) {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "settings_teams permission required" } });
    }
    const { organizationId } = request.auth;
    const team = await fastify.prisma.team.findFirst({
      where: { id: request.params.id, organizationId },
      select: { id: true },
    });
    if (!team) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Team not found" } });
    }

    const affected = await fastify.prisma.user.findMany({
      where: { organizationId, teamId: team.id },
      select: { id: true, role: true },
    });
    if (affected.some((u) => outranks(request.auth.role, u.role))) {
      return reply.status(403).send(PROTECTED_MEMBER);
    }
    await fastify.prisma.user.updateMany({
      where: { organizationId, teamId: team.id },
      data: { teamId: null, teamRole: null },
    });
    await fastify.prisma.team.delete({ where: { id: team.id } });
    await Promise.all(affected.map((u) => invalidateAuthCache(u.id)));

    return reply.status(204).send();
  });
};
