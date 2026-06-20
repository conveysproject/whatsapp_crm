# Design + Plan: Basic Configuration — Sub-project 3a (Default + Closure Statuses + Delete Safety)

**Date:** 2026-06-20
**Status:** Approved (design); combined spec+plan (lean mode).
**Part of:** Contact Settings → Sub-project 3 (Basic Configuration). 3a = the two status-settings sections + delete-safety hardening. 3b (closure deadline + alerts) is next.

**Role:** Full-stack/migration engineer.

## Context
The Basic Configuration tab (3rd tab) has three sections in the Interakt reference: Default Status for New Contacts, Select Closure Statuses, and Default Closure Deadline. 3a builds the first two (no new infra) plus the lead-status delete-safety hardening (because these settings make a status referenceable, creating dangling-ref risk). 3b builds the closure-deadline feature next (alert via in-app Notification AND email — email pattern to be reused from `apps/conveys`).

## Storage
Settings live in `Organization.settings.contactConfig` (JSON), read via existing `GET /organizations/me` (returns the org incl. `settings`) and written via existing admin/manager-guarded `PATCH /organizations/me` (shallow-merges top-level `settings` keys):
```
settings.contactConfig = {
  defaultLeadStatusId: string | null,
  closureLeadStatusIds: string[],
}
```
No new settings API needed.

## Scope

### Schema — delete-safety #1 (unique status name)
- Add `@@unique([organizationId, name])` to `LeadStatus`. Migration `<ts>_lead_status_unique_name`: `CREATE UNIQUE INDEX "lead_statuses_organization_id_name_key" ON "lead_statuses"("organization_id","name");` (existing seed data is unique per org, so this applies cleanly).

### API — `lead-statuses.ts`
- **POST/PATCH dup-name → 409:** wrap create/update; on Prisma `P2002` (unique violation) return `409 { error: { code: "DUPLICATE_NAME", message: "A lead status with this name already exists" } }`.
- **DELETE guard — delete-safety #2 (extend):** before deleting, block (409) if the status is referenced by ANY of:
  1. a contact (`contact.count({ organizationId, leadStatusId: id })`) — existing.
  2. org Basic Config settings — read `organization.settings.contactConfig`; block if `defaultLeadStatusId === id` or `closureLeadStatusIds.includes(id)`.
  3. a flow — raw SQL existence check that any flow's `flow_definition.nodes[]` has an `update_stage` config referencing the id:
     ```ts
     const used = await fastify.prisma.$queryRaw<{ exists: boolean }[]>`
       SELECT EXISTS(
         SELECT 1 FROM "flows"
         WHERE "organization_id" = ${organizationId}
           AND "flow_definition"->'nodes' @> ${`[{"config":{"leadStatusId":"${id}"}}]`}::jsonb
       ) AS exists`;
     ```
  Return `409 { error: { code: "STATUS_IN_USE", message: "<which reference>" } }` with a message naming the blocker (contacts / default-or-closure setting / a flow). All checks org-scoped.

### API — `contacts.ts` POST (apply default status)
- When the create body has no `leadStatusId`, read `org.settings.contactConfig.defaultLeadStatusId`; if present and valid (belongs to org), set it on the new contact. (Fetch the org's settings once in the handler.) Keeps the existing explicit-`leadStatusId` path unchanged.

### Web — `BasicConfigTab.tsx` (replaces the `basic-config` ComingSoon)
- Fetch the org via `GET /v1/organizations/me` (React Query key `org-me`, reuse if present) to read `settings.contactConfig`. Fetch statuses via `useLeadStatuses()`.
- **Default Status for New Contacts:** a `<select>` (options from statuses, value = `defaultLeadStatusId`, leading "— None —"). With the Interakt helper text.
- **Select Closure Statuses:** multi-select chips from statuses (toggle ids in `closureLeadStatusIds`); selected chips highlighted with the status color dot.
- **Save** button → `PATCH /v1/organizations/me` with `{ settings: { contactConfig: { defaultLeadStatusId, closureLeadStatusIds } } }`; invalidate `org-me`. Show a saved/success state.
- Wire into `ContactFieldsClient.tsx`: `active === "basic-config" ? <BasicConfigTab/> : ...`.

## Out of Scope (3b / later)
- Closure Deadline section + `Contact.closureDeadline` + scheduled overdue check + in-app/email alert (reuse `apps/conveys` email) — 3b.

## Error Handling
- Dup status name → 409 DUPLICATE_NAME (POST/PATCH). Delete-in-use → 409 STATUS_IN_USE (contacts/settings/flows). Default-status apply silently skips an invalid/missing id. All queries org-scoped; settings writes admin/manager-guarded (existing).

## Testing
- **lead-statuses.test.ts:** POST/PATCH dup-name → 409; DELETE blocked when referenced by a setting (mock org.settings) and by a flow (mock the raw query) and by a contact; DELETE 204 when unreferenced. Keep existing RBAC/reorder tests.
- **contacts.test.ts:** create without leadStatusId applies the org default; create with explicit leadStatusId ignores the default.
- **Web:** type-check + build; manual smoke (set default, toggle closure statuses, save, reload).
- **Opus final review** (schema migration + raw-SQL guard + contact-create default).

## Success Criteria
Admins can set the default status (applied to new contacts) and choose closure statuses; lead statuses can't be deleted while referenced by contacts, settings, or flows, and can't be created/renamed to a duplicate name.
