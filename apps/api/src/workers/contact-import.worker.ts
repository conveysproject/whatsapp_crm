import { Worker, UnrecoverableError } from "bullmq";
import Papa from "papaparse";
import { Meilisearch } from "meilisearch";
import type { LifecycleStage, Prisma } from "@prisma/client";
import { redisConnection } from "../lib/queue.js";
import { redis } from "../lib/redis.js";
import { prisma } from "../lib/prisma.js";
import { normalizeFullPhone, normalizeSplitPhone } from "../lib/phone-normalize.js";
import type { FieldMapping } from "@WBMSG/shared";

interface ContactImportJob {
  importId: string;
  sessionId: string;
  organizationId: string;
  fieldMapping: FieldMapping;
  batchTags: string[];
  lifecycleStage: string;
  updateExisting: boolean;
}

const meili = new Meilisearch({
  host: process.env["MEILISEARCH_URL"] ?? "http://localhost:7700",
  apiKey: process.env["MEILISEARCH_KEY"] ?? "",
});

function extractPhone(row: Record<string, string>, mapping: FieldMapping): string | null {
  const full = mapping.find((e) => e.dbField === "fullPhoneNumber");
  const phone = mapping.find((e) => e.dbField === "phoneNumber");
  const cc = mapping.find((e) => e.dbField === "countryCode");
  if (full) {
    const normalized = normalizeFullPhone(row[full.csvColumn] ?? "");
    if (normalized) return normalized;
  }
  if (phone && cc) return normalizeSplitPhone(row[cc.csvColumn] ?? "", row[phone.csvColumn] ?? "");
  return null;
}

function extractField(row: Record<string, string>, mapping: FieldMapping, dbField: string): string | undefined {
  const entry = mapping.find((e) => e.dbField === dbField);
  return entry ? (row[entry.csvColumn] ?? "").trim() || undefined : undefined;
}

function mergeTagsUnion(csvTagsRaw: string | undefined, batchTags: string[]): string[] {
  const csvTags = csvTagsRaw ? csvTagsRaw.split(";").map((t) => t.trim()).filter(Boolean) : [];
  return Array.from(new Set([...batchTags, ...csvTags]));
}

async function writeProgress(
  importId: string,
  processed: number,
  total: number,
  created: number,
  updated: number,
  skipped: number,
  status: string
): Promise<void> {
  await redis.set(
    `import:progress:${importId}`,
    JSON.stringify({ processed, total, created, updated, skipped, status }),
    "EX",
    7200
  );
}

export const contactImportWorker = new Worker<ContactImportJob>(
  "contact-import",
  async (job) => {
    const { importId, sessionId, organizationId, fieldMapping, batchTags, lifecycleStage, updateExisting } = job.data;
    console.log(`[contact-import] job started importId=${importId}`);

    await prisma.contactImport.update({ where: { id: importId }, data: { status: "processing" } });

    const csvText = await redis.get(`import:csv:${sessionId}`);
    if (!csvText) {
      await prisma.contactImport.update({
        where: { id: importId },
        data: { status: "failed", errorSummary: { message: "Upload session expired. Please re-upload the file." } as Prisma.InputJsonValue },
      });
      await redis.set(
        `import:progress:${importId}`,
        JSON.stringify({ status: "failed", processed: 0, total: 0, created: 0, updated: 0, skipped: 0 }),
        "EX", 7200
      );
      throw new UnrecoverableError("CSV session expired — no retries");
    }
    await redis.del(`import:csv:${sessionId}`);

    const parsed = Papa.parse<Record<string, string>>(csvText, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
    });

    const rows = parsed.data;
    const BATCH_SIZE = 500;
    const seenPhones = new Set<string>();
    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errorSamples: Array<{ row: number; reason: string }> = [];

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const validRows: Array<{ phone: string; row: Record<string, string> }> = [];

      for (let j = 0; j < batch.length; j++) {
        const row = batch[j]!;
        const phone = extractPhone(row, fieldMapping);
        if (!phone) {
          skipped++;
          if (errorSamples.length < 50) errorSamples.push({ row: i + j + 1, reason: "Invalid or missing phone number" });
          continue;
        }
        if (seenPhones.has(phone)) {
          skipped++;
          continue;
        }
        seenPhones.add(phone);
        validRows.push({ phone, row });
      }

      if (validRows.length) {
        const batchPhones = validRows.map((r) => r.phone);
        const existingContacts = await prisma.contact.findMany({
          where: { organizationId, phoneNumber: { in: batchPhones } },
          select: { id: true, phoneNumber: true },
        });
        const existingMap = new Map(existingContacts.map((c) => [c.phoneNumber, c.id]));

        const toCreate: Prisma.ContactCreateManyInput[] = [];
        const toUpdate: Array<{ id: string; phone: string; data: Prisma.ContactUpdateInput }> = [];

        for (const { phone, row } of validRows) {
          const existingId = existingMap.get(phone);
          const tags = mergeTagsUnion(extractField(row, fieldMapping, "tags"), batchTags);
          const name = extractField(row, fieldMapping, "name") ?? null;
          const email = extractField(row, fieldMapping, "email") ?? null;
          const csvLifecycle = extractField(row, fieldMapping, "lifecycleStage");
          const stage = (csvLifecycle || lifecycleStage) as LifecycleStage;

          if (existingId && updateExisting) {
            toUpdate.push({ id: existingId, phone, data: { name, email, lifecycleStage: stage, tags } });
          } else if (!existingId) {
            toCreate.push({ organizationId, phoneNumber: phone, name, email, lifecycleStage: stage, tags });
          } else {
            skipped++;
          }
        }

        if (toCreate.length) {
          const result = await prisma.contact.createMany({ data: toCreate, skipDuplicates: true });
          created += result.count;
        }

        for (const { id, data } of toUpdate) {
          try {
            await prisma.contact.update({ where: { id }, data });
            updated++;
          } catch {
            skipped++;
            if (errorSamples.length < 50) errorSamples.push({ row: 0, reason: `Update failed for contact ${id}` });
          }
        }

        // Bulk Meilisearch index — non-fatal if it fails
        try {
          const phonesToIndex = [
            ...toCreate.map((c) => c.phoneNumber),
            ...toUpdate.map((u) => u.phone),
          ];
          if (phonesToIndex.length) {
            const contacts = await prisma.contact.findMany({
              where: { organizationId, phoneNumber: { in: phonesToIndex } },
              select: { id: true, organizationId: true, name: true, phoneNumber: true, email: true, lifecycleStage: true },
            });
            await meili.index("contacts").addDocuments(contacts);
          }
        } catch {
          // Search index lag is acceptable; contacts are in DB
        }
      }

      await writeProgress(importId, i + batch.length, rows.length, created, updated, skipped, "processing");
      await prisma.contactImport.update({
        where: { id: importId },
        data: { processedRows: created + updated + skipped, createdCount: created, updatedCount: updated, skippedCount: skipped },
      });
    }

    await prisma.contactImport.update({
      where: { id: importId },
      data: {
        status: "completed",
        completedAt: new Date(),
        errorSummary: errorSamples.length ? (errorSamples as unknown as Prisma.InputJsonValue) : undefined,
      },
    });

    await writeProgress(importId, rows.length, rows.length, created, updated, skipped, "completed");
  },
  { connection: redisConnection, concurrency: 1 }
);

console.log("[contact-import] worker instance created");

contactImportWorker.on("active", (job) => {
  console.log(`[contact-import] job active id=${job.id} importId=${job.data.importId}`);
});

contactImportWorker.on("completed", (job) => {
  console.log(`[contact-import] job completed id=${job.id} importId=${job.data.importId}`);
});

contactImportWorker.on("failed", async (job, err) => {
  console.error(`[contact-import] job failed importId=${job?.data?.importId} err=${err.message}`);
  if (!job) return;
  const { importId } = job.data;
  await prisma.contactImport
    .update({
      where: { id: importId },
      data: { status: "failed", errorSummary: { message: err.message } as Prisma.InputJsonValue },
    })
    .catch(() => undefined);
  await redis
    .set(`import:progress:${importId}`, JSON.stringify({ status: "failed" }), "EX", 7200)
    .catch(() => undefined);
});

contactImportWorker.on("error", (err) => {
  console.error(`[contact-import] worker error: ${err.message}`);
});
