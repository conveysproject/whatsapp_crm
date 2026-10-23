import type { FastifyPluginAsync } from "fastify";
import * as Sentry from "@sentry/node";

interface ScrubbableEvent {
  request?: { data?: unknown; cookies?: unknown; headers?: Record<string, unknown>; [k: string]: unknown };
  [k: string]: unknown;
}

/**
 * Keeps request bodies, cookies and auth headers out of Sentry. Bodies can hold SMTP passwords, API keys and
 * sign-in credentials, and Sentry's own scrubber does not know every field name (for example `pass`).
 */
export function scrubSentryEvent<T extends object>(event: T): T {
  const req = (event as ScrubbableEvent).request;
  if (req) {
    delete req.data;
    delete req.cookies;
    if (req.headers) {
      for (const h of Object.keys(req.headers)) {
        if (h.toLowerCase() === "authorization" || h.toLowerCase() === "cookie") delete req.headers[h];
      }
    }
  }
  return event;
}

/** Optional Sentry init. Exception capture and the client-facing 5xx body live in plugins/error-handler.ts. */
export const sentryPlugin: FastifyPluginAsync = async () => {
  const dsn = process.env["SENTRY_DSN"];
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env["NODE_ENV"] ?? "development",
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    beforeSend: (event) => scrubSentryEvent(event),
    beforeSendTransaction: (event) => scrubSentryEvent(event),
  });
};
