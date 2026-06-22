import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../lib/prisma.js";
import type { Role } from "@prisma/client";
import { checkPlanLimit } from "../lib/plan-limits.js";

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
      // GAP-S50: reject disposable/temporary email addresses
      try {
        const check = await fetch(`https://disposable.debounce.io/?email=${encodeURIComponent(request.body.email)}`, { signal: AbortSignal.timeout(10000) });
        if (check.ok) {
          const result = await check.json() as { disposable?: string };
          if (result.disposable !== "false") {
            return reply.status(422).send({ error: { code: "DISPOSABLE_EMAIL", message: "Disposable email addresses are not allowed" } });
          }
        }
      } catch { /* treat external failure as pass — don't block invite on API outage */ }
      const limitCheck = await checkPlanLimit(prisma, request.auth.organizationId, "team_members");
      if (!limitCheck.allowed) {
        return reply.status(402).send({ error: { code: "PLAN_LIMIT_REACHED", message: `Team member limit of ${limitCheck.limit} reached` } });
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

      // Email is sent by the web app (Vercel) after this response —
      // Railway cannot reach GoDaddy SMTP directly.
      return reply.status(201).send({ data: invitation });
    }
  );

  fastify.get<{ Params: { token: string } }>(
    "/invitations/:token",
    {
      config: { public: true },
      schema: {
        params: { type: "object", properties: { token: { type: "string" } }, required: ["token"] },
      },
    },
    async (request, reply) => {
      const invitation = await prisma.invitation.findUnique({
        where: { token: request.params.token, status: "pending" },
        select: { email: true, role: true, expiresAt: true },
      });
      if (!invitation || invitation.expiresAt < new Date()) {
        return reply.status(404).send({ error: { code: "INVALID_TOKEN", message: "Invitation not found or expired" } });
      }
      return reply.send({ data: invitation });
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
