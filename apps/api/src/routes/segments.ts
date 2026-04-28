import type { FastifyPluginAsync } from "fastify";
import { evaluateSegment, type SegmentFilter } from "../lib/segment-evaluator.js";
import type { SegmentId } from "@trustcrm/shared";

interface SegmentBody {
  name: string;
  filters: SegmentFilter[];
}

export const segmentsRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/segments", async (request, reply) => {
    const { organizationId } = request.auth;
    const segments = await fastify.prisma.segment.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
    });
    return reply.send({ data: segments });
  });

  fastify.get<{ Params: { id: SegmentId } }>("/segments/:id", async (request, reply) => {
    const { organizationId } = request.auth;
    const segment = await fastify.prisma.segment.findFirst({
      where: { id: request.params.id, organizationId },
    });
    if (!segment) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Segment not found" } });
    }
    return reply.send({ data: segment });
  });

  fastify.post<{ Body: SegmentBody }>("/segments", async (request, reply) => {
    const { organizationId } = request.auth;
    const segment = await fastify.prisma.segment.create({
      data: {
        organizationId,
        name: request.body.name,
        filters: request.body.filters as object,
      },
    });
    return reply.status(201).send({ data: segment });
  });

  fastify.patch<{ Params: { id: SegmentId }; Body: Partial<SegmentBody> }>(
    "/segments/:id",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const existing = await fastify.prisma.segment.findFirst({
        where: { id: request.params.id, organizationId },
      });
      if (!existing) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Segment not found" } });
      }
      const segment = await fastify.prisma.segment.update({
        where: { id: request.params.id },
        data: {
          name: request.body.name,
          filters: request.body.filters as object | undefined,
        },
      });
      return reply.send({ data: segment });
    }
  );

  fastify.delete<{ Params: { id: SegmentId } }>("/segments/:id", async (request, reply) => {
    const { organizationId } = request.auth;
    const existing = await fastify.prisma.segment.findFirst({
      where: { id: request.params.id, organizationId },
    });
    if (!existing) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Segment not found" } });
    }
    await fastify.prisma.segment.delete({ where: { id: request.params.id } });
    return reply.status(204).send();
  });

  fastify.post<{ Params: { id: SegmentId } }>("/segments/:id/evaluate", async (request, reply) => {
    const { organizationId } = request.auth;
    const segment = await fastify.prisma.segment.findFirst({
      where: { id: request.params.id, organizationId },
    });
    if (!segment) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Segment not found" } });
    }
    const phones = await evaluateSegment(
      fastify.prisma,
      organizationId,
      segment.filters as SegmentFilter[]
    );
    return reply.send({ data: { phones, count: phones.length } });
  });
};
