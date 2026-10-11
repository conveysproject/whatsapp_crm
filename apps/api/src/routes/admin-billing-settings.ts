import type { FastifyPluginAsync } from "fastify";
import { parseBillingConfig } from "../lib/billing/bands.js";
import { loadBillingConfig, saveBillingConfig } from "../lib/billing/settings.js";

/** Super-admin only: price bands, free allowance and the "published" switch that controls whether customers see prices. */
export const adminBillingSettingsRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/admin/billing/settings", async (request, reply) => {
    if (request.auth.role !== "superAdmin") {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Super admin access required" } });
    }
    return reply.send({ data: await loadBillingConfig(fastify.prisma) });
  });

  fastify.put<{ Body: unknown }>("/admin/billing/settings", async (request, reply) => {
    if (request.auth.role !== "superAdmin") {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Super admin access required" } });
    }
    const parsed = parseBillingConfig(request.body);
    if (!parsed.ok) {
      return reply.status(400).send({ error: { code: "INVALID_SETTINGS", message: parsed.error } });
    }
    await saveBillingConfig(fastify.prisma, parsed.config, request.auth.userId);
    return reply.send({ data: parsed.config });
  });
};
