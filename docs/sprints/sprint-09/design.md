# Sprint 9 — Templates & Approvals

## Sprint Goal
Enable the team to build WhatsApp message templates, submit them to Meta for approval, and track their status — unlocking the ability to send broadcast messages to opted-in contacts via campaigns.

## What We're Building

- **Template CRUD API** — `GET/POST/PATCH /v1/templates`. A template stores `name`, `category` (marketing/utility/authentication), `language`, and `components` (JSONB array matching Meta's format: `[{ type: "HEADER", text }, { type: "BODY", text }, ...]`).
- **Meta submission** — `POST /v1/templates/:id/submit` calls the Meta Graph API (`POST /{wabaId}/message_templates`) with the template's components. Stores the returned `metaTemplateId`. Status is set to `pending` immediately.
- **Approval webhook** — The `POST /v1/webhooks/whatsapp` handler already exists (Sprint 3). Sprint 9 adds a branch for `change.field === "message_template_status_update"` — updates the matching template's `status` to `approved` or `rejected`.
- **Template builder UI** — `NEW /templates/new` — a form for name, category, language, header, body, footer. Body supports `{{1}}` variable placeholders. Live `TemplatePreview` component shows a WhatsApp-style bubble rendering the current content.
- **Templates list page** — `/templates` — table with status badge (yellow: pending, green: approved, red: rejected). Submit button on each row.
- **Multi-language** — Language code dropdown covers en, hi, mr, ta, te. One template per language; Meta treats each as a separate entity.

## Key Technical Decisions

- **Components as JSONB, not normalized** — Meta's template component structure is a well-defined JSON array. Storing it as JSONB avoids a `template_components` join table and allows sending the payload to Meta without transformation.
- **Status as application enum, not Meta-derived** — We map Meta's `APPROVED`/`REJECTED`/`PENDING` to lowercase `approved`/`rejected`/`pending` for consistency with the rest of the schema. The mapping happens in the webhook handler.
- **No template versioning in Sprint 9** — Templates are immutable after Meta approval (Meta doesn't allow editing approved templates — you must create a new one). Sprint 9 treats each `POST /v1/templates` as a new version. Version history is a Sprint 12+ concern.
- **Live preview as pure rendering** — `TemplatePreview` is a pure presentational component — it renders whatever strings are passed as props. No API calls. This makes it instantaneous and testable.
- **No button components in Sprint 9** — CTA buttons (URL, phone number) are part of the `BUTTONS` component. Sprint 9 supports header/body/footer only. Button support is added in Sprint 10 (Campaign Scheduler) when it's needed for campaign CTAs.

## Dependencies

- **External:** WABA provisioned and `whatsappBusinessAccountId` stored on the `Organization` row; `WA_ACCESS_TOKEN` env var set
- **Internal:** Sprint 3 complete — webhook handler exists; Sprint 4 complete — `templates` table created by migration

## Definition of Done

- [ ] `POST /v1/templates` creates a template with `status: pending`
- [ ] `POST /v1/templates/:id/submit` calls Meta API; updates `metaTemplateId`; returns updated record
- [ ] Simulated `message_template_status_update` webhook with `event: APPROVED` → template `status` becomes `approved`
- [ ] `/templates/new` form submits and redirects to `/templates`
- [ ] `/templates` list shows status badges
- [ ] `TemplatePreview` renders header/body/footer in WhatsApp bubble style
- [ ] `pnpm --filter @trustcrm/api test` — all pass including `templates.test.ts`
- [ ] `pnpm type-check` — no errors
- [ ] `pnpm lint` — no errors

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Meta template name must be unique per WABA | High | Medium | Validate name is `[a-z0-9_]` only before submission; catch Meta 400 errors and surface message to user |
| Template approval takes 24–72 hours | High | Low | Status badge shows `pending`; poll via webhook; document expected wait time |
| `whatsappBusinessAccountId` not set on org | Medium | High | Check for null before submit; return 400 with clear error message |
| Body variable `{{1}}` syntax not validated | Medium | Low | Add Zod validation for body containing variables: warn if variable count mismatches component spec |
