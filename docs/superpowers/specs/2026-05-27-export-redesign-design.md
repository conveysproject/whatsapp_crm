# Contact Export Redesign — Design Spec

**Date:** 2026-05-27  
**Status:** Approved  

---

## Overview

Replace the current one-click full-export with a filter-first export modal. Before downloading, the user configures which contacts to export using up to five filter types. The exported CSV includes all contact fields — standard fields, tags, groups, notes, and one column per org custom field — matching the import format so export → edit → re-import cycles work cleanly.

---

## Current State

- Export button calls `GET /v1/contacts/export` with no filter params
- CSV includes only 7 fields: id, firstName, lastName, phoneNumber, email, countryCode, createdAt
- No lifecycle stage, tags, groups, notes, or custom fields exported
- No filtering — always exports all contacts

---

## New User Flow

1. User clicks **Export** on the contacts page
2. **Export modal** opens with five optional filters and a live contact count
3. User configures filters (all optional — no filter = export all)
4. Live count updates as filters change: **"1,234 contacts will be exported"**
5. User clicks **Download CSV** → file downloads; modal closes

---

## Export Modal

### Filters

All filters are optional. Different filter types combine as AND (e.g. lifecycle=lead AND tags=vip exports only leads that also have the vip tag). An empty modal (no filters set) exports all contacts.

| Filter | UI | Match logic |
|--------|----|-------------|
| Lifecycle stage | Multi-select checkboxes: lead / prospect / customer / loyal / churned | OR — contact matches any checked stage |
| Tags | Tag chip input (Enter/comma to add) | AND — contact must have ALL entered tags |
| Segment | Single dropdown (fetched from `/v1/segments`) | Contact must be a member of the selected segment |
| Groups | Multi-select dropdown (fetched from `/v1/contact-groups?archived=false`) | OR — contact must be in ANY selected group |
| Custom fields | "+ Add custom field filter" rows | AND — contact must match ALL added filters |

**Custom field filter rows:** shown only if org has custom fields (fetched from `/v1/contacts/custom-fields`). Each row: field name dropdown + text input for value + × remove button. Operator is always "contains" (case-insensitive). Multiple rows combine with AND.

### Live Count

Below the filters: **"1,234 contacts will be exported"**

- Fetches `GET /v1/contacts/export/count` with current filter params
- Debounced 400ms after any filter change
- Shows **"Estimating…"** while loading
- Shows **"All contacts"** when no filters are set and count equals total org contacts

### Buttons

- **Cancel** — closes modal, no download
- **Download CSV** — triggers download; button shows "Downloading…" while in progress; modal closes on success

---

## Exported CSV Columns

Columns are fixed-order. Custom field columns appear after Notes, one per active org custom field ordered by `inputName` alphabetically.

| Column header | Source | Notes |
|---------------|--------|-------|
| `Full Phone` | `phoneNumber` | Prefixed with `=` to prevent Excel formula injection: `="919876543210"` |
| `First Name` | `firstName` | |
| `Last Name` | `lastName` | |
| `Email` | `email` | |
| `Country Code` | `countryCode` | |
| `Lifecycle Stage` | `lifecycleStage` | Raw value: lead / prospect / customer / loyal / churned |
| `Tags` | `tags[]` | Pipe-separated: `vip\|premium` |
| `Groups` | via `groupContacts` join | Pipe-separated group titles: `VIP Customers\|Delhi` |
| `Notes` | `notes` | Newlines replaced with space to keep single-row CSV |
| `Created At` | `createdAt` | ISO 8601: `2026-01-15T10:30:00.000Z` |
| `{cf.inputName}` | `customFields[cf.id]` | One column per active org custom field; empty string if contact has no value |

---

## Backend Changes

### 1. New endpoint — `GET /v1/contacts/export/count`

Returns the count of contacts matching the given filters. Used for the live count in the modal.

**Query params:** same as export (see below).

**Response:**
```typescript
{ data: { count: number } }
```

**Auth:** same as export — requires `manage_contacts` + `export_contacts` permissions.

### 2. Extend `GET /v1/contacts/export`

**New query params (all optional):**

```typescript
lifecycleStage?: string | string[]   // repeatable: ?lifecycleStage=lead&lifecycleStage=prospect
tags?: string | string[]             // repeatable: contact must have ALL tags
segmentId?: string                   // contact must be a member of this segment
groupIds?: string | string[]         // repeatable: contact must be in ANY group
cf?: Record<string, string>          // custom field filters: cf[fieldId]=value (contains match)
```

**WHERE clause logic:**

```typescript
where: {
  organizationId,
  deletedAt: null,
  ...(lifecycleStages.length > 0 && { lifecycleStage: { in: lifecycleStages } }),
  ...(tags.length > 0 && { tags: { hasEvery: tags } }),
  ...(segmentId && { id: { in: segmentMemberIds } }),   // resolved via segment evaluator
  ...(groupIds.length > 0 && {
    groupContacts: { some: { contactGroupId: { in: groupIds } } },
  }),
  // custom field filters applied as AND conditions using Prisma JSON path filtering
}
```

**Segment resolution:** call the existing segment evaluator with the segment's filters and match mode to get matching contact IDs. Add `id: { in: ids }` to the WHERE clause.

**Custom field filtering:** for each `cf[fieldId]=value` entry, add a Prisma JSON filter:
```typescript
customFields: { path: [fieldId], string_contains: value }
```
Multiple custom field filters are AND-combined.

**CSV generation:**
1. Fetch org's active custom fields from `CustomField` table ordered by `inputName`
2. Fetch matching contacts with `include: { groupContacts: { include: { contactGroup: true } } }`
3. Write header row (fixed columns + one per custom field)
4. Write one row per contact; escape commas, quotes, newlines; prefix phone with `=`
5. Stream response with `Content-Type: text/csv`, `Content-Disposition: attachment; filename="contacts-{YYYY-MM-DD}.csv"`

**Filename** includes the export date: `contacts-2026-05-27.csv`.

### 3. Remove legacy export path

The default export (no `format` param) currently calls `generateContactsCsv()`. Remove this branch — the new CSV format is now the default. The `format=json` path remains unchanged.

---

## Frontend Changes

### `ContactsClient.tsx`

- Add `showExportModal` boolean state (default `false`)
- Export button `onClick`: `setShowExportModal(true)` instead of direct download
- Render `<ExportModal open={showExportModal} onClose={() => setShowExportModal(false)} />`

### New `ExportModal.tsx` (`apps/web/components/contacts/ExportModal.tsx`)

**State:**
```typescript
lifecycleStages: string[]           // selected lifecycle stages
tags: string[]                      // entered tags
segmentId: string | null            // selected segment id
groupIds: string[]                  // selected group ids
customFieldFilters: { fieldId: string; value: string }[]  // added custom field rows
count: number | null                // live count result
counting: boolean                   // count fetch in progress
downloading: boolean                // download in progress
```

**Data fetched on mount:**
- `GET /v1/segments` — for segment dropdown
- `GET /v1/contact-groups?archived=false` — for groups multi-select
- `GET /v1/contacts/custom-fields` — for custom field filter rows

**Count fetch:** debounced 400ms, triggered on any filter state change. Builds the same query params as the download request and calls `GET /v1/contacts/export/count`.

**Download:** builds URL with filter params, fetches as blob, creates object URL, triggers `<a>` click, revokes URL. Button shows "Downloading…" during fetch; modal closes on success.

---

## Error Handling

| Scenario | Handling |
|----------|---------|
| Count fetch fails | Show "Unable to estimate count" — download still available |
| Segment fetch fails | Segment dropdown shows error state; other filters still work |
| Groups fetch fails | Groups dropdown shows error state; other filters still work |
| Custom fields fetch fails | Custom field filter section hidden |
| Download fails | Toast error: "Export failed. Please try again." Modal stays open |
| Zero results | Count shows "0 contacts match" — Download CSV button disabled |

---

## Out of Scope

- Excel (.xlsx) format
- Email delivery for large exports
- Column picker (choose which fields to include)
- Scheduled / recurring exports
- Export history
- Date range filter
