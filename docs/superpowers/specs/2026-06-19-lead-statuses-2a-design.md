# Design: Lead Statuses — Sub-project 2a (Expand + Manage)

**Date:** 2026-06-19
**Status:** Approved (design)
**Part of:** Contact Settings feature. This is Sub-project 2 (Lead Statuses), stage **2a** of an expand → migrate → contract sequence.

## Context

Today `Contact.lifecycleStage` is a fixed Prisma enum (`lead`, `prospect`, `customer`, `loyal`, `churned`) referenced by ~20 source files (contacts route, segments, CSV import, trust-score, AI context, contact forms, segment builder, import wizard, export, flows). The goal is to replace it with an org-configurable `LeadStatus` table.

Replacing a live column used in 20 places at once is risky, so the work is split into three stages:

- **2a (this spec):** Additively introduce `LeadStatus` + a nullable `Contact.leadStatusId` FK, seed + backfill, build the CRUD API and the Lead Statuses settings tab. `lifecycleStage` is left untouched and keeps powering all existing consumers — zero regression risk.
- **2b (later):** Cut the 20 consumers over to `leadStatusId` (keeping `lifecycleStage` in sync during transition).
- **2c (later):** Drop the `lifecycleStage` column + `LifecycleStage` enum.

This spec covers **only 2a**.

## Problem

There is no way for an org to define its own lead/pipeline statuses, colors, or ordering. The "Lead Statuses" tab on `/settings/contact-fields` currently shows a "Coming soon" placeholder.

## Solution

Add an org-scoped `LeadStatus` table and a nullable `Contact.leadStatusId`. A data migration seeds each existing org with 7 default statuses and backfills every contact's `leadStatusId` from its current enum value. A CRUD API manages statuses (list/create/update/delete/reorder) with RBAC and a delete-in-use guard. The Lead Statuses tab gets a real UI: a drag-orderable list with color swatches and an add/edit slide-over.

## Data Model

New model in `apps/api/prisma/schema.prisma`:

```prisma
model LeadStatus {
  id             String    @id @default(uuid())
  organizationId String    @map("organization_id")
  name           String
  color          String    // hex string, e.g. "#F97316"
  sortOrder      Int       @default(0) @map("sort_order")
  isClosure      Boolean   @default(false) @map("is_closure") // consumed by 2b / Basic Config; unused in 2a
  createdAt      DateTime  @default(now()) @map("created_at")
  updatedAt      DateTime  @updatedAt @map("updated_at")
  contacts       Contact[]

  @@index([organizationId, sortOrder])
  @@map("lead_statuses")
}
```

Contact gains (additive — `lifecycleStage` stays):

```prisma
  leadStatusId String?     @map("lead_status_id")
  leadStatus   LeadStatus? @relation(fields: [leadStatusId], references: [id])
```

Field choices follow existing patterns: `color` mirrors `Label.bgColor` (hex string), `sortOrder` mirrors `AutoReply.priorityIndex`, `isClosure` added now to avoid a second migration in 2b.

## Colors (match Interakt)

**Seed colors** (the 7 default statuses):

| Name | color | isClosure |
|---|---|---|
| New Lead | `#F97316` | false |
| Qualification | `#22C55E` | false |
| Needs Analysis | `#3B82F6` | false |
| Proposal | `#EC4899` | false |
| Negotiation | `#8B5CF6` | false |
| Closed Won | `#10B981` | true |
| Closed Lost | `#EF4444` | true |

`sortOrder` is assigned 0..6 in the order above.

**Color picker swatches** (offered in the Add/Edit slide-over — Interakt's 5-swatch palette):
`#FACC15` (yellow), `#F87171` (coral), `#22C55E` (green), `#EC4899` (pink), `#3B82F6` (blue).

A seeded status may carry a color outside the picker set (e.g. Negotiation `#8B5CF6`); that matches Interakt and is acceptable — the picker constrains new/edited selections only.

## Migration

A Prisma migration (`add_lead_statuses`) that:

1. Creates the `lead_statuses` table and adds `contacts.lead_status_id` (nullable, FK).
2. For **every existing organization**, inserts the 7 seed rows (name, color, sortOrder, isClosure as above).
3. Backfills `contacts.lead_status_id` by mapping the existing enum value to the seeded status of that org:
   - `lead` → New Lead
   - `prospect` → Qualification
   - `customer` → Closed Won
   - `loyal` → Closed Won
   - `churned` → Closed Lost

Steps 2–3 are written as SQL in the migration (set-based: insert per org from the `organizations` table; update contacts joined to their org's seeded status by the mapped name).

**New-org seeding:** a shared helper `seedLeadStatuses(prisma, organizationId)` (in `apps/api/src/lib/`) inserts the same 7 rows. It is called from both org-creation paths — `apps/api/src/routes/clerk-webhook.ts` (`organization.created`) and `apps/api/src/routes/register.ts` — so newly created orgs start with the defaults.

## API — `apps/api/src/routes/lead-statuses.ts`

All endpoints org-scoped (`request.auth.organizationId`). Write endpoints guarded by `canAccess(role, permissions, "manage_contacts")` (consistent with Sub-project 1's Fields management) returning `403 FORBIDDEN` when denied.

| Method | Path | Behavior |
|---|---|---|
| GET | `/lead-statuses` | List org's statuses ordered by `sortOrder` asc. |
| POST | `/lead-statuses` | Create `{ name, color, isClosure? }`. `sortOrder` = current max + 1. 201. |
| PATCH | `/lead-statuses/:id` | Update any of `name`, `color`, `isClosure`. 404 if not in org. |
| DELETE | `/lead-statuses/:id` | **409 `STATUS_IN_USE`** if any contact has `leadStatusId = :id`; else delete, 204. 404 if not in org. |
| PATCH | `/lead-statuses/reorder` | Body `{ orderedIds: string[] }`. Validates the set equals the org's status ids, then rewrites `sortOrder` to match array index, in a transaction. |

The router is registered alongside the other routers in `apps/api/src/routes/index.ts`.

## Web — Lead Statuses tab

Replace the `lead-statuses` `ComingSoon` placeholder in `ContactFieldsClient.tsx` with `LeadStatusesTab` (new file under `settings/contact-fields/tabs/`).

Components:
- `LeadStatusesTab.tsx` — fetches `GET /lead-statuses` (React Query key `lead-statuses`), renders the list + "Add Status" button + the slide-over. Owns add/edit/delete/reorder mutations (invalidating `lead-statuses`).
- `LeadStatusRow` (within the tab or colocated) — a dnd-kit sortable row: drag handle · name · color swatch · edit (pencil) · delete (trash). Uses `@dnd-kit/core` + `@dnd-kit/sortable` (already dependencies).
- `StatusSlideOver` — right-hand slide-over panel with a Status Name input and the 5-swatch color picker; "Save" calls POST (add) or PATCH (edit).

Behaviors:
- Reorder: on drag end, optimistically reorder then call `PATCH /lead-statuses/reorder` with the new id order.
- Delete: calls DELETE; on 409 `STATUS_IN_USE`, shows an inline error ("This status is assigned to contacts — reassign them before deleting.") and keeps the row.
- The slide-over Save button is disabled until a name is entered (matches Interakt).

## Error Handling

- API: org-scoping on every query; 404 for cross-org/missing ids; 409 for delete-in-use; 403 for RBAC denial; reorder validates the id set before mutating.
- Web: delete 409 surfaced inline; mutation failures show an error message; React Query `lead-statuses` invalidated after each successful mutation.

## Testing

- **API (vitest, `lead-statuses.test.ts`)** following the existing route-test pattern:
  - GET returns statuses ordered by `sortOrder`.
  - POST appends with `sortOrder` = max + 1.
  - DELETE returns 409 when a contact references the status; 204 when none do.
  - PATCH `/reorder` rewrites `sortOrder` to match the provided order.
  - Write endpoints return 403 without `manage_contacts`.
- **Seed helper (vitest)**: `seedLeadStatuses` inserts exactly the 7 named rows with correct colors/isClosure/sortOrder.
- **Web**: type-check + manual smoke (add, edit, recolor, reorder, delete-in-use error). No web component-test runner beyond pure logic.

## Scope Boundary (explicit)

2a is purely additive. It does **NOT** modify any of the ~20 `lifecycleStage` consumers (segments, contacts filter, import worker/wizard, AI context, trust-score, contact detail, Add/Edit forms, export, flows). They continue using the enum. Contact create/edit forms are **not** repointed to `leadStatusId` in 2a — that is 2b.

**Interim contacts:** because create forms still write only `lifecycleStage` in 2a, any contact created between 2a and 2b will have `leadStatusId = null` (the migration backfill only covers contacts that existed at migration time). This is harmless in 2a (nothing reads `leadStatusId` yet); 2b must backfill remaining nulls from `lifecycleStage` as part of cutting consumers over.

## Out of Scope (later stages)

- 2b: repointing the 20 consumers to `leadStatusId`; keeping `lifecycleStage` in sync.
- 2c: dropping the `lifecycleStage` column + enum.
- Basic Configuration tab (default status / closure statuses / closure-deadline) — Sub-project 3.
- Per-status contact counts in the UI (YAGNI for now).
