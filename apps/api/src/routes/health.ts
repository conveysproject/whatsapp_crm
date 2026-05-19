import type { FastifyPluginAsync } from "fastify";

export const healthRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get("/health", { config: { public: true } }, async (_request, reply) => {
    return reply.status(200).send({
      status: "ok",
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? "0.0.1",
    });
  });

  // GAP-S57: standard ping-pong health endpoint (public, used by uptime monitors)
  fastify.get("/ping-pong", { config: { public: true } }, async (_request, reply) => {
    return reply.send({ message: "pong", timestamp: new Date().toISOString() });
  });
};
