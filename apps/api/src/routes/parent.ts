import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { randomBytes } from "crypto";
import { prisma } from "../lib/prisma.js";
import { redis } from "../lib/redis.js";
import { incrWithTtl } from "../lib/redis-counter.js";
import { canAccess } from "../lib/permissions.js";
import { canBeParent, isChildOf, ParentLinkError, parentOrgsEnabled, unlinkChild } from "../lib/parent-orgs.js";
import {
  ChildNotFoundError,
  getChildMessages,
  getChildrenOverview,
  getChildStats,
  InvalidCursorError,
  type DateRange,
} from "../lib/parent-dashboard-queries.js";

const DAY_MS = 86_400_000;
const DEFAULT_RANGE_DAYS = 30;
const IMPERSONATION_TTL_SECONDS = 900;
const MAX_RANGE_DAYS = 366;

const notFound = (reply: FastifyReply) =>
  reply.status(404).send({ error: { code: "NOT_FOUND", message: "Not found" } });

// One body for "unknown", "someone else's" and "yourself": callers cannot probe org ids.
const forbiddenChild = (reply: FastifyReply) =>
  reply.status(403).send({ error: { code: "FORBIDDEN_CHILD", message: "Not available" } });

/** Flag, permission and parent-capability gate. Same order as client-invitations. D15: the admin role only. */
async function parentGuard(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply | undefined> {
  if (!parentOrgsEnabled()) return notFound(reply);
  const { role, permissions, organizationId } = request.auth;
  if (role !== "admin" || !canAccess(role, permissions, "parent_access")) {
    return reply.status(403).send({ error: { code: "FORBIDDEN", message: "parent_access permission required" } });
  }
  if (!(await canBeParent(prisma, organizationId))) {
    return reply
      .status(403)
      .send({ error: { code: "NOT_A_PARENT", message: "This organization is not a parent account." } });
  }
  return undefined;
}

function parseRange(q: { from?: string; to?: string }): DateRange | { error: string } {
  const to = q.to ? new Date(q.to) : new Date();
  const from = q.from ? new Date(q.from) : new Date(to.getTime() - DEFAULT_RANGE_DAYS * DAY_MS);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return { error: "from and to must be valid dates" };
  if (from.getTime() > to.getTime()) return { error: "from must not be after to" };
  if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * DAY_MS) {
    return { error: `range must not exceed ${MAX_RANGE_DAYS} days` };
  }
  return { from, to };
}

const invalidRange = (reply: FastifyReply, message: string) =>
  reply.status(400).send({ error: { code: "INVALID_RANGE", message } });

const rangeQuery = {
  type: "object",
  properties: { from: { type: "string", maxLength: 40 }, to: { type: "string", maxLength: 40 } },
} as const;

const childParams = {
  type: "object",
  properties: { childId: { type: "string", maxLength: 64 } },
  required: ["childId"],
} as const;

const rangeJson = (r: DateRange) => ({ from: r.from.toISOString(), to: r.to.toISOString() });

export const parentRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { from?: string; to?: string } }>(
    "/parent/children",
    { preHandler: parentGuard, schema: { querystring: rangeQuery } },
    async (request, reply) => {
      const range = parseRange(request.query);
      if ("error" in range) return invalidRange(reply, range.error);
      const data = await getChildrenOverview(prisma, request.auth.organizationId, range);
      return reply.send({ data, range: rangeJson(range) });
    },
  );

  fastify.get<{ Querystring: { from?: string; to?: string } }>(
    "/parent/dashboard",
    { preHandler: parentGuard, schema: { querystring: rangeQuery } },
    async (request, reply) => {
      const range = parseRange(request.query);
      if ("error" in range) return invalidRange(reply, range.error);
      const children = await getChildrenOverview(prisma, request.auth.organizationId, range);
      const totals = { sent: 0, delivered: 0, read: 0, failed: 0, received: 0 };
      for (const c of children) {
        totals.sent += c.sent;
        totals.delivered += c.delivered;
        totals.read += c.read;
        totals.failed += c.failed;
        totals.received += c.received;
      }
      return reply.send({ data: { range: rangeJson(range), totals, children } });
    },
  );

  fastify.get<{ Params: { childId: string }; Querystring: { from?: string; to?: string } }>(
    "/parent/children/:childId/stats",
    { preHandler: parentGuard, schema: { params: childParams, querystring: rangeQuery } },
    async (request, reply) => {
      const range = parseRange(request.query);
      if ("error" in range) return invalidRange(reply, range.error);
      try {
        const data = await getChildStats(prisma, request.auth.organizationId, request.params.childId, range);
        return reply.send({ data, range: rangeJson(range) });
      } catch (err) {
        if (err instanceof ChildNotFoundError) return forbiddenChild(reply);
        throw err;
      }
    },
  );

  // The "parent can read everything" path: every request is audited, and it fails closed
  // (no audit row, no content).
  fastify.get<{ Params: { childId: string }; Querystring: { cursor?: string; limit?: number } }>(
    "/parent/children/:childId/messages",
    {
      config: {
        rateLimit: {
          hook: "preHandler",
          max: 60,
          timeWindow: "1 minute",
          keyGenerator: (req) => `parent-content:${req.auth?.organizationId ?? req.ip}`,
        },
      },
      preHandler: parentGuard,
      schema: {
        params: childParams,
        querystring: {
          type: "object",
          properties: {
            cursor: { type: "string", maxLength: 64 },
            limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
          },
        },
      },
    },
    async (request, reply) => {
      // A super admin impersonating the parent admin must not create content reads in the parent user's name.
      if (request.auth.impersonation) return forbiddenChild(reply);
      const parentOrganizationId = request.auth.organizationId;
      const { childId } = request.params;
      const { cursor } = request.query;
      try {
        const { items, nextCursor } = await getChildMessages(prisma, parentOrganizationId, childId, {
          ...(cursor ? { cursor } : {}),
          limit: request.query.limit ?? 50,
        });
        await prisma.parentAuditEvent.create({
          data: {
            parentOrganizationId,
            childOrganizationId: childId,
            actorUserId: request.auth.userId,
            action: "content_read",
            metadata: { count: items.length, cursor: cursor ?? null },
          },
        });
        return reply.send({ data: items, nextCursor });
      } catch (err) {
        if (err instanceof ChildNotFoundError) return forbiddenChild(reply);
        if (err instanceof InvalidCursorError) {
          return reply.status(400).send({ error: { code: "INVALID_CURSOR", message: "Invalid cursor" } });
        }
        throw err;
      }
    },
  );

  // Parent admin removes a child link (D12). Same generic 403 as every other child route for unknown,
  // foreign or already-unlinked ids. unlinkChild writes the audit event.
  fastify.delete<{ Params: { childId: string } }>(
    "/parent/children/:childId",
    { preHandler: parentGuard, schema: { params: childParams } },
    async (request, reply) => {
      if (request.auth.impersonation) return forbiddenChild(reply);
      if (request.auth.role !== "admin") return forbiddenChild(reply);
      const { childId } = request.params;
      if (!(await isChildOf(prisma, request.auth.organizationId, childId))) return forbiddenChild(reply);
      try {
        await unlinkChild(prisma, childId, "parent", request.auth.userId);
      } catch (err) {
        if (err instanceof ParentLinkError && (err.code === "NOT_A_CHILD" || err.code === "ORG_NOT_FOUND")) {
          return forbiddenChild(reply);
        }
        throw err;
      }
      return reply.send({ data: { removed: true } });
    },
  );

  // ── Parent admin opens a child as admin (impersonation) ───────────────────
  // Same shape as the super-admin flow in admin.ts: ImpersonationLog FIRST, then the Redis token
  // (15 min), then the parent audit row. The session is read-only until the issuer elevates it.
  // The auth plugin re-checks the whole parent/child relationship on every request that uses the token.
  fastify.post<{ Params: { childId: string }; Body: { userId?: string } }>(
    "/parent/children/:childId/impersonate",
    {
      preHandler: parentGuard,
      schema: {
        params: childParams,
        body: {
          type: "object",
          properties: { userId: { type: "string", minLength: 1, maxLength: 64 } },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      if (request.auth.impersonation) return forbiddenChild(reply); // no nested sessions
      if (request.auth.role !== "admin") return forbiddenChild(reply); // D15: the parent's admin role only
      const { childId } = request.params;
      const actorId = request.auth.userId;
      const parentOrganizationId = request.auth.organizationId;

      // Per-actor rate limit: max 10 tokens per hour. INCR and EXPIRE run in one script, so the counter
      // always has a TTL (SET NX then INCR could recreate an expired key without one). Fails closed.
      const actorKey = `impersonate:parent-actor:${actorId}`;
      const count = await incrWithTtl(redis, actorKey, 3600);
      if (count > 10) {
        return reply.status(429).send({ error: { code: "RATE_LIMITED", message: "Impersonation limit reached (10/hour)" } });
      }

      if (!(await isChildOf(prisma, parentOrganizationId, childId))) return forbiddenChild(reply);

      // Target: inside THE CHILD only, active, not deleted, never a super admin. One generic 403 for every failure.
      const requestedUserId = request.body?.userId;
      const target = await prisma.user.findFirst({
        where: requestedUserId
          ? { id: requestedUserId, organizationId: childId, isActive: true, deletedAt: null }
          : { organizationId: childId, role: "admin", isActive: true, deletedAt: null },
        ...(requestedUserId ? {} : { orderBy: { createdAt: "asc" as const } }),
        select: { id: true, role: true },
      });
      if (!target || target.role === "superAdmin") return forbiddenChild(reply);
      const child = await prisma.organization.findUnique({ where: { id: childId }, select: { name: true } });
      if (!child) return forbiddenChild(reply);

      const token = randomBytes(32).toString("hex");
      // Log FIRST: if it cannot be written, no token exists (no unlogged session).
      await prisma.impersonationLog.create({
        data: {
          actorId,
          organizationId: childId,
          actorOrganizationId: parentOrganizationId,
          orgName: child.name,
          targetUserId: target.id,
          mode: "readonly",
          token,
          ipAddress: request.ip,
          userAgent: request.headers["user-agent"] ?? null,
        },
      });
      await redis.set(
        `impersonate:${token}`,
        JSON.stringify({
          organizationId: childId,
          targetUserId: target.id,
          issuedBy: actorId,
          issuedSid: request.auth.sid ?? null,
          issuedByOrgId: parentOrganizationId,
          mode: "readonly",
        }),
        "EX",
        IMPERSONATION_TTL_SECONDS,
      );
      try {
        await prisma.parentAuditEvent.create({
          data: {
            parentOrganizationId,
            childOrganizationId: childId,
            actorUserId: actorId,
            action: "impersonate_started",
            metadata: { targetUserId: target.id, mode: "readonly", expiresIn: IMPERSONATION_TTL_SECONDS },
          },
        });
      } catch (err) {
        // Fail closed: no audit row, no live session.
        await redis.del(`impersonate:${token}`);
        await prisma.impersonationLog.updateMany({ where: { token, endedAt: null }, data: { endedAt: new Date() } });
        throw err;
      }
      return reply.send({ data: { token, expiresIn: IMPERSONATION_TTL_SECONDS, mode: "readonly" } });
    },
  );

  type ParentSessionPayload = {
    organizationId?: string;
    targetUserId?: string;
    issuedBy?: string;
    issuedSid?: string | null;
    issuedByOrgId?: string;
    mode?: string;
  };
  /** Live parent-issued session for this child, or null. Super-admin tokens (no issuedByOrgId) never match. */
  async function loadParentSession(token: string, parentOrganizationId: string, childId: string) {
    const raw = await redis.get(`impersonate:${token}`);
    let payload: ParentSessionPayload | null = null;
    try { payload = raw ? (JSON.parse(raw) as ParentSessionPayload) : null; } catch { payload = null; }
    if (!payload || payload.issuedByOrgId !== parentOrganizationId || payload.organizationId !== childId || !payload.targetUserId) {
      return null;
    }
    return payload;
  }

  // Elevate to edit mode: only the issuer, from their own (non-impersonation) session, with a reason.
  // Remaining TTL is preserved; log first so a log failure never leaves an unlogged edit session.
  fastify.post<{ Params: { childId: string }; Body: { token: string; reason: string } }>(
    "/parent/children/:childId/impersonate/elevate",
    {
      preHandler: parentGuard,
      schema: {
        params: childParams,
        body: {
          type: "object",
          required: ["token", "reason"],
          properties: {
            token: { type: "string", minLength: 1, maxLength: 200 },
            reason: { type: "string", minLength: 10, maxLength: 500 },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      if (request.auth.impersonation) return forbiddenChild(reply);
      if (request.auth.role !== "admin") return forbiddenChild(reply);
      const { childId } = request.params;
      const { token, reason } = request.body;
      const actorId = request.auth.userId;
      const parentOrganizationId = request.auth.organizationId;
      if (!(await isChildOf(prisma, parentOrganizationId, childId))) return forbiddenChild(reply);
      const sessionNotFound = () =>
        reply.status(404).send({ error: { code: "NOT_FOUND", message: "Impersonation session not found or expired" } });

      const payload = await loadParentSession(token, parentOrganizationId, childId);
      if (!payload) return sessionNotFound();
      if (payload.issuedBy !== actorId || !payload.issuedSid || payload.issuedSid !== request.auth.sid) {
        return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Only the issuing admin can elevate this session" } });
      }
      if (payload.mode === "edit") {
        return reply.status(409).send({ error: { code: "ALREADY_ELEVATED", message: "Session is already in edit mode" } });
      }
      const key = `impersonate:${token}`;
      const ttlMs = await redis.pttl(key);
      if (ttlMs <= 0) return sessionNotFound();

      const logged = await prisma.impersonationLog.updateMany({
        where: { token, actorId, endedAt: null },
        data: { mode: "edit", elevationReason: reason },
      });
      if (logged.count === 0) return sessionNotFound();
      // Audit BEFORE the Redis write: if it throws, the session stays read-only (fail closed).
      await prisma.parentAuditEvent.create({
        data: {
          parentOrganizationId,
          childOrganizationId: childId,
          actorUserId: actorId,
          action: "impersonate_elevated",
          metadata: { targetUserId: payload.targetUserId, reason, remainingMs: ttlMs },
        },
      });
      // XX: only overwrite a key that still exists, so an expired or concurrently ended session is never recreated.
      const written = await redis.set(key, JSON.stringify({ ...payload, mode: "edit" }), "PX", ttlMs, "XX");
      if (written !== "OK") {
        await prisma.impersonationLog.updateMany({ where: { token, endedAt: null }, data: { endedAt: new Date() } });
        return sessionNotFound();
      }
      return reply.send({ data: { mode: "edit", expiresIn: Math.ceil(ttlMs / 1000) } });
    },
  );

  // End a session early: only the issuer. Idempotent for an expired token.
  fastify.delete<{ Params: { childId: string }; Body: { token: string } }>(
    "/parent/children/:childId/impersonate",
    {
      preHandler: parentGuard,
      schema: {
        params: childParams,
        body: {
          type: "object",
          required: ["token"],
          properties: { token: { type: "string", minLength: 1, maxLength: 200 } },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      if (request.auth.impersonation) return forbiddenChild(reply);
      if (request.auth.role !== "admin") return forbiddenChild(reply);
      const { childId } = request.params;
      const { token } = request.body;
      const actorId = request.auth.userId;
      const raw = await redis.get(`impersonate:${token}`);
      if (raw) {
        let parsed: ParentSessionPayload = {};
        try { parsed = JSON.parse(raw) as ParentSessionPayload; } catch { parsed = {}; }
        if (
          parsed.issuedBy !== actorId ||
          parsed.issuedByOrgId !== request.auth.organizationId ||
          parsed.organizationId !== childId
        ) {
          return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Only the issuing admin can end this session" } });
        }
        await redis.del(`impersonate:${token}`);
      }
      await prisma.impersonationLog.updateMany({
        where: { token, actorId, endedAt: null },
        data: { endedAt: new Date() },
      });
      return reply.status(204).send();
    },
  );
};
