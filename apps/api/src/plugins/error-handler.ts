import fp from "fastify-plugin";
import type { FastifyError, FastifyPluginAsync } from "fastify";
import * as Sentry from "@sentry/node";

const GENERIC_BODY = { error: { code: "INTERNAL_ERROR", message: "Internal server error" } } as const;

/**
 * Global error handler (fp-wrapped so it applies to every route plugin registered after it).
 * - status < 500: delegated to Fastify's default handler via reply.send(error), so the 4xx response is unchanged.
 * - status >= 500 / unknown: the error goes to the server log (and Sentry when SENTRY_DSN is set); the client gets a
 *   generic body and never the error message, stack or query text. A 5xx keeps its original status code.
 * Child plugins that call setErrorHandler (e.g. the public API) override this inside their own context.
 */
const errorHandlerPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.setErrorHandler((error: FastifyError | unknown, request, reply) => {
    // Same precedence as Fastify's default handler: `status` wins over `statusCode`.
    const e = error as { status?: unknown; statusCode?: unknown } | null | undefined;
    const pick = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 400 ? v : undefined);
    const statusCode = pick(e?.status) ?? pick(e?.statusCode);

    if (statusCode !== undefined && statusCode >= 400 && statusCode < 500) {
      void reply.code(statusCode).send(error);
      return;
    }

    request.log.error({ err: error }, "unhandled error");
    if (process.env["SENTRY_DSN"]) {
      try {
        Sentry.captureException(error);
      } catch {
        // reporting must never change the response
      }
    }
    void reply.status(statusCode !== undefined && statusCode >= 500 && statusCode < 600 ? statusCode : 500).send(GENERIC_BODY);
  });
};

export const errorHandlerPluginFp = fp(errorHandlerPlugin, { name: "error-handler" });
export default errorHandlerPluginFp;
