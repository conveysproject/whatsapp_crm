# CSV Bulk Contact Import — Design Spec

**Date:** 2026-05-02  
**Status:** Approved

---

## Overview

Replace the existing basic CSV import (`POST /v1/contacts/import`) with a full multi-step wizard supporting up to 500,000 contacts (50 MB), real-time progress tracking, field mapping, duplicate detection, and batch tagging. Processing runs as a background BullMQ job; progress streams to the frontend via SSE.

---

## User Flow

```
Upload → Map Fields → Preview → (Confirm) → Progress → Summary
```

1. **Upload** — Drop or browse for `.csv`, set batch tags + lifecycle stage for all contacts in file
2. **Map Fields** — Map CSV columns to DB fields; auto-suggested; phone mapping required
3. **Preview** — Server returns counts: new / duplicate-in-CSV / will-update-in-DB; user toggles "Update existing contacts"
4. **Confirm** — Single button triggers background job
5. **Progress** — Live SSE progress bar + counters (created / updated / skipped)
6. **Summary** — Final counts; links to `/contacts` or restart wizard

---

## Architecture

### New API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/v1/contacts/import/upload` | Receive CSV, store in Redis, return columns + sample rows |
| `POST` | `/v1/contacts/import/analyze` | Given mapping, return preview stats (new / dup / update) |
| `POST` | `/v1/contacts/import/start` | Create DB record, enqueue BullMQ job, return `importJobId` |
| `GET` | `/v1/contacts/import/:jobId/progress` | SSE — streams live progress events |

The existing `POST /v1/contacts/import` is replaced by these four endpoints.

### New BullMQ Queue

Queue name: `contact-import`  
Retry: 3 attempts, exponential backoff starting at 2 s  
Batch size: 500 rows per iteration

### Redis Keys

| Key | Content | TTL |
|-----|---------|-----|
| `import:csv:{sessionId}` | Raw CSV string | 30 min |
| `import:progress:{jobId}` | `{processed, total, created, updated, skipped, status}` | 2 hrs |

---

## Database Schema

### New Prisma Model

```prisma
model ContactImport {
  id             String              @id @default(uuid())
  organizationId String
  status         ContactImportStatus @default(pending)
  totalRows      Int
  processedRows  Int                 @default(0)
  createdCount   Int                 @default(0)
  updatedCount   Int                 @default(0)
  skippedCount   Int                 @default(0)
  fieldMapping   Json
  batchTags      String[]
  lifecycleStage LifecycleStage
  updateExisting Boolean             @default(false)
  errorSummary   Json?
  createdAt      DateTime            @default(now())
  completedAt    DateTime?

  @@index([organizationId])
}

enum ContactImportStatus {
  pending
  processing
  completed
  failed
}
```

### Contact Model

No changes. Existing fields cover all import data: `phoneNumber`, `name`, `email`, `lifecycleStage`, `tags`, `customFields`.

---

## Frontend — 5-Step Wizard

**Location:** `apps/web/app/(dashboard)/contacts/import/page.tsx` (full replacement)  
**State:** Single React context holding `{ sessionId, columns, sampleRows, mapping, batchTags, lifecycleStage, analysisResult, updateExisting, importJobId }`

### Step 1 — Upload

- Drag-and-drop zone + "Browse files", `.csv` only, 50 MB limit enforced client-side
- Instructions panel (upload rules, phone format requirements)
- **Batch tags** input — reuses existing `TagInput` component; tags applied to every imported contact
- **Lifecycle stage** dropdown — lead / prospect / customer / loyal / churned; defaults to "lead"
- On select → `POST /v1/contacts/import/upload` → store `sessionId + columns` in wizard context → advance to step 2

### Step 2 — Map Fields

- Table: one row per CSV column with three cells: **CSV Column name** | **DB Field dropdown** | **Sample value** (first non-empty value from that column)
- DB field options: `Full Phone Number`, `Phone Number`, `Country Code`, `Name`, `Email`, `Lifecycle Stage`, `Tags`, `— Skip —`
- Auto-suggest via case-insensitive fuzzy match of column name to DB field label
- Validation: must map either `Full Phone Number` OR both `Phone Number` + `Country Code` — not both approaches simultaneously
- "Next" disabled until phone mapping is valid
- On "Next" → `POST /v1/contacts/import/analyze` with `{ sessionId, fieldMapping }` → store analysis result → advance to step 3

### Step 3 — Preview

Four summary cards:

| Card | Value |
|------|-------|
| Total rows | Row count in CSV |
| New contacts | Phone not in DB |
| Duplicates in file | Same phone appears more than once in CSV (only first occurrence imported) |
| Will update | Phone already exists in DB |

- Toggle: **"Update existing contacts"** — if off, "Will update" count is shown as skipped
- "Confirm & Import" → `POST /v1/contacts/import/start` with `{ sessionId, fieldMapping, batchTags, lifecycleStage, updateExisting }` → returns `importJobId` → advance to step 4

### Step 4 — Progress

- Progress bar: `processedRows / totalRows`
- Three live counters: **Created** · **Updated** · **Skipped**
- SSE connection to `GET /v1/contacts/import/:jobId/progress`
- SSE event shape: `{ processed, total, created, updated, skipped }`
- Terminal event: `{ event: 'done', status: 'completed' | 'failed' }` → auto-advance to step 5

### Step 5 — Summary

- Final counts: Created / Updated / Skipped / Failed rows
- "View Contacts" → navigate to `/contacts`
- "Import Another File" → reset wizard to step 1

---

## Backend Processing Detail

### Upload Handler

1. Enforce 50 MB limit via `@fastify/multipart`
2. Parse with PapaParse — headers + first 3 data rows only (for sample values)
3. Store full raw CSV string in Redis: `import:csv:{sessionId}`, TTL 30 min
4. Return `{ sessionId, columns: string[], sampleRows: Record<string, string>[] }`

### Analyze Handler

1. Load CSV from Redis by `sessionId` (404 if expired)
2. Parse all rows; apply field mapping to extract phone value per row
3. **Phone normalization:**
   - Separate columns: `+${countryCode}${phoneNumber}` after stripping non-digits
   - Full column: strip non-digits, prepend `+` if absent
4. Count `duplicatesInCsv` (phone seen more than once within the file)
5. DB duplicate check: chunk normalized phones into batches of 1,000 and run `SELECT phoneNumber FROM contacts WHERE organizationId = ? AND phoneNumber IN (...)` per chunk; union results
6. Return `{ totalRows, newContacts, duplicatesInCsv, existingInDb }`

### Start Handler

1. Create `ContactImport` record (status: `pending`)
2. Enqueue BullMQ job: `{ importId, sessionId, organizationId, fieldMapping, batchTags, lifecycleStage, updateExisting }`
3. Return `{ importJobId: importId }`

### BullMQ Worker (`contact-import`)

```
for each batch of 500 rows:
  1. Normalize phones; skip rows with invalid/missing phone
  2. Deduplicate within batch (keep first occurrence)
  3. Prisma upsert (if updateExisting) or createMany with skipDuplicates
  4. Merge batchTags with CSV tags (union, no duplicates)
  5. Bulk index batch to Meilisearch (one indexDocuments call)
  6. Update ContactImport counters in DB
  7. Write progress to Redis: import:progress:{jobId}
```

- Delete Redis CSV key after first load
- On complete: set `status: completed`, `completedAt`
- On failure: set `status: failed`, write `errorSummary` (up to 50 sample row errors)

### SSE Endpoint

- Poll `import:progress:{jobId}` from Redis every 1 s
- Emit JSON progress events until status is `completed` or `failed`
- Emit `{ event: 'done', status }` then close stream
- On client reconnect: immediately emit current progress from Redis (no events lost)

---

## Error Handling

| Scenario | Handling |
|----------|---------|
| File > 50 MB | Rejected client-side before upload; shown inline on step 1 |
| Invalid CSV (parse error) | Server returns 400; wizard shows error on step 1, user can re-upload |
| No phone column mapped | "Next" button disabled with inline message |
| Both phone mapping approaches selected | Conflict warning shown inline on step 2 |
| Redis session expired (> 30 min) | 404 from analyze/start; wizard shows "Session expired, please re-upload" and resets to step 1 |
| Invalid phone number in row | Row skipped, counted in `skippedCount` |
| DB write failure for a row | Row skipped, counted in `skippedCount`; error recorded in `errorSummary` |
| Worker crashes / exhausts retries | `ContactImport.status` → `failed`; SSE receives `done` event with `status: failed`; step 4 shows error state |

---

## Files Changed

### New files
- `apps/api/src/routes/contacts-import.ts` — four new endpoints
- `apps/api/src/workers/contact-import.worker.ts` — BullMQ worker
- `apps/api/src/lib/phone-normalize.ts` — E.164 normalization utility
- `apps/web/app/(dashboard)/contacts/import/ImportWizard.tsx` — wizard context + shell
- `apps/web/app/(dashboard)/contacts/import/steps/Step1Upload.tsx`
- `apps/web/app/(dashboard)/contacts/import/steps/Step2MapFields.tsx`
- `apps/web/app/(dashboard)/contacts/import/steps/Step3Preview.tsx`
- `apps/web/app/(dashboard)/contacts/import/steps/Step4Progress.tsx`
- `apps/web/app/(dashboard)/contacts/import/steps/Step5Summary.tsx`

### Modified files
- `apps/api/prisma/schema.prisma` — add `ContactImport` model + `ContactImportStatus` enum
- `apps/api/src/index.ts` — register `contacts-import` routes + `contact-import` worker
- `apps/web/app/(dashboard)/contacts/import/page.tsx` — replace with wizard shell
- `packages/shared/src/index.ts` — add `ContactImportId` branded type + import progress types

---

## Field Mapping JSON Structure

`fieldMapping` is an array passed from the frontend to analyze/start endpoints:

```typescript
type DbField =
  | 'fullPhoneNumber'
  | 'phoneNumber'
  | 'countryCode'
  | 'name'
  | 'email'
  | 'lifecycleStage'
  | 'tags'
  | 'skip';

interface FieldMappingEntry {
  csvColumn: string;   // exact header name from CSV
  dbField: DbField;    // chosen mapping
}

type FieldMapping = FieldMappingEntry[];
```

Validation rule: exactly one entry must have `dbField: 'fullPhoneNumber'` OR exactly one each of `'phoneNumber'` and `'countryCode'` — never both approaches in the same mapping.

---

## Out of Scope

- Import history page (viewing past imports)
- Partial resume if browser closes mid-import (job completes in background; result viewable via `ContactImport` record if history page added later)
- Custom field creation from unmapped CSV columns
- Per-row error download (only summary counts exposed)
