# Public API Phase 2: Templates API (spec addendum)

Status: DRAFT, awaiting approval. Extends `docs/prd-plivo-compatible-api.md` (approved 2026-10-05, Phase 1 live in production).
Customer-facing name is "WBMSG API"; the shapes follow Plivo's WhatsApp Templates reference (plivo.com/docs/messaging/api/whatsapp-templates, read 2026-10-06).

## Problem
A client migrating from Plivo manages templates through Plivo's five template endpoints. Phase 1 can send templates but only the dashboard can create, list, update or delete them.

## Goals / non-goals
- Goals: the five endpoints below, wire-compatible with Plivo, scoped to the credential's own org and WABA, metered by the existing usage tracking, no dashboard behaviour change.
- Non-goals: embedded signup, WABA event webhooks (Phase 3), template library, carousel/flow templates beyond passing components through, media upload API (clients pass a Meta `header_handle`, as Plivo requires).

## Endpoints (all under `/v1/Account/{auth_id}`, Basic auth, existing limiter, access check and usage metering)
| Method + path | Behaviour |
|---|---|
| `POST /WhatsApp/Template/{waba_id}/` | Validate, create the row, submit to Meta. 200 `{api_id, status:"success", message:"template submitted to meta for review", template_id, template_name, template_status:"PENDING", template_language, template_category}` |
| `GET /WhatsApp/Template/{waba_id}/` | List, `template_name` substring filter, `limit` (max 20, default 20), `offset`. `{api_id, status:"success", meta:{limit,offset,next,previous}, objects:[{template_id,name,language,category,status}]}` |
| `GET /WhatsApp/Template/{waba_id}/{template_id}/` | `{api_id, template_id, name, language, category, status, quality_score:{score}, rejected_reason, components}` |
| `POST /WhatsApp/Template/{waba_id}/{template_id}/` | Edit components at Meta (same body shape as create); template returns to PENDING. Same response as create |
| `DELETE /WhatsApp/Template/{waba_id}/{template_id}/?name=` | Delete at Meta and locally. 204 |

`template_id` is Meta's numeric template id (our `templates.meta_template_id`). `waba_id` must equal the org's `whatsappBusinessAccountId`, otherwise 404 (identical body for any mismatch). Errors: 400 validation, 404 not found, 502 Meta failure, 429 existing limiter; bodies via `plivoErrorBody`.

## Rules
- Create body: `name` (lowercase letters, digits, underscore, max 512), `language`, `category` (MARKETING | UTILITY | AUTHENTICATION), `components` (must contain a BODY), optional `allow_category_change` (default false, passed to Meta). Name+language already present for the org returns 400 (our table has no unique constraint, so the check is in code, inside a transaction with the insert).
- Components are validated structurally (known types, string text, button counts) and then passed to Meta unchanged; a header with a media format must carry `example.header_handle`. We do not upload media for API callers.
- Update: only for templates that have a Meta id and status approved, rejected or paused; others 400. The row's components and `lastEditedTime` update and status becomes pending. Name, language and category are immutable (400 if they differ).
- Delete: Meta's delete is `DELETE /{waba_id}/message_templates?name=&hsm_id=`; the dashboard route today calls `DELETE /{template_id}`, which is not the documented call and swallows failures. The shared helper uses the documented call and fails the request (502) if Meta refuses, so a row is never removed while the template still exists at Meta. `?name` must match the stored name (400 otherwise).
- Status mapping: our enum has draft/pending/approved/rejected; Plivo also reports PAUSED and DISABLED. Phase 2 reports what we store; the webhook/sync mapping of PAUSED/DISABLED is Phase 3 (listed under risks).
- Credential token: Meta calls use `organization.wabaAccessToken`, falling back to the `whatsapp_access_token` vendor setting (the two stores are inconsistent today, F11); a missing token returns 400 `API_NOT_CONFIGURED`.

## Architecture fit
- New `lib/public-api/templates-mapping.ts` (validation + Meta shape + Plivo response mapping) and `routes/public-api/templates.ts`, registered in the same child context as messages so auth, limiter, error handler and usage hook apply.
- New `editTemplateOnMeta` and `deleteTemplateOnMeta` in `lib/meta-templates.ts`; `submitTemplateToMeta` reused (extended with `allowCategoryChange`). Dashboard `DELETE /templates/:id` is switched to the shared delete helper (behaviour change: a Meta failure now blocks the delete; flagged for your approval, see Q2).
- No migration. No schema change.

## Security
- Org scoping from the credential only (`request.publicApi.organizationId`); every query filters on it; WABA id and template id from the URL are only lookups.
- Same-body 404 for foreign/unknown waba or template; Meta error text is passed through `redactForLog` and never echoed raw (we return Meta's code and a generic message).
- Usage metering and rate limits are inherited. Template create/edit/delete are low-volume; no extra limiter.

## Rollout / rollback
No flag beyond the existing `PUBLIC_API_ENABLED`. Rollback is a revert; no data changes.

## Acceptance criteria
1. A valid credential can create, list, retrieve, update and delete a template; Meta shows it; the dashboard Templates page shows the same row.
2. A foreign `waba_id` or template id returns 404; a credential from another org cannot see or change this org's templates.
3. Duplicate name+language returns 400 and creates nothing.
4. Meta rejection on create returns 400/502 with Meta's code and leaves no orphan row.
5. Delete never removes the local row when Meta delete fails.
6. Usage page shows the five endpoints.

## Open questions (defaults chosen; tell me if you disagree)
- Q1 Include Update now? Default yes (the client lists all five endpoints).
- Q2 Change the dashboard delete to fail when Meta refuses? Default yes (current behaviour silently orphans templates at Meta).
- Q3 PAUSED/DISABLED statuses: default report stored status only; real mapping is Phase 3.
- Q4 Language codes: stored exactly as sent (`en_US` vs `en`); the send path already matches name+language exactly, so a client must use the same code in both. Default: no normalisation.

## Risks
Plivo's exact error bodies and the Update immutability rules were read from a summarised page; the client's real samples should be checked before release (same PROVISIONAL marking as Phase 1). Meta edit limits (about 10 edits per 30 days, one per 24 hours) surface as 400 with Meta's code.
