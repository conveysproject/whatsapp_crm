# Contact Tags — Full Interakt Parity

**Date:** 2026-06-27
**Status:** Approved

## Goal

Close all identified gaps between WBMSG and Interakt's contact tag system to reach 100% feature parity. Seven changes across API, web, and a shared utility.

---

## Current State Summary

- `Contact.tags String[]` is the active tag system — used everywhere in web and API.
- `Label` model (with `textColor`/`bgColor`) exists in schema but is **unused in the web UI** — left as-is for a future message-labels feature.
- `settings/labels/LabelsClient.tsx` manages `Contact.tags`, not `Label` records.
- The "Tag selected" bulk button in the contacts list renders but has **no onClick handler** — dead UI.
- Tags display as uniform gray pills on every surface — no color differentiation.

---

## Architecture Decisions

### Colored tags — deterministic hash, no DB
Color is derived client-side by hashing the tag string to an index in a fixed 10-color palette. No new DB table. Same tag always gets the same color across all contacts and surfaces. Matches Interakt's auto-assign behavior.

New utility: `apps/web/lib/tag-color.ts`

```ts
// Returns stable Tailwind bg+text class pair for any tag string
export function getTagColor(tag: string): { bg: string; text: string }
```

Palette: 10 distinct color pairs covering blue, green, purple, orange, pink, teal, red, yellow, indigo, cyan — all using Tailwind `100`/`700` shades for readability.

### Bulk tag — append only, new API endpoint
`POST /v1/contacts/bulk/assign-tags` takes `{ contactIds: string[], tags: string[] }`. For each contact, it appends tags that are not already present (array union, no duplicates). Never replaces existing tags. Requires `contacts_bulk_tag` permission (already defined in RBAC).

### Tag autocomplete — new shared component
`TagCombobox.tsx` replaces the raw `<input>` in `EditContactDrawer` and is used in the bulk modal and inbox edit. On focus it fetches `GET /v1/contacts/tags`, shows a dropdown of existing org tags filtered by typed text, plus an inline "+ Create [text]" option. Keyboard-navigable. Falls back gracefully if the fetch fails (free-text only).

### CSV per-row tags — already implemented ✓
The import worker already calls `extractField(row, fieldMapping, "tags")` and `mergeTagsUnion` (splits on `;`). The import UI already exposes `Tags` as a mappable field. No changes needed for Gap 4.

---

## Changes

### 1. `apps/web/lib/tag-color.ts` (new)
Deterministic hash function → 10-color palette. Exported as `getTagColor(tag: string)`.

### 2. `apps/web/components/contacts/TagCombobox.tsx` (new)
Replaces free-text tag inputs across the app. Props: `tags: string[]`, `onChange: (tags: string[]) => void`. Fetches org tags on mount, shows filtered dropdown, supports keyboard nav and inline create.

### 3. `apps/api/src/routes/contacts.ts`
- Add `POST /v1/contacts/bulk/assign-tags` — appends tags to selected contacts, guards with `contacts_bulk_tag` permission.

### 4. `apps/api/src/routes/labels.ts`
- Add `PATCH /v1/tags/:tag` (rename) — body `{ newTag: string }`. Updates all contacts in org: remove old tag string, add new tag string. Requires `settings_tags` permission. Lives here alongside existing `GET /v1/tags` and `DELETE /v1/tags/:tag`.

### 5. `apps/web/components/contacts/BulkTagModal.tsx` (new)
Modal opened by the "Tag selected" button. Shows "Assign tags to N contacts", uses `TagCombobox`, confirm → `POST /v1/contacts/bulk/assign-tags` → updates local contact state (appends tags to selected rows in-memory).

### 6. `apps/web/components/contacts/ContactsClient.tsx`
- Wire `onClick` on "Tag selected" button → opens `BulkTagModal`.
- Add tag filter dropdown to the toolbar (loads from `GET /v1/contacts/tags`, sets `?tag=` query param — API already supports this).
- Replace tag pill rendering with `getTagColor(tag)` colored badges.

### 7. `apps/web/components/contacts/EditContactDrawer.tsx`
- Replace inline tag `<input>` with `TagCombobox`.
- Apply `getTagColor` to existing tag pills.

### 8. `apps/web/components/inbox/ContactPanel.tsx`
- Add "Edit" button to Tags section.
- Toggling edit shows inline `TagCombobox` + "Save" button → `PATCH /v1/contacts/:id` with updated tags.
- Apply `getTagColor` to tag pills.

### 9. `apps/web/app/(dashboard)/settings/labels/LabelsClient.tsx`
- Add inline rename: clicking a tag name makes it editable in-place → confirm → `PATCH /v1/tags/:tag`.
- Apply `getTagColor` to tag pills.

### 10. CSV import field mapping — already implemented ✓
No changes needed. `contact-import.worker.ts` already calls `extractField(row, fieldMapping, "tags")` and `mergeTagsUnion` (splits on `;`, merges with `batchTags`). `Step2MapFields.tsx` already exposes `Tags` as a mappable field with auto-detection for columns containing "tag". Gap 4 is fully closed.

---

## Tag Color Palette

| Index | bg class | text class | Color |
|---|---|---|---|
| 0 | bg-blue-100 | text-blue-700 | Blue |
| 1 | bg-green-100 | text-green-700 | Green |
| 2 | bg-purple-100 | text-purple-700 | Purple |
| 3 | bg-orange-100 | text-orange-700 | Orange |
| 4 | bg-pink-100 | text-pink-700 | Pink |
| 5 | bg-teal-100 | text-teal-700 | Teal |
| 6 | bg-red-100 | text-red-700 | Red |
| 7 | bg-yellow-100 | text-yellow-700 | Yellow |
| 8 | bg-indigo-100 | text-indigo-700 | Indigo |
| 9 | bg-cyan-100 | text-cyan-700 | Cyan |

Hash: sum of char codes mod 10.

---

## Data Flow

### Bulk tag
```
User selects contacts → clicks "Tag selected" → BulkTagModal opens
→ user searches/creates tags → confirm
→ POST /v1/contacts/bulk/assign-tags { contactIds, tags }
→ API: prisma.contact.findMany(where: { id: { in: contactIds }, orgId })
       → for each: update tags (union)
→ 204 → modal closes → ContactsClient updates local state (append tags to selected rows)
```

### Inbox tag edit
```
User clicks "Edit" in Tags section of ContactPanel
→ TagCombobox appears (pre-populated with contact's current tags)
→ user adds/removes → "Save"
→ PATCH /v1/contacts/:id { tags: [...] }
→ 200 → ContactPanel re-renders with new tags (colored)
```

### Tag rename
```
User clicks tag name in settings/labels → editable input
→ confirms new name → PATCH /v1/tags/:oldTag { newTag }
→ API: update all contacts in org (remove old, add new)
→ 200 → LabelsClient updates tag name in local state
```


---

## Surfaces Receiving Colored Tags

All tag pill renders updated to use `getTagColor(tag)`:

1. Contacts table — [ContactsClient.tsx](apps/web/components/contacts/ContactsClient.tsx)
2. Edit contact drawer — [EditContactDrawer.tsx](apps/web/components/contacts/EditContactDrawer.tsx)
3. Inbox contact panel — [ContactPanel.tsx](apps/web/components/inbox/ContactPanel.tsx)
4. Bulk tag modal — [BulkTagModal.tsx](apps/web/components/contacts/BulkTagModal.tsx) (new)
5. Settings labels page — [LabelsClient.tsx](apps/web/app/(dashboard)/settings/labels/LabelsClient.tsx)

---

## Permissions

No new permissions needed. Existing RBAC:
- `contacts_bulk_tag` — guards bulk assign endpoint (already defined)
- `settings_tags` — guards delete and rename endpoints (already in use for delete)

---

## Testing

- Unit test `getTagColor` — same tag always returns same color, all 10 palette entries reachable.
- API test `POST /v1/contacts/bulk/assign-tags` — appends, deduplicates, rejects cross-org, enforces permission.
- API test `PATCH /v1/tags/:tag` — renames across all contacts, rejects cross-org, enforces permission.
- Web: no new Vitest tests for UI components (covered by manual verification).

---

## Out of Scope

- `Label` model (colored labels on messages) — left untouched, future feature.
- External/public API for tags — not included in this spec.
- Tag color picker — colors are auto-assigned deterministically, no user choice.
