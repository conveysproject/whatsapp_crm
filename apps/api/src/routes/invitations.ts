import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../lib/prisma.js";
import type { Role, TeamRole } from "@prisma/client";
import { checkPlanLimit } from "../lib/plan-limits.js";
import { canAccessSub } from "../lib/permissions.js";
import { canGrantRole } from "../lib/role-grants.js";
import { isWbmsgAuth, verifyBearer } from "../auth/identity.js";
import { normalizeEmail } from "../auth/ids.js";

class InvitationGone extends Error {}

/** wbmsg mode: an already signed-in account (no org yet) joins the invited workspace. */
async function acceptSignedIn(
  request: FastifyRequest<{ Params: { token: string }; Body: { fullName: string; mobileNumber?: string } }>,
  reply: FastifyReply,
) {
  let userId: string;
  try {
    ({ userId } = await verifyBearer(request.headers.authorization));
  } catch {
    return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Please sign in." } });
  }
  const invitation = await prisma.invitation.findUnique({ where: { token: request.params.token } });
  if (!invitation || invitation.status !== "pending" || invitation.expiresAt < new Date()) {
    return reply.status(400).send({ error: { code: "INVALID_TOKEN", message: "Invitation is invalid or expired" } });
  }
  const account = await prisma.authAccount.findUnique({ where: { id: userId }, select: { email: true } });
  if (!account || normalizeEmail(account.email) !== normalizeEmail(invitation.email)) {
    return reply
      .status(403)
      .send({ error: { code: "EMAIL_MISMATCH", message: "This invitation was sent to a different email." } });
  }
  if (await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })) {
    return reply
      .status(409)
      .send({ error: { code: "ALREADY_MEMBER", message: "You already belong to a workspace." } });
  }
  const limit = await checkPlanLimit(prisma, invitation.organizationId, "team_members");
  if (!limit.allowed) {
    return reply
      .status(403)
      .send({ error: { code: "SEAT_LIMIT", message: "This workspace has no free seats. Ask your admin." } });
  }
  const { fullName, mobileNumber } = request.body;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.create({
        data: {
          id: userId,
          organizationId: invitation.organizationId,
          email: normalizeEmail(invitation.email),
          fullName,
          role: invitation.role,
          ...(mobileNumber ? { mobileNumber } : {}),
          ...(invitation.teamId ? { teamId: invitation.teamId, teamRole: invitation.teamRole ?? "member" } : {}),
        },
      });
      const claimed = await tx.invitation.updateMany({
        where: { id: invitation.id, status: "pending" },
        data: { status: "accepted" },
      });
      if (claimed.count !== 1) throw new InvitationGone();
    });
  } catch (err) {
    if (err instanceof InvitationGone) {
      return reply.status(400).send({ error: { code: "INVALID_TOKEN", message: "Invitation is invalid or expired" } });
    }
    if ((err as { code?: unknown })?.code === "P2002") {
      return reply
        .status(409)
        .send({ error: { code: "ALREADY_MEMBER", message: "You already belong to a workspace." } });
    }
    throw err;
  }
  return reply.status(201).send({ data: { organizationId: invitation.organizationId } });
}

export const invitationRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: { email: string; role: Role; teamId?: string; teamRole?: TeamRole } }>(
    "/invitations",
    {
      schema: {
        body: {
          type: "object",
          required: ["email", "role"],
          properties: {
            email: { type: "string", format: "email" },
            role: { type: "string", enum: ["admin", "manager", "agent", "viewer", "whatsappAdmin"] },
            teamId: { type: "string" },
            teamRole: { type: "string", enum: ["lead", "member"] },
          },
        },
      },
    },
    async (request, reply) => {
      const { role, permissions } = request.auth;
      if (!canAccessSub(role, permissions, "settings_access", "settings_agents")) {
        return reply.status(403).send({ error: { code: "FORBIDDEN", message: "settings_agents permission required" } });
      }
      if (!canGrantRole(role, request.body.role)) {
        return reply.status(403).send({ error: { code: "ROLE_NOT_GRANTABLE", message: "You cannot invite someone with a higher role than your own" } });
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
          ...(request.body.teamId ? { teamId: request.body.teamId, teamRole: request.body.teamRole ?? "member" } : {}),
        },
        select: { id: true, email: true, role: true, token: true, expiresAt: true },
      });

      // Email is sent by the web app (Vercel) after this response —
      // Railway cannot reach GoDaddy SMTP directly.
      return reply.status(201).send({ data: invitation });
    }
  );

  fastify.get(
    "/invitations/seat-status",
    async (request, reply) => {
      const { allowed, limit, current } = await checkPlanLimit(prisma, request.auth.organizationId, "team_members");
      return reply.send({ data: { used: current, limit, canAdd: allowed } });
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
        select: { email: true, role: true, expiresAt: true, organizationId: true },
      });
      if (!invitation || invitation.expiresAt < new Date()) {
        return reply.status(404).send({ error: { code: "INVALID_TOKEN", message: "Invitation not found or expired" } });
      }
      return reply.send({ data: invitation });
    }
  );

  fastify.post<{ Params: { token: string }; Body: { clerkUserId?: string; fullName: string; mobileNumber?: string } }>(
    "/invitations/:token/accept",
    {
      config: { public: true },
      schema: {
        params: { type: "object", properties: { token: { type: "string" } }, required: ["token"] },
        body: {
          type: "object",
          required: ["fullName"],
          properties: {
            clerkUserId: { type: "string" },
            fullName: { type: "string" },
            mobileNumber: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      if (isWbmsgAuth()) return acceptSignedIn(request, reply);

      if (!request.body.clerkUserId) {
        return reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "body must have required property 'clerkUserId'",
        });
      }
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
            ...(request.body.mobileNumber ? { mobileNumber: request.body.mobileNumber } : {}),
            ...(invitation.teamId ? { teamId: invitation.teamId, teamRole: invitation.teamRole ?? "member" } : {}),
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
