import type { FastifyPluginAsync } from "fastify";
import { COUNT_MODES, clearCountRulesCache, type CountMode } from "../lib/billing/count-rules.js";

const CATEGORY = /^[a-z_]{1,40}$/;

/** Super-admin only: editable per-category counting overrides (default: follow Meta). Applies to messages recorded afterwards. */
export const adminBillingRulesRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/admin/billing/count-rules", async (request, reply) => {
    if (request.auth.role !== "superAdmin") {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Super admin access required" } });
    }
    const rows = await fastify.prisma.billingCountRule.findMany({
      select: { category: true, mode: true, updatedAt: true },
      orderBy: { category: "asc" },
    });
    return reply.send({ data: { modes: COUNT_MODES, rules: rows } });
  });

  fastify.put<{ Body: { category?: unknown; mode?: unknown } }>("/admin/billing/count-rules", async (request, reply) => {
    if (request.auth.role !== "superAdmin") {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Super admin access required" } });
    }
    const { category, mode } = request.body ?? {};
    if (typeof category !== "string" || !CATEGORY.test(category)) {
      return reply.status(400).send({ error: { code: "INVALID_CATEGORY", message: "category must be lower-case letters and underscores (max 40)" } });
    }
    if (typeof mode !== "string" || !(COUNT_MODES as readonly string[]).includes(mode)) {
      return reply.status(400).send({ error: { code: "INVALID_MODE", message: `mode must be one of ${COUNT_MODES.join(", ")}` } });
    }
    const row = await fastify.prisma.billingCountRule.upsert({
      where: { category },
      create: { category, mode: mode as CountMode, updatedBy: request.auth.userId },
      update: { mode: mode as CountMode, updatedBy: request.auth.userId },
      select: { category: true, mode: true, updatedAt: true },
    });
    clearCountRulesCache();
    return reply.send({ data: row });
  });
};
