import type { FastifyPluginAsync } from "fastify";
import { randomUUID } from "crypto";
import Papa from "papaparse";
import type { LifecycleStage, Prisma } from "@prisma/client";
import { redis } from "../lib/redis.js";
import { contactImportQueue } from "../lib/queue.js";
import { normalizeFullPhone, normalizeSplitPhone } from "../lib/phone-normalize.js";
import type { FieldMapping, ContactImportId } from "@trustcrm/shared";

const CSV_SESSION_TTL_SECONDS = 1800; // 30 minutes

export const contactsImportRouter: FastifyPluginAsync = async (fastify) => {
  fastify.post("/contacts/import/upload", async (request, reply) => {
    const file = await (request as unknown as {
      file: () => Promise<{ toBuffer: () => Promise<Buffer> } | null>;
    }).file();

    if (!file) {
      return reply.status(400).send({ error: { code: "NO_FILE", message: "No file uploaded" } });
    }

    const buffer = await file.toBuffer();
    const csvText = buffer.toString("utf-8");

    const result = Papa.parse<Record<string, string>>(csvText, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      preview: 4,
    });

    if (result.errors.length && !result.data.length) {
      return reply.status(400).send({ error: { code: "INVALID_CSV", message: "Could not parse CSV file" } });
    }

    const columns = result.meta.fields ?? [];
    const sampleRows = result.data.slice(0, 3);
    const sessionId = randomUUID();

    await redis.set(`import:csv:${sessionId}`, csvText, "EX", CSV_SESSION_TTL_SECONDS);

    return reply.send({ data: { sessionId, columns, sampleRows } });
  });

  fastify.post<{ Body: { sessionId: string; fieldMapping: FieldMapping } }>(
    "/contacts/import/analyze",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const { sessionId, fieldMapping } = request.body;

      const csvText = await redis.get(`import:csv:${sessionId}`);
      if (!csvText) {
        return reply.status(404).send({ error: { code: "SESSION_EXPIRED", message: "Upload session expired. Please re-upload your file." } });
      }

      const parsed = Papa.parse<Record<string, string>>(csvText, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h) => h.trim(),
      });

      const fullPhoneEntry = fieldMapping.find((e) => e.dbField === "fullPhoneNumber");
      const phoneEntry = fieldMapping.find((e) => e.dbField === "phoneNumber");
      const ccEntry = fieldMapping.find((e) => e.dbField === "countryCode");

      const seenPhones = new Set<string>();
      let duplicatesInCsv = 0;
      const uniquePhones: string[] = [];

      for (const row of parsed.data) {
        let phone: string | null = null;
        if (fullPhoneEntry) {
          phone = normalizeFullPhone(row[fullPhoneEntry.csvColumn] ?? "");
        }
        if (!phone && phoneEntry && ccEntry) {
          phone = normalizeSplitPhone(row[ccEntry.csvColumn] ?? "", row[phoneEntry.csvColumn] ?? "");
        }
        if (!phone) continue;
        if (seenPhones.has(phone)) {
          duplicatesInCsv++;
        } else {
          seenPhones.add(phone);
          uniquePhones.push(phone);
        }
      }

      const CHUNK = 1000;
      const existingPhones = new Set<string>();
      for (let i = 0; i < uniquePhones.length; i += CHUNK) {
        const chunk = uniquePhones.slice(i, i + CHUNK);
        const found = await fastify.prisma.contact.findMany({
          where: { organizationId, phoneNumber: { in: chunk } },
          select: { phoneNumber: true },
        });
        for (const c of found) existingPhones.add(c.phoneNumber);
      }

      return reply.send({
        data: {
          totalRows: parsed.data.length,
          newContacts: uniquePhones.filter((p) => !existingPhones.has(p)).length,
          duplicatesInCsv,
          existingInDb: existingPhones.size,
        },
      });
    }
  );

  fastify.post<{
    Body: {
      sessionId: string;
      fieldMapping: FieldMapping;
      batchTags: string[];
      lifecycleStage: string;
      updateExisting: boolean;
      totalRows: number;
    };
  }>("/contacts/import/start", async (request, reply) => {
    const { organizationId } = request.auth;
    const { sessionId, fieldMapping, batchTags, lifecycleStage, updateExisting, totalRows } = request.body;

    const importRecord = await fastify.prisma.contactImport.create({
      data: {
        organizationId,
        status: "pending",
        totalRows,
        fieldMapping: fieldMapping as unknown as Prisma.InputJsonValue,
        batchTags,
        lifecycleStage: lifecycleStage as LifecycleStage,
        updateExisting,
      },
    });

    await contactImportQueue.add("process", {
      importId: importRecord.id,
      sessionId,
      organizationId,
      fieldMapping,
      batchTags,
      lifecycleStage,
      updateExisting,
    });

    return reply.send({ data: { importJobId: importRecord.id as ContactImportId } });
  });

  // SSE endpoint — EventSource cannot send auth headers.
  // The importJobId (UUID) is unguessable and scopes access to one read-only stream.
  fastify.get<{ Params: { jobId: string } }>(
    "/contacts/import/:jobId/progress",
    (request, reply) => {
      const { jobId } = request.params;

      reply.hijack();
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      });
      reply.raw.flushHeaders();

      const send = (data: object) => {
        reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      const interval = setInterval(() => {
        void (async () => {
          const raw = await redis.get(`import:progress:${jobId}`);
          if (!raw) return;
          const progress = JSON.parse(raw) as { status: string };
          send(progress);
          if (progress.status === "completed" || progress.status === "failed") {
            send({ event: "done", status: progress.status });
            clearInterval(interval);
            reply.raw.end();
          }
        })();
      }, 1000);

      request.raw.on("close", () => clearInterval(interval));
    }
  );
};
