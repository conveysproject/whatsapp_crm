import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import { verifyClerkToken } from "../lib/clerk.js";

const authPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("preHandler", async (request, reply) => {
    const routeConfig = request.routeOptions?.config as unknown as Record<string, unknown> | undefined;
    if (routeConfig?.["public"]) return;

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

    request.auth = { userId, organizationId: user.organizationId, role: user.role };
  });
};

export default fp(authPlugin);
