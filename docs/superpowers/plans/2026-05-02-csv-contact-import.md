# CSV Bulk Contact Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the basic single-step CSV import with a 5-step wizard (Upload → Map Fields → Preview → Progress → Summary) supporting 500K contacts, background BullMQ processing, and SSE progress streaming.

**Architecture:** Server-first — CSV uploaded to Fastify, stored in Redis; server parses for field mapping and DB duplicate analysis; BullMQ worker processes batches of 500 rows; SSE streams live progress to the browser.

**Tech Stack:** Fastify 4 + ESM, Prisma + PostgreSQL, BullMQ + Redis (ioredis), PapaParse, Next.js 15 App Router, Vitest

---

## File Map

### New files
- `apps/api/src/lib/phone-normalize.ts` — pure E.164 normalization functions
- `apps/api/src/lib/phone-normalize.test.ts` — unit tests
- `apps/api/src/lib/redis.ts` — standalone ioredis client for key-value ops
- `apps/api/src/routes/contacts-import.ts` — four import endpoints
- `apps/api/src/routes/contacts-import.test.ts` — route tests
- `apps/api/src/workers/contact-import.worker.ts` — BullMQ worker
- `apps/web/app/(dashboard)/contacts/import/ImportWizard.tsx` — wizard context + step router
- `apps/web/app/(dashboard)/contacts/import/steps/Step1Upload.tsx`
- `apps/web/app/(dashboard)/contacts/import/steps/Step2MapFields.tsx`
- `apps/web/app/(dashboard)/contacts/import/steps/Step3Preview.tsx`
- `apps/web/app/(dashboard)/contacts/import/steps/Step4Progress.tsx`
- `apps/web/app/(dashboard)/contacts/import/steps/Step5Summary.tsx`

### Modified files
- `apps/api/prisma/schema.prisma` — add `ContactImport` model + `ContactImportStatus` enum
- `apps/api/src/lib/queue.ts` — add `contactImportQueue`
- `apps/api/src/routes/contacts.ts` — remove old `POST /contacts/import` endpoint
- `apps/api/src/routes/index.ts` — register `contactsImportRouter`
- `apps/api/src/index.ts` — raise multipart limit to 50 MB, import contact-import worker
- `apps/web/app/(dashboard)/contacts/import/page.tsx` — render `<ImportWizard />`
- `packages/shared/src/index.ts` — add `ContactImportId`, `DbField`, `FieldMappingEntry`, `FieldMapping`, `ImportAnalysisResult`, `ImportProgress` types

---

## Task 1: Prisma schema migration + shared types

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Add ContactImportStatus enum to schema.prisma**

Open `apps/api/prisma/schema.prisma`. After the `CampaignStatus` enum block (after line ~175), insert:

```prisma
enum ContactImportStatus {
  pending
  processing
  completed
  failed
}
```

- [ ] **Step 2: Add ContactImport model to schema.prisma**

After the `Contact` model closing brace, insert:

```prisma
model ContactImport {
  id             String              @id @default(uuid())
  organizationId String              @map("organization_id")
  status         ContactImportStatus @default(pending)
  totalRows      Int                 @map("total_rows")
  processedRows  Int                 @default(0) @map("processed_rows")
  createdCount   Int                 @default(0) @map("created_count")
  updatedCount   Int                 @default(0) @map("updated_count")
  skippedCount   Int                 @default(0) @map("skipped_count")
  fieldMapping   Json                @map("field_mapping")
  batchTags      String[]            @map("batch_tags")
  lifecycleStage LifecycleStage      @map("lifecycle_stage")
  updateExisting Boolean             @default(false) @map("update_existing")
  errorSummary   Json?               @map("error_summary")
  createdAt      DateTime            @default(now()) @map("created_at")
  completedAt    DateTime?           @map("completed_at")

  @@index([organizationId])
  @@map("contact_imports")
}
```

- [ ] **Step 3: Generate and apply the migration**

```bash
cd apps/api && pnpm exec prisma migrate dev --name add_contact_import
```

Expected: "Your database is now in sync with your schema." Prisma client regenerated.

- [ ] **Step 4: Add shared types**

Open `packages/shared/src/index.ts`. After the `CampaignId` line, add:

```typescript
export type ContactImportId = string & { readonly __brand: "ContactImportId" };

export type DbField =
  | "fullPhoneNumber"
  | "phoneNumber"
  | "countryCode"
  | "name"
  | "email"
  | "lifecycleStage"
  | "tags"
  | "skip";

export interface FieldMappingEntry {
  csvColumn: string;
  dbField: DbField;
}

export type FieldMapping = FieldMappingEntry[];

export interface ImportAnalysisResult {
  totalRows: number;
  newContacts: number;
  duplicatesInCsv: number;
  existingInDb: number;
}

export interface ImportProgress {
  processed: number;
  total: number;
  created: number;
  updated: number;
  skipped: number;
  status: "pending" | "processing" | "completed" | "failed";
}
```

- [ ] **Step 5: Verify shared package builds**

```bash
pnpm --filter @WBMSG/shared type-check
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations packages/shared/src/index.ts
git commit -m "feat(api): add ContactImport schema and shared import types"
```

---

## Task 2: Phone normalization utility

**Files:**
- Create: `apps/api/src/lib/phone-normalize.ts`
- Create: `apps/api/src/lib/phone-normalize.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/lib/phone-normalize.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { normalizeFullPhone, normalizeSplitPhone, isValidE164 } from "./phone-normalize.js";

describe("normalizeFullPhone", () => {
  it("returns E.164 when given full number with plus", () => {
    expect(normalizeFullPhone("+919748072737")).toBe("+919748072737");
  });

  it("prepends + when missing", () => {
    expect(normalizeFullPhone("919748072737")).toBe("+919748072737");
  });

  it("strips spaces and dashes", () => {
    expect(normalizeFullPhone("+91 97480 72737")).toBe("+919748072737");
  });

  it("returns null for empty string", () => {
    expect(normalizeFullPhone("")).toBeNull();
  });

  it("returns null for non-numeric garbage", () => {
    expect(normalizeFullPhone("not-a-phone")).toBeNull();
  });
});

describe("normalizeSplitPhone", () => {
  it("combines country code and phone into E.164", () => {
    expect(normalizeSplitPhone("91", "9748072737")).toBe("+919748072737");
  });

  it("strips non-digits from both parts", () => {
    expect(normalizeSplitPhone("+91", "(974) 807-2737")).toBe("+919748072737");
  });

  it("returns null when country code is empty", () => {
    expect(normalizeSplitPhone("", "9748072737")).toBeNull();
  });

  it("returns null when phone is empty", () => {
    expect(normalizeSplitPhone("91", "")).toBeNull();
  });
});

describe("isValidE164", () => {
  it("accepts valid E.164", () => {
    expect(isValidE164("+919748072737")).toBe(true);
  });

  it("rejects missing plus", () => {
    expect(isValidE164("919748072737")).toBe(false);
  });

  it("rejects too short", () => {
    expect(isValidE164("+1234")).toBe(false);
  });

  it("rejects too long", () => {
    expect(isValidE164("+" + "2".repeat(17))).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @WBMSG/api test src/lib/phone-normalize.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement phone-normalize.ts**

Create `apps/api/src/lib/phone-normalize.ts`:

```typescript
export function isValidE164(value: string): boolean {
  return /^\+[1-9]\d{6,14}$/.test(value);
}

export function normalizeFullPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  const e164 = `+${digits}`;
  return isValidE164(e164) ? e164 : null;
}

export function normalizeSplitPhone(countryCode: string, phone: string): string | null {
  const cc = countryCode.replace(/\D/g, "");
  const ph = phone.replace(/\D/g, "");
  if (!cc || !ph) return null;
  const e164 = `+${cc}${ph}`;
  return isValidE164(e164) ? e164 : null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @WBMSG/api test src/lib/phone-normalize.test.ts
```

Expected: All 10 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/phone-normalize.ts apps/api/src/lib/phone-normalize.test.ts
git commit -m "feat(api): add E.164 phone normalization utility"
```

---

## Task 3: Redis client + contact import queue + multipart limit

**Files:**
- Create: `apps/api/src/lib/redis.ts`
- Modify: `apps/api/src/lib/queue.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Create standalone Redis client**

Create `apps/api/src/lib/redis.ts`:

```typescript
import { Redis } from "ioredis";

export const redis = new Redis(
  process.env["REDIS_URL"] ?? "redis://localhost:6379"
);
```

- [ ] **Step 2: Add contactImportQueue to queue.ts**

Open `apps/api/src/lib/queue.ts`. After the `flowQueue` export, add:

```typescript
export const contactImportQueue = new Queue("contact-import", {
  connection: redisConnection,
  defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 2000 } },
});
```

- [ ] **Step 3: Raise multipart limit to 50 MB in index.ts**

Open `apps/api/src/index.ts`. Change line:
```typescript
await server.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });
```
to:
```typescript
await server.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } });
```

- [ ] **Step 4: Run type-check**

```bash
pnpm --filter @WBMSG/api type-check
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/redis.ts apps/api/src/lib/queue.ts apps/api/src/index.ts
git commit -m "feat(api): add contact import queue, Redis client, and 50 MB multipart limit"
```

---

## Task 4: Upload endpoint

**Files:**
- Create: `apps/api/src/routes/contacts-import.ts`
- Create: `apps/api/src/routes/contacts-import.test.ts`
- Modify: `apps/api/src/routes/contacts.ts` (remove old import handler)
- Modify: `apps/api/src/routes/index.ts`

- [ ] **Step 1: Write the failing upload test**

Create `apps/api/src/routes/contacts-import.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import type { PrismaClient } from "@prisma/client";

const mockRedisGet = vi.fn();
const mockRedisSet = vi.fn().mockResolvedValue("OK");
const mockRedisDel = vi.fn().mockResolvedValue(1);

vi.mock("../lib/redis.js", () => ({
  redis: { get: mockRedisGet, set: mockRedisSet, del: mockRedisDel },
}));

vi.mock("../lib/queue.js", () => ({
  contactImportQueue: { add: vi.fn().mockResolvedValue({ id: "job-1" }) },
  redisConnection: {},
}));

vi.mock("../lib/phone-normalize.js", async () => {
  const actual = await import("../lib/phone-normalize.js");
  return actual;
});

const mockPrisma = {
  contact: { findMany: vi.fn().mockResolvedValue([]) },
  contactImport: {
    create: vi.fn().mockResolvedValue({
      id: "import-1",
      organizationId: "org-1",
      status: "pending",
      totalRows: 2,
    }),
  },
};

const mockAuth = { userId: "user-1", organizationId: "org-1", role: "admin" as const };

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (request) => { request.auth = mockAuth; });
  const { contactsImportRouter } = await import("./contacts-import.js");
  await app.register(contactsImportRouter, { prefix: "/v1" });
  return app;
}

describe("POST /v1/contacts/import/upload", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("parses CSV headers and returns sessionId and columns", async () => {
    const boundary = "----TestBoundary123";
    const csvContent = "Name,Phone Number,Country Code,Email\r\nAlice,9000000001,91,alice@example.com";
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="contacts.csv"',
      "Content-Type: text/csv",
      "",
      csvContent,
      `--${boundary}--`,
    ].join("\r\n");

    const res = await app.inject({
      method: "POST",
      url: "/v1/contacts/import/upload",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });

    expect(res.statusCode).toBe(200);
    const data = res.json<{ data: { sessionId: string; columns: string[]; sampleRows: Record<string, string>[] } }>().data;
    expect(data.sessionId).toBeTruthy();
    expect(data.columns).toEqual(["Name", "Phone Number", "Country Code", "Email"]);
    expect(data.sampleRows).toHaveLength(1);
    expect(data.sampleRows[0]).toMatchObject({ Name: "Alice", "Phone Number": "9000000001" });
    expect(mockRedisSet).toHaveBeenCalledWith(
      expect.stringContaining("import:csv:"),
      expect.any(String),
      "EX",
      1800
    );
  });

  it("returns 400 when no file is attached", async () => {
    const boundary = "----TestBoundary123";
    const res = await app.inject({
      method: "POST",
      url: "/v1/contacts/import/upload",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: `--${boundary}--`,
    });
    expect(res.statusCode).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @WBMSG/api test src/routes/contacts-import.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement contacts-import.ts with the upload endpoint**

Create `apps/api/src/routes/contacts-import.ts`:

```typescript
import type { FastifyPluginAsync } from "fastify";
import { randomUUID } from "crypto";
import Papa from "papaparse";
import type { LifecycleStage } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { redis } from "../lib/redis.js";
import { contactImportQueue } from "../lib/queue.js";
import { normalizeFullPhone, normalizeSplitPhone } from "../lib/phone-normalize.js";
import type { FieldMapping, ContactImportId } from "@WBMSG/shared";

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
};
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @WBMSG/api test src/routes/contacts-import.test.ts
```

Expected: Both upload tests PASS.

- [ ] **Step 5: Remove old import endpoint from contacts.ts**

Open `apps/api/src/routes/contacts.ts`. Delete the entire `fastify.post("/contacts/import", ...)` block (the handler spanning from `fastify.post("/contacts/import",` through its closing `});`). Save the file.

- [ ] **Step 6: Register the new router in routes/index.ts**

Open `apps/api/src/routes/index.ts`. Add import after the last existing import:

```typescript
import { contactsImportRouter } from "./contacts-import.js";
```

Inside the `routes` function, after `await fastify.register(contactsRouter, { prefix: "/v1" });`, add:

```typescript
await fastify.register(contactsImportRouter, { prefix: "/v1" });
```

- [ ] **Step 7: Run all API tests**

```bash
pnpm --filter @WBMSG/api test
```

Expected: All tests PASS (contacts.test.ts still passes — the removed endpoint had no test).

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/routes/contacts-import.ts apps/api/src/routes/contacts-import.test.ts apps/api/src/routes/contacts.ts apps/api/src/routes/index.ts
git commit -m "feat(api): add CSV upload endpoint, remove legacy import route"
```

---

## Task 5: Analyze endpoint

**Files:**
- Modify: `apps/api/src/routes/contacts-import.ts`
- Modify: `apps/api/src/routes/contacts-import.test.ts`

- [ ] **Step 1: Write the failing analyze tests**

Append to `apps/api/src/routes/contacts-import.test.ts`:

```typescript
describe("POST /v1/contacts/import/analyze", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns counts with duplicate and DB-existing detection", async () => {
    const csv = "Name,Phone Number,Country Code\r\nAlice,9000000001,91\r\nBob,9000000002,91\r\nAlice,9000000001,91";
    mockRedisGet.mockResolvedValue(csv);
    // Bob exists in DB
    mockPrisma.contact.findMany.mockResolvedValue([{ phoneNumber: "+919000000002" }]);

    const res = await app.inject({
      method: "POST",
      url: "/v1/contacts/import/analyze",
      payload: {
        sessionId: "test-session",
        fieldMapping: [
          { csvColumn: "Phone Number", dbField: "phoneNumber" },
          { csvColumn: "Country Code", dbField: "countryCode" },
          { csvColumn: "Name", dbField: "name" },
        ],
      },
    });

    expect(res.statusCode).toBe(200);
    const data = res.json<{ data: { totalRows: number; newContacts: number; duplicatesInCsv: number; existingInDb: number } }>().data;
    expect(data.totalRows).toBe(3);
    expect(data.duplicatesInCsv).toBe(1); // 3rd row is Alice duplicate
    expect(data.existingInDb).toBe(1);    // Bob matches DB
    expect(data.newContacts).toBe(1);     // Alice first occurrence is new
  });

  it("returns 404 when session is expired", async () => {
    mockRedisGet.mockResolvedValue(null);
    const res = await app.inject({
      method: "POST",
      url: "/v1/contacts/import/analyze",
      payload: {
        sessionId: "expired-session",
        fieldMapping: [{ csvColumn: "Phone", dbField: "fullPhoneNumber" }],
      },
    });
    expect(res.statusCode).toBe(404);
  });
});
```

- [ ] **Step 2: Run tests to verify new tests fail**

```bash
pnpm --filter @WBMSG/api test src/routes/contacts-import.test.ts
```

Expected: The two new analyze tests FAIL (route not found). Upload tests still PASS.

- [ ] **Step 3: Add the analyze endpoint to contacts-import.ts**

Inside `contactsImportRouter` in `apps/api/src/routes/contacts-import.ts`, after the upload handler, add:

```typescript
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
        } else if (phoneEntry && ccEntry) {
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @WBMSG/api test src/routes/contacts-import.test.ts
```

Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/contacts-import.ts apps/api/src/routes/contacts-import.test.ts
git commit -m "feat(api): add CSV analyze endpoint with duplicate and DB detection"
```

---

## Task 6: Start endpoint + SSE progress endpoint

**Files:**
- Modify: `apps/api/src/routes/contacts-import.ts`
- Modify: `apps/api/src/routes/contacts-import.test.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Write the failing start endpoint test**

Append to `apps/api/src/routes/contacts-import.test.ts`:

```typescript
describe("POST /v1/contacts/import/start", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("creates a ContactImport record and enqueues a job", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/contacts/import/start",
      payload: {
        sessionId: "test-session",
        fieldMapping: [{ csvColumn: "Full Phone Number", dbField: "fullPhoneNumber" }],
        batchTags: ["conference-2025"],
        lifecycleStage: "lead",
        updateExisting: false,
        totalRows: 10,
      },
    });

    expect(res.statusCode).toBe(200);
    const data = res.json<{ data: { importJobId: string } }>().data;
    expect(data.importJobId).toBe("import-1");
    expect(mockPrisma.contactImport.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ organizationId: "org-1", lifecycleStage: "lead" }),
      })
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @WBMSG/api test src/routes/contacts-import.test.ts
```

Expected: The new start test FAILS. All previous tests still PASS.

- [ ] **Step 3: Add the start and SSE endpoints to contacts-import.ts**

Inside `contactsImportRouter`, after the analyze handler, add:

```typescript
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

  // SSE endpoint — EventSource cannot send auth headers, so auth is skipped here.
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
```

- [ ] **Step 4: Run all import tests**

```bash
pnpm --filter @WBMSG/api test src/routes/contacts-import.test.ts
```

Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/contacts-import.ts apps/api/src/routes/contacts-import.test.ts
git commit -m "feat(api): add import start and SSE progress endpoints"
```

---

## Task 7: BullMQ contact import worker

**Files:**
- Create: `apps/api/src/workers/contact-import.worker.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Create the worker**

Create `apps/api/src/workers/contact-import.worker.ts`:

```typescript
import { Worker } from "bullmq";
import Papa from "papaparse";
import { MeiliSearch } from "meilisearch";
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

const meili = new MeiliSearch({
  host: process.env["MEILISEARCH_URL"] ?? "http://localhost:7700",
  apiKey: process.env["MEILISEARCH_KEY"] ?? "",
});

function extractPhone(row: Record<string, string>, mapping: FieldMapping): string | null {
  const full = mapping.find((e) => e.dbField === "fullPhoneNumber");
  const phone = mapping.find((e) => e.dbField === "phoneNumber");
  const cc = mapping.find((e) => e.dbField === "countryCode");
  if (full) return normalizeFullPhone(row[full.csvColumn] ?? "");
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

    await prisma.contactImport.update({ where: { id: importId }, data: { status: "processing" } });

    const csvText = await redis.get(`import:csv:${sessionId}`);
    if (!csvText) throw new Error("CSV session data not found in Redis");
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
        const toUpdate: Array<{ id: string; data: Prisma.ContactUpdateInput }> = [];

        for (const { phone, row } of validRows) {
          const existingId = existingMap.get(phone);
          const tags = mergeTagsUnion(extractField(row, fieldMapping, "tags"), batchTags);
          const name = extractField(row, fieldMapping, "name") ?? null;
          const email = extractField(row, fieldMapping, "email") ?? null;
          const csvLifecycle = extractField(row, fieldMapping, "lifecycleStage");
          const stage = (csvLifecycle || lifecycleStage) as LifecycleStage;

          if (existingId && updateExisting) {
            toUpdate.push({ id: existingId, data: { name, email, lifecycleStage: stage, tags } });
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
            ...validRows.filter((r) => existingMap.has(r.phone) && updateExisting).map((r) => r.phone),
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

contactImportWorker.on("failed", async (job, err) => {
  if (!job) return;
  const { importId } = job.data;
  await prisma.contactImport.update({
    where: { id: importId },
    data: { status: "failed", errorSummary: { message: err.message } as Prisma.InputJsonValue },
  }).catch(() => undefined);
  await redis.set(`import:progress:${importId}`, JSON.stringify({ status: "failed" }), "EX", 7200).catch(() => undefined);
});
```

- [ ] **Step 2: Run type-check on the API**

```bash
pnpm --filter @WBMSG/api type-check
```

Expected: No errors.

- [ ] **Step 3: Run all API tests**

```bash
pnpm --filter @WBMSG/api test
```

Expected: All tests PASS.

- [ ] **Step 2: Add worker import to index.ts**

Open `apps/api/src/index.ts`. After the existing worker imports (`import "./workers/flow.worker.js";`), add:

```typescript
import "./workers/contact-import.worker.js";
```

- [ ] **Step 3: Run type-check and all API tests**

```bash
pnpm --filter @WBMSG/api type-check
pnpm --filter @WBMSG/api test
```

Expected: No type errors. All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/workers/contact-import.worker.ts apps/api/src/index.ts
git commit -m "feat(api): add BullMQ contact import worker with batch processing and SSE progress"
```

---

## Task 8: Wizard shell + Step 1 (Upload)

**Files:**
- Create: `apps/web/app/(dashboard)/contacts/import/ImportWizard.tsx`
- Create: `apps/web/app/(dashboard)/contacts/import/steps/Step1Upload.tsx`
- Create stub files for Steps 2–5 (replaced in Tasks 9–11)
- Modify: `apps/web/app/(dashboard)/contacts/import/page.tsx`

- [ ] **Step 1: Create stub files for Steps 2–5**

Create `apps/web/app/(dashboard)/contacts/import/steps/Step2MapFields.tsx`:
```tsx
"use client";
import { JSX } from "react";
export function Step2MapFields(): JSX.Element { return <div />; }
```

Create `apps/web/app/(dashboard)/contacts/import/steps/Step3Preview.tsx`:
```tsx
"use client";
import { JSX } from "react";
export function Step3Preview(): JSX.Element { return <div />; }
```

Create `apps/web/app/(dashboard)/contacts/import/steps/Step4Progress.tsx`:
```tsx
"use client";
import { JSX } from "react";
export function Step4Progress(): JSX.Element { return <div />; }
```

Create `apps/web/app/(dashboard)/contacts/import/steps/Step5Summary.tsx`:
```tsx
"use client";
import { JSX } from "react";
export function Step5Summary(): JSX.Element { return <div />; }
```

- [ ] **Step 2: Create the wizard context and shell**

Create `apps/web/app/(dashboard)/contacts/import/ImportWizard.tsx`:

```tsx
"use client";

import { JSX, createContext, useContext, useState } from "react";
import type { FieldMapping, ImportAnalysisResult, ImportProgress } from "@WBMSG/shared";
import { Step1Upload } from "./steps/Step1Upload.js";
import { Step2MapFields } from "./steps/Step2MapFields.js";
import { Step3Preview } from "./steps/Step3Preview.js";
import { Step4Progress } from "./steps/Step4Progress.js";
import { Step5Summary } from "./steps/Step5Summary.js";

export interface WizardState {
  step: 1 | 2 | 3 | 4 | 5;
  sessionId: string | null;
  columns: string[];
  sampleRows: Record<string, string>[];
  mapping: FieldMapping;
  batchTags: string[];
  lifecycleStage: string;
  analysisResult: ImportAnalysisResult | null;
  updateExisting: boolean;
  importJobId: string | null;
  totalRows: number;
  importSummary: ImportProgress | null;
}

interface WizardContextValue {
  state: WizardState;
  setState: (patch: Partial<WizardState>) => void;
  nextStep: () => void;
  reset: () => void;
}

const WizardContext = createContext<WizardContextValue | null>(null);

export function useWizard(): WizardContextValue {
  const ctx = useContext(WizardContext);
  if (!ctx) throw new Error("useWizard must be used inside ImportWizard");
  return ctx;
}

const INITIAL_STATE: WizardState = {
  step: 1,
  sessionId: null,
  columns: [],
  sampleRows: [],
  mapping: [],
  batchTags: [],
  lifecycleStage: "lead",
  analysisResult: null,
  updateExisting: true,
  importJobId: null,
  totalRows: 0,
  importSummary: null,
};

const STEP_LABELS = ["Upload", "Map Fields", "Preview", "Importing", "Done"] as const;

export function ImportWizard(): JSX.Element {
  const [state, setStateRaw] = useState<WizardState>(INITIAL_STATE);

  function setState(patch: Partial<WizardState>) {
    setStateRaw((prev) => ({ ...prev, ...patch }));
  }

  function nextStep() {
    setStateRaw((prev) => ({ ...prev, step: Math.min(prev.step + 1, 5) as WizardState["step"] }));
  }

  function reset() {
    setStateRaw(INITIAL_STATE);
  }

  const stepComponents: Record<WizardState["step"], JSX.Element> = {
    1: <Step1Upload />,
    2: <Step2MapFields />,
    3: <Step3Preview />,
    4: <Step4Progress />,
    5: <Step5Summary />,
  };

  return (
    <WizardContext.Provider value={{ state, setState, nextStep, reset }}>
      <div className="max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Import Contacts</h1>
          <nav className="mt-4 flex items-center gap-0 flex-wrap">
            {STEP_LABELS.map((label, idx) => {
              const stepNum = (idx + 1) as WizardState["step"];
              const isActive = state.step === stepNum;
              const isDone = state.step > stepNum;
              return (
                <div key={label} className="flex items-center">
                  <div className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full ${isActive ? "bg-brand-600 text-white font-medium" : isDone ? "text-brand-600" : "text-gray-400"}`}>
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${isActive ? "bg-white text-brand-600" : isDone ? "bg-brand-600 text-white" : "bg-gray-200 text-gray-500"}`}>
                      {isDone ? "✓" : stepNum}
                    </span>
                    {label}
                  </div>
                  {idx < STEP_LABELS.length - 1 && <div className="w-6 h-px bg-gray-200 mx-1" />}
                </div>
              );
            })}
          </nav>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          {stepComponents[state.step]}
        </div>
      </div>
    </WizardContext.Provider>
  );
}
```

- [ ] **Step 3: Create Step1Upload**

Create `apps/web/app/(dashboard)/contacts/import/steps/Step1Upload.tsx`:

```tsx
"use client";

import { JSX, useRef, useState, DragEvent, ChangeEvent } from "react";
import { useAuth } from "@clerk/nextjs";
import { useWizard } from "../ImportWizard.js";
import { TagInput } from "@/components/contacts/TagInput";
import { Button } from "@/components/ui/Button";

const LIFECYCLE_STAGES = ["lead", "prospect", "customer", "loyal", "churned"] as const;

export function Step1Upload(): JSX.Element {
  const { state, setState, nextStep } = useWizard();
  const { getToken } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Only .csv files are accepted.");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setError("File exceeds the 50 MB limit.");
      return;
    }
    setUploading(true);
    try {
      const token = await getToken();
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${process.env["NEXT_PUBLIC_API_URL"]}/v1/contacts/import/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token ?? ""}` },
        body: form,
      });
      if (!res.ok) {
        setError("Upload failed. Please check your file and try again.");
        return;
      }
      const body = await res.json() as { data: { sessionId: string; columns: string[]; sampleRows: Record<string, string>[] } };
      setState({ sessionId: body.data.sessionId, columns: body.data.columns, sampleRows: body.data.sampleRows });
      nextStep();
    } catch {
      setError("An unexpected error occurred.");
    } finally {
      setUploading(false);
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  }

  function onInputChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 space-y-1">
        <p className="font-medium">Upload instructions</p>
        <ul className="list-disc list-inside space-y-0.5 text-blue-700">
          <li>Max 50 MB allowed (up to 500,000 contacts)</li>
          <li>CSV must contain: <strong>Phone Number &amp; Country Code</strong> in any 2 columns, OR <strong>Full Phone Number</strong> (country code + number combined) in any 1 column</li>
          <li>If 2 contacts in the CSV have the same phone number, only the first will be imported</li>
          <li>If a contact already exists in your account, you can choose to update or skip it in the next step</li>
        </ul>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-xl border-2 border-dashed p-10 text-center transition-colors ${dragging ? "border-brand-500 bg-brand-50" : "border-gray-300 hover:border-brand-400 hover:bg-gray-50"}`}
      >
        <p className="text-sm text-gray-600">Drag &amp; drop your CSV here, or <span className="text-brand-600 font-medium">browse files</span></p>
        <p className="mt-1 text-xs text-gray-400">.csv only · max 50 MB</p>
        <input ref={inputRef} type="file" accept=".csv" className="hidden" onChange={onInputChange} />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Lifecycle stage for all contacts in this file
          </label>
          <select
            value={state.lifecycleStage}
            onChange={(e) => setState({ lifecycleStage: e.target.value })}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {LIFECYCLE_STAGES.map((s) => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Apply tags to all contacts in this file
          </label>
          <TagInput tags={state.batchTags} onChange={(tags) => setState({ batchTags: tags })} />
        </div>
      </div>

      {uploading && <p className="text-sm text-gray-500 animate-pulse">Uploading and parsing file…</p>}
    </div>
  );
}
```

- [ ] **Step 4: Replace page.tsx**

Replace all content of `apps/web/app/(dashboard)/contacts/import/page.tsx` with:

```tsx
import { JSX } from "react";
import { ImportWizard } from "./ImportWizard.js";

export default function ContactsImportPage(): JSX.Element {
  return <ImportWizard />;
}
```

- [ ] **Step 5: Run type-check**

```bash
pnpm --filter @WBMSG/web type-check
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/(dashboard)/contacts/import/
git commit -m "feat(web): add import wizard shell, Step 1 upload, and stub steps"
```

---

## Task 9: Step 2 — Map Fields

**Files:**
- Modify: `apps/web/app/(dashboard)/contacts/import/steps/Step2MapFields.tsx`

- [ ] **Step 1: Replace the stub with the full implementation**

Replace `apps/web/app/(dashboard)/contacts/import/steps/Step2MapFields.tsx` with:

```tsx
"use client";

import { JSX, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useWizard } from "../ImportWizard.js";
import { Button } from "@/components/ui/Button";
import type { DbField, FieldMappingEntry } from "@WBMSG/shared";

const DB_FIELD_OPTIONS: { value: DbField; label: string }[] = [
  { value: "fullPhoneNumber", label: "Full Phone Number" },
  { value: "phoneNumber", label: "Phone Number" },
  { value: "countryCode", label: "Country Code" },
  { value: "name", label: "Name" },
  { value: "email", label: "Email" },
  { value: "lifecycleStage", label: "Lifecycle Stage" },
  { value: "tags", label: "Tags" },
  { value: "skip", label: "— Skip —" },
];

function autoSuggest(col: string): DbField {
  const lower = col.toLowerCase().replace(/[\s_-]/g, "");
  if (lower.includes("fullphone") || (lower.includes("phone") && lower.includes("full"))) return "fullPhoneNumber";
  if (lower.includes("countrycode") || lower === "cc" || lower === "isd") return "countryCode";
  if (lower.includes("phone") || lower.includes("mobile") || lower.includes("whatsapp")) return "phoneNumber";
  if (lower.includes("name")) return "name";
  if (lower.includes("email") || lower.includes("mail")) return "email";
  if (lower.includes("lifecycle") || lower.includes("stage")) return "lifecycleStage";
  if (lower.includes("tag")) return "tags";
  return "skip";
}

function validateMapping(mapping: FieldMappingEntry[]): string | null {
  const hasFull = mapping.some((e) => e.dbField === "fullPhoneNumber");
  const hasPhone = mapping.some((e) => e.dbField === "phoneNumber");
  const hasCC = mapping.some((e) => e.dbField === "countryCode");
  if (hasFull && (hasPhone || hasCC)) return "Map either Full Phone Number OR Phone Number + Country Code — not both.";
  if (!hasFull && !hasPhone) return "Map at least one phone column to continue.";
  if (hasPhone && !hasCC) return "Country Code column is required when Phone Number is mapped.";
  if (hasCC && !hasPhone) return "Phone Number column is required when Country Code is mapped.";
  return null;
}

export function Step2MapFields(): JSX.Element {
  const { state, setState, nextStep } = useWizard();
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (state.mapping.length === 0 && state.columns.length > 0) {
      setState({ mapping: state.columns.map((col) => ({ csvColumn: col, dbField: autoSuggest(col) })) });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateMapping(csvColumn: string, dbField: DbField) {
    setState({ mapping: state.mapping.map((e) => e.csvColumn === csvColumn ? { ...e, dbField } : e) });
  }

  const validationError = validateMapping(state.mapping);

  async function handleNext() {
    if (validationError) return;
    setError(null);
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`${process.env["NEXT_PUBLIC_API_URL"]}/v1/contacts/import/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
        body: JSON.stringify({ sessionId: state.sessionId, fieldMapping: state.mapping }),
      });
      if (res.status === 404) {
        setState({ step: 1, sessionId: null, columns: [], sampleRows: [], mapping: [] });
        return;
      }
      if (!res.ok) {
        setError("Analysis failed. Please try again.");
        return;
      }
      const body = await res.json() as { data: { totalRows: number; newContacts: number; duplicatesInCsv: number; existingInDb: number } };
      setState({ analysisResult: body.data, totalRows: body.data.totalRows });
      nextStep();
    } catch {
      setError("An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-medium text-gray-900">Map CSV columns to contact fields</h2>
        <p className="text-sm text-gray-500 mt-1">We have suggested mappings based on your column names. Adjust as needed.</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
              <th className="pb-2 pr-4">CSV Column</th>
              <th className="pb-2 pr-4">Maps to</th>
              <th className="pb-2">Sample value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {state.mapping.map((entry) => (
              <tr key={entry.csvColumn}>
                <td className="py-2 pr-4 font-mono text-gray-700 text-xs">{entry.csvColumn}</td>
                <td className="py-2 pr-4">
                  <select
                    value={entry.dbField}
                    onChange={(e) => updateMapping(entry.csvColumn, e.target.value as DbField)}
                    className="rounded-md border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    {DB_FIELD_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </td>
                <td className="py-2 text-gray-400 text-xs truncate max-w-[180px]">
                  {state.sampleRows[0]?.[entry.csvColumn] ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {validationError && <p className="text-sm text-amber-600">{validationError}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end">
        <Button onClick={() => { void handleNext(); }} disabled={!!validationError || loading}>
          {loading ? "Analysing…" : "Next"}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run type-check**

```bash
pnpm --filter @WBMSG/web type-check
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/(dashboard)/contacts/import/steps/Step2MapFields.tsx
git commit -m "feat(web): add Step 2 CSV field mapping UI"
```

---

## Task 10: Step 3 — Preview

**Files:**
- Modify: `apps/web/app/(dashboard)/contacts/import/steps/Step3Preview.tsx`

- [ ] **Step 1: Replace the stub with the full implementation**

Replace `apps/web/app/(dashboard)/contacts/import/steps/Step3Preview.tsx` with:

```tsx
"use client";

import { JSX, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useWizard } from "../ImportWizard.js";
import { Button } from "@/components/ui/Button";

function StatCard({ label, value, highlight }: { label: string; value: number; highlight?: string }): JSX.Element {
  return (
    <div className="rounded-lg border border-gray-200 p-4 text-center space-y-1">
      <p className="text-2xl font-bold text-gray-900">{value.toLocaleString()}</p>
      <p className="text-sm font-medium text-gray-700">{label}</p>
      {highlight && <p className="text-xs text-gray-400">{highlight}</p>}
    </div>
  );
}

export function Step3Preview(): JSX.Element {
  const { state, setState, nextStep } = useWizard();
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const result = state.analysisResult;

  async function handleConfirm() {
    if (!result) return;
    setError(null);
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`${process.env["NEXT_PUBLIC_API_URL"]}/v1/contacts/import/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
        body: JSON.stringify({
          sessionId: state.sessionId,
          fieldMapping: state.mapping,
          batchTags: state.batchTags,
          lifecycleStage: state.lifecycleStage,
          updateExisting: state.updateExisting,
          totalRows: state.totalRows,
        }),
      });
      if (res.status === 404) {
        setState({ step: 1, sessionId: null, columns: [], sampleRows: [], mapping: [], analysisResult: null });
        return;
      }
      if (!res.ok) {
        setError("Could not start import. Please try again.");
        return;
      }
      const body = await res.json() as { data: { importJobId: string } };
      setState({ importJobId: body.data.importJobId });
      nextStep();
    } catch {
      setError("An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }

  if (!result) {
    return <p className="text-sm text-gray-500">No analysis data. Please go back and re-upload.</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-gray-900">Import preview</h2>
        <p className="text-sm text-gray-500 mt-1">Review the breakdown before importing.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total rows" value={result.totalRows} />
        <StatCard label="New contacts" value={result.newContacts} highlight="will be created" />
        <StatCard label="Duplicates in file" value={result.duplicatesInCsv} highlight="only first imported" />
        <StatCard
          label="Already in account"
          value={result.existingInDb}
          highlight={state.updateExisting ? "will be updated" : "will be skipped"}
        />
      </div>

      <label className="flex items-center gap-3 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={state.updateExisting}
          onChange={(e) => setState({ updateExisting: e.target.checked })}
          className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
        />
        <span className="text-sm text-gray-700">Update existing contacts with data from this CSV</span>
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end">
        <Button onClick={() => { void handleConfirm(); }} disabled={loading}>
          {loading ? "Starting…" : "Confirm & Import"}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run type-check**

```bash
pnpm --filter @WBMSG/web type-check
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/(dashboard)/contacts/import/steps/Step3Preview.tsx
git commit -m "feat(web): add Step 3 import preview with update existing toggle"
```

---

## Task 11: Step 4 (Progress) + Step 5 (Summary)

**Files:**
- Modify: `apps/web/app/(dashboard)/contacts/import/steps/Step4Progress.tsx`
- Modify: `apps/web/app/(dashboard)/contacts/import/steps/Step5Summary.tsx`

- [ ] **Step 1: Replace Step4 stub with SSE progress UI**

Replace `apps/web/app/(dashboard)/contacts/import/steps/Step4Progress.tsx` with:

```tsx
"use client";

import { JSX, useEffect, useState } from "react";
import { useWizard } from "../ImportWizard.js";
import type { ImportProgress } from "@WBMSG/shared";

export function Step4Progress(): JSX.Element {
  const { state, setState, nextStep } = useWizard();
  const [progress, setProgress] = useState<ImportProgress>({
    processed: 0,
    total: state.totalRows,
    created: 0,
    updated: 0,
    skipped: 0,
    status: "pending",
  });
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!state.importJobId) return;
    let es: EventSource | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let done = false;

    function connect() {
      es = new EventSource(
        `${process.env["NEXT_PUBLIC_API_URL"]}/v1/contacts/import/${state.importJobId}/progress`
      );

      es.onmessage = (event: MessageEvent<string>) => {
        const data = JSON.parse(event.data) as Partial<ImportProgress> & { event?: string; status?: string };
        if (data.event === "done") {
          done = true;
          es?.close();
          if (data.status === "failed") {
            setFailed(true);
          } else {
            setState({ importSummary: { ...progress, status: "completed" } });
            nextStep();
          }
          return;
        }
        setProgress((prev) => ({ ...prev, ...data }));
      };

      es.onerror = () => {
        es?.close();
        if (!done) {
          reconnectTimeout = setTimeout(connect, 2000);
        }
      };
    }

    connect();

    return () => {
      done = true;
      es?.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.importJobId]);

  const percent = progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0;

  if (failed) {
    return (
      <div className="space-y-4 text-center py-4">
        <p className="text-red-600 font-medium text-lg">Import failed</p>
        <p className="text-sm text-gray-500">An error occurred during processing. Please try again or contact support.</p>
        <p className="text-sm text-gray-400">
          Partial results — Created: {progress.created.toLocaleString()} · Updated: {progress.updated.toLocaleString()} · Skipped: {progress.skipped.toLocaleString()}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-gray-900">Importing contacts…</h2>
        <p className="text-sm text-gray-500 mt-1">Keep this page open. Large files may take a few minutes.</p>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-sm text-gray-600">
          <span>{progress.processed.toLocaleString()} of {progress.total.toLocaleString()} rows processed</span>
          <span className="font-medium">{percent}%</span>
        </div>
        <div className="h-3 rounded-full bg-gray-200 overflow-hidden">
          <div
            className="h-full bg-brand-600 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 text-center text-sm">
        <div className="rounded-lg border border-gray-100 bg-green-50 p-3">
          <p className="text-xl font-bold text-green-700">{progress.created.toLocaleString()}</p>
          <p className="text-gray-500 text-xs mt-0.5">Created</p>
        </div>
        <div className="rounded-lg border border-gray-100 bg-blue-50 p-3">
          <p className="text-xl font-bold text-blue-700">{progress.updated.toLocaleString()}</p>
          <p className="text-gray-500 text-xs mt-0.5">Updated</p>
        </div>
        <div className="rounded-lg border border-gray-100 p-3">
          <p className="text-xl font-bold text-gray-400">{progress.skipped.toLocaleString()}</p>
          <p className="text-gray-500 text-xs mt-0.5">Skipped</p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace Step5 stub with summary UI**

Replace `apps/web/app/(dashboard)/contacts/import/steps/Step5Summary.tsx` with:

```tsx
"use client";

import { JSX } from "react";
import { useRouter } from "next/navigation";
import { useWizard } from "../ImportWizard.js";
import { Button } from "@/components/ui/Button";

export function Step5Summary(): JSX.Element {
  const { state, reset } = useWizard();
  const router = useRouter();

  const summary = state.importSummary;

  return (
    <div className="space-y-6 text-center py-2">
      <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto">
        <span className="text-green-600 text-2xl font-bold">✓</span>
      </div>

      <div>
        <h2 className="text-xl font-semibold text-gray-900">Import complete</h2>
        <p className="text-sm text-gray-500 mt-1">Your contacts have been imported successfully.</p>
      </div>

      <div className="grid grid-cols-3 gap-3 text-center text-sm">
        <div className="rounded-lg border border-gray-100 bg-green-50 p-4">
          <p className="text-2xl font-bold text-green-700">{(summary?.created ?? 0).toLocaleString()}</p>
          <p className="text-gray-500 mt-0.5">Created</p>
        </div>
        <div className="rounded-lg border border-gray-100 bg-blue-50 p-4">
          <p className="text-2xl font-bold text-blue-700">{(summary?.updated ?? 0).toLocaleString()}</p>
          <p className="text-gray-500 mt-0.5">Updated</p>
        </div>
        <div className="rounded-lg border border-gray-100 p-4">
          <p className="text-2xl font-bold text-gray-400">{(summary?.skipped ?? 0).toLocaleString()}</p>
          <p className="text-gray-500 mt-0.5">Skipped</p>
        </div>
      </div>

      <div className="flex justify-center gap-3 pt-2">
        <Button onClick={() => router.push("/contacts")}>
          View Contacts
        </Button>
        <Button onClick={reset}>
          Import Another File
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Run type-check on both packages**

```bash
pnpm --filter @WBMSG/web type-check
pnpm --filter @WBMSG/api type-check
```

Expected: No errors on either.

- [ ] **Step 4: Run all API tests**

```bash
pnpm --filter @WBMSG/api test
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/(dashboard)/contacts/import/steps/Step4Progress.tsx apps/web/app/(dashboard)/contacts/import/steps/Step5Summary.tsx
git commit -m "feat(web): add Step 4 SSE progress and Step 5 import summary"
```

---

## Final verification

- [ ] **Start the dev server and run a full end-to-end test**

```bash
docker compose up -d   # ensure Postgres, Redis, Meilisearch are running
pnpm dev               # starts api + web
```

Navigate to `http://localhost:3000/contacts/import` and test:
1. Upload the sample CSV from the spec (`Sample CSV Upload.csv`)
2. Verify columns are detected and auto-suggested in Step 2
3. Map "Full Phone Number" to the correct column
4. Confirm the preview shows correct counts
5. Enable/disable "Update existing contacts" toggle
6. Click "Confirm & Import" and watch the progress bar advance
7. Verify the summary counts match

- [ ] **Run full test suite**

```bash
pnpm test
```

Expected: All tests PASS.
