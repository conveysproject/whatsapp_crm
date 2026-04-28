import type { FastifyPluginAsync } from "fastify";
import * as Sentry from "@sentry/node";

export const sentryPlugin: FastifyPluginAsync = async (fastify) => {
  const dsn = process.env["SENTRY_DSN"];
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env["NODE_ENV"] ?? "development",
    tracesSampleRate: 0.1,
  });

  fastify.setErrorHandler((error, _request, reply) => {
    Sentry.captureException(error);
    reply.status(500).send({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
  });
};
