import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import { verifyClerkToken } from "../lib/clerk.js";
import { redis } from "../lib/redis.js";

const authPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("preHandler", async (request, reply) => {
    const routeConfig = request.routeOptions?.config as unknown as Record<string, unknown> | undefined;
    if (routeConfig?.["public"]) return;

    // GAP-S71: super-admin impersonation via Redis token
    const impersonateToken = request.headers["x-impersonate-token"] as string | undefined;
    if (impersonateToken) {
      const raw = await redis.get(`impersonate:${impersonateToken}`);
      if (!raw) {
        return reply.status(401).send({ error: { code: "INVALID_IMPERSONATION_TOKEN", message: "Invalid or expired impersonation token" } });
      }
      const { organizationId, issuedBy } = JSON.parse(raw) as { organizationId: string; issuedBy: string };
      request.auth = { userId: issuedBy, organizationId, role: "superAdmin", permissions: {} };
      return;
    }

    let userId: string;
    try {
      ({ userId } = await verifyClerkToken(request.headers.authorization));
    } catch {
      return reply.status(401).send({
        error: { code: "UNAUTHORIZED", message: "Invalid or missing token" },
      });
    }

    const user = await fastify.prisma.user.findFirst({
      where: { id: userId, isActive: true },
      select: { role: true, organizationId: true },
    });

    if (!user) {
      return reply.status(403).send({
        error: { code: "FORBIDDEN", message: "User not found in organization" },
      });
    }

    const member = await fastify.prisma.organizationMember.findFirst({
      where: { userId, organizationId: user.organizationId },
      select: { permissions: true },
    });
    const permissions = (member?.permissions ?? {}) as Record<string, string>;

    request.auth = { userId, organizationId: user.organizationId, role: user.role, permissions };

    // Fire-and-forget login audit log
    setImmediate(() => {
      try {
        fastify.prisma.loginLog
          .create({
            data: {
              userId,
              orgId: user.organizationId,
              ipAddress: request.ip,
              userAgent: request.headers["user-agent"] ?? null,
            },
          })
          .catch(() => {/* non-critical */});
      } catch {/* non-critical — app may have been closed before timer fires */}
    });
  });
};

export default fp(authPlugin);
