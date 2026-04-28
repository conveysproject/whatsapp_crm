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
};
