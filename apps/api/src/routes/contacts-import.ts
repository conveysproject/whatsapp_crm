import type { FastifyPluginAsync } from "fastify";
import { randomUUID, createHmac, timingSafeEqual } from "crypto";
import Papa from "papaparse";
import type { LifecycleStage, Prisma } from "@prisma/client";
import { redis } from "../lib/redis.js";
import { contactImportQueue } from "../lib/queue.js";
import { normalizeFullPhone, normalizeSplitPhone } from "../lib/phone-normalize.js";
import type { FieldMapping, ContactImportId } from "@WBMSG/shared";

const CSV_SESSION_TTL_SECONDS = 1800; // 30 minutes

function generateImportToken(importJobId: string, organizationId: string): string {
  const secret = process.env["IMPORT_TOKEN_SECRET"] ?? "dev-import-secret-change-in-prod";
  const exp = Math.floor(Date.now() / 1000) + CSV_SESSION_TTL_SECONDS;
  const payload = `${importJobId}:${organizationId}:${exp}`;
  const sig = createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}:${sig}`;
}

function verifyImportToken(token: string, expectedJobId: string): string | null {
  const lastColon = token.lastIndexOf(":");
  if (lastColon === -1) return null;
  const payload = token.slice(0, lastColon);
  const sig = token.slice(lastColon + 1);
  const parts = payload.split(":");
  // payload is jobId:orgId:exp — but jobId and orgId may contain hyphens, not colons
  // so split into exactly 3 parts from the right: exp is last, orgId is second-to-last, rest is jobId
  if (parts.length < 3) return null;
  const exp = parseInt(parts[parts.length - 1]!, 10);
  const orgId = parts[parts.length - 2]!;
  const jobId = parts.slice(0, parts.length - 2).join(":");
  if (jobId !== expectedJobId) return null;
  if (isNaN(exp) || Math.floor(Date.now() / 1000) > exp) return null;
  const secret = process.env["IMPORT_TOKEN_SECRET"] ?? "dev-import-secret-change-in-prod";
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  try {
    const sigBuf = Buffer.from(sig, "hex");
    const expBuf = Buffer.from(expected, "hex");
    if (sigBuf.length !== expBuf.length) return null;
    if (!timingSafeEqual(sigBuf, expBuf)) return null;
  } catch {
    return null;
  }
  return orgId;
}

function streamParseCSV(csvText: string): Promise<Array<Record<string, string>>> {
  return new Promise((resolve, reject) => {
    const rows: Array<Record<string, string>> = [];
    let chunk: Array<Record<string, string>> = [];

    Papa.parse<Record<string, string>>(csvText, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      step: (result, parser) => {
        chunk.push(result.data);
        if (chunk.length >= 500) {
          rows.push(...chunk);
          chunk = [];
          parser.pause();
          setImmediate(() => parser.resume());
        }
      },
      complete: () => {
        rows.push(...chunk);
        resolve(rows);
      },
      error: (err: Error) => reject(err),
    });
  });
}

export const contactsImportRouter: FastifyPluginAsync = async (fastify) => {
  fastify.post("/contacts/import/upload", async (request, reply) => {
    const file = await (request as unknown as {
      file: () => Promise<{ toBuffer: () => Promise<Buffer> } | null>;
    }).file();

    if (!file) {
      return reply.status(400).send({ error: { code: "NO_FILE", message: "No file uploaded" } });
    }

    const fileWithName = file as unknown as { fieldname: string; toBuffer: () => Promise<Buffer> };
    if (fileWithName.fieldname !== "file") {
      return reply.status(400).send({ error: { code: "INVALID_FIELD", message: "File must be sent in a field named 'file'" } });
    }

    const buffer = await fileWithName.toBuffer();
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

      const rows = await streamParseCSV(csvText);

      const fullPhoneEntry = fieldMapping.find((e) => e.dbField === "fullPhoneNumber");
      const phoneEntry = fieldMapping.find((e) => e.dbField === "phoneNumber");
      const ccEntry = fieldMapping.find((e) => e.dbField === "countryCode");

      const seenPhones = new Set<string>();
      let duplicatesInCsv = 0;
      const uniquePhones: string[] = [];

      for (const row of rows) {
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
          totalRows: rows.length,
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

    const importToken = generateImportToken(importRecord.id, organizationId);
    return reply.send({ data: { importJobId: importRecord.id as ContactImportId, importToken } });
  });

  fastify.delete<{ Params: { sessionId: string } }>(
    "/contacts/import/session/:sessionId",
    async (request, reply) => {
      const { sessionId } = request.params;
      await redis.del(`import:csv:${sessionId}`);
      return reply.status(204).send();
    }
  );

  // SSE endpoint — EventSource cannot send auth headers, so Clerk auth is skipped
  // via config.public and access is controlled by the short-lived HMAC token
  // issued by /start and passed as ?token= query param.
  fastify.get<{ Params: { jobId: string }; Querystring: { token?: string } }>(
    "/contacts/import/:jobId/progress",
    { config: { public: true } },
    (request, reply) => {
      const { jobId } = request.params;
      const { token } = request.query;

      if (!token) {
        reply.status(401).send({ error: { code: "MISSING_TOKEN", message: "Missing import token" } });
        return;
      }
      const orgId = verifyImportToken(token, jobId);
      if (!orgId) {
        reply.status(401).send({ error: { code: "INVALID_TOKEN", message: "Invalid or expired import token" } });
        return;
      }

      reply.hijack();
      reply.raw.socket?.setNoDelay(true);
      // Set CORS headers for SSE
      // Use env variable for allowed origin
      const allowedOrigin = process.env["CORS_ORIGIN"] || "*";
      reply.raw.setHeader("Access-Control-Allow-Origin", allowedOrigin);
      reply.raw.setHeader("Vary", "Origin");
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
      });
      reply.raw.flushHeaders();

      // Send an immediate comment so Railway's proxy doesn't close the idle connection
      reply.raw.write(": connected\n\n");

      const send = (data: object) => {
        try {
          if (reply.raw.writable) reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
        } catch { /* socket already closed */ }
      };

      let closed = false;
      const finish = (progress: Record<string, unknown> & { status: string }) => {
        if (closed) return;
        closed = true;
        clearInterval(interval);
        clearInterval(heartbeat);
        // Single message carries both progress data and done signal so the
        // browser receives everything before the socket closes
        send({ ...progress, event: "done" });
        setTimeout(() => { try { reply.raw.end(); } catch { /* ignore */ } }, 250);
        console.log(`[sse] sent done event for jobId=${jobId} status=${progress.status}`);
      };

      // Heartbeat keeps Railway's proxy from timing out the connection
      const heartbeat = setInterval(() => {
        try {
          if (reply.raw.writable) reply.raw.write(": heartbeat\n\n");
          else clearInterval(heartbeat);
        } catch { clearInterval(heartbeat); }
      }, 15000);

      const checkProgress = async () => {
        const raw = await redis.get(`import:progress:${jobId}`);
        if (!raw) return false;
        const progress = JSON.parse(raw) as Record<string, unknown> & { status: string };
        if (progress.status === "completed" || progress.status === "failed") {
          finish(progress);
          return true;
        }
        send(progress);
        return false;
      };

      // Check immediately in case the job already completed before SSE opened
      void checkProgress();

      const interval = setInterval(() => {
        void checkProgress();
      }, 1000);

      request.raw.on("close", () => {
        clearInterval(interval);
        clearInterval(heartbeat);
      });
    }
  );
};
