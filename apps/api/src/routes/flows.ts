import type { FastifyPluginAsync } from "fastify";
import { flowQueue } from "../lib/queue.js";
import type { FlowDefinition, FlowTriggerPayload } from "../lib/flow-runner.js";
import { checkPlanLimit } from "../lib/plan-limits.js";
import { canAccess, canAccessSub } from "../lib/permissions.js";

interface FlowBody {
  name: string;
  triggerType: string;
  flowDefinition: FlowDefinition;
}

export const flowsRouter: FastifyPluginAsync = async (fastify) => {
  // Section gate (Phase 2 / D15): every automation route requires automation_access.
  fastify.addHook("preHandler", async (request, reply) => {
    const { role, permissions } = request.auth;
    if (!canAccess(role, permissions, "automation_access")) {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "automation_access permission required" } });
    }
  });

  fastify.get("/flows", async (request, reply) => {
    const { organizationId } = request.auth;
    const flows = await fastify.prisma.flow.findMany({
      where: { organizationId },
      include: { _count: { select: { runs: true } } },
      orderBy: { createdAt: "desc" },
    });
    return reply.send({ data: flows });
  });

  fastify.get<{ Params: { id: string } }>("/flows/:id", async (request, reply) => {
    const { organizationId } = request.auth;
    const flow = await fastify.prisma.flow.findFirst({ where: { id: request.params.id, organizationId } });
    if (!flow) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Flow not found" } });
    return reply.send({ data: flow });
  });

  fastify.post<{ Body: FlowBody }>("/flows", async (request, reply) => {
    const { organizationId, role, permissions } = request.auth;
    // GAP-S04: automation_access + automation_bot_flows sub-permission required
    if (!canAccessSub(role, permissions, "automation_access", "automation_bot_flows")) {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "automation_bot_flows permission required" } });
    }
    const limitCheck = await checkPlanLimit(fastify.prisma, organizationId, "flows");
    if (!limitCheck.allowed) {
      return reply.status(402).send({ error: { code: "PLAN_LIMIT_REACHED", message: `Flow limit of ${limitCheck.limit} reached` } });
    }
    const flow = await fastify.prisma.flow.create({
      data: {
        organizationId,
        name: request.body.name,
        triggerType: request.body.triggerType,
        isActive: false,
        flowDefinition: request.body.flowDefinition as object,
      },
    });
    return reply.status(201).send({ data: flow });
  });

  fastify.patch<{ Params: { id: string }; Body: Partial<FlowBody> & { isActive?: boolean } }>(
    "/flows/:id",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const existing = await fastify.prisma.flow.findFirst({ where: { id: request.params.id, organizationId } });
      if (!existing) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Flow not found" } });
      const flow = await fastify.prisma.flow.update({
        where: { id: request.params.id },
        data: request.body as object,
      });
      return reply.send({ data: flow });
    }
  );

  fastify.delete<{ Params: { id: string } }>("/flows/:id", async (request, reply) => {
    const { organizationId } = request.auth;
    const existing = await fastify.prisma.flow.findFirst({ where: { id: request.params.id, organizationId } });
    if (!existing) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Flow not found" } });
    await fastify.prisma.flow.delete({ where: { id: request.params.id } });
    return reply.status(204).send();
  });

  fastify.post<{ Params: { id: string } }>("/flows/:id/duplicate", async (request, reply) => {
    const { organizationId } = request.auth;
    const original = await fastify.prisma.flow.findFirst({
      where: { id: request.params.id, organizationId },
    });
    if (!original) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Flow not found" } });
    }
    const copy = await fastify.prisma.flow.create({
      data: {
        organizationId,
        name: `Copy of ${original.name}`,
        triggerType: original.triggerType,
        isActive: false,
        flowDefinition: original.flowDefinition as object,
      },
    });
    return reply.status(201).send({ data: copy });
  });

  fastify.get<{
    Params: { id: string };
    Querystring: { limit?: string; cursor?: string };
  }>("/flows/:id/runs", async (request, reply) => {
    const { organizationId } = request.auth;
    const flow = await fastify.prisma.flow.findFirst({
      where: { id: request.params.id, organizationId },
    });
    if (!flow) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Flow not found" } });
    }
    const limit = Math.min(parseInt(request.query.limit ?? "50", 10) || 50, 100);
    const cursor = request.query.cursor;
    const runs = await fastify.prisma.flowRun.findMany({
      where: { flowId: request.params.id, organizationId },
      orderBy: { startedAt: "desc" },
      take: limit,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const nextCursor = runs.length === limit ? (runs[runs.length - 1]?.id ?? null) : null;
    return reply.send({ data: runs, nextCursor });
  });

  fastify.post<{ Params: { id: string }; Body: FlowTriggerPayload }>(
    "/flows/:id/test",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const flow = await fastify.prisma.flow.findFirst({ where: { id: request.params.id, organizationId } });
      if (!flow) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Flow not found" } });

      await flowQueue.add("test-flow", { flowId: flow.id, payload: { ...request.body, organizationId } });
      return reply.send({ data: { status: "queued", message: "Flow test job enqueued" } });
    }
  );
};
