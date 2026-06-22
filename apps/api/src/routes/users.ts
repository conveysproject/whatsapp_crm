import type { FastifyPluginAsync } from "fastify";
import type { Role } from "@prisma/client";
import { redis } from "../lib/redis.js";

function invalidateAuthCache(userId: string): Promise<number> {
  return redis.del(`auth:user:${userId}`);
}

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
      if (request.auth.role !== "admin") {
        return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Only admins can change roles" } });
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
      if (request.auth.role !== "admin") {
        return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Only admins can remove users" } });
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
      if (role !== "admin") {
        return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Only admins can update permissions" } });
      }
      const member = await fastify.prisma.organizationMember.findFirst({
        where: { userId: request.params.id, organizationId },
      });
      if (!member) return reply.status(404).send({ error: "Team member not found" });
      const data = await fastify.prisma.organizationMember.update({
        where: { id: member.id },
        data: { permissions: request.body.permissions },
      });
      await invalidateAuthCache(request.params.id);
      return reply.send({ data });
    }
  );
};
