import type { FastifyPluginAsync } from "fastify";
import { Prisma } from "@prisma/client";

// GAP-S17: Non-template campaign preset messages.
// Stored as CannedResponse with category="nt_campaign".
// Valid for use in the 24h WhatsApp service window (not template-based).

interface PresetBody {
  name: string;
  content: string;
  mediaData?: Record<string, unknown>;
}

export const ntCampaignPresetsRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/nt-campaign-presets", async (request, reply) => {
    const { organizationId } = request.auth;
    const data = await fastify.prisma.cannedResponse.findMany({
      where: { organizationId, category: "nt_campaign" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, content: true, mediaData: true, createdAt: true, updatedAt: true },
    });
    return reply.send({ data });
  });

  fastify.post<{ Body: PresetBody }>("/nt-campaign-presets", async (request, reply) => {
    const { organizationId } = request.auth;
    const { name, content, mediaData } = request.body;
    if (!name || !content) {
      return reply.status(400).send({ error: { code: "INVALID_INPUT", message: "name and content are required" } });
    }
    const data = await fastify.prisma.cannedResponse.create({
      data: {
        organizationId,
        name,
        content,
        mediaData: mediaData !== undefined ? (mediaData as Prisma.InputJsonValue) : Prisma.DbNull,
        category: "nt_campaign",
      },
    });
    return reply.status(201).send({ data });
  });

  fastify.put<{ Params: { id: string }; Body: Partial<PresetBody> }>(
    "/nt-campaign-presets/:id",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const existing = await fastify.prisma.cannedResponse.findFirst({
        where: { id: request.params.id, organizationId, category: "nt_campaign" },
      });
      if (!existing) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Preset not found" } });
      const { name, content, mediaData } = request.body;
      const data = await fastify.prisma.cannedResponse.update({
        where: { id: request.params.id },
        data: {
          ...(name !== undefined && { name }),
          ...(content !== undefined && { content }),
          ...(mediaData !== undefined && { mediaData: mediaData as Prisma.InputJsonValue }),
        },
      });
      return reply.send({ data });
    }
  );

  fastify.delete<{ Params: { id: string } }>("/nt-campaign-presets/:id", async (request, reply) => {
    const { organizationId } = request.auth;
    const existing = await fastify.prisma.cannedResponse.findFirst({
      where: { id: request.params.id, organizationId, category: "nt_campaign" },
    });
    if (!existing) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Preset not found" } });
    await fastify.prisma.cannedResponse.delete({ where: { id: request.params.id } });
    return reply.status(204).send();
  });
};
