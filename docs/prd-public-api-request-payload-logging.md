# PRD: Public API request/response payload logging + named template parameters

Status: DRAFT, awaiting owner sign-off (2026-10-09). Related: `docs/prd-plivo-compatible-api.md`, `docs/prd-api-usage-tracking.md`.

## 1. Problem and evidence

A client (credential `Signalz_NewTrial`, org `org_3KAoe46iHxpOC2XfjRPcatVOGYj`) reported an "Internal server error" and could not send a template. Support could not tell what was received or answered:

- `api_request_logs` keeps metadata only (method, endpoint, status, error class, duration, ids): `apps/api/prisma/schema.prisma:1580`. No request or response body, no 4xx message text.
- Rejected sends (400) create no `messages` row, so nothing else records them (`routes/public-api/messages.ts:74-121`).
- Callbacks to the client's URL leave no record at all (`workers/public-api-callbacks.worker.ts:17-59`: only a console warning on failure).
- Prod check 2026-10-09: the client's last 2 sends and 4 template-create calls were all 400 `validation`; the reason is unrecoverable from our data.
- Separately, `parameter_name` on template parameters is silently dropped (`lib/public-api/send-mapping.ts:126-143`), so named-variable templates (the client's templates are `parameter_format = NAMED`) cannot be sent.

## 2. Goals / non-goals

Goals
1. Part A: accept `parameter_name` on text parameters and pass it to Meta; render named placeholders in the inbox preview.
2. Part B: store request and response bodies of public API calls, and callback delivery attempts, so support can answer "what did we receive and what did we say".
3. Client org admins can view their own org's records in the existing API Usage screen.

Non-goals
- No cross-org staff UI. Staff access is a read-only script that writes an audit row per lookup.
- No change to metering (`api_usage_daily`) or to API responses.
- No storing of callback response bodies.

## 3. Architecture fit

- Part A: pure mapping change in `send-mapping.ts` plus `WaTemplateComponent` type in `lib/whatsapp.ts:113`.
- Part B reuses the existing buffered, single-flight, never-throws recorder (`lib/public-api/usage.ts:203-328`) and the hourly cleanup job (`usage-cleanup.ts`). Payloads ride on the same raw event and share its id, which is the `api_id` (`request.apiId`) sent to the client and used as the `api_request_logs.id` (`request_id` is a per-process counter and is NOT unique). The payload rows are written in a separate transaction AFTER the metering transaction commits, so a payload failure never costs raw rows or rollups (duplicates are skipped, `skipDuplicates`).
- Capture points: request body from `request.body` and response body from an `onSend` hook inside the public API plugin (`routes/public-api/index.ts:60`), handed to `recordUsageOnResponse`.

## 4. Data model (hand-authored additive SQL; local DB is drifted)

`api_request_payloads`
- `id` TEXT PK = the `api_id` returned to the client (also the `api_request_logs.id` of the same request). The table is self-contained: it repeats the summary columns (method, endpoint, status_code, outcome, error_class, error_code, duration_ms, api_key_id) because the metadata rows in `api_request_logs` are kept 30 days while payloads live 365 days, so the two retentions are independent and there is no foreign key.
- `organization_id` TEXT NOT NULL (indexed with `created_at`)
- `request_body` TEXT NULL, `response_body` TEXT NULL (JSON text, redacted, each capped at 16 KB)
- `request_truncated` BOOL, `response_truncated` BOOL
- `query_string` TEXT NULL, `client_ip` TEXT NULL, `user_agent` TEXT NULL
- `created_at` TIMESTAMPTZ

`api_callback_attempts`
- `id` UUID PK, `organization_id`, `api_key_id`, `message_id` (indexed `organization_id, created_at`)
- `url` TEXT, `method` TEXT, `fields` JSONB (the form fields we sent), `attempt` INT
- `outcome` TEXT (`delivered` | `http_error` | `network_error` | `dropped`), `http_status` INT NULL, `reason` TEXT NULL (safe projection only), `duration_ms` INT, `created_at`

`api_payload_access_audit`
- `id` UUID PK, `actor` TEXT, `organization_id` TEXT, `reason` TEXT, `query` TEXT, `rows_returned` INT, `created_at`

Rollback: set the flag off; the tables are additive and can stay empty.

## 5. API contract

Part A (backward compatible): a text parameter may carry `parameter_name` (string, `^[A-Za-z0-9_]{1,64}$`). Forwarded to Meta as `parameter_name`. Positional sends are unchanged.

Pre-send validation against the stored template (owner decision 2026-10-09: validate before calling Meta): the stored `templates.components` already contain the placeholders in the BODY/HEADER text (`{{username}}` or `{{1}}`), and `parameter_format` says NAMED or POSITIONAL. Before queueing, compare the request's body/header text parameters with the template:
- NAMED: the set of `parameter_name`s sent must equal the set of placeholders in the text. Missing, unknown or duplicate names -> 400 `template parameters not matched` with a safe detail, e.g. `expected: username, order_id; got: username`.
- POSITIONAL: the number of text parameters must equal the number of `{{n}}` placeholders; a `parameter_name` sent to a positional template -> 400.
- Scope (confirmed by owner): BODY and HEADER text only. Button parameters keep today's checks.

Part A2: additional pre-send validation (owner request 2026-10-09). All failures are 400 with a short safe message, before any DB write or queueing. Existing checks stay as they are (type, src/dst phone validity via `normalizeFullPhone`, max 20 dst, text max 4096, exactly one content kind, https media, location fields, parameter types: `send-mapping.ts:56-158`).

New checks (owner approved items 1, 3, 6 and 8 on 2026-10-09; item 6 is conditional on verifying Meta's current rules before coding):
1. Phone strings: `src`/`dst` currently strip every non-digit (`phone-normalize.ts:16-19`), so `abc14155552672xyz` passes. Proposed: allow only digits, optional leading `+`, spaces, `-`, parentheses; anything else -> 400 naming the offending field. (?)
2. Template name: must match `^[a-z0-9_]{1,512}$` (Meta naming) and language `^[a-z]{2,3}(_[A-Za-z]{2,4})?$` before the DB lookup.
3. Template lookup errors split into: not found (and, when the same name exists in other languages, list the available languages, e.g. you sent `en`, available: `en_US`); found but not approved (return the current status). (?)
4. Duplicate component types (two `body`) and unsupported types -> 400.
5. Parameter counts and names against the template (Part A above), plus: empty/whitespace-only text values rejected; a header with an IMAGE/VIDEO/DOCUMENT format requires exactly one `media` parameter; a text header requires no media.
6. Body text parameter content: no newline, tab, or 4+ consecutive spaces. Verification 2026-10-09: Meta's template overview page (developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview) does NOT state this rule; only third-party providers (e.g. Wati help center) document it. Status: UNVERIFIED against Meta. Owner decision 2026-10-09: SKIP this check for now; Meta's error comes back in the failed callback. Revisit with proof.
   Also from Meta's page: named placeholders at creation are lowercase letters and underscores; the send-time `parameter_name` must match the template's names. So `parameter_name` is checked against the template's placeholders rather than by a loose regex of our own (only a safe-character check `^[A-Za-z0-9_]{1,64}$` as a pre-filter).
Item 7 (button parameter checks) is out of scope: owner limited validation to BODY and HEADER.
8. Callback `url`: max 2000 chars; `method` must be GET or POST (today anything else silently becomes POST). (?)

Part C: clear errors (owner request 2026-10-09; plan `docs/superpowers/plans/2026-10-09-public-api-clear-errors.md`). Every failure body becomes `{ api_id, error, error_code, hint }` (additive; `error` stays a plain sentence), built from one error catalog. Scope: validation 400, auth 401/403/404 (distinguishing missing header, malformed Basic, auth_id/URL mismatch and invalid credentials without revealing whether a credential exists), 429 with `Retry-After`, 500 with a retry hint, and template create/update/delete errors. Async Meta failures add `ErrorMessage` to callbacks and `error_message` to message lookups. The `api_id` in a response is the same id as the stored request row, so support can find the exact request from what the client reports.

Part B dashboard API (same `settings_api_key` gate and API-availability check as `routes/api-usage.ts:71-80`):
- `GET /v1/api-usage/requests` gains `hasPayload`.
- `GET /v1/api-usage/requests/:id/payload` returns the payload row only if `organization_id` matches the caller's org; otherwise 404.
- `GET /v1/api-usage/callbacks?messageId=&cursor=&limit=` org-scoped, newest first.

## 6. Security and privacy

- Never store: `Authorization` header, any key matching `/token|secret|authorization|password|api[_-]?key/i` (recursive redaction before truncation), callback signatures.
- Bodies contain end-customer phone numbers and message text. Mitigations: org-scoped reads only, retention 365 days per owner decision 2026-10-09 (`API_PAYLOAD_RETENTION_DAYS`, default 365; callback attempts follow the same setting) deleted by a separate batched step of the hourly job, payloads skipped when the request has no org (unauthenticated floods) and never stored for 401 responses (credential-guessing noise; their metadata row stays), flag default OFF (`API_PAYLOAD_LOGGING_ENABLED`).
- Privacy policy and ToS need a line covering API payload retention (owner action, release checklist).
- Staff lookup via `apps/api/scripts/lookup-api-request.ts`: read-only, refuses to run without `--org` and `--reason`, writes `api_payload_access_audit`.
- Org scoping: every query filters by `organization_id`; RBAC unchanged (`settings_api_key`).

## 7. Rollout and production impact

1. Ship Part A alone first (no migration).
2. Ship Part B with the flag off; migration is additive and runs via `start.sh` `migrate deploy`.
3. Enable the flag in Railway (user action; secret/variable writes are blocked for Claude).
4. Add the privacy line, then enable.

## 8. Acceptance criteria

- A send with `parameter_name` reaches Meta with the same names; positional unchanged; named template without names -> 400.
- With the flag on, every public API response (200, 4xx except 401, 5xx, 429 with an org) whose raw metadata row is written has a payload row with redacted, capped bodies; with the flag off, none.
- Records of org A are never returned to org B (test).
- A recorder or DB failure never changes an API response.
- Cleanup removes payloads older than retention.
- Each callback attempt (success, HTTP error, network error, dropped) writes one attempt row.

## 9. Risks and open questions

- A 365-day retention of customers' phone numbers and message text is a large privacy footprint. The privacy policy and ToS line (section 7) must be live before the flag is enabled, and the payload tables need a documented deletion path for a customer's erasure request.
- Stricter validation can reject requests that work today. Any new check that would reject an input currently accepted is listed with (?) in section 5 and needs owner sign-off; clients already integrated (this one is new, but others may follow) should get the same behavior.
- Volume: 16 KB x 2 per call, kept 365 days; at the current volume this is small, and the flush path is batched. Re-check before opening the API to all orgs.
- Signed media URLs inside bodies may carry credentials in the query string. Default: redact query strings of URL values named `media`/`url`/`link`.
- Success sampling (`API_REQUEST_LOG_SUCCESS_SAMPLE_RATE`) < 1 would also drop payloads for sampled-out calls; acceptable, documented.
- Unverified: exact Meta behavior when a named template receives positional parameters (not needed for the fix).
