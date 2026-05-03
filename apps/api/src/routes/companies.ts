import type { FastifyPluginAsync } from "fastify";
import { paginate, parsePaginationParams } from "../lib/pagination.js";
import type { CompanyId } from "@WBMSG/shared";

interface CompanyBody {
  name: string;
  domain?: string;
  industry?: string;
}

interface CompanyPatchBody {
  name?: string;
  domain?: string;
  industry?: string;
}

export const companiesRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/companies", async (request, reply) => {
    const { organizationId } = request.auth;
    const { cursor, limit } = parsePaginationParams(request.query as Record<string, string>);

    const companies = await fastify.prisma.company.findMany({
      where: {
        organizationId,
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      take: limit + 1,
      orderBy: { id: "asc" },
    });

    return reply.send(paginate(companies, limit));
  });

  fastify.get<{ Params: { id: CompanyId } }>("/companies/:id", async (request, reply) => {
    const { organizationId } = request.auth;
    const company = await fastify.prisma.company.findFirst({
      where: { id: request.params.id, organizationId },
    });
    if (!company) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Company not found" } });
    }
    return reply.send({ data: company });
  });

  fastify.post<{ Body: CompanyBody }>("/companies", async (request, reply) => {
    const { organizationId } = request.auth;
    const company = await fastify.prisma.company.create({
      data: {
        organizationId,
        name: request.body.name,
        domain: request.body.domain ?? null,
        industry: request.body.industry ?? null,
      },
    });
    return reply.status(201).send({ data: company });
  });

  fastify.patch<{ Params: { id: CompanyId }; Body: CompanyPatchBody }>(
    "/companies/:id",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const existing = await fastify.prisma.company.findFirst({
        where: { id: request.params.id, organizationId },
      });
      if (!existing) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Company not found" } });
      }
      const company = await fastify.prisma.company.update({
        where: { id: request.params.id },
        data: request.body,
      });
      return reply.send({ data: company });
    }
  );

  fastify.delete<{ Params: { id: CompanyId } }>("/companies/:id", async (request, reply) => {
    const { organizationId } = request.auth;
    const existing = await fastify.prisma.company.findFirst({
      where: { id: request.params.id, organizationId },
    });
    if (!existing) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Company not found" } });
    }
    await fastify.prisma.company.delete({ where: { id: request.params.id } });
    return reply.status(204).send();
  });
};
