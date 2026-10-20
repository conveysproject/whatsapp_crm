import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../lib/prisma.js";
import { canAccess } from "../lib/permissions.js";
import { canBeParent, linkChild, parentOrgsEnabled, ParentLinkError } from "../lib/parent-orgs.js";
import { createWorkspace } from "../lib/create-workspace.js";
import { verifyBearer } from "../auth/identity.js";
import { normalizeEmail } from "../auth/ids.js";
import { sendMail, isEmailConfigured } from "../lib/mail.js";
import {
  buildClientInvitationEmail,
  clientInvitationAcceptUrl,
  CLIENT_INVITATION_SUBJECT,
} from "../lib/invitation-email.js";

class InvitationGone extends Error {}

const notFound = (reply: FastifyReply) =>
  reply.status(404).send({ error: { code: "NOT_FOUND", message: "Not found" } });
const invalidToken404 = (reply: FastifyReply) =>
  reply.status(404).send({ error: { code: "INVALID_TOKEN", message: "Invitation not found or expired" } });

/** Flag, permission and parent-capability gate for the parent-side (authenticated) routes. */
async function parentGuard(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply | undefined> {
  if (!parentOrgsEnabled()) return notFound(reply);
  const { role, permissions, organizationId } = request.auth;
  if (!canAccess(role, permissions, "parent_access")) {
    return reply.status(403).send({ error: { code: "FORBIDDEN", message: "parent_access permission required" } });
  }
  if (!(await canBeParent(prisma, organizationId))) {
    return reply
      .status(403)
      .send({ error: { code: "NOT_A_PARENT", message: "This organization cannot invite client accounts." } });
  }
  return undefined;
}

const tokenParams = { type: "object", properties: { token: { type: "string" } }, required: ["token"] } as const;

export const clientInvitationRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: { email: string } }>(
    "/client-invitations",
    {
      config: { rateLimit: { hook: "preHandler", max: 30, timeWindow: "1 hour", keyGenerator: (req) => `invite:${req.auth?.organizationId ?? req.ip}` } },
      preHandler: parentGuard,
      schema: {
        body: {
          type: "object",
          required: ["email"],
          properties: { email: { type: "string", format: "email" } },
        },
      },
    },
    async (request, reply) => {
      const parentOrganizationId = request.auth.organizationId;
      const email = normalizeEmail(request.body.email);

      if (await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true } })) {
        return reply
          .status(409)
          .send({ error: { code: "ALREADY_REGISTERED", message: "This email already has an account." } });
      }
      const existing = await prisma.clientInvitation.findFirst({
        where: { parentOrganizationId, email, status: "pending", expiresAt: { gt: new Date() } },
        select: { id: true },
      });
      if (existing) {
        return reply
          .status(409)
          .send({ error: { code: "INVITE_EXISTS", message: "A pending invitation for this email already exists." } });
      }

      const invitation = await prisma.clientInvitation.create({
        data: {
          parentOrganizationId,
          email,
          token: randomUUID(),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          createdBy: request.auth.userId,
        },
      });
      const parent = await prisma.organization.findUnique({ where: { id: parentOrganizationId }, select: { name: true } });

      let emailSent = false;
      try {
        if (isEmailConfigured()) {
          await sendMail({
            to: invitation.email,
            subject: CLIENT_INVITATION_SUBJECT,
            html: buildClientInvitationEmail({
              parentName: parent?.name ?? "A WBMSG customer",
              acceptUrl: clientInvitationAcceptUrl(invitation.token),
            }),
          });
          emailSent = true;
        } else {
          request.log.warn("client invitation email skipped: mail not configured");
        }
      } catch (err) {
        request.log.error({ err }, "client invitation email failed");
      }
      // The token only travels by email; never return it to the caller.
      const { token: _token, ...data } = invitation;
      return reply.status(201).send({ data, emailSent });
    },
  );

  fastify.get("/client-invitations", { preHandler: parentGuard }, async (request, reply) => {
    const rows = await prisma.clientInvitation.findMany({
      where: { parentOrganizationId: request.auth.organizationId },
      select: { id: true, email: true, status: true, expiresAt: true, createdAt: true, acceptedOrgId: true },
      orderBy: { createdAt: "desc" },
    });
    const now = new Date();
    return reply.send({
      data: rows.map((r) => ({ ...r, status: r.status === "pending" && r.expiresAt < now ? "expired" : r.status })),
    });
  });

  fastify.delete<{ Params: { id: string } }>(
    "/client-invitations/:id",
    {
      preHandler: parentGuard,
      schema: { params: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
    },
    async (request, reply) => {
      const r = await prisma.clientInvitation.updateMany({
        where: { id: request.params.id, parentOrganizationId: request.auth.organizationId, status: "pending" },
        data: { status: "revoked" },
      });
      if (r.count !== 1) return notFound(reply);
      return reply.status(204).send();
    },
  );

  // Public. Unknown, used, revoked and expired tokens are indistinguishable.
  fastify.get<{ Params: { token: string } }>(
    "/client-invitations/:token",
    { config: { public: true }, schema: { params: tokenParams } },
    async (request, reply) => {
      if (!parentOrgsEnabled()) return notFound(reply);
      const invitation = await prisma.clientInvitation.findUnique({ where: { token: request.params.token } });
      if (!invitation || invitation.status !== "pending" || invitation.expiresAt < new Date()) {
        return invalidToken404(reply);
      }
      const parent = await prisma.organization.findUnique({
        where: { id: invitation.parentOrganizationId },
        select: { name: true },
      });
      if (!parent) return invalidToken404(reply);
      return reply.send({ data: { parentName: parent.name, email: invitation.email } });
    },
  );

  fastify.post<{ Params: { token: string }; Body: { fullName: string; organizationName: string; mobileNumber?: string } }>(
    "/client-invitations/:token/accept",
    {
      config: { public: true },
      schema: {
        params: tokenParams,
        body: {
          type: "object",
          required: ["fullName", "organizationName"],
          properties: {
            fullName: { type: "string", minLength: 1, maxLength: 255 },
            organizationName: { type: "string", minLength: 1, maxLength: 255 },
            mobileNumber: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      if (!parentOrgsEnabled()) return notFound(reply);
      let userId: string;
      try {
        ({ userId } = await verifyBearer(request.headers.authorization));
      } catch {
        return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "Please sign in." } });
      }
      const invalid = () =>
        reply.status(400).send({ error: { code: "INVALID_TOKEN", message: "Invitation is invalid or expired" } });
      const invitation = await prisma.clientInvitation.findUnique({ where: { token: request.params.token } });
      if (!invitation || invitation.status !== "pending" || invitation.expiresAt < new Date()) return invalid();

      const account = await prisma.authAccount.findUnique({ where: { id: userId }, select: { email: true } });
      if (!account || normalizeEmail(account.email) !== normalizeEmail(invitation.email)) {
        return reply
          .status(403)
          .send({ error: { code: "EMAIL_MISMATCH", message: "This invitation was sent to a different email." } });
      }
      const alreadyMember = () =>
        reply.status(409).send({ error: { code: "ALREADY_MEMBER", message: "You already belong to a workspace." } });
      if (await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })) return alreadyMember();

      const { fullName, organizationName, mobileNumber } = request.body;
      try {
        const organizationId = await prisma.$transaction(async (tx) => {
          const { organizationId: childId } = await createWorkspace(tx, {
            userId,
            email: normalizeEmail(account.email),
            fullName,
            business: {
              companyName: organizationName,
              companyWebsite: "",
              companyLocation: "",
              industry: "",
              subCategory: "",
              revenue: "",
            },
          });
          if (mobileNumber) await tx.user.update({ where: { id: userId }, data: { mobileNumber } });
          await linkChild(tx, invitation.parentOrganizationId, childId, userId);
          // Single use: only one of two concurrent accepts can flip pending -> accepted.
          const claimed = await tx.clientInvitation.updateMany({
            where: { id: invitation.id, status: "pending" },
            data: { status: "accepted", acceptedOrgId: childId },
          });
          if (claimed.count !== 1) throw new InvitationGone();
          return childId;
        });
        return reply.status(201).send({ data: { organizationId } });
      } catch (err) {
        if (err instanceof InvitationGone) return invalid();
        if (err instanceof ParentLinkError) {
          return reply.status(409).send({
            error: { code: "PARENT_UNAVAILABLE", message: "The inviting company can no longer accept client accounts." },
          });
        }
        if ((err as { code?: unknown })?.code === "P2002") return alreadyMember();
        throw err;
      }
    },
  );
};
