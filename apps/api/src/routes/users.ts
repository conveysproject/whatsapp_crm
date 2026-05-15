import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../lib/prisma.js";
import type { Role } from "@prisma/client";

export const userRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/users", async (request) => {
    const users = await prisma.user.findMany({
      where: { organizationId: request.auth.organizationId, isActive: true },
      select: { id: true, email: true, fullName: true, role: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    return { data: users };
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
      const user = await prisma.user.update({
        where: { id: request.params.id, organizationId: request.auth.organizationId },
        data: { role: request.body.role },
        select: { id: true, email: true, role: true },
      });
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
      await prisma.user.update({
        where: { id: request.params.id, organizationId: request.auth.organizationId },
        data: { isActive: false },
      });
      return reply.status(204).send();
    }
  );

  fastify.post<{ Body: { pushToken: string } }>("/users/push-token", async (request, reply) => {
    const { pushToken } = request.body;
    await fastify.prisma.user.update({
      where: { id: request.auth.userId },
      data: { pushToken },
    });
    return reply.status(204).send();
  });

  // Mobile Expo device token registration
  fastify.post<{ Body: { token: string; platform?: string } }>("/users/device-token", async (request, reply) => {
    const { token, platform } = request.body;
    if (!token) return reply.status(400).send({ error: { code: "MISSING_TOKEN", message: "token is required" } });
    await fastify.prisma.user.update({
      where: { id: request.auth.userId },
      data: { pushToken: token },
    });
    void platform; // stored on User for now; no separate device table needed
    return reply.send({ data: { registered: true } });
  });

  // Auth login log — called from Clerk webhook on session.created
  fastify.post<{ Body: { userId: string; orgId?: string; ipAddress?: string; userAgent?: string; success?: boolean } }>(
    "/auth/login-log",
    async (request, reply) => {
      const { userId, orgId, ipAddress, userAgent, success = true } = request.body;
      if (!userId) return reply.status(400).send({ error: { code: "MISSING_USER_ID", message: "userId is required" } });
      const entry = await fastify.prisma.loginLog.create({
        data: { userId, orgId: orgId ?? null, ipAddress: ipAddress ?? null, userAgent: userAgent ?? null, success },
      });
      return reply.status(201).send({ data: { id: entry.id } });
    }
  );

  fastify.put<{ Params: { id: string }; Body: { permissions: Record<string, string> } }>(
    "/users/:id/permissions",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const member = await fastify.prisma.organizationMember.findFirst({
        where: { userId: request.params.id, organizationId },
      });
      if (!member) return reply.status(404).send({ error: "Team member not found" });
      const data = await fastify.prisma.organizationMember.update({
        where: { id: member.id },
        data: { permissions: request.body.permissions },
      });
      return reply.send({ data });
    }
  );
};
