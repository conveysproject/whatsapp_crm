import type { FastifyPluginAsync } from "fastify";
import { loadBillingConfig } from "../lib/billing/settings.js";
import { bandViews } from "../lib/billing/bands.js";

/**
 * Public, anonymous price list for the marketing site. Returns only the free allowance and, once the owner has
 * published prices in Admin > Billing, the band table. Never returns any other billing setting.
 */
export const publicPricingRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/public/pricing", { config: { public: true } }, async () => {
    const config = await loadBillingConfig(fastify.prisma);
    if (!config.published) return { data: { published: false, freeAllowance: config.freeAllowance } };
    return { data: { published: true, freeAllowance: config.freeAllowance, bands: bandViews(config) } };
  });
};
