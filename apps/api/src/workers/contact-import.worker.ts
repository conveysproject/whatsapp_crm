import { Worker, UnrecoverableError } from "bullmq";
import Papa from "papaparse";

import type { Prisma } from "@prisma/client";
import { redisConnection } from "../lib/queue.js";
import { redis } from "../lib/redis.js";
import { prisma } from "../lib/prisma.js";
import { getIo } from "../lib/io-ref.js";
import { normalizeFullPhone, normalizeSplitPhone } from "../lib/phone-normalize.js";
import { resolveLeadStatusId } from "../lib/resolve-lead-status.js";
import type { FieldMapping } from "@WBMSG/shared";

const IMPORT_LOCK_TTL_SECONDS = 3600;
const ERROR_CSV_TTL_SECONDS = 86400; // 24 hours

interface ContactImportJob {
  importId: string;
  sessionId: string;
  organizationId: string;
  fieldMapping: FieldMapping;
  batchTags: string[];
  batchGroupIds: string[];
  leadStatusId?: string | null;
  updateExisting: boolean;
}

export function extractFirstLastName(
  row: Record<string, string>,
  mapping: FieldMapping
): { firstName: string | null; lastName: string | null; name: string | null } {
  let firstName: string | null = null;
  let lastName: string | null = null;
  let name: string | null = null;

  const fnEntry = mapping.find((e) => e.dbField === "firstName");
  const lnEntry = mapping.find((e) => e.dbField === "lastName");
  const fullEntry = mapping.find((e) => e.dbField === "fullName");
  const nameEntry = mapping.find((e) => e.dbField === "name");

  if (fnEntry) firstName = (row[fnEntry.csvColumn] ?? "").trim() || null;
  if (lnEntry) lastName = (row[lnEntry.csvColumn] ?? "").trim() || null;
  if (firstName || lastName) {
    name = `${firstName ?? ""} ${lastName ?? ""}`.trim() || null;
  }

  if (fullEntry) {
    const raw = (row[fullEntry.csvColumn] ?? "").trim();
    if (raw) {
      const spaceIdx = raw.indexOf(" ");
      firstName = spaceIdx >= 0 ? raw.slice(0, spaceIdx) : raw;
      lastName = spaceIdx >= 0 ? raw.slice(spaceIdx + 1) : "";
      name = raw;
    }
  }

  if (!name && nameEntry) {
    name = (row[nameEntry.csvColumn] ?? "").trim() || null;
  }

  return { firstName, lastName, name };
}

export function extractCustomFields(
  row: Record<string, string>,
  mapping: FieldMapping,
  cfInputNameMap: Map<string, string> = new Map()
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const entry of mapping) {
    if ((entry.dbField as string).startsWith("customField:")) {
      const id = (entry.dbField as string).slice("customField:".length);
      const key = cfInputNameMap.get(id) ?? id;
      const value = (row[entry.csvColumn] ?? "").trim();
      if (value) result[key] = value;
    }
  }
  return result;
}

export async function assignBatchGroups(
  db: typeof prisma,
  contactIds: string[],
  batchGroupIds: string[]
): Promise<void> {
  if (batchGroupIds.length === 0 || contactIds.length === 0) return;
  const pairs = contactIds.flatMap((contactId) =>
    batchGroupIds.map((contactGroupId) => ({ contactId, contactGroupId }))
  );
  await db.groupContact.createMany({ data: pairs, skipDuplicates: true });
}

function extractPhone(row: Record<string, string>, mapping: FieldMapping): string | null {
  const full = mapping.find((e) => e.dbField === "fullPhoneNumber");
  const phone = mapping.find((e) => e.dbField === "phoneNumber");
  const cc = mapping.find((e) => e.dbField === "countryCode");
  if (full) {
    const normalized = normalizeFullPhone(row[full.csvColumn] ?? "");
    if (normalized) return normalized;
  }
  if (phone && cc) {
    const result = normalizeSplitPhone(row[cc.csvColumn] ?? "", row[phone.csvColumn] ?? "");
    if (result) return result;
  }
  // Fallback: phoneNumber column may contain a full international number
  if (phone) return normalizeFullPhone(row[phone.csvColumn] ?? "");
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
  status: string,
  errorCount?: number
): Promise<void> {
  await redis.set(
    `import:progress:${importId}`,
    JSON.stringify({ processed, total, created, updated, skipped, status, errorCount: errorCount ?? 0 }),
    "EX",
    7200
  );
}

export const contactImportWorker = new Worker<ContactImportJob>(
  "contact-import",
  async (job) => {
    const { importId, sessionId, organizationId, fieldMapping, batchTags, batchGroupIds, leadStatusId: batchLeadStatusId, updateExisting } = job.data;
    console.log(`[contact-import] job started importId=${importId}`);

    const lockKey = `import:lock:${organizationId}`;
    const acquired = await redis.set(lockKey, importId, "EX", IMPORT_LOCK_TTL_SECONDS, "NX");
    if (!acquired) {
      throw new Error("Another import is already in progress for this organization. Please wait and retry.");
    }

    await prisma.contactImport.update({ where: { id: importId }, data: { status: "processing" } });

    const csvText = await redis.get(`import:csv:${sessionId}`);
    if (!csvText) {
      await prisma.contactImport.update({
        where: { id: importId },
        data: { status: "failed", errorSummary: { message: "Upload session expired. Please re-upload the file." } as Prisma.InputJsonValue },
      });
      await redis.set(
        `import:progress:${importId}`,
        JSON.stringify({ status: "failed", processed: 0, total: 0, created: 0, updated: 0, skipped: 0, errorCount: 0 }),
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
    const csvHeaders = parsed.meta.fields ?? [];
    const BATCH_SIZE = 500;
    const seenPhones = new Set<string>();

    const allCountries = await prisma.country.findMany({ select: { id: true, isoCode: true, name: true } });
    const countryLookup = new Map<string, number>();
    for (const c of allCountries) {
      if (c.isoCode) countryLookup.set(c.isoCode.toLowerCase(), c.id);
      countryLookup.set(c.name.toLowerCase(), c.id);
    }

    const customFieldMeta = await prisma.contactCustomField.findMany({
      where: { organizationId, isActive: true },
      select: { id: true, inputName: true },
    });
    const cfInputNameMap = new Map(customFieldMeta.map((cf) => [cf.id, cf.inputName]));

    // Lead status lookup for resolving CSV status text (or the batch default) to a leadStatusId
    const leadStatusRows = await prisma.leadStatus.findMany({ where: { organizationId }, select: { id: true, name: true } });
    const leadStatusNameToId = new Map(leadStatusRows.map((s) => [s.name.trim().toLowerCase(), s.id]));
    const validLeadStatusIds = new Set(leadStatusRows.map((s) => s.id));

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errorSamples: Array<{ row: number; reason: string }> = [];
    // Full failed rows for error CSV download
    const failedRows: Array<Record<string, string> & { "Error Reason": string }> = [];

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const validRows: Array<{ phone: string; row: Record<string, string> }> = [];

      for (let j = 0; j < batch.length; j++) {
        const row = batch[j]!;
        const phone = extractPhone(row, fieldMapping);
        if (!phone) {
          skipped++;
          const reason = "Missing or invalid country code — number must include full country code (e.g. 919907072035)";
          if (errorSamples.length < 50) errorSamples.push({ row: i + j + 1, reason });
          failedRows.push({ ...row, "Error Reason": reason });
          continue;
        }
        if (seenPhones.has(phone)) {
          skipped++;
          const reason = "Duplicate phone number in file";
          failedRows.push({ ...row, "Error Reason": reason });
          continue;
        }
        seenPhones.add(phone);
        validRows.push({ phone, row });
      }

      if (validRows.length) {
        const batchPhones = validRows.map((r) => r.phone);
        // Exact match — all phones are stored as plain digits (no +)
        // Include soft-deleted contacts so we can restore them; do NOT filter by deletedAt here
        const existingContacts = await prisma.contact.findMany({
          where: { organizationId, phoneNumber: { in: batchPhones } },
          select: { id: true, phoneNumber: true, deletedAt: true },
        });
        const existingMap = new Map(existingContacts.map((c) => [c.phoneNumber, { id: c.id, softDeleted: c.deletedAt !== null }]));

        const toCreate: Prisma.ContactCreateManyInput[] = [];
        const toUpdate: Array<{ id: string; phone: string; restored: boolean; data: Prisma.ContactUpdateInput }> = [];

        for (const { phone, row } of validRows) {
          const existing = existingMap.get(phone);
          const tags = mergeTagsUnion(extractField(row, fieldMapping, "tags"), batchTags);
          const { firstName, lastName, name } = extractFirstLastName(row, fieldMapping);
          const email = extractField(row, fieldMapping, "email") ?? null;
          const csvStatus = extractField(row, fieldMapping, "leadStatusId");
          const leadStatusId = resolveLeadStatusId(csvStatus, leadStatusNameToId, validLeadStatusIds, batchLeadStatusId ?? null);
          const countryRaw = extractField(row, fieldMapping, "country");
          const countryId = countryRaw ? (countryLookup.get(countryRaw.toLowerCase()) ?? null) : null;
          const customFields = extractCustomFields(row, fieldMapping, cfInputNameMap);
          const customFieldsValue = Object.keys(customFields).length > 0
            ? customFields as unknown as Prisma.InputJsonValue
            : undefined;

          if (existing && (updateExisting || existing.softDeleted)) {
            // Always restore soft-deleted contacts; update active contacts only when updateExisting is set
            toUpdate.push({
              id: existing.id, phone, restored: existing.softDeleted,
              data: {
                firstName, lastName, name, email, tags,
                ...(leadStatusId ? { leadStatus: { connect: { id: leadStatusId } } } : {}),
                ...(existing.softDeleted && { deletedAt: null }),
                ...(countryId !== null && { countryId }),
                ...(customFieldsValue !== undefined && { customFields: customFieldsValue }),
              },
            });
          } else if (!existing) {
            toCreate.push({
              organizationId, phoneNumber: phone, firstName, lastName, name, email, leadStatusId, tags,
              ...(countryId !== null && { countryId }),
              ...(customFieldsValue !== undefined && { customFields: customFieldsValue }),
            });
          } else {
            skipped++;
          }
        }

        if (toCreate.length) {
          const result = await prisma.contact.createMany({ data: toCreate, skipDuplicates: true });
          created += result.count;
        }

        for (const { id, restored, data } of toUpdate) {
          try {
            await prisma.contact.update({ where: { id }, data });
            if (restored) created++; else updated++;
          } catch {
            skipped++;
            if (errorSamples.length < 50) errorSamples.push({ row: 0, reason: `Update failed for contact ${id}` });
          }
        }

        if (batchGroupIds.length > 0) {
          const batchContacts = await prisma.contact.findMany({
            where: { organizationId, phoneNumber: { in: validRows.map((r) => r.phone) } },
            select: { id: true },
          });
          await assignBatchGroups(prisma, batchContacts.map((c) => c.id), batchGroupIds);
        }
      }

      await writeProgress(importId, i + batch.length, rows.length, created, updated, skipped, "processing", failedRows.length);
      await prisma.contactImport.update({
        where: { id: importId },
        data: { processedRows: created + updated + skipped, createdCount: created, updatedCount: updated, skippedCount: skipped },
      });
      const io = getIo();
      if (io) {
        const pct = rows.length > 0 ? Math.round(((i + batch.length) / rows.length) * 100) : 0;
        io.to(`org:${organizationId}`).emit("import:progress", { importId, processed: i + batch.length, total: rows.length, percentage: pct });
      }
    }

    // Store error CSV in Redis for 24h download
    if (failedRows.length > 0) {
      const errorCsvHeaders = [...csvHeaders, "Error Reason"];
      const errorCsv = Papa.unparse(failedRows, { columns: errorCsvHeaders });
      await redis.set(`import:errors:${importId}`, errorCsv, "EX", ERROR_CSV_TTL_SECONDS);
    }

    await prisma.contactImport.update({
      where: { id: importId },
      data: {
        status: "completed",
        completedAt: new Date(),
        errorSummary: errorSamples.length ? (errorSamples as unknown as Prisma.InputJsonValue) : undefined,
      },
    });

    await writeProgress(importId, rows.length, rows.length, created, updated, skipped, "completed", failedRows.length);
    await redis.del(`import:lock:${organizationId}`);
    getIo()?.to(`org:${organizationId}`).emit("import:completed", { importId });
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
  const { importId, organizationId } = job.data;
  await prisma.contactImport
    .update({
      where: { id: importId },
      data: { status: "failed", errorSummary: { message: err.message } as Prisma.InputJsonValue },
    })
    .catch(() => undefined);
  await redis
    .set(`import:progress:${importId}`, JSON.stringify({ status: "failed", errorCount: 0 }), "EX", 7200)
    .catch(() => undefined);
  await redis.del(`import:lock:${organizationId}`).catch(() => undefined);
});

contactImportWorker.on("error", (err) => {
  console.error(`[contact-import] worker error: ${err.message}`);
});
