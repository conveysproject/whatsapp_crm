import type { FastifyPluginAsync } from "fastify";
import { healthRoute } from "./health.js";
import { organizationRoutes } from "./organizations.js";
import { userRoutes } from "./users.js";
import { invitationRoutes } from "./invitations.js";
import { webhooksRouter } from "./webhooks.js";
import { conversationsRouter } from "./conversations.js";
import { messagesRouter } from "./messages.js";

export const routes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(healthRoute);
  await fastify.register(organizationRoutes, { prefix: "/v1" });
  await fastify.register(userRoutes, { prefix: "/v1" });
  await fastify.register(invitationRoutes, { prefix: "/v1" });
  await fastify.register(webhooksRouter, { prefix: "/v1" });
  await fastify.register(conversationsRouter, { prefix: "/v1" });
  await fastify.register(messagesRouter, { prefix: "/v1" });
};
