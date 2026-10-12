import type { FastifyPluginAsync } from "fastify";
import { cachedStanding, isEnforcedBlock } from "../lib/billing/send-guard.js";

/**
 * The caller's own organization's payment standing, for the warning banner. Any signed-in member may read it (so an
 * agent whose sending is paused understands why), and it carries no amounts, links or customer data: only the state and dates.
 */
export const billingStandingRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/billing/standing", async (request, reply) => {
    const { organizationId } = request.auth;
    try {
      const s = await cachedStanding(fastify.prisma, organizationId);
      return reply.send({
        data: {
          state: s.state,
          // "watch" never refuses a send, so it is reported as a warning only; a cancelled account is always paused
          paused: isEnforcedBlock(s),
          dueAt: s.dueAt ? s.dueAt.toISOString() : null,
          blockAt: s.blockAt ? s.blockAt.toISOString() : null,
        },
      });
    } catch {
      // A banner must never break a page: on any failure report "fine".
      return reply.send({ data: { state: "ok", paused: false, dueAt: null, blockAt: null } });
    }
  });
};
