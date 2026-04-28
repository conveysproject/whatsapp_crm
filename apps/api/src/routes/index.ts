import type { FastifyPluginAsync } from "fastify";
import { healthRoute } from "./health.js";
import { organizationRoutes } from "./organizations.js";
import { userRoutes } from "./users.js";
import { invitationRoutes } from "./invitations.js";

export const routes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(healthRoute);
  await fastify.register(organizationRoutes, { prefix: "/v1" });
  await fastify.register(userRoutes, { prefix: "/v1" });
  await fastify.register(invitationRoutes, { prefix: "/v1" });
};
