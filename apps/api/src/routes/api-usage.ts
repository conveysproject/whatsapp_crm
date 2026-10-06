import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { canAccessSub } from "../lib/permissions.js";
import { checkPublicApiAccess } from "../lib/public-api/access.js";
import { getUsageSummary, listRequests, type OutcomeFilter } from "../lib/public-api/usage-queries.js";

const DAY_MS = 86_400_000;
const MAX_RANGE_MS = 366 * DAY_MS;
const PRESETS: Record<string, number> = { "24h": DAY_MS, "7d": 7 * DAY_MS, "30d": 30 * DAY_MS };
const ENDPOINTS = new Set(["message.send", "message.list", "message.get", "other"]);
const OUTCOMES = new Set(["success", "client_error", "server_error", "error"]);
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Normalizes a query value: Fastify yields an array for repeated keys; use the first string. */
function qp(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  return undefined;
}

const invalid = (reply: FastifyReply, message: string) => reply.status(400).send({ error: { code: "INVALID_QUERY", message } });
const notFound = (reply: FastifyReply) => reply.status(404).send({ error: { code: "NOT_FOUND", message: "Credential not found" } });

/** A date-only `to` is inclusive of that whole UTC day. Returns null when unparsable. */
function parseBound(v: string, isTo: boolean): Date | null {
  const d = new Date(DATE_ONLY.test(v) ? `${v}T00:00:00.000Z` : v);
  if (Number.isNaN(d.getTime())) return null;
  return isTo && DATE_ONLY.test(v) ? new Date(d.getTime() + DAY_MS) : d;
}

export const apiUsageRouter: FastifyPluginAsync = async (fastify) => {
  // Same gate as the credentials routes: permission first, then API access (identical body for blocked / not allow-listed).
  fastify.addHook("preHandler", async (request, reply) => {
    const { role, permissions } = request.auth;
    if (!canAccessSub(role, permissions, "settings_access", "settings_api_key")) {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "settings_api_key permission required" } });
    }
    const access = await checkPublicApiAccess(fastify.prisma, request.auth.organizationId);
    if (!access.allowed) {
      return reply.status(403).send({ error: { code: "API_NOT_AVAILABLE", message: "API access is not available for this organization." } });
    }
  });

  fastify.get<{ Querystring: Record<string, unknown> }>("/api-usage/summary", async (request, reply) => {
    const q = request.query ?? {};
    const range = qp(q["range"]) ?? "7d";
    const apiKeyId = qp(q["apiKeyId"]);
    if (apiKeyId !== undefined && !ID_RE.test(apiKeyId)) return invalid(reply, "apiKeyId is invalid");

    let from: Date;
    let to: Date;
    if (range === "custom") {
      const f = qp(q["from"]);
      const t = qp(q["to"]);
      if (!f || !t) return invalid(reply, "from and to are required for a custom range");
      const fd = parseBound(f, false);
      const td = parseBound(t, true);
      if (!fd || !td) return invalid(reply, "from and to must be ISO dates");
      if (fd.getTime() >= td.getTime()) return invalid(reply, "from must be before to");
      if (td.getTime() - fd.getTime() > MAX_RANGE_MS) return invalid(reply, "range may span at most 366 days");
      from = fd; to = td;
    } else if (range in PRESETS) {
      to = new Date();
      from = new Date(to.getTime() - PRESETS[range]!);
    } else {
      return invalid(reply, "range must be 24h, 7d, 30d or custom");
    }

    const data = await getUsageSummary(fastify.prisma, request.auth.organizationId, { from, to, ...(apiKeyId ? { apiKeyId } : {}) });
    if (!data) return notFound(reply);
    return reply.send(data);
  });

  fastify.get<{ Querystring: Record<string, unknown> }>("/api-usage/requests", async (request, reply) => {
    const q = request.query ?? {};
    const limitRaw = qp(q["limit"]);
    let limit = 50;
    if (limitRaw !== undefined) {
      if (!/^\d{1,3}$/.test(limitRaw)) return invalid(reply, "limit must be an integer between 1 and 100");
      limit = Number(limitRaw);
      if (limit < 1 || limit > 100) return invalid(reply, "limit must be an integer between 1 and 100");
    }
    const outcome = qp(q["outcome"]);
    if (outcome !== undefined && !OUTCOMES.has(outcome)) return invalid(reply, "outcome must be success, client_error, server_error or error");
    const endpoint = qp(q["endpoint"]);
    if (endpoint !== undefined && !ENDPOINTS.has(endpoint)) return invalid(reply, "endpoint is not a known endpoint");
    const apiKeyId = qp(q["apiKeyId"]);
    if (apiKeyId !== undefined && !ID_RE.test(apiKeyId)) return invalid(reply, "apiKeyId is invalid");
    const cursor = qp(q["cursor"]);
    if (cursor !== undefined && cursor.length > 200) return invalid(reply, "cursor is invalid");

    const res = await listRequests(fastify.prisma, request.auth.organizationId, {
      limit,
      ...(cursor ? { cursor } : {}),
      ...(outcome ? { outcome: outcome as OutcomeFilter } : {}),
      ...(apiKeyId ? { apiKeyId } : {}),
      ...(endpoint ? { endpoint } : {}),
    });
    if (res === "invalid_cursor") return invalid(reply, "cursor is invalid");
    if (!res) return notFound(reply);
    return reply.send(res);
  });
};
