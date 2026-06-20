# Design + Plan: Basic Configuration — Sub-project 3b (Closure Deadline)

**Date:** 2026-06-20
**Status:** Approved (design); combined spec+plan (lean mode).
**Part of:** Contact Settings → Sub-project 3 (Basic Configuration). 3b = the third section + the overdue alerting subsystem. Completes the Basic Configuration tab.

**Role:** Full-stack engineer.

## Decisions (from brainstorm)
- **Stored** `Contact.closureDeadline`, set on first status assignment (createdAt + N days); a scheduled job backfills any in-sales-cycle contact that lacks one (covers import/flow/pre-existing).
- **Per-contact deadline editing UI deferred** (follow-up).
- **In-app Notification now + API mail helper** (nodemailer, reusing the conveys SMTP env vars); email **no-ops safely when SMTP env is unset** — no accidental sends.

## Storage / Schema
- `Organization.settings.contactConfig.closureDeadlineDays: number | null` (added to the Basic Config tab).
- `Contact`: add `closureDeadline DateTime? @map("closure_deadline")` and `closureAlertedAt DateTime? @map("closure_alerted_at")` (alert-once guard) + `@@index([organizationId, closureDeadline])`. Migration `<ts>_contact_closure_deadline`.

## Scope

### API
- **`apps/api/src/lib/mail.ts`** (new): nodemailer transport mirroring `apps/conveys/lib/mail.ts` (GoDaddy SMTP via `SMTP_USER`/`SMTP_PASS`). `sendMail({ to, subject, html })` — **if `SMTP_USER`/`SMTP_PASS` are unset, log a warning and return without sending** (no-op). Add `nodemailer` + `@types/nodemailer` to `apps/api`.
- **`apps/api/src/lib/closure-deadline.ts`** (new, pure + testable): `computeClosureDeadline(createdAt: Date, days: number): Date` = createdAt + days*86400000. Unit-tested.
- **`contacts.ts` POST/PATCH:** when a contact gets a `leadStatusId` for the first time and `closureDeadlineDays` is configured and `closureDeadline` is null, set `closureDeadline = computeClosureDeadline(createdAt, days)`. (Create: createdAt ≈ now. Update: existing.createdAt.) Read `closureDeadlineDays` from org settings (already fetched for the default-status logic in POST; fetch in PATCH).
- **`apps/api/src/workers/closure-deadline.worker.ts`** (new, message-cleanup pattern): `startClosureDeadlineWorker()` + `scheduleClosureDeadlineCron()` (hourly repeatable). Per org with `closureDeadlineDays` configured:
  1. **Backfill:** contacts with a `leadStatusId`, null `closureDeadline` → set `closureDeadline = createdAt + days`.
  2. **Overdue alert:** contacts where `closureDeadline < now` AND `leadStatusId NOT IN closureLeadStatusIds` AND `closureAlertedAt IS NULL` AND `assignedUserId IS NOT NULL` → create a `Notification` for `assignedUserId` (`type: "closure_overdue"`, message naming the contact) + `sendMail` to that user's email (best-effort, no-op if SMTP unset) + set `closureAlertedAt = now`.
  - Register in `apps/api/src/index.ts` alongside the other start/schedule workers.

### Web — `BasicConfigTab.tsx`
- Add a third section "Default Closure Deadline": a number input bound to `closureDeadlineDays` (days from creation), with the Interakt helper text. Save it in the same `contactConfig` PATCH.

## Out of Scope (follow-ups)
- Per-contact editable `closureDeadline` in the contact detail/edit UI.
- Configurable cron interval / per-org scheduling nuance.

## Error Handling
- `sendMail` no-ops + warns when SMTP env missing; wrapped in try/catch in the worker so an email failure never blocks the notification or the `closureAlertedAt` update.
- All worker queries org-scoped (iterate orgs / filter by organizationId).
- `closureAlertedAt` guarantees one alert per contact per deadline.

## Testing
- **`closure-deadline.test.ts`:** `computeClosureDeadline` (createdAt + N days, exact ms).
- **contacts.test.ts:** create with a status + configured days sets `closureDeadline`; create without days configured leaves it null.
- **Web:** type-check + build.
- **Opus final review** (schema + scheduled worker + email/notification side-effects).

## Success Criteria
Admins set a closure-deadline (N days); contacts entering the sales cycle get a `closureDeadline`; an hourly job alerts the account owner (in-app + email-if-configured) once when a contact passes its deadline without being in a closure status.
