# Contact Import Redesign — Design Spec

**Date:** 2026-05-27  
**Status:** Approved  
**Supersedes:** `2026-05-02-csv-contact-import-design.md`

---

## Overview

Redesign the existing 5-step import wizard into a 3-step flow that matches how leading CRMs (HubSpot, Zoho, Pipedrive, Attio) handle import. Simultaneously adds three missing field types: `firstName`/`lastName` (with full-name auto-split), batch group assignment, and custom field column mapping.

The existing backend infrastructure (BullMQ worker, SSE, Redis, ContactImport model) is preserved. Changes are scoped to: wizard step consolidation, new `DbField` values, `batchGroupIds` on `ContactImport`, and worker extensions.

---

## What Changes vs. Previous Spec

| Area | Before | After |
|------|--------|-------|
| Wizard steps | 5 (Upload → Map → Preview → Progress → Summary) | 3 (Upload → Configure → Import) |
| Batch settings location | Step 1 (Upload) | Step 2 (Configure) |
| Preview stats | Separate Step 3 screen | Inline in Step 2 |
| Summary | Separate Step 5 screen | Inline in Step 3 after progress completes |
| firstName / lastName | Not supported | Separate columns + full-name auto-split |
| Groups | Not supported | Batch multi-select in Step 2 |
| Custom fields | Not supported | Per-column mapping in Step 2 mapper |
| Required custom field warning | N/A | Yellow banner in Step 2, non-blocking |

---

## 3-Step User Flow

```
Upload → Configure → Import
```

### Step 1 — Upload

Single responsibility: file selection only.

- Drag-and-drop zone + "Browse files", `.csv` only, 50 MB limit enforced client-side
- On file select → `POST /v1/contacts/import/upload` → stores CSV in Redis, returns columns + sample rows
- "Next" active once upload succeeds
- No batch settings, no lifecycle stage, no tags on this screen

### Step 2 — Configure

All decisions before committing to import, on one screen. Two sections:

**Section A — Column Mapper**

Table: one row per CSV column. Columns: **CSV Column** | **Map to** dropdown | **Sample value**.

The "Map to" dropdown uses `<optgroup>` sections:

| Group | Options |
|-------|---------|
| Identity | First Name, Last Name, Full Name (auto-split), Full Phone Number, Phone Number, Email |
| Contact Info | Country Code, Lifecycle Stage, Language |
| Engagement | Tags |
| Custom Fields | One option per active org custom field (fetched from `/v1/contacts/custom-fields`), labeled by `inputName` |
| — | Skip |

Auto-suggest: case-insensitive fuzzy match of CSV column name to option label on upload.

Phone validation: **"Preview"** button disabled unless either `Full Phone Number` OR both `Phone Number` + `Country Code` are mapped (not both approaches).

Required custom fields warning: computed client-side whenever the mapping changes. If any org custom field marked `isRequired` has no `customField:<id>` entry in the current mapping, show yellow banner:
> "Required fields not mapped: **City**, **Plan** — contacts will be imported without these values."
Import is not blocked by this warning.

**Section B — Batch Settings**

Below the mapper, always visible:

- **Groups** — multi-select dropdown (fetches `/v1/contact-groups?archived=false`); all imported contacts added to selected groups
- **Tags** — existing tag input (Enter/comma to add); merged with any per-row tags column
- **Lifecycle Stage** — select: lead / prospect / customer / loyal / churned; applied to all contacts (overridden per-row if `lifecycleStage` column is mapped)
- **Update existing contacts** — checkbox; if unchecked, contacts with existing phone numbers are skipped

**Step 2 button flow:**

1. **"Preview"** button (enabled when phone mapping is valid) → calls `POST /v1/contacts/import/analyze` → shows stats inline:
   > `842 new · 31 duplicates in file · 12 will update`
   Stats row replaces the "Preview" button. A "Re-analyze" link appears if the user edits mapping afterwards.
2. **"Start Import"** button appears once analyze succeeds → calls `POST /v1/contacts/import/start` → advances to Step 3.

Stats update immediately (re-run analyze) if the user toggles **Update existing contacts** after initial preview.

### Step 3 — Import

Single screen. No navigation away until complete.

- Progress bar: `processedRows / totalRows`
- Live counters: **Created** · **Updated** · **Skipped** (via SSE)
- On SSE `done` event with `status: completed`: progress bar freezes, results render below on the same screen:
  - Final counts: Created / Updated / Skipped / Failed rows
  - "View Contacts" link → `/contacts`
  - "Import Another File" → resets wizard to Step 1
- On `status: failed`: error state shown inline, no navigation

---

## Backend Changes

### 1. Shared Types (`packages/shared/src/index.ts`)

Extend `DbField`:

```typescript
type DbField =
  | 'fullPhoneNumber'
  | 'phoneNumber'
  | 'countryCode'
  | 'firstName'        // new
  | 'lastName'         // new
  | 'fullName'         // new — auto-split on first space
  | 'name'
  | 'email'
  | 'lifecycleStage'
  | 'tags'
  | `customField:${string}`  // new — string is the CustomField.id
  | 'skip';
```

### 2. Prisma Schema (`apps/api/prisma/schema.prisma`)

Add one field to `ContactImport`:

```prisma
model ContactImport {
  // ... existing fields unchanged ...
  batchGroupIds  String[]   @default([])   // new
}
```

No migration to `Contact` model required — `firstName`, `lastName`, and `customFields` already exist.

### 3. API Route (`apps/api/src/routes/contacts-import.ts`)

**`POST /v1/contacts/import/start`** — accept new field in body:
```typescript
batchGroupIds?: string[]   // ContactGroup IDs
```
Store on `ContactImport` record. Pass to BullMQ job payload.

No changes to upload or analyze endpoints.

### 4. Worker (`apps/api/src/workers/contact-import.worker.ts`)

Three additions to the per-row field extractor:

**firstName / lastName:**
```
'firstName'  → contact.firstName = value
'lastName'   → contact.lastName = value
```
Both also derive `name = "${firstName} ${lastName}".trim()` (same derivation as the contact PATCH route).

**fullName (auto-split):**
```
'fullName' → split on first space:
  firstName = everything before first space
  lastName  = everything after first space (including remaining spaces)
  name      = original value
```
Example: `"John Smith Doe"` → firstName `"John"`, lastName `"Smith Doe"`.
Example: `"Priya"` → firstName `"Priya"`, lastName `""`.

**customField:\<id\>:**
```
'customField:<id>' → accumulate into customFields: { [id]: value }
```
Merged into the contact upsert payload. Existing `customFields` values for other keys are preserved (spread merge, not replace).

**batchGroupIds — post-batch step:**
After each batch of contacts is created/updated, create `ContactGroup` junction records:
```
for each contact in batch:
  for each groupId in batchGroupIds:
    upsert ContactGroup { contactId, groupId }  (skip if already member)
```
Uses `createMany({ skipDuplicates: true })` — no error if contact is already in group.

---

## Frontend Changes

### Files

| Action | File |
|--------|------|
| Delete | `apps/web/app/(dashboard)/contacts/import/steps/Step3Preview.tsx` |
| Delete | `apps/web/app/(dashboard)/contacts/import/steps/Step5Summary.tsx` |
| Rename / replace | `Step1Upload.tsx` — strip batch settings, file only |
| Replace | `Step2MapFields.tsx` → becomes Configure step (mapper + batch panel + stats) |
| Replace | `Step4Progress.tsx` → becomes Import step (progress + inline results) |
| Modify | `ImportWizard.tsx` — collapse 5-step state machine to 3 steps; add `batchGroupIds` to context |

### Wizard Context — added fields

```typescript
batchGroupIds: string[]          // new
setBatchGroupIds: (ids: string[]) => void  // new
requiredFieldsNotMapped: string[] // new — populated after analyze
```

### DbField dropdown — groups multi-select

Reuse the same groups fetch pattern as `AddContactModal` (`/v1/contact-groups?archived=false`). Render as a multi-select or a tag-style picker. Fetched once on Step 2 mount.

### Custom fields in mapper

Fetch `/v1/contacts/custom-fields` on Step 2 mount (same call `SegmentBuilder` already makes). Add as `<optgroup label="Custom Fields">` in the mapper dropdown. Each option value is `customField:<id>`.

After `analyze` response, compare org's `isRequired` custom fields against current `fieldMapping`. Any required field whose `id` does not appear in any `customField:<id>` mapping entry is added to `requiredFieldsNotMapped`. Show yellow banner if array is non-empty.

---

## Error Handling (unchanged from previous spec, additions noted)

| Scenario | Handling |
|----------|---------|
| Required custom field not mapped | Yellow warning banner in Step 2 — non-blocking |
| Group fetch fails | Batch group picker shows error state; import can still proceed without groups |
| `fullName` with no space | Entire value → `firstName`; `lastName` set to `""` |
| Both `firstName` and `fullName` mapped | `fullName` wins (last-write); implementation note: apply fullName after firstName/lastName |
| All previous error scenarios | Unchanged from `2026-05-02-csv-contact-import-design.md` |

---

## Out of Scope

- Deduplication by `externalId` (phone-only deduplication unchanged)
- Per-row group mapping from a CSV column (batch-only)
- Blocking import when required custom fields are not mapped
- Import history page
- Per-row error download
- Company assignment during import
