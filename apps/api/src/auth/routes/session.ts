import type { FastifyPluginAsync } from "fastify";
import { requireAccountSession } from "../account-auth.js";
import { authClientIp, hitLimit } from "../limits.js";
import { revokeAllSessions, revokeSession, rotateRefreshToken } from "../sessions.js";

const SESSION_EXPIRED = { error: { code: "SESSION_EXPIRED", message: "Please sign in again." } };
const UNAVAILABLE = { error: { code: "UNAVAILABLE", message: "Please try again." } };
const NOT_FOUND = { error: { code: "NOT_FOUND", message: "Session not found" } };

export const sessionRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: { refreshToken: string } }>(
    "/refresh",
    {
      config: { public: true },
      // Refresh runs every ~10 min per tab, so it has its own, much looser per-IP bucket.
      onRequest: async (request, reply) => {
        if (await hitLimit(`auth:ipr:${authClientIp(request)}`, 300, 600)) {
          return reply.status(429).send({
            error: { code: "RATE_LIMITED", message: "Too many requests, please slow down." },
          });
        }
      },
      schema: {
        body: {
          type: "object",
          required: ["refreshToken"],
          properties: { refreshToken: { type: "string", minLength: 1, maxLength: 200 } },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      let result: Awaited<ReturnType<typeof rotateRefreshToken>>;
      try {
        result = await rotateRefreshToken(fastify.prisma, request.body.refreshToken);
      } catch (err) {
        // Infrastructure failure: retryable, must not sign the user out. Never log the token.
        fastify.log.warn({ err: err instanceof Error ? err.name : "unknown" }, "refresh failed");
        return reply.status(503).send(UNAVAILABLE);
      }
      if ("error" in result) return reply.status(401).send(SESSION_EXPIRED);
      return reply.send({ accessToken: result.accessToken, refreshToken: result.refreshToken, expiresIn: 600 });
    },
  );

  const accountRoute = { config: { public: true }, preHandler: requireAccountSession };

  fastify.post("/signout", accountRoute, async (request, reply) => {
    const { sid } = request.account!;
    await revokeSession(fastify.prisma, sid, "signout");
    return reply.send({ ok: true });
  });

  fastify.get("/sessions", accountRoute, async (request, reply) => {
    const { sid, accountId } = request.account!;
    const rows = await fastify.prisma.authSession.findMany({
      where: { accountId: accountId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: "desc" },
      select: { id: true, client: true, deviceLabel: true, ip: true, lastUsedAt: true },
    });
    return reply.send({
      data: rows.map((r) => ({
        id: r.id,
        client: r.client,
        deviceLabel: r.deviceLabel,
        ip: r.ip,
        lastUsedAt: r.lastUsedAt,
        current: r.id === sid,
      })),
    });
  });

  fastify.delete<{ Params: { id: string } }>(
    "/sessions/:id",
    { ...accountRoute, schema: { params: { type: "object", properties: { id: { type: "string", maxLength: 64 } } } } },
    async (request, reply) => {
      const { accountId } = request.account!;
      const owned = await fastify.prisma.authSession.findFirst({
        where: { id: request.params.id, accountId: accountId, revokedAt: null },
        select: { id: true },
      });
      if (!owned) return reply.status(404).send(NOT_FOUND);
      await revokeSession(fastify.prisma, owned.id, "user_revoked");
      return reply.send({ ok: true });
    },
  );

  fastify.post("/sessions/revoke-all", accountRoute, async (request, reply) => {
    const { sid, accountId } = request.account!;
    const revoked = await revokeAllSessions(fastify.prisma, accountId, "user_revoked_all", sid);
    return reply.send({ revoked });
  });
};
