import type { FastifyPluginAsync } from "fastify";
import { uploadToR2, deleteFromR2, R2_PUBLIC_URL } from "../lib/r2.js";

interface CreateUrlBody {
  title: string;
  type: string;
  fileUrl: string;
  description?: string;
}

interface UpdateBody {
  title?: string;
  description?: string;
}

export const mediaAssetsRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { type?: string } }>("/media-assets", async (request, reply) => {
    const { organizationId } = request.auth;
    const { type } = request.query;
    const items = await fastify.prisma.mediaAsset.findMany({
      where: { organizationId, isActive: true, ...(type ? { type } : {}) },
      orderBy: { createdAt: "desc" },
    });
    return reply.send({ data: items });
  });

  fastify.post<{ Body: CreateUrlBody }>("/media-assets", async (request, reply) => {
    const { organizationId } = request.auth;
    const { title, type, fileUrl, description } = request.body;
    if (!title || !type || !fileUrl) {
      return reply.status(400).send({ error: { code: "MISSING_FIELDS", message: "title, type, and fileUrl are required" } });
    }
    const item = await fastify.prisma.mediaAsset.create({
      data: { organizationId, title, type, fileUrl, description: description ?? null },
    });
    return reply.status(201).send({ data: item });
  });

  fastify.post("/media-assets/upload", async (request, reply) => {
    const { organizationId } = request.auth;
    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ error: { code: "NO_FILE", message: "No file uploaded" } });
    }
    const chunks: Buffer[] = [];
    for await (const chunk of data.file) {
      chunks.push(chunk as Buffer);
    }
    const file = Buffer.concat(chunks);

    const titleField = data.fields["title"] as { value?: string } | undefined;
    const descField = data.fields["description"] as { value?: string } | undefined;
    const rawName = titleField?.value ?? data.filename ?? "Untitled";
    const title = rawName.replace(/\.[^/.]+$/, "");
    const mimeType = data.mimetype;
    const type = mimeType.startsWith("image/") ? "image"
      : mimeType.startsWith("video/") ? "video"
      : mimeType.startsWith("audio/") ? "audio"
      : "document";

    const { url } = await uploadToR2(file, organizationId, mimeType);
    const item = await fastify.prisma.mediaAsset.create({
      data: {
        organizationId,
        title,
        type,
        fileUrl: url,
        mimeType,
        fileSizeBytes: file.byteLength,
        description: descField?.value ?? null,
      },
    });
    return reply.status(201).send({ data: item });
  });

  fastify.put<{ Params: { id: string }; Body: UpdateBody }>("/media-assets/:id", async (request, reply) => {
    const { organizationId } = request.auth;
    const existing = await fastify.prisma.mediaAsset.findFirst({
      where: { id: request.params.id, organizationId },
    });
    if (!existing) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Media asset not found" } });
    }
    const { title, description } = request.body;
    const updated = await fastify.prisma.mediaAsset.update({
      where: { id: existing.id },
      data: {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
      },
    });
    return reply.send({ data: updated });
  });

  fastify.delete<{ Params: { id: string } }>("/media-assets/:id", async (request, reply) => {
    const { organizationId } = request.auth;
    const existing = await fastify.prisma.mediaAsset.findFirst({
      where: { id: request.params.id, organizationId },
    });
    if (!existing) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Media asset not found" } });
    }
    if (R2_PUBLIC_URL && existing.fileUrl.startsWith(R2_PUBLIC_URL)) {
      const key = existing.fileUrl.slice(R2_PUBLIC_URL.length + 1);
      await deleteFromR2(key);
      await fastify.prisma.mediaAsset.delete({ where: { id: existing.id } });
    } else {
      await fastify.prisma.mediaAsset.update({ where: { id: existing.id }, data: { isActive: false } });
    }
    return reply.status(204).send();
  });
};
