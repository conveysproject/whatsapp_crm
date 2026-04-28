import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../lib/prisma.js";
import type { Role } from "@prisma/client";

export const invitationRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: { email: string; role: Role } }>(
    "/invitations",
    {
      schema: {
        body: {
          type: "object",
          required: ["email", "role"],
          properties: {
            email: { type: "string", format: "email" },
            role: { type: "string", enum: ["admin", "manager", "agent", "viewer"] },
          },
        },
      },
    },
    async (request, reply) => {
      if (request.auth.role !== "admin") {
        return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Only admins can invite members" } });
      }
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const invitation = await prisma.invitation.create({
        data: {
          organizationId: request.auth.organizationId,
          email: request.body.email,
          role: request.body.role,
          expiresAt,
        },
        select: { id: true, email: true, role: true, token: true, expiresAt: true },
      });
      return reply.status(201).send({ data: invitation });
    }
  );

  fastify.post<{ Params: { token: string }; Body: { clerkUserId: string; fullName: string } }>(
    "/invitations/:token/accept",
    {
      config: { public: true },
      schema: {
        params: { type: "object", properties: { token: { type: "string" } }, required: ["token"] },
        body: {
          type: "object",
          required: ["clerkUserId", "fullName"],
          properties: {
            clerkUserId: { type: "string" },
            fullName: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const invitation = await prisma.invitation.findUnique({
        where: { token: request.params.token, status: "pending" },
      });

      if (!invitation || invitation.expiresAt < new Date()) {
        return reply.status(400).send({ error: { code: "INVALID_TOKEN", message: "Invitation is invalid or expired" } });
      }

      await prisma.$transaction([
        prisma.user.create({
          data: {
            id: request.body.clerkUserId,
            organizationId: invitation.organizationId,
            email: invitation.email,
            fullName: request.body.fullName,
            role: invitation.role,
          },
        }),
        prisma.invitation.update({
          where: { id: invitation.id },
          data: { status: "accepted" },
        }),
      ]);

      return reply.status(201).send({ data: { organizationId: invitation.organizationId } });
    }
  );
};
