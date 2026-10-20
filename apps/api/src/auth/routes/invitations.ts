import type { FastifyPluginAsync } from "fastify";
import { checkPlanLimit } from "../../lib/plan-limits.js";
import { trustDevice } from "../devices.js";
import { newAccountId, normalizeEmail } from "../ids.js";
import { authClientIp } from "../limits.js";
import { checkPasswordPolicy, hashPassword } from "../password.js";
import { createSession } from "../sessions.js";

const MIN_DURATION_MS = 300;

export const INVALID_INVITATION = {
  error: { code: "INVALID_INVITATION", message: "This invitation link is invalid or has expired." },
};
export const ACCOUNT_EXISTS = {
  error: { code: "ACCOUNT_EXISTS", message: "You already have an account. Sign in to accept this invitation." },
};
export const WEAK_PASSWORD = { error: { code: "WEAK_PASSWORD", message: "Use 8 to 128 characters." } };
const SEAT_LIMIT = {
  error: { code: "SEAT_LIMIT", message: "This workspace has no free seats. Ask your admin." },
};

class InvitationGone extends Error {}

export async function padTo(startedAt: number): Promise<void> {
  const left = MIN_DURATION_MS - (Date.now() - startedAt);
  if (left > 0) await new Promise((r) => setTimeout(r, left));
}

export function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "P2002";
}

interface AcceptBody {
  firstName: string;
  lastName: string;
  password: string;
  mobileNumber?: string;
  client: "web" | "mobile";
}

/** Public, credential-limited (registered inside the per-IP limited plugin). */
export const invitationAcceptRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Params: { token: string }; Body: AcceptBody }>(
    "/invitations/:token/accept",
    {
      config: { public: true },
      schema: {
        params: { type: "object", properties: { token: { type: "string", maxLength: 200 } }, required: ["token"] },
        body: {
          type: "object",
          required: ["firstName", "lastName", "password", "client"],
          properties: {
            firstName: { type: "string", minLength: 1, maxLength: 100 },
            lastName: { type: "string", minLength: 1, maxLength: 100 },
            password: { type: "string" },
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
      const { firstName, lastName, password, mobileNumber, client } = request.body;

      const invitation = await db.invitation.findUnique({ where: { token: request.params.token } });
      if (!invitation || invitation.status !== "pending" || invitation.expiresAt < new Date()) {
        await padTo(startedAt);
        return reply.status(400).send(INVALID_INVITATION);
      }

      if (!checkPasswordPolicy(password).ok) return reply.status(400).send(WEAK_PASSWORD);

      const email = normalizeEmail(invitation.email);
      if (await db.authAccount.findUnique({ where: { email } })) {
        return reply.status(409).send(ACCOUNT_EXISTS);
      }

      const limit = await checkPlanLimit(db, invitation.organizationId, "team_members");
      if (!limit.allowed) return reply.status(403).send(SEAT_LIMIT);

      const passwordHash = await hashPassword(password);
      const id = newAccountId();
      const now = new Date();
      try {
        await db.$transaction(async (tx) => {
          await tx.authAccount.create({
            data: { id, email, passwordHash, firstName, lastName, emailVerifiedAt: now },
          });
          await tx.user.create({
            data: {
              id,
              organizationId: invitation.organizationId,
              email,
              fullName: `${firstName} ${lastName}`,
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
          await padTo(startedAt);
          return reply.status(400).send(INVALID_INVITATION);
        }
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
        organizationId: invitation.organizationId,
      });
    },
  );
};
