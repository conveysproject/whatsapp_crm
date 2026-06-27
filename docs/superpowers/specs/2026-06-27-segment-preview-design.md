# Segment Preview (Apply Filter Without Saving)

**Date:** 2026-06-27
**Status:** Approved

## Problem

The segment builder requires saving a named segment before seeing which contacts match. Users who want to explore filters or verify results must commit to creating a permanent record first.

## Solution

Add a read-only **Preview** button to the New Segment and Edit Segment pages. Clicking it calls a new API endpoint that evaluates filters without any DB writes and returns the matching contacts. Name is still required only at save time.

## API

### `POST /v1/segments/preview`

**File:** `apps/api/src/routes/segments.ts`

**Auth:** Clerk JWT — same as all segment routes. Org-scoped.

**Request body:**
```json
{ "filters": [...], "match": "all" | "any", "whatsappOptedOnly": boolean }
```

**Response:**
```json
{ "data": { "count": 12, "contacts": [...ContactPreview] } }
```

Calls the existing `evaluateSegment(prisma, organizationId, filters, match, whatsappOptedOnly)` — no segment record created or updated. Returns the same `{ count, contacts }` shape as `POST /v1/segments/:id/evaluate`.

## Web — New Segment Page

**File:** `apps/web/app/(dashboard)/contacts/segments/new/page.tsx`

**State added:**
- `previewContacts: ContactPreview[]` — starts empty
- `previewCount: number | null` — starts null
- `previewing: boolean` — loading state for the button

**`handlePreview()`:** POSTs `{ filters, match, whatsappOptedOnly }` to `/v1/segments/preview`, sets `previewCount` and `previewContacts`.

**Button row (below SegmentBuilderV2):**
```
[ Preview ]  [ Save Segment ]
```
- Preview: secondary style, enabled when `filters.length > 0`, does not require `name`
- Save Segment: unchanged — still requires `name.trim()`

**Contacts table:** Added below the button row, hidden until `previewCount !== null`. Same markup as the existing table on the Edit page (Name / Phone / Status columns, link to `/contacts/[id]`).

## Web — Edit Segment Page

**File:** `apps/web/app/(dashboard)/contacts/segments/[id]/page.tsx`

**State added:**
- `previewing: boolean` — loading state for the new button

**`handlePreview()`:** POSTs `{ filters, match, whatsappOptedOnly }` to `/v1/segments/preview`, sets the existing `matchCount` and `contacts` state (already used by Save).

**Button row:**
```
[ Preview ]  [ Save Segment ]  {matchCount} contacts match this segment
```
- Preview: secondary style, always enabled (segment already exists)
- Save Segment: unchanged — still PATCHes + evaluates (updates `lastContactCount` on the record)

The existing contacts table already renders from `matchCount`/`contacts` state — no structural change needed.

## No New Shared Component

The contacts table (~30 lines) is duplicated into the New page rather than abstracted. The two pages have different surrounding state and the duplication is minimal.

## Out of Scope

- Contacts list page filter panel (separate feature)
- Pagination on the preview contacts list (matches existing evaluate behavior)
- Saving preview state across page reloads
