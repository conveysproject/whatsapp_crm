# Public API Phase 2: Templates API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox syntax.

**Goal:** Five Plivo-shaped template endpoints on the public API, org-scoped, metered, with a corrected shared Meta delete.

**Architecture:** `lib/meta-templates.ts` gains `editTemplateOnMeta` / `deleteTemplateOnMeta` and a typed `MetaTemplateError`; `lib/public-api/templates-mapping.ts` holds pure validation + response mapping; `routes/public-api/templates.ts` holds the five routes, registered next to `publicApiMessagesRouter` in `routes/public-api/index.ts`; the dashboard delete uses the shared helper.

**Tech Stack:** Fastify 4, Prisma 7 (no schema change), vitest, existing `plivoError`/`plivoErrorBody`.

**Spec:** `docs/prd-plivo-compatible-api-phase2-templates.md` (approved by the user 2026-10-06; defaults Q1-Q4 accepted).

## Global Constraints
- Work on branch `feat/public-api-templates`. No migration, no schema change.
- Every query filters on `request.publicApi!.organizationId`. `waba_id` must equal `organization.whatsappBusinessAccountId`, else 404 with the SAME body as an unknown template (`plivoError(reply, 404, "Resource not found")`).
- Meta text/errors never echoed raw: return Meta's numeric code in the message, pass any logged text through `redactForLog` (`lib/meta-error.ts`).
- Token: `organization.wabaAccessToken ?? vendor_settings.whatsapp_access_token`; neither -> 400 "WhatsApp is not connected".
- Route paths registered with and without trailing slash (see `both()` in `messages.ts`), `PUBLIC` route config, no `request.auth`.
- Responses: `api_id` via `newApiId()`; template_id = `metaTemplateId`.
- Match surrounding code style; tests in vitest next to the source; run `npx tsc --noEmit`, eslint on touched files, then the whole API suite (2 known flaky segments failures are pre-existing).

## Review Focus
- A credential from org A requests org B's waba_id or template_id: 404, nothing changed.
- Create when Meta rejects: no orphan local row; response 400 with Meta code.
- Delete when Meta refuses: local row kept, 502.
- Name+language duplicate: 400, one row only (two concurrent creates).
- `limit` over 20, negative offset, non-numeric: clamp or 400, never 500.
- Update of a draft/pending template (no Meta id or not editable): 400.
- Components with no BODY, non-string text, 11 buttons: 400.

### Task 1: Meta helpers (edit, delete, typed error)
**Files:** Modify `apps/api/src/lib/meta-templates.ts`; Create `apps/api/src/lib/meta-templates.test.ts`.
**Produces:**
- `class MetaTemplateError extends Error { code: number|null; status: number }` (never contains the access token)
- `submitTemplateToMeta(opts & { allowCategoryChange?: boolean })` throws `MetaTemplateError` (keep message text compatible with existing callers: still starts with "Meta template submission failed")
- `editTemplateOnMeta({ accessToken, metaTemplateId, components, category? }): Promise<void>` -> `POST {WA_BASE}/{metaTemplateId}` body `{components}`; throws `MetaTemplateError` on non-2xx or `success:false`
- `deleteTemplateOnMeta({ wabaId, accessToken, name, metaTemplateId }): Promise<void>` -> `DELETE {WA_BASE}/{wabaId}/message_templates?name=<enc>&hsm_id=<id>`; non-2xx or `success:false` throws; Meta "template not found" (code 100 / subcode 2593002) is treated as success (already gone).
- [ ] Tests first (mock global `fetch`): URL/method/body/headers for each call; 400 error body -> `MetaTemplateError` with `code`; `success:false`; not-found treated as success on delete; token never in error message.
- [ ] Implement; run tests.
- [ ] Commit `feat(api): Meta template edit/delete helpers with typed errors`.

### Task 2: Mapping + validation (pure)
**Files:** Create `apps/api/src/lib/public-api/templates-mapping.ts` and `.test.ts`.
**Produces:**
- `parseTemplateBody(body: unknown): { name; language; category: "marketing"|"utility"|"authentication"; components: object[]; allowCategoryChange: boolean }` throwing `TemplateValidationError`; rules: name `/^[a-z0-9_]{1,512}$/`; language 2-15 chars `[A-Za-z_]`; category case-insensitive of the three; components array with at least one BODY (type case-insensitive), every `text` a string <=1024 (body) / <=60 (header, footer), buttons <=10, media headers need `example.header_handle` array of strings; unknown component types rejected.
- `parseListQuery(q): { name?: string; limit: number; offset: number }` limit default/clamp 1..20, offset >=0, junk -> defaults.
- `templateStatus(s: TemplateStatus): "PENDING"|"APPROVED"|"REJECTED"` (draft -> PENDING).
- `toSubmitResponse(row)`, `toListObject(row)`, `toRetrieveResponse(row)` per spec shapes (`rejected_reason`: stored value or "NONE"; `quality_score: {score}` from `qualityScore` or "UNKNOWN").
- [ ] Tests first covering each rule and the response shapes; implement; commit.

### Task 3: Routes
**Files:** Create `apps/api/src/routes/public-api/templates.ts` and `templates.test.ts`; Modify `apps/api/src/routes/public-api/index.ts` (register `publicApiTemplatesRouter` in the same child context as messages).
**Behaviour:** exactly the spec table. Create: parse -> resolve org WABA/token -> in a transaction check (org, name, language) duplicate and insert `draft` -> call `submitTemplateToMeta` -> on success set `metaTemplateId`, status `pending`; on `MetaTemplateError` delete the just-created row and return 400 `Meta rejected the template (code N)`; on any other error delete the row and 502. Update: only if row has `metaTemplateId` and status in approved/rejected, and body name/language/category equal the stored ones; call `editTemplateOnMeta`, then update components, extracted fields via the same extraction as the dashboard (move `extractTemplateFields` from `routes/templates.ts` into `lib/template-components.ts` as an export if not already shared), `lastEditedTime`, status `pending`. Delete: `?name` must equal stored name; `deleteTemplateOnMeta` first (only when `metaTemplateId`), then delete the row; Meta failure -> 502 and row kept. Retrieve/list/delete find by `{ organizationId, metaTemplateId: template_id }`.
- [ ] Tests first (mock prisma + meta helpers; reuse the harness in `routes/public-api/index.test.ts`): each acceptance criterion and each Review Focus line above.
- [ ] Implement; run suite; commit `feat(api): public API template endpoints`.

### Task 4: Dashboard delete uses the shared helper
**Files:** Modify `apps/api/src/routes/templates.ts` (`DELETE /templates/:id`), its test file.
- [ ] Test first: Meta failure -> 502 and row kept; no Meta id -> deletes locally; Meta not-found -> deletes.
- [ ] Implement with `deleteTemplateOnMeta` (token as in submit: vendor setting then org token then env); commit `fix(api): dashboard template delete uses Meta's documented call and no longer orphans templates`.

### Task 5: Verify
- [ ] `npx tsc --noEmit`, eslint on touched files, full API suite, org-scoping/RBAC audit of the new routes, update `docs` + memory, merge locally. Do NOT push; ask the user first.
