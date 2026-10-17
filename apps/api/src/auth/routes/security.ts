import type { FastifyPluginAsync } from "fastify";
import { requireSid } from "./session.js";

const NOT_FOUND = { error: { code: "NOT_FOUND", message: "Account not found" } };

/** Authenticated; every query is scoped to request.auth.userId (never a client-supplied id). */
export const securityRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/me/security", async (request, reply) => {
    if (!requireSid(request, reply)) return reply;
    const accountId = request.auth.userId;
    const account = await fastify.prisma.authAccount.findUnique({
      where: { id: accountId },
      select: {
        email: true,
        emailVerifiedAt: true,
        passwordHash: true,
        phoneE164: true,
        phoneVerifiedAt: true,
        oauthLinks: { select: { provider: true } },
      },
    });
    if (!account) return reply.status(404).send(NOT_FOUND);
    const sessions = await fastify.prisma.authSession.count({
      where: { accountId, revokedAt: null, expiresAt: { gt: new Date() } },
    });
    return reply.send({
      email: account.email,
      emailVerified: account.emailVerifiedAt !== null,
      hasPassword: account.passwordHash !== null,
      phone: account.phoneE164 ? { e164: account.phoneE164, verified: account.phoneVerifiedAt !== null } : null,
      oauth: account.oauthLinks.map((l) => ({ provider: l.provider })),
      sessions,
    });
  });
};
