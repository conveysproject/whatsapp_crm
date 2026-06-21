import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../lib/prisma.js";
import type { Role } from "@prisma/client";
import { checkPlanLimit } from "../lib/plan-limits.js";
import { sendMail } from "../lib/mail.js";

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
      const webUrl = process.env["WEB_URL"] ?? "https://wbmsg.com";
      const acceptUrl = `${webUrl}/invitations/${invitation.token}/accept`;
      void sendMail({
        to: invitation.email,
        subject: "You've been invited to join WBMSG",
        html: `
          <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px">
            <h2 style="margin:0 0 8px;color:#111827;font-size:20px">You've been invited</h2>
            <p style="margin:0 0 24px;color:#6b7280;font-size:14px">
              You've been invited to join as <strong>${invitation.role}</strong>.
              Click the button below to create your account and join the team.
            </p>
            <a href="${acceptUrl}"
               style="display:inline-block;background:#059669;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600">
              Accept Invitation
            </a>
            <p style="margin:24px 0 0;color:#9ca3af;font-size:12px">
              This invitation expires in 7 days. If you didn't expect this, you can ignore this email.
            </p>
          </div>
        `,
      }).then(() => {
        fastify.log.info({ to: invitation.email }, "Invitation email sent");
      }).catch((err: unknown) => fastify.log.error({ err, to: invitation.email }, "Failed to send invitation email"));

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
