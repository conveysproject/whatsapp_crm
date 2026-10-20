import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../lib/prisma.js";
import { canAccess } from "../lib/permissions.js";
import { canBeParent, parentOrgsEnabled } from "../lib/parent-orgs.js";
import {
  ChildNotFoundError,
  getChildMessages,
  getChildrenOverview,
  getChildStats,
  type DateRange,
} from "../lib/parent-dashboard-queries.js";

const DAY_MS = 86_400_000;
const DEFAULT_RANGE_DAYS = 30;
const MAX_RANGE_DAYS = 366;

const notFound = (reply: FastifyReply) =>
  reply.status(404).send({ error: { code: "NOT_FOUND", message: "Not found" } });

// One body for "unknown", "someone else's" and "yourself": callers cannot probe org ids.
const forbiddenChild = (reply: FastifyReply) =>
  reply.status(403).send({ error: { code: "FORBIDDEN_CHILD", message: "Not available" } });

/** Flag, permission and parent-capability gate. Same order as client-invitations. */
async function parentGuard(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply | undefined> {
  if (!parentOrgsEnabled()) return notFound(reply);
  const { role, permissions, organizationId } = request.auth;
  if (!canAccess(role, permissions, "parent_access")) {
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
        throw err;
      }
    },
  );
};
