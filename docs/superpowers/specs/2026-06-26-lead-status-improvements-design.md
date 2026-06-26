# Lead Status Improvements — Design Spec

**Date:** 2026-06-26
**Scope:** M2 Contact & Lead Management
**Status:** Approved

## Background

Gap analysis against Interakt's Lead Status feature identified four gaps. One (default status seeding) was already implemented via `seed-lead-statuses.ts` + the Clerk `organization.created` webhook. This spec covers the three real gaps.

## Gap 1 — Graceful Status Deletion

### Problem

`DELETE /lead-statuses/:id` returns a `409 STATUS_IN_USE` error if any contact references the status. This prevents admins from ever deleting a status that has been used, creating a dead-end.

### Decision

- Contacts assigned to the deleted status are cascade-updated to `leadStatusId: null` (Unassigned) within the same DB transaction as the delete.
- The existing `409` blocks for org `defaultLeadStatusId` config and flow `update_stage` node references remain unchanged — those are targeted error messages that require deliberate admin action.

### API Changes — `apps/api/src/routes/lead-statuses.ts`

Remove the `inUse` count check (lines 100–103). Replace with a `$transaction`:

```
1. prisma.contact.updateMany({ where: { organizationId, leadStatusId: id }, data: { leadStatusId: null } })
2. prisma.leadStatus.delete({ where: { id } })
```

Response stays `204`. No body change.

The org-config and flow-reference blocks stay above the transaction, unchanged.

### UI Changes — `apps/web/app/(dashboard)/settings/contact-settings/tabs/LeadStatusesTab.tsx`

- Replace the direct `remove.mutate(id)` call in `SortableStatusRow.onDelete` with a confirmation dialog trigger.
- New state: `deleteTarget: { id: string; name: string } | null`.
- Dialog text: **"Delete '[Name]'? Contacts using this status will be moved to Unassigned."** with Cancel and Delete buttons.
- `onError` in the mutation only surfaces org-config and flow-blocking errors (the `STATUS_IN_USE` error from contact counts is gone).

---

## Gap 2 — Default Status Seeding

Already implemented. `apps/api/src/lib/seed-lead-statuses.ts` seeds the 7 Interakt-standard statuses (New Lead → Closed Lost) on `organization.created` via the Clerk webhook. No work needed.

---

## Gap 3 — Pipeline / Kanban View

### Problem

The contacts page only has a flat list view. There is no pipeline/board view grouped by lead status, which is a core sales workflow feature.

### Decision

- **View toggle** on the existing `/contacts` page — a `[List] [Pipeline]` segmented control. No new route.
- Mode persisted in `localStorage` key `wbmsg-contacts-view`.
- Active filters (search, tags, assigned user, etc.) carry over into the pipeline view.
- Contacts with `leadStatusId = null` are hidden from the pipeline (matching Interakt). They remain visible in list view.
- **Per-column fetch** strategy: each column calls the existing `GET /contacts?leadStatusId=X&limit=20`. No new API endpoint needed.
- Drag between columns changes a contact's lead status via `PATCH /contacts/:id`.

### New Components

| File | Role |
|---|---|
| `apps/web/components/contacts/PipelineView.tsx` | Board container; receives `statuses` + active `filters`; renders columns in a horizontal scroll |
| `apps/web/components/contacts/PipelineColumn.tsx` | Single column; owns its React Query per-column fetch + pagination state |
| `apps/web/components/contacts/PipelineCard.tsx` | Draggable contact card |

### Modify

`apps/web/app/(dashboard)/contacts/ContactsClient.tsx`:
- Add `[List] [Pipeline]` toggle to the header.
- Read/write `localStorage` for view mode.
- Conditionally render `PipelineView` (with current filters) vs the existing list table.

### Column Layout

- Fixed width ~280px, container horizontally scrollable.
- Header: colored status dot + status name + contact count badge — shows loaded count; appends "+" when `pagination.has_more === true` (e.g. "20+"). No separate count API call required.
- Cards: initials avatar, full name (bold), phone number (gray), assigned user initials chip (bottom-right, shown only if set).
- Footer: "Load more" button shown when `pagination.has_more === true`; fetches next page via `pagination.next_cursor`.

### Drag & Drop

Uses `@dnd-kit/core` + `@dnd-kit/sortable` (already installed). `DragOverlay` shows a ghost card during drag.

On `DragEnd`:
1. If destination column differs from source — call `PATCH /contacts/:id` with `{ leadStatusId: destinationStatusId }`.
2. On success — invalidate both source and destination column query keys so they re-fetch fresh data.
3. On error — invalidate source column only to restore the card (no optimistic state to roll back).

### React Query Keys

```
["pipeline-column", statusId, filters]
```

Filters object is serialized into the key so columns re-fetch when the user changes search/tag/etc.

---

## Gap 4 — Name Validation + Colour Swatches

### Problem

- `StatusSlideOver` accepts any characters in the status name with no validation.
- The backend has no character validation either.
- Only 5 colour swatches are available; the 7 default seed statuses use colours not in the picker.

### Name Validation

**Allowed pattern:** letters, numbers, spaces, hyphens, underscores — regex `/[^a-zA-Z0-9 \-_]/`.

**Frontend** (`apps/web/app/(dashboard)/settings/contact-settings/tabs/StatusSlideOver.tsx`):
- Validate on every keystroke.
- If invalid characters found: show inline error below input — *"Only letters, numbers, spaces, hyphens, and underscores."*
- Save button disabled while `nameError` is set or name is empty.

**Backend** (`apps/api/src/routes/lead-statuses.ts`, POST + PATCH):
- After `name.trim()`, test the same pattern.
- Return `400 { code: "INVALID_NAME", message: "Status names may only contain letters, numbers, spaces, hyphens, and underscores" }`.

### Colour Swatches

Expand `SWATCHES` constant in `StatusSlideOver.tsx` from 5 to 10. New set covers all 7 default seed colours plus 3 extras:

```ts
const SWATCHES = [
  "#3B82F6", // blue       — Needs Analysis seed
  "#22C55E", // green      — Qualification seed
  "#10B981", // emerald    — Closed Won seed
  "#14B8A6", // teal
  "#8B5CF6", // violet     — Negotiation seed
  "#EC4899", // pink       — Proposal seed
  "#F97316", // orange     — New Lead seed
  "#EF4444", // red        — Closed Lost seed
  "#FACC15", // yellow
  "#64748B", // slate
] as const;
```

---

## Files Changed Summary

| File | Change |
|---|---|
| `apps/api/src/routes/lead-statuses.ts` | Delete handler: cascade contacts → null instead of blocking; add name validation to POST + PATCH |
| `apps/web/app/(dashboard)/settings/contact-settings/tabs/LeadStatusesTab.tsx` | Add delete confirmation dialog |
| `apps/web/app/(dashboard)/settings/contact-settings/tabs/StatusSlideOver.tsx` | Inline name validation; expand to 10 swatches |
| `apps/web/app/(dashboard)/contacts/ContactsClient.tsx` | Add List/Pipeline toggle; conditionally render PipelineView |
| `apps/web/components/contacts/PipelineView.tsx` | New — board container |
| `apps/web/components/contacts/PipelineColumn.tsx` | New — per-column fetch + pagination |
| `apps/web/components/contacts/PipelineCard.tsx` | New — draggable card |

## Out of Scope

- Existing blocks on org `defaultLeadStatusId` and flow `update_stage` references (intentionally kept).
- Default status seeding (already shipped).
- Any new API endpoints (pipeline reuses existing contacts endpoint).
