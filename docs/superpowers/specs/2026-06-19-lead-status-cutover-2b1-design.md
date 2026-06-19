# Design: Lead Status Cutover — Sub-project 2b-1 (Interactive Contact Surfaces)

**Date:** 2026-06-19
**Status:** Approved (design)
**Part of:** Contact Settings → Sub-project 2 (Lead Statuses). Stage 2b-1 of the cutover that removes the `lifecycleStage` enum and uses `leadStatus` only.

**Role framing:** Migration engineer — safely move every consumer off a live column, in an order where no intermediate state references a removed column. The column is dropped last (2c).

## Context

2a added the `LeadStatus` table + nullable `Contact.leadStatusId`, seeded 7 statuses per org, and backfilled existing contacts. The user directive for 2b: **remove `lifecycleStage` entirely and use only the new status — no enum sync.** Because `lifecycleStage` is referenced by ~20 files, the removal is sequenced so each step is shippable and the column is dropped only after all consumers are migrated:

- **2b-1 (this spec):** interactive contact status surfaces.
- **2b-2:** segments + saved filters (persisted JSON) + CSV import (external value mapping).
- **2b-3:** flows (`flowDefinition` JSON).
- **2c:** drop `lifecycleStage` column + `LifecycleStage` enum.

This spec covers **only 2b-1**.

## Problem

The contact's status is currently created, edited, filtered, displayed, exported, and fed to AI/ML via the fixed `lifecycleStage` enum. These interactive surfaces must use the configurable `leadStatus` instead.

## Scope

### API (`apps/api`)

**`src/routes/contacts.ts`**
- **List filter:** replace the `?lifecycleStage=` query handling with `?leadStatusId=` (`leadStatusId: { in: [...] }` when provided). Remove the `LifecycleStage` cast import usage for filtering.
- **List + single-contact responses:** `include: { leadStatus: { select: { id: true, name: true, color: true } } }` so the UI can render name + color. Keep existing fields.
- **POST /contacts (create):** accept `leadStatusId` in the body; write it. Stop reading/writing `lifecycleStage`. If `leadStatusId` is omitted, leave it null (no enum default).
- **PATCH /contacts/:id (update):** accept `leadStatusId`; write it. Remove the `lifecycleStage` update branch. The change-detection that currently fires the `lifecycle_change` flow trigger when `lifecycleStage` changes now fires when `leadStatusId` changes (trigger type string `lifecycle_change` is unchanged so existing flows still fire; flows migrate in 2b-3). Validate that a provided `leadStatusId` belongs to the org (404/400 if not).
- **GET /contacts/export (CSV):** output the lead status name (from the `leadStatus` relation) in the status column instead of `lifecycleStage`.

**`src/routes/ai.ts`**
- In the contact `select` for AI context, replace `lifecycleStage: true` with `leadStatus: { select: { name: true } }`; use `leadStatus?.name ?? "—"` wherever the stage string was used in the prompt/context.

**`src/routes/trust-score.ts`**
- Replace `select: { ... lifecycleStage }` with the `leadStatus` relation; send `leadStatus?.name ?? null` as the value of the ML payload's existing `lifecycle_stage` field. **The ML service contract (field name `lifecycle_stage`) is unchanged** — only the value source changes.
- **Known consideration:** the ML service previously received enum values (`lead`/`prospect`/…); it will now receive status names (`New Lead`/`Qualification`/…). This widens/changes the category vocabulary the model sees. Accepted for 2b-1 (the ML service in `services/ml` is out of scope and any model retraining is a separate concern); flagged so it is a conscious choice, not a silent drift.

### Web (`apps/web`)

A shared hook/fetch for lead statuses is used by the forms, filters, and export modal: `GET /v1/lead-statuses` (React Query key `lead-statuses`, the same key 2a uses).

**`components/contacts/AddContactModal.tsx` + `components/contacts/EditContactDrawer.tsx`**
- Replace the hardcoded 5-option `lifecycleStage` `<select>` with a dropdown populated from `GET /lead-statuses` (label = name, value = id). Form state field becomes `leadStatusId: string`. Submit `leadStatusId` (omit when empty). Default selection: none/placeholder (not an enum value).

**`app/(dashboard)/contacts/[id]/ContactDetailSidebar.tsx` + `ContactDetailClient.tsx`**
- Display the contact's `leadStatus` (name + a small color dot using `style={{ backgroundColor }}`) instead of the `lifecycleStage` text/badge.

**`components/contacts/ContactsClient.tsx`**
- The contacts list status filter switches from the fixed enum options to options fetched from `/lead-statuses`; the applied filter sends `?leadStatusId=` (matching the API change). Display each contact's status from the `leadStatus` relation.

**`components/contacts/ExportModal.tsx`**
- The "lifecycle stage" filter chips become lead-status options from `/lead-statuses`; `buildParams` appends `leadStatusId` instead of `lifecycleStage`.

## Data Migration

A small migration (or a one-time backfill in the same migration file pattern as 2a) sets `leadStatusId` for any contact where it is null, by mapping the existing `lifecycleStage` value to the org's seeded status (lead→New Lead, prospect→Qualification, customer→Closed Won, loyal→Closed Won, churned→Closed Lost). This covers contacts created between 2a and 2b-1 (forms still wrote the enum then).

## Out of Scope (later stages)

- CSV import (`contacts-import.ts`, `contact-import.worker.ts`, `Step2MapFields.tsx`, `ImportWizard.tsx`, `csv.ts`) — 2b-2.
- Segments + saved filters (`segment-evaluator.ts`, `SegmentBuilder.tsx`, saved-filters) — 2b-2.
- Flows (`flow-runner.ts`, `FlowConfigPanel.tsx`, `serialize.ts`) — 2b-3.
- Dropping the `lifecycleStage` column / `LifecycleStage` enum — 2c.

## Known Interim Behavior (accepted)

- The `lifecycleStage` column remains (read by segments/flows/import until 2b-2/2b-3). 2b-1 stops the interactive surfaces from using it; it is **not** kept in sync.
- Contacts created via **CSV import** between 2b-1 and 2b-2 will have a null `leadStatus` and show no status in the UI until import is migrated. Temporary, known gap.

## Error Handling

- API: `leadStatusId` on create/update validated against the org (reject cross-org/unknown ids with 400/404); all queries org-scoped; existing RBAC on contact write endpoints unchanged.
- Web: status dropdowns show a loading/empty state if `/lead-statuses` is still fetching; submitting without a status is allowed (null).

## Testing

- **API (vitest):** `contacts.ts` — filter by `leadStatusId`, create/update persists `leadStatusId`, create/update rejects an unknown `leadStatusId`, export emits the status name. Update the existing contacts tests that asserted `lifecycleStage` behavior.
- **Web:** type-check + build + manual smoke (add/edit a contact's status, filter the list, export, view detail).
- Confirm no remaining `lifecycleStage` references in the Tier-1 files after the change (grep gate).

## Success Criteria

The contact create/edit/detail/list-filter/export/AI/trust-score surfaces use `leadStatus` exclusively; no Tier-1 file references `lifecycleStage`; existing contacts and interim-created contacts all have a `leadStatusId`.
