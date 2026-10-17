import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { authClientIp, hitLimit } from "../limits.js";
import { revokeAllSessions, revokeSession, rotateRefreshToken } from "../sessions.js";

const SESSION_EXPIRED = { error: { code: "SESSION_EXPIRED", message: "Please sign in again." } };
const NO_SESSION = { error: { code: "NO_SESSION", message: "This action needs a WBMSG session." } };
const NOT_FOUND = { error: { code: "NOT_FOUND", message: "Session not found" } };

/** Returns the caller's sid, or answers 400 NO_SESSION (clerk mode, demo, impersonation have no own session). */
function requireSid(request: FastifyRequest, reply: FastifyReply): string | null {
  const sid = request.auth?.sid;
  if (!sid) {
    void reply.status(400).send(NO_SESSION);
    return null;
  }
  return sid;
}

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
      const result = await rotateRefreshToken(fastify.prisma, request.body.refreshToken);
      if ("error" in result) return reply.status(401).send(SESSION_EXPIRED);
      return reply.send({ accessToken: result.accessToken, refreshToken: result.refreshToken, expiresIn: 600 });
    },
  );

  fastify.post("/signout", async (request, reply) => {
    const sid = requireSid(request, reply);
    if (!sid) return reply;
    await revokeSession(fastify.prisma, sid, "signout");
    return reply.send({ ok: true });
  });

  fastify.get("/sessions", async (request, reply) => {
    const sid = requireSid(request, reply);
    if (!sid) return reply;
    const rows = await fastify.prisma.authSession.findMany({
      where: { accountId: request.auth.userId, revokedAt: null, expiresAt: { gt: new Date() } },
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
    { schema: { params: { type: "object", properties: { id: { type: "string", maxLength: 64 } } } } },
    async (request, reply) => {
      const sid = requireSid(request, reply);
      if (!sid) return reply;
      const owned = await fastify.prisma.authSession.findFirst({
        where: { id: request.params.id, accountId: request.auth.userId, revokedAt: null },
        select: { id: true },
      });
      if (!owned) return reply.status(404).send(NOT_FOUND);
      await revokeSession(fastify.prisma, owned.id, "user_revoked");
      return reply.send({ ok: true });
    },
  );

  fastify.post("/sessions/revoke-all", async (request, reply) => {
    const sid = requireSid(request, reply);
    if (!sid) return reply;
    const revoked = await revokeAllSessions(fastify.prisma, request.auth.userId, "user_revoked_all", sid);
    return reply.send({ revoked });
  });
};
