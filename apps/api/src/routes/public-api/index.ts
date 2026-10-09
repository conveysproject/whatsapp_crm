import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import rateLimit from "@fastify/rate-limit";
import { redisConnection } from "../../lib/queue.js";
import { clientIp } from "../../lib/public-api/client-ip.js";
import { apiErrorBody } from "../../lib/public-api/error-catalog.js";
import { apiError } from "../../lib/public-api/responses.js";
import { safeErr } from "../../lib/public-api/safe-err.js";
import { buildPayloadSnapshot, payloadLoggingEnabled } from "../../lib/public-api/payload-capture.js";
import { recordApiRequest } from "../../lib/public-api/usage.js";
import { publicApiAuth } from "./auth.js";
import { publicApiMessagesRouter } from "./messages.js";
import { publicApiTemplatesRouter } from "./templates.js";

/** Positive integer from an env var; falls back when missing, empty, non-numeric, zero or negative. */
export function positiveIntEnv(name: string, fallback: number): number {
  const n = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Clear error bodies for errors raised outside `apiError` (rate limit, body parsing, unexpected failures).
 * Tolerates a non-Error / null throw and never throws itself.
 */
export function publicApiErrorHandler(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  const apiId = request.apiId;
  const status = (error as { statusCode?: number } | null | undefined)?.statusCode;
  const code = (error as { code?: string } | null | undefined)?.code ?? "";
  const send = (s: number, c: Parameters<typeof apiErrorBody>[0], hint?: string) =>
    reply.status(s).send(apiErrorBody(c, { ...(hint ? { hint } : {}), ...(apiId ? { apiId } : {}) }));

  if (status === 429) {
    // The rate limiter normally sets Retry-After itself; fall back to 60s if it did not.
    const existing = Number.parseInt(String(reply.getHeader?.("retry-after") ?? ""), 10);
    const seconds = Number.isFinite(existing) && existing > 0 ? existing : 60;
    reply.header("retry-after", String(seconds));
    return send(429, "RATE_LIMITED", `Wait ${seconds} second(s) and retry.`);
  }
  if (status === 413) return send(413, "BODY_TOO_LARGE");
  if (status === 415) return send(415, "UNSUPPORTED_CONTENT_TYPE");
  if (status === 400 && /EMPTY_JSON_BODY/.test(code)) return send(400, "EMPTY_BODY");
  if (status === 400) return send(400, "INVALID_JSON");
  if (typeof status === "number" && status >= 400 && status < 500) return send(status, "VALIDATION_FAILED");
  // Name/code and request id only: error messages (e.g. Prisma validation errors) can echo phone numbers and text.
  request.log.error({ error: safeErr(error), reqId: request.id, apiId }, "public API unhandled error");
  return send(500, "INTERNAL_ERROR");
}

/** Records one usage event for a finished response. Never throws (the hook must not affect a response). */
export function recordUsageOnResponse(request: FastifyRequest, reply: FastifyReply): void {
  try {
    const who = request.publicApi ?? request.publicApiAttempt;
    // Payload only for authenticated callers and only when the flag is on. Never reads headers (no Authorization).
    // A failure here drops the payload, never the usage event or the response.
    let payload: ReturnType<typeof buildPayloadSnapshot> | undefined;
    if (who?.organizationId && payloadLoggingEnabled()) {
      try {
        payload = buildPayloadSnapshot({
          body: request.body, url: request.url, responseText: request.apiResponseBody,
          clientIp: clientIp(request.ip, request.headers["x-forwarded-for"], request.headers["x-real-ip"]),
          userAgent: request.headers["user-agent"],
        });
      } catch { payload = undefined; }
    }
    recordApiRequest({
      method: request.method,
      routeUrl: request.routeOptions?.url,
      statusCode: reply.statusCode,
      durationMs: Math.max(0, Math.round(reply.elapsedTime)) || 0,
      requestId: String(request.id),
      messages: request.usageMessages ?? 0,
      organizationId: who?.organizationId ?? null,
      apiKeyId: who?.apiKeyId ?? null,
      ...(request.apiId ? { logId: request.apiId } : {}),
      ...(payload ? { payload } : {}),
    });
  } catch { /* usage recording must never affect a response */ }
}

const throttled = (req: unknown, context: { ttl?: number }) => {
  const seconds = Math.max(1, Math.ceil((context?.ttl ?? 60_000) / 1000));
  const apiId = (req as { apiId?: string } | undefined)?.apiId;
  return { statusCode: 429, headers: { "retry-after": String(seconds) }, ...apiErrorBody("RATE_LIMITED", { hint: `Wait ${seconds} second(s) and retry.`, ...(apiId ? { apiId } : {}) }) };
};

/**
 * Registered at prefix `/v1/Account/:authId`. Encapsulated: the rate limiters, auth hook and error handler apply only to these routes.
 * Note: when Redis is down the limiters do NOT fail fast: the shared ioredis client is built with
 * `maxRetriesPerRequest: null` (lib/queue.ts), so limiter calls (and `queue.add` in the routes) wait until the client
 * reconnects or the request times out upstream, rather than erroring into a 500.
 */
export const publicApiRouter: FastifyPluginAsync = async (fastify) => {
  fastify.setErrorHandler(publicApiErrorHandler);
  // Unknown paths under this prefix get the same JSON body as every other error (same for unauthenticated callers: no existence info).
  fastify.setNotFoundHandler({ config: { public: true } } as never, (_req, reply) => apiError(reply, 404, "NOT_FOUND"));

  // One id per request: used in every response body and (logging plan) as the request-log row id.
  fastify.addHook("onRequest", (req, _reply, done) => { req.apiId = randomUUID(); req.log = req.log.child({ apiId: req.apiId }); done(); });

  // Capture the serialized response body for payload logging (string payloads only; zero work unless the flag is on).
  fastify.addHook("onSend", (req, _reply, payload, done) => {
    try {
      if (payloadLoggingEnabled() && typeof payload === "string") req.apiResponseBody = payload;
    } catch { /* capture must never affect a response */ }
    done(null, payload);
  });

  // Usage metering: exactly one event per response of this plugin (incl. 4xx/5xx/429). Synchronous, in-memory, never throws.
  // The route PATTERN is recorded (never the URL, which carries the auth id and message ids).
  // Known limitation: Fastify does not fire onResponse for requests aborted by the client, so those are not counted.
  fastify.addHook("onResponse", (request, reply, done) => {
    recordUsageOnResponse(request, reply);
    done();
  });

  const perCredentialMax = positiveIntEnv("PUBLIC_API_RATE_LIMIT", 300);
  const preAuthMax = positiveIntEnv("PUBLIC_API_PREAUTH_RATE_LIMIT", perCredentialMax * 10);

  // Coarse PRE-AUTH flood guard, keyed by the client IP only. The API is not built with `trustProxy`, so behind
  // Railway `req.ip` is the proxy address; `clientIp` reads the real address from X-Forwarded-For (right-most public
  // entry, only when the socket peer is our own proxy) so spoofed headers cannot choose a bucket. The max stays high
  // (10x) because shared NATs exist, and the per-credential limiter below is the authoritative one. It must not be
  // keyed by authId: unauthenticated requests would then let a third party exhaust a victim's bucket.
  let probesLeft = 20;
  fastify.addHook("onRequest", (req, _reply, done) => {
    // One-off deployment probe (no addresses): confirms the proxy header shape without logging anyone's IP.
    if (probesLeft > 0) {
      probesLeft--;
      const xff = req.headers["x-forwarded-for"];
      const entries = (Array.isArray(xff) ? xff.join(",") : xff ?? "").split(",").filter((e) => e.trim()).length;
      req.log.info({ xffEntries: entries, hasRealIp: Boolean(req.headers["x-real-ip"]), resolvedIsPeer: clientIp(req.ip, xff, req.headers["x-real-ip"]) === req.ip }, "[public-api] client-ip probe");
    }
    done();
  });
  await fastify.register(rateLimit, {
    max: preAuthMax,
    timeWindow: "1 minute",
    ...(redisConnection ? { redis: redisConnection } : {}),
    keyGenerator: (req) => `pub:ip:${clientIp(req.ip, req.headers["x-forwarded-for"], req.headers["x-real-ip"])}`,
    errorResponseBuilder: throttled,
  });
  fastify.addHook("preHandler", (req, reply) => publicApiAuth(req as never, reply));

  // Child context created AFTER the auth hook: its preHandler limiter runs after `publicApiAuth` (parent hooks run
  // before route-level hooks), so only authenticated requests count, per API key.
  await fastify.register(async (child) => {
    await child.register(rateLimit, {
      hook: "preHandler",
      max: perCredentialMax,
      timeWindow: "1 minute",
      ...(redisConnection ? { redis: redisConnection } : {}),
      keyGenerator: (req) => `pub:key:${(req as { publicApi?: { apiKeyId?: string } }).publicApi?.apiKeyId ?? ""}`,
      errorResponseBuilder: throttled,
    });
    await child.register(publicApiMessagesRouter);
    await child.register(publicApiTemplatesRouter);
  });
};
