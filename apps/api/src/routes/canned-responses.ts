import type { FastifyPluginAsync } from "fastify";
import { Prisma } from "@prisma/client";
import { canAccess } from "../lib/permissions.js";

interface CannedResponseBody {
  name: string;
  shortcut?: string;
  content: string;
  mediaData?: Record<string, unknown>;
}

export const cannedResponsesRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/canned-responses", async (request, reply) => {
    const { organizationId } = request.auth;
    // GAP-S17: exclude NT campaign presets from regular canned response list
    const data = await fastify.prisma.cannedResponse.findMany({
      where: { organizationId, category: "general" },
      orderBy: { name: "asc" },
    });
    return reply.send({ data });
  });

  fastify.post<{ Body: CannedResponseBody }>("/canned-responses", async (request, reply) => {
    const { organizationId, role, permissions } = request.auth;
    if (!canAccess(role, permissions, "manage_bot_replies")) {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Permission required: manage_bot_replies" } });
    }
    const { name, shortcut, content, mediaData } = request.body;
    const data = await fastify.prisma.cannedResponse.create({
      data: { organizationId, name, shortcut: shortcut ?? null, content, mediaData: (mediaData !== undefined ? mediaData as Prisma.InputJsonValue : Prisma.DbNull), category: "general" },
    });
    return reply.status(201).send({ data });
  });

  fastify.put<{ Params: { id: string }; Body: Partial<CannedResponseBody> }>(
    "/canned-responses/:id",
    async (request, reply) => {
      const { organizationId, role, permissions } = request.auth;
      if (!canAccess(role, permissions, "manage_bot_replies")) {
        return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Permission required: manage_bot_replies" } });
      }
      const existing = await fastify.prisma.cannedResponse.findFirst({
        where: { id: request.params.id, organizationId },
      });
      if (!existing) return reply.status(404).send({ error: "Not found" });
      const { name, shortcut, content, mediaData } = request.body;
      const data = await fastify.prisma.cannedResponse.update({
        where: { id: request.params.id },
        data: {
          ...(name !== undefined && { name }),
          ...(shortcut !== undefined && { shortcut }),
          ...(content !== undefined && { content }),
          ...(mediaData !== undefined && { mediaData: mediaData as Prisma.InputJsonValue }),
        },
      });
      return reply.send({ data });
    }
  );

  fastify.delete<{ Params: { id: string } }>("/canned-responses/:id", async (request, reply) => {
    const { organizationId, role, permissions } = request.auth;
    if (!canAccess(role, permissions, "manage_bot_replies")) {
      return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Permission required: manage_bot_replies" } });
    }
    const existing = await fastify.prisma.cannedResponse.findFirst({
      where: { id: request.params.id, organizationId },
    });
    if (!existing) return reply.status(404).send({ error: "Not found" });
    await fastify.prisma.cannedResponse.delete({ where: { id: request.params.id } });
    return reply.status(204).send();
  });
};
