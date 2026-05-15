import type { FastifyPluginAsync } from "fastify";
import { uploadMedia, getMediaUrl, downloadMediaBytes, uploadResumableMedia } from "../lib/whatsapp.js";

const RESUMABLE_THRESHOLD = 50 * 1024 * 1024; // 50MB

export const mediaRouter: FastifyPluginAsync = async (fastify) => {
  // ── Upload media to WhatsApp ──────────────────────────────────────────────
  fastify.post("/media/upload", async (request, reply) => {
    const { organizationId } = request.auth;

    const org = await fastify.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { phoneNumberId: true, wabaAccessToken: true },
    });
    if (!org?.phoneNumberId || !org?.wabaAccessToken) {
      return reply.status(400).send({ error: { code: "WA_NOT_CONFIGURED", message: "WhatsApp account not configured" } });
    }

    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ error: { code: "NO_FILE", message: "No file uploaded" } });
    }

    const chunks: Buffer[] = [];
    for await (const chunk of data.file) {
      chunks.push(chunk as Buffer);
    }
    const file = Buffer.concat(chunks);
    const mimeType = data.mimetype;

    const result = file.byteLength >= RESUMABLE_THRESHOLD
      ? await uploadResumableMedia(org.phoneNumberId, file, mimeType, org.wabaAccessToken)
      : await uploadMedia(org.phoneNumberId, file, mimeType, org.wabaAccessToken);

    return reply.status(201).send({
      data: {
        mediaId: result.mediaId,
        mimeType,
        filename: data.filename,
        size: file.byteLength,
      },
    });
  });

  // ── Proxy download of a WhatsApp media file ──────────────────────────────
  fastify.get<{ Params: { mediaId: string } }>("/media/:mediaId", async (request, reply) => {
    const { organizationId } = request.auth;

    const org = await fastify.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { wabaAccessToken: true },
    });
    if (!org?.wabaAccessToken) {
      return reply.status(400).send({ error: { code: "WA_NOT_CONFIGURED", message: "WhatsApp account not configured" } });
    }

    const { url, mimeType } = await getMediaUrl(request.params.mediaId, org.wabaAccessToken);
    const bytes = await downloadMediaBytes(url, org.wabaAccessToken);

    return reply
      .header("Content-Type", mimeType)
      .header("Content-Length", String(bytes.byteLength))
      .header("Cache-Control", "private, max-age=3600")
      .send(bytes);
  });
};
