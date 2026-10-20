import type { FastifyPluginAsync } from "fastify";
import { createWorkspace } from "../../lib/create-workspace.js";
import { canBeParent, linkChild, ParentLinkError } from "../../lib/parent-orgs.js";
import { trustDevice } from "../devices.js";
import { newAccountId, normalizeEmail } from "../ids.js";
import { authClientIp } from "../limits.js";
import { checkPasswordPolicy, hashPassword } from "../password.js";
import { createSession } from "../sessions.js";
import { ACCOUNT_EXISTS, INVALID_INVITATION, isUniqueViolation, padTo, WEAK_PASSWORD } from "./invitations.js";

const PARENT_UNAVAILABLE = {
  error: { code: "PARENT_UNAVAILABLE", message: "The inviting company can no longer accept client accounts." },
};

class InvitationGone extends Error {}

interface ClientAcceptBody {
  firstName: string;
  lastName: string;
  password: string;
  organizationName: string;
  mobileNumber?: string;
  client: "web" | "mobile";
}

/**
 * Client invitation accept for a brand-new person (docs/prd-parent-child-orgs.md D2/D10).
 * Mirrors the team-invite accept (./invitations.ts): public, registered inside the per-IP credential
 * limiter, padded generic failure, no account for the invited email may exist yet. Possession of the
 * emailed token proves the inbox, so the account is created verified. One transaction creates the
 * account, the child org with the invitee as admin, the parent link and the single-use claim.
 * Someone who already has an account signs in and uses POST /v1/client-invitations/:token/accept.
 */
export const clientInvitationAcceptRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Params: { token: string }; Body: ClientAcceptBody }>(
    "/client-invitations/:token/accept",
    {
      config: { public: true },
      schema: {
        params: { type: "object", properties: { token: { type: "string", maxLength: 200 } }, required: ["token"] },
        body: {
          type: "object",
          required: ["firstName", "lastName", "password", "organizationName", "client"],
          properties: {
            firstName: { type: "string", minLength: 1, maxLength: 100 },
            lastName: { type: "string", minLength: 1, maxLength: 100 },
            password: { type: "string" },
            organizationName: { type: "string", minLength: 1, maxLength: 255 },
            mobileNumber: { type: "string", maxLength: 30 },
            client: { type: "string", enum: ["web", "mobile"] },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const startedAt = Date.now();
      const db = fastify.prisma;
      const { firstName, lastName, password, organizationName, mobileNumber, client } = request.body;

      const invitation = await db.clientInvitation.findUnique({ where: { token: request.params.token } });
      if (
        !invitation ||
        invitation.status !== "pending" ||
        invitation.expiresAt < new Date() ||
        !(await canBeParent(db, invitation.parentOrganizationId))
      ) {
        await padTo(startedAt);
        return reply.status(400).send(INVALID_INVITATION);
      }

      if (!checkPasswordPolicy(password).ok) return reply.status(400).send(WEAK_PASSWORD);

      const email = normalizeEmail(invitation.email);
      if (await db.authAccount.findUnique({ where: { email } })) {
        return reply.status(409).send(ACCOUNT_EXISTS);
      }

      const passwordHash = await hashPassword(password);
      const id = newAccountId();
      const now = new Date();
      let organizationId: string;
      try {
        organizationId = await db.$transaction(async (tx) => {
          await tx.authAccount.create({
            data: { id, email, passwordHash, firstName, lastName, emailVerifiedAt: now },
          });
          const { organizationId: childId } = await createWorkspace(tx, {
            userId: id,
            email,
            fullName: `${firstName} ${lastName}`,
            business: {
              companyName: organizationName,
              companyWebsite: "",
              companyLocation: "",
              industry: "",
              subCategory: "",
              revenue: "",
            },
          });
          if (mobileNumber) await tx.user.update({ where: { id }, data: { mobileNumber } });
          await linkChild(tx, invitation.parentOrganizationId, childId, id);
          // Single use: only one of two concurrent accepts can flip pending -> accepted, and never after expiry.
          const claimed = await tx.clientInvitation.updateMany({
            where: { id: invitation.id, status: "pending", expiresAt: { gt: new Date() } },
            data: { status: "accepted", acceptedOrgId: childId },
          });
          if (claimed.count !== 1) throw new InvitationGone();
          return childId;
        });
      } catch (err) {
        if (err instanceof InvitationGone) {
          await padTo(startedAt);
          return reply.status(400).send(INVALID_INVITATION);
        }
        if (err instanceof ParentLinkError) return reply.status(409).send(PARENT_UNAVAILABLE);
        if (isUniqueViolation(err)) return reply.status(409).send(ACCOUNT_EXISTS);
        throw err;
      }

      const session = await createSession(db, {
        accountId: id,
        client,
        typ: "user",
        ip: authClientIp(request),
        userAgent: request.headers["user-agent"],
      });
      const deviceId = await trustDevice(db, id);
      return reply.status(201).send({
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        expiresIn: 600,
        deviceId,
        organizationId,
      });
    },
  );
};
