import type { FastifyPluginAsync } from "fastify";
import * as Sentry from "@sentry/node";

/** Optional Sentry init. Exception capture and the client-facing 5xx body live in plugins/error-handler.ts. */
export const sentryPlugin: FastifyPluginAsync = async () => {
  const dsn = process.env["SENTRY_DSN"];
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env["NODE_ENV"] ?? "development",
    tracesSampleRate: 0.1,
  });
};
