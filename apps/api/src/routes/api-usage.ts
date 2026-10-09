import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { canAccessSub } from "../lib/permissions.js";
import { checkPublicApiAccess } from "../lib/public-api/access.js";
import { getUsageSummary, listRequests, type OutcomeFilter } from "../lib/public-api/usage-queries.js";

const DAY_MS = 86_400_000;
const MAX_RANGE_MS = 366 * DAY_MS;
/** Preset day counts: whole UTC days, today included (7d = today + the previous 6 days). `24h` is a rolling hourly window. */
const DAY_PRESETS: Record<string, number> = { "7d": 7, "30d": 30 };
const ENDPOINTS = new Set(["message.send", "message.list", "message.get", "template.create", "template.list", "template.get", "template.update", "template.delete", "other"]);
const OUTCOMES = new Set(["success", "client_error", "server_error", "error"]);
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CURSOR_ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
/** ISO datetime that carries its own offset (Z or +hh:mm); an offset-less datetime would be read in server-local time. */
const DATETIME_WITH_OFFSET = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-](\d{2}):?(\d{2}))$/;

/** True when y-m-d is a real calendar date (no JS Date rollover). */
function isRealDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Normalizes a query value: Fastify yields an array for repeated keys; use the first string. */
function qp(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  return undefined;
}

const invalid = (reply: FastifyReply, message: string) => reply.status(400).send({ error: { code: "INVALID_QUERY", message } });
const notFound = (reply: FastifyReply) => reply.status(404).send({ error: { code: "NOT_FOUND", message: "Credential not found" } });

/**
 * Accepts only `YYYY-MM-DD` (UTC midnight) or an ISO datetime with Z / an explicit offset; anything else is null.
 * A date-only `to` is INCLUSIVE of that whole UTC day: it becomes the exclusive end, 00:00Z of the next day.
 */
function parseBound(v: string, isTo: boolean): Date | null {
  const dateOnly = DATE_ONLY.test(v);
  const m = dateOnly ? null : DATETIME_WITH_OFFSET.exec(v);
  if (!dateOnly && !m) return null;
  // Strict ranges: JS Date would silently roll 2026-02-31 / T24:00 / T10:60 over to a different instant.
  if (m) {
    const [y, mo, d, h, mi, sec, offH, offM] = [m[1], m[2], m[3], m[4], m[5], m[6] ?? "0", m[8] ?? "0", m[9] ?? "0"].map(Number) as [number, number, number, number, number, number, number, number];
    if (!isRealDate(y, mo, d) || h > 23 || mi > 59 || sec > 59 || offH > 23 || offM > 59) return null;
  }
  const d = new Date(dateOnly ? `${v}T00:00:00.000Z` : v);
  if (Number.isNaN(d.getTime())) return null;
  if (dateOnly && !isRealDate(Number(v.slice(0, 4)), Number(v.slice(5, 7)), Number(v.slice(8, 10)))) return null; // e.g. 2026-02-31
  return isTo && dateOnly ? new Date(d.getTime() + DAY_MS) : d;
}

/**
 * Resolves a `24h | 7d | 30d` preset to its window. Shared by /summary and /requests so both produce identical windows.
 * `24h` is rolling; `7d` / `30d` are the last N whole UTC days including today (`to` = tomorrow 00:00Z, exclusive).
 */
function presetWindow(range: string): { from: Date; to: Date } | null {
  if (range === "24h") {
    const to = new Date();
    return { from: new Date(to.getTime() - DAY_MS), to };
  }
  if (Object.hasOwn(DAY_PRESETS, range)) {
    const todayStart = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
    const to = new Date(todayStart + DAY_MS);
    return { from: new Date(to.getTime() - DAY_PRESETS[range]! * DAY_MS), to };
  }
  return null;
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
      if (!fd || !td) return invalid(reply, "from and to must be YYYY-MM-DD or an ISO datetime with Z or an offset");
      if (fd.getTime() >= td.getTime()) return invalid(reply, "from must be before to");
      if (td.getTime() - fd.getTime() > MAX_RANGE_MS) return invalid(reply, "range may span at most 366 days");
      from = fd; to = td;
    } else {
      const w = presetWindow(range);
      if (!w) return invalid(reply, "range must be 24h, 7d, 30d or custom");
      ({ from, to } = w);
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

    // Optional window: a `range` preset (same helper as /summary) OR explicit from/to; never both. No params = all retained rows.
    const rangeParam = qp(q["range"]);
    const fromParam = qp(q["from"]);
    const toParam = qp(q["to"]);
    let window: { from?: Date; to?: Date } = {};
    if (rangeParam !== undefined) {
      if (fromParam !== undefined || toParam !== undefined) return invalid(reply, "use either range or from/to, not both");
      const w = presetWindow(rangeParam);
      if (!w) return invalid(reply, "range must be 24h, 7d or 30d");
      window = w;
    } else if (fromParam !== undefined || toParam !== undefined) {
      const fd = fromParam !== undefined ? parseBound(fromParam, false) : undefined;
      const td = toParam !== undefined ? parseBound(toParam, true) : undefined;
      if (fd === null || td === null) return invalid(reply, "from and to must be YYYY-MM-DD or an ISO datetime with Z or an offset");
      if (fd && td) {
        if (fd.getTime() >= td.getTime()) return invalid(reply, "from must be before to");
        if (td.getTime() - fd.getTime() > MAX_RANGE_MS) return invalid(reply, "range may span at most 366 days");
      }
      window = { ...(fd ? { from: fd } : {}), ...(td ? { to: td } : {}) };
    }

    const res = await listRequests(fastify.prisma, request.auth.organizationId, {
      limit,
      ...window,
      ...(cursor ? { cursor } : {}),
      ...(outcome ? { outcome: outcome as OutcomeFilter } : {}),
      ...(apiKeyId ? { apiKeyId } : {}),
      ...(endpoint ? { endpoint } : {}),
    });
    if (res === "invalid_cursor") return invalid(reply, "cursor is invalid");
    if (!res) return notFound(reply);
    return reply.send(res);
  });

  // Stored payload / callback history. All routes sit under the preHandler gate above and every query is scoped to the session org.
  const encodeCursor = (d: Date, id: string) => Buffer.from(`${d.toISOString()}|${id}`).toString("base64url");
  const decodeCursor = (c: string): { at: Date; id: string } | null => {
    if (c.length > 200 || !/^[A-Za-z0-9_-]+$/.test(c)) return null;
    const parts = Buffer.from(c, "base64url").toString("utf8").split("|");
    if (parts.length !== 2) return null;
    const [iso, id] = parts as [string, string];
    if (!CURSOR_ISO_RE.test(iso) || !UUID_RE.test(id)) return null;
    const at = new Date(iso);
    const year = at.getUTCFullYear();
    return Number.isNaN(at.getTime()) || year < 2000 || year > 2100 ? null : { at, id };
  };
  const pageLimit = (q: Record<string, unknown>): number | null => {
    const raw = qp(q["limit"]);
    if (raw === undefined) return 50;
    if (!/^\d{1,3}$/.test(raw)) return null;
    const n = Number(raw);
    return n >= 1 && n <= 100 ? n : null;
  };
  /** Sibling key of organizationId in the same where object, so it is AND-ed with it and never replaces it. */
  const before = (c: { at: Date; id: string }) => ({ OR: [{ createdAt: { lt: c.at } }, { createdAt: c.at, id: { lt: c.id } }] });

  fastify.get<{ Querystring: Record<string, unknown> }>("/api-usage/payloads", async (request, reply) => {
    const q = request.query ?? {};
    const limit = pageLimit(q);
    if (limit === null) return invalid(reply, "limit must be an integer between 1 and 100");
    const outcome = qp(q["outcome"]);
    if (outcome !== undefined && !OUTCOMES.has(outcome)) return invalid(reply, "outcome must be success, client_error, server_error or error");
    const endpoint = qp(q["endpoint"]);
    if (endpoint !== undefined && !ENDPOINTS.has(endpoint)) return invalid(reply, "endpoint is not a known endpoint");
    const apiKeyId = qp(q["apiKeyId"]);
    if (apiKeyId !== undefined && !ID_RE.test(apiKeyId)) return invalid(reply, "apiKeyId is invalid");
    const cursorRaw = qp(q["cursor"]);
    const cursor = cursorRaw === undefined ? null : decodeCursor(cursorRaw);
    if (cursorRaw !== undefined && !cursor) return invalid(reply, "cursor is invalid");

    const rows = await fastify.prisma.apiRequestPayload.findMany({
      where: {
        organizationId: request.auth.organizationId,
        ...(outcome ? { outcome: outcome === "error" ? { in: ["client_error", "server_error"] } : outcome } : {}),
        ...(endpoint ? { endpoint } : {}),
        ...(apiKeyId ? { apiKeyId } : {}),
        ...(cursor ? before(cursor) : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      select: { id: true, createdAt: true, method: true, endpoint: true, statusCode: true, outcome: true, errorClass: true, errorCode: true, durationMs: true, apiKeyId: true },
    });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return reply.send({
      enabled: process.env["API_PAYLOAD_LOGGING_ENABLED"] === "true",
      data: page,
      nextCursor: rows.length > limit && last ? encodeCursor(last.createdAt, last.id) : null,
    });
  });

  fastify.get<{ Params: { id: string } }>("/api-usage/payloads/:id", async (request, reply) => {
    if (!UUID_RE.test(request.params.id)) return invalid(reply, "id is invalid");
    const row = await fastify.prisma.apiRequestPayload.findFirst({ where: { id: request.params.id, organizationId: request.auth.organizationId } });
    if (!row) return notFound(reply);
    return reply.send(row);
  });

  fastify.get<{ Querystring: Record<string, unknown> }>("/api-usage/callbacks", async (request, reply) => {
    const q = request.query ?? {};
    const limit = pageLimit(q);
    if (limit === null) return invalid(reply, "limit must be an integer between 1 and 100");
    const messageId = qp(q["messageId"]);
    if (messageId !== undefined && !UUID_RE.test(messageId)) return invalid(reply, "messageId is invalid");
    const cursorRaw = qp(q["cursor"]);
    const cursor = cursorRaw === undefined ? null : decodeCursor(cursorRaw);
    if (cursorRaw !== undefined && !cursor) return invalid(reply, "cursor is invalid");
    const rows = await fastify.prisma.apiCallbackAttempt.findMany({
      where: { organizationId: request.auth.organizationId, ...(messageId ? { messageId } : {}), ...(cursor ? before(cursor) : {}) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      select: { id: true, createdAt: true, messageId: true, url: true, method: true, attempt: true, outcome: true, httpStatus: true, reason: true, durationMs: true, fields: true },
    });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return reply.send({ data: page, nextCursor: rows.length > limit && last ? encodeCursor(last.createdAt, last.id) : null });
  });
};
