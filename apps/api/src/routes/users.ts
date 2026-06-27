import type { FastifyPluginAsync } from "fastify";
import type { Role } from "@prisma/client";
import { canAccessSub } from "../lib/permissions.js";
import { invalidateAuthCache } from "../lib/auth-cache.js";

export const userRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/users", async (request) => {
    const users = await fastify.prisma.user.findMany({
      where: { organizationId: request.auth.organizationId, isActive: true },
      select: {
        id: true, email: true, fullName: true, role: true, mobileNumber: true, lastSignInAt: true, createdAt: true,
        memberships: {
          where: { organizationId: request.auth.organizationId },
          select: { permissions: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return {
      data: users.map(({ memberships, ...u }) => ({
        ...u,
        permissions: (memberships[0]?.permissions ?? {}) as Record<string, string>,
      })),
    };
  });

  fastify.get("/users/me", async (request, reply) => {
    const user = await fastify.prisma.user.findFirst({
      where: { id: request.auth.userId, organizationId: request.auth.organizationId, isActive: true },
      select: { id: true, fullName: true, email: true, role: true, organizationId: true, availability: true },
    });
    if (!user) return reply.status(404).send({ error: { code: "USER_NOT_FOUND", message: "User not found" } });
    return { data: { ...user, permissions: request.auth.permissions } };
  });

  fastify.patch<{ Params: { id: string }; Body: { role: Role } }>(
    "/users/:id/role",
    {
      schema: {
        params: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
        body: {
          type: "object",
          properties: { role: { type: "string", enum: ["admin", "manager", "agent", "viewer"] } },
          required: ["role"],
        },
      },
    },
    async (request, reply) => {
      const { role, permissions } = request.auth;
      if (!canAccessSub(role, permissions, "settings_access", "settings_agents")) {
        return reply.status(403).send({ error: { code: "FORBIDDEN", message: "settings_agents permission required" } });
      }
      if (request.params.id === request.auth.userId) {
        return reply.status(400).send({ error: { code: "SELF_MODIFY", message: "Admins cannot change their own role" } });
      }
      const user = await fastify.prisma.user.update({
        where: { id: request.params.id, organizationId: request.auth.organizationId },
        data: { role: request.body.role },
        select: { id: true, email: true, role: true },
      });
      await invalidateAuthCache(request.params.id);
      return { data: user };
    }
  );

  fastify.delete<{ Params: { id: string } }>(
    "/users/:id",
    {
      schema: {
        params: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
      },
    },
    async (request, reply) => {
      const { role, permissions } = request.auth;
      if (!canAccessSub(role, permissions, "settings_access", "settings_agents")) {
        return reply.status(403).send({ error: { code: "FORBIDDEN", message: "settings_agents permission required" } });
      }
      if (request.params.id === request.auth.userId) {
        return reply.status(400).send({ error: { code: "SELF_MODIFY", message: "Admins cannot remove themselves" } });
      }
      await fastify.prisma.user.update({
        where: { id: request.params.id, organizationId: request.auth.organizationId },
        data: { isActive: false },
      });
      await invalidateAuthCache(request.params.id);
      return reply.status(204).send();
    }
  );

  fastify.post<{ Body: { pushToken: string } }>(
    "/users/push-token",
    {
      schema: {
        body: {
          type: "object",
          required: ["pushToken"],
          properties: { pushToken: { type: "string", minLength: 1, maxLength: 512 } },
        },
      },
    },
    async (request, reply) => {
      const { pushToken } = request.body;
      await fastify.prisma.user.update({
        where: { id: request.auth.userId },
        data: { pushToken },
      });
      return reply.status(204).send();
    }
  );

  // Mobile Expo device token registration
  fastify.post<{ Body: { token: string; platform?: string } }>(
    "/users/device-token",
    {
      schema: {
        body: {
          type: "object",
          required: ["token"],
          properties: {
            token: { type: "string", minLength: 1, maxLength: 512 },
            platform: { type: "string", maxLength: 32 },
          },
        },
      },
    },
    async (request, reply) => {
      const { token, platform } = request.body;
      await fastify.prisma.user.update({
        where: { id: request.auth.userId },
        data: { pushToken: token },
      });
      void platform; // stored on User for now; no separate device table needed
      return reply.send({ data: { registered: true } });
    }
  );

  fastify.patch<{ Body: { availability: string } }>(
    "/users/me/availability",
    {
      schema: {
        body: {
          type: "object",
          required: ["availability"],
          properties: {
            availability: { type: "string", enum: ["online", "away"] },
          },
        },
      },
    },
    async (request) => {
      const updated = await fastify.prisma.user.update({
        where: { id: request.auth.userId },
        data: { availability: request.body.availability },
        select: { id: true, availability: true },
      });
      return { data: updated };
    }
  );

  fastify.put<{ Params: { id: string }; Body: { permissions: Record<string, string> } }>(
    "/users/:id/permissions",
    async (request, reply) => {
      const { organizationId, role } = request.auth;
      if (role !== "admin" && role !== "superAdmin") {
        return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Only admins can update permissions" } });
      }

      // The target user must belong to this org.
      const target = await fastify.prisma.user.findFirst({
        where: { id: request.params.id, organizationId },
        select: { id: true, role: true },
      });
      if (!target) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Team member not found" } });
      }

      const data = await fastify.prisma.organizationMember.upsert({
        where: { organizationId_userId: { organizationId, userId: request.params.id } },
        create: {
          organizationId,
          userId: request.params.id,
          role: target.role,
          permissions: request.body.permissions,
        },
        update: { permissions: request.body.permissions },
      });

      await invalidateAuthCache(request.params.id);
      return reply.send({ data });
    }
  );

  fastify.patch<{ Params: { id: string }; Body: { teamId: string | null; teamRole?: "lead" | "member" } }>(
    "/users/:id/team",
    {
      schema: {
        params: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
        body: {
          type: "object",
          required: ["teamId"],
          properties: {
            teamId: { type: ["string", "null"] },
            teamRole: { type: "string", enum: ["lead", "member"] },
          },
        },
      },
    },
    async (request, reply) => {
      const { role, permissions, organizationId } = request.auth;
      if (!canAccessSub(role, permissions, "settings_access", "settings_agents")) {
        return reply.status(403).send({ error: { code: "FORBIDDEN", message: "settings_agents permission required" } });
      }
      const target = await fastify.prisma.user.findFirst({
        where: { id: request.params.id, organizationId },
        select: { id: true, organizationId: true, teamId: true, teamRole: true },
      });
      if (!target) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "User not found" } });

      // If moving a lead out of their current team, ensure another lead remains.
      if (target.teamId && target.teamId !== request.body.teamId && target.teamRole === "lead") {
        const otherLeads = await fastify.prisma.user.count({
          where: { organizationId, teamId: target.teamId, teamRole: "lead", id: { not: target.id } },
        });
        if (otherLeads === 0) {
          return reply.status(400).send({ error: { code: "LAST_LEAD", message: "Assign another Lead before moving this one" } });
        }
      }

      const teamId = request.body.teamId;
      const data = teamId === null
        ? { teamId: null as null, teamRole: null as null }
        : { teamId, teamRole: request.body.teamRole ?? ("member" as const) };
      await fastify.prisma.user.update({ where: { id: target.id }, data });
      await invalidateAuthCache(target.id);
      return reply.send({ data: { id: target.id, ...data } });
    },
  );
};
