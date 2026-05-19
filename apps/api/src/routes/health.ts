import type { FastifyPluginAsync } from "fastify";
import { randomBytes } from "node:crypto";
import { redis } from "../lib/redis.js";

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

  // GAP-S51: demo mode info endpoint — publicly declares whether this instance is a demo
  fastify.get("/demo/info", { config: { public: true } }, async (_request, reply) => {
    const isDemo = process.env["IS_DEMO_MODE"] === "true";
    return reply.send({
      data: {
        demoMode: isDemo,
        demoAccountId: isDemo ? (process.env["DEMO_ACCOUNT_ID"] ?? null) : null,
        note: isDemo ? "This is a read-only demo instance. Outgoing messages are prefixed with [DEMO]." : null,
      },
    });
  });

  // GAP-S51: demo login — generates a temporary impersonation token for the demo org
  fastify.post("/demo/login", { config: { public: true } }, async (_request, reply) => {
    const isDemo = process.env["IS_DEMO_MODE"] === "true";
    const demoOrgId = process.env["DEMO_ACCOUNT_ID"];
    if (!isDemo || !demoOrgId) {
      return reply.status(404).send({ error: "Demo mode is not enabled on this instance" });
    }
    const token = randomBytes(32).toString("hex");
    await redis.set(`impersonate:${token}`, JSON.stringify({ organizationId: demoOrgId, orgName: "Demo Account", isDemo: true }), "EX", 3600);
    return reply.send({ data: { token, expiresIn: 3600, demoAccountId: demoOrgId } });
  });
};
