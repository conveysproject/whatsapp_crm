# PRD: Plivo-compatible public WhatsApp API

Status: APPROVED 2026-10-05; Phase 1 implemented on branch feat/plivo-compatible-api (see docs/superpowers/plans/2026-10-05-plivo-compatible-api-phase1.md).

## Problem and evidence

A client uses Plivo's WhatsApp API and wants the same API from WBMSG. WBMSG is a Meta Tech Provider (not a BSP), and the client will pay Meta directly (user decision, this session). So Plivo's credit line, Multi-Partner Solution and reseller-onboarding API are out of scope; each end customer connects their own WABA.

Plivo's documented WhatsApp surface (read from plivo.com/docs this session): 9 REST endpoints (`POST /WhatsApp/EmbeddedSignup/`, `POST/GET /Message/`, `GET /Message/{uuid}/`, 5 template endpoints under `/WhatsApp/Template/{waba_id}/`), of which 8 apply to us, plus 3 webhooks (status callback, inbound, WABA events). Auth is HTTP Basic (Auth ID + Auth Token) at `/v1/Account/{auth_id}/...`.

### What WBMSG has today (evidence)

| # | Finding | Evidence |
|---|---|---|
| F1 | All authenticated routes use Clerk. A route skips auth only with `config: { public: true }`. There is no API-key or Basic auth path. | `apps/api/src/plugins/auth.ts:85-87`, `:132-139` |
| F2 | An `ApiKey` model and `api_keys` table exist (id, organizationId, name, keyHash unique, scopes[], lastUsedAt, createdAt). Nothing in the codebase reads or writes it. The migration that created it is committed. | `apps/api/prisma/schema.prisma:841-852`; `migrations/20260428034450_.../migration.sql:131-194`; repo-wide grep for `prisma.apiKey` found no use |
| F3 | A plan feature switch `api_access` exists (`vendor_settings.plan_feature_api_access`), enforced only in `dispatchWebhook`. | `lib/plan-limits.ts:41-52`; `lib/webhook-dispatch.ts:10-12` |
| F4 | A web setting `vendor_api_access_token` is saved from the vendor-settings page but no API code reads it. It is not an enforced credential. | `apps/web/app/(dashboard)/settings/vendor-settings/page.tsx:34,50`; grep found no API use |
| F5 | Meta calls live in `lib/whatsapp.ts`: text (`:15`), media (`:45`), template (`:103`), interactive (`:137`). There is no location sender. Errors are thrown as `Error("... " + JSON.stringify(metaError))`, not typed, so Meta error codes are not available to callers. | `lib/whatsapp.ts:15-163`, `:37-39` |
| F6 | Dashboard send is conversation-bound (`POST /v1/conversations/:id/messages`), gated by `inbox_access`. It creates a `sending` draft, calls Meta, then marks `sent`. It does not check the 24h window (Meta rejects). Template send resolves a stored `Template` by id, not by name. | `routes/messages.ts:177-474`, `:218-219` |
| F7 | Sending to an arbitrary number is done by `POST /templates/:id/send-to-contact`, which finds or creates a conversation. The inbound worker upserts the contact (unique `organizationId + phoneNumber`) and creates the conversation. | `routes/templates.ts:542-563`; `workers/inbound-message.worker.ts:111-152` |
| F8 | The `Message` model has no destination number, no error code, no callback URL, no client reference. `MessageStatus` = sending, sent, delivered, read, failed, expired, aborted (no `queued`, no `undelivered`). | `schema.prisma:265-295`, `:222-230` |
| F9 | The Meta status webhook handler maps only sent/delivered/read/failed and does not read Meta's `errors` array (`WaStatusUpdate` has no error field). | `routes/webhooks.ts:38-43`, `:134-166` |
| F10 | One WhatsApp number per org: `Organization.phoneNumberId` is a single column and the webhook resolves org by `findFirst({ phoneNumberId })`. | `schema.prisma:40`; `routes/webhooks.ts:129-132` |
| F11 | The org's Meta token is stored in two places: `Organization.wabaAccessToken` (used by `messages.ts:190`, `inbound-message.worker.ts:104`) and `vendor_settings.whatsapp_access_token` (used by `templates.ts:104-108`, `lib/whatsapp.ts`). | grep counts: 17 files reference one of the two |
| F12 | Outbound webhooks exist: `Webhook` model + `/webhook-endpoints` CRUD + `dispatchWebhook` (HMAC `X-Signature-256`, 10s timeout, ONE attempt, no retry). Only `message.inbound` is ever dispatched. The URL is not validated (no HTTPS or private-IP check). | `lib/webhook-dispatch.ts:5-53`; `routes/webhook-endpoints.ts:10-48`; only caller `workers/inbound-message.worker.ts:436` |
| F13 | Global rate limit is 60 req/min keyed by `auth.userId` or IP. | `plugins/rate-limit.ts:9-17` |
| F14 | Every registered non-GET route must be classified in the impersonation guard or its test fails. | `lib/impersonation-guard.ts:7-9`; `impersonation-guard.test.ts:13-27` |
| F15 | BullMQ queues live in `lib/queue.ts` (pattern to follow). Templates: create saves a `draft` row, submit sends to Meta (`lib/meta-templates.ts:35-62`), delete calls Meta by `metaTemplateId`. There is no edit-at-Meta function. `Template` has no unique (org, name, language). | `lib/queue.ts`; `routes/templates.ts:71-160, 247-271`; `schema.prisma:663-697` |
| F16 | RBAC is deny-by-default via `canAccess` / `canAccessSub`; admin and superAdmin bypass. | `lib/permissions.ts:15-50` |

## Verified Plivo wire contract (read 2026-10-05 from plivo.com/docs and plivo-python / plivo-node source)

- **Requests:** JSON bodies, `Content-Type: application/json`, HTTP Basic (auth_id:auth_token), base `https://api.plivo.com/v1/Account/{auth_id}/`. Python SDK `Message.create` posts to `Message/` and serialises `template`, `interactive`, `location` objects to dicts.
- **Send success:** `{"api_id","message":"message(s) queued","message_uuid":[...]}`. Status codes 200/201/202/204/400/401/404/405/429/500. Plivo's docs give **no error body schema**; the error JSON shape must come from the client's logs or a live Plivo test (not guessable).
- **Template object (send):** `{name, language, components?: [Component]}` (python `Template`); component example from docs: `{type: header|body|button, sub_type: quick_reply|url, index, parameters: [{type: text|media|payload, ...}]}`.
- **Location (send):** `{latitude, longitude, name, address}`, all four required strings.
- **Interactive (send), from docs examples:** button: `{type:"button", header?:{type:"media", media:url}, body:{text}, action:{buttons:[{title,id}]}}`; cta_url: `{type:"cta_url", header?, body:{text}, footer?:{text}, action:{buttons:[{title, cta_url}]}}`; list: `{type:"list", header?, body:{text}, action:{lists:[{title,id}]}}`. The list example looks too simple for Meta's list (no sections/button label); verify against the client's real calls.
- **Status callback (outbound webhook):** form-encoded POST (query string for GET), not JSON. Fields: MessageUUID, To, From, Type, Status (queued|sent|failed|delivered|undelivered|read), Units, TotalRate, TotalAmount, MCC, MNC, ErrorCode, Sequence, MessageTime, QueuedTime, SentTime, DeliveryReportTime, requester_ip, PowerpackUUID (optional); WhatsApp adds ConversationID (null for inbound), ConversationOrigin (utility|authentication|marketing|service), ConversationExpirationTimestamp (unix).
- **Inbound webhook:** documented fields only From, To, Text, Type (`whatsapp`), MessageUUID (+ Media0..N for MMS). Media/interactive-reply/location fields for WhatsApp are NOT documented anywhere I could reach: client sample required (Q2).
- **Signature V2 (verified in SDK source):** header `X-Plivo-Signature-V2` = base64(HMAC-SHA256(key = auth token, message = scheme://host/path of the webhook URL (no query) + nonce)), nonce in `X-Plivo-Signature-V2-Nonce`; `X-Plivo-Signature-Ma-V2` is the same computed with the main-account token. V3 (`validate_v3_signature`) also exists: message = base URL + "." + nonce, params sorted and concatenated for POST; not fully read, only needed if the client validates V3.
- **Base URL in SDKs:** Node SDK allows overriding `url` in client options. Python SDK hardcodes `PLIVO_API = https://api.plivo.com` and sets `client.base_uri` internally; no constructor/env override (whether the instance attribute can be reassigned after construction is not verified). Other SDKs (PHP, Ruby, Java, .NET, Go) not checked. "Exact" for an SDK user therefore needs either a per-SDK base-URL override or the client routing `api.plivo.com` through their own proxy/DNS; this must be confirmed with the client.
- **Other facts:** `src` is required for whatsapp; list pagination limit<=20; `message_expiry` 5-10,799s; `dst` multi-recipient separated by `<`.

### Compatibility implications (decide before building)
1. Status and inbound callbacks must be form-encoded and signed with V2 using the **credential's auth token** (so the client's existing validator works unchanged).
2. Error bodies cannot be made exact without a real sample.
3. `Units/TotalRate/TotalAmount/MCC/MNC/Sequence/requester_ip` have no Meta source; must be filled with plausible static values (Q4) or the client's code may choke on empty floats.
4. WhatsApp `ConversationID/Origin/ExpirationTimestamp` come from Meta's status webhook conversation/pricing objects (not verified present in current Meta payloads; check Meta docs).

## Goals
- A client with existing Plivo WhatsApp code can switch by changing only the base URL and credentials (decision pending, see Q1).
- The 8 applicable endpoints (message send, list, retrieve, plus template create/list/get/update/delete; embedded signup is excluded) work against the org's own WABA.
- Status callbacks, inbound forwarding and (phase 3) WABA events are delivered to the client's URLs with retry and signature.
- API-sent traffic is stored as normal WBMSG messages (inbox, contacts, analytics).
- Strict tenant isolation: a credential reaches only its own org's data.

## Non-goals
- `POST /WhatsApp/EmbeddedSignup/` and any BSP/reseller/credit-line flow (not a BSP).
- WhatsApp Calling, SMS/MMS, 10DLC, Powerpack, Subaccount/Application APIs.
- Billing or pricing via WBMSG (client pays Meta directly).
- Changing existing dashboard routes' behavior.

## Design (proposed, subject to Q1-Q6)

### 1. Credentials
- Reuse the existing, unused `api_keys` table (F2) rather than adding a new one: `ApiKey.id` is the **Auth ID**; the **Auth Token** is generated once, shown once, and only its hash stored in `keyHash` (compare with `timingSafeEqual`). One additive migration (hand-authored SQL, local DB is drifted) adds `revoked_at`, `created_by`, `callback_url` (default status-callback URL), `callback_secret`.
- Management endpoints (Clerk-authenticated, normal dashboard routes): create/list/revoke/rotate under `/v1/api-credentials`, gated by a new RBAC sub-permission (admin/superAdmin by default), plan switch `api_access` required (F3). Added to `BLOCKED_PREFIXES` so impersonation sessions can never create or read credentials.
- Never log tokens. Token shown once.

### 2. Public route module
- New encapsulated (non-`fp`) plugin registered in `routes/index.ts` at prefix `/v1/Account/:authId`. Each route sets `config: { public: true }` to skip Clerk (F1) and the module's own `preHandler` does Basic-auth: `authId` in URL must equal the Basic username, token hash must match, credential not revoked, org `status = active`, `api_access` enabled. It then sets `request.publicApi = { organizationId, apiKeyId }`.
- Every query is scoped by `organizationId` from the credential, never from URL or body. `waba_id` in template paths must equal the org's `whatsappBusinessAccountId`, otherwise 404.
- Rate limit: separate limit keyed by `authId` (F13 keys by userId/IP), 429 on exceed.
- Add `/v1/Account` to the impersonation guard's `BLOCKED_PREFIXES` and extend its test (F14); this keeps the existing "every route classified" test green.
- Response/error shapes follow Plivo (`api_id` on every response, 400/401/404/429/502 etc.). Our own error format `{ error: { code, message } }` is NOT used on this surface.

### 3. Messages
- `POST /Message/`: validate `src` equals the org's connected number (F10; display number is stored at `vendor_settings.current_phone_number_number`, `lib/whatsapp.ts:443-446`), `dst` E.164 (multiple via `<`, each becomes its own message and UUID), `type=whatsapp`. Find-or-create contact + conversation (F7), insert a `sending` message, call Meta via `lib/whatsapp.ts`, mark `sent`, store the Meta wamid. `message_uuid` = our `Message.id`.
- Sender helpers: reuse text/media/template/interactive; add `sendLocationMessage`. Add a typed Meta error (code, subcode, message) to `lib/whatsapp.ts` without changing existing callers' behavior (F5).
- Template sends take Plivo's `template: { name, language, parameters }`; look up the org's `Template` by name + language (F15 no unique constraint, see Q5) and require `approved`. A new mapper converts Plivo parameters to Meta components (existing `buildTemplateComponents` takes stored components + variables, `lib/template-components.ts:44`).
- 24h session rule: for non-template sends, check `conversation.lastInboundAt` (F6) and return Plivo error 380 if outside the window, instead of letting Meta reject.
- New table `api_message_meta` (message_id PK/FK, api_key_id, dst, callback_url, callback_method, error_code, client_ref): needed because `Message` has none of these (F8). Additive migration.
- `GET /Message/` and `GET /Message/{uuid}/`: read from `messages` joined to `api_message_meta`/conversation, filtered by org. Plivo's list filters are limit<=20, offset, direction, state, type, time range, error_code. Retrieve returns 404 for other orgs' UUIDs.
- Plivo state mapping: sending->queued, sent->sent, delivered->delivered, read->read, failed->failed; `undelivered` mapped from Meta failures after sent (rule TBD, Q6).

### 4. Status callbacks (outbound webhooks)
- Extend the Meta status handler (F9) to capture `statuses[].errors[0].code`, store it in `api_message_meta.error_code`, and enqueue a callback job when the message has a callback URL (per-message `url` or credential default).
- New BullMQ queue `public-api-callbacks` (pattern F15). Retries at +60s, +120s, +240s (Plivo's documented schedule), success = HTTP 200. Delivery log reuses `WebhookDeliveryLog` if compatible (to verify) or a small new table.
- Payload fields per Plivo: From, To, MessageUUID, Status, Units, TotalRate, TotalAmount, ErrorCode, MCC, MNC. We cannot honestly fill Units/TotalRate/TotalAmount/MCC/MNC from Meta; plan is to send them empty/zero (Q4).
- Signature: implement Plivo V2 exactly as in "Verified Plivo wire contract" (token = the credential's auth token; token must therefore be recoverable for signing, not only hashed: store it encrypted, see Security).
- Payload encoding: callbacks are form-encoded (`application/x-www-form-urlencoded`), not JSON.
- SSRF protection on every callback/webhook URL: HTTPS only, resolve DNS and reject private/loopback/link-local ranges, no redirects, 10s timeout, response body truncated. Applies to the new module; existing `dispatchWebhook` lacks it (F12), noted as an adjacent risk, not fixed here.

### 5. Inbound webhook forwarding
- After the inbound worker stores a message, enqueue a forward to the credential's inbound URL in Plivo's shape. The exact Plivo inbound/interactive payload is NOT in Plivo's public docs (read this session), so this needs a client sample (Q2). Same retry/SSRF rules as above.

### 6. Templates API
- Create: save `Template` (draft) then submit via existing `submitTemplateToMeta`; respond with `template_id` = our id, `template_status: PENDING`. Components follow Meta shape (Plivo's create body is Meta-shaped: BODY required, header/footer/buttons/carousel).
- List/Get: from the `templates` table (org-scoped; `quality_score`, `rejected_reason` columns exist, `schema.prisma:681-684`).
- Update: new Meta edit call (does not exist, F15); phase 2.
- Delete: reuse the Meta delete + row delete logic (`routes/templates.ts:259-269`), extracted into a helper shared with the dashboard route.

### 7. Phasing
0. Client samples (inbound webhook, interactive send, status callback) and Plivo signature page.
1. Credentials + `POST/GET /Message/` (text, media, template, location, interactive) + status callbacks + inbound forwarding.
2. Templates API (5 endpoints).
3. WABA event webhooks (quality, tier, template status; the template status handler exists at `routes/webhooks.ts:115-124`), polish, docs page.

## Data model and migration plan
- One migration, hand-authored SQL: `ALTER TABLE api_keys` (add `revoked_at`, `created_by`, `callback_url`, `callback_secret`) and `CREATE TABLE api_message_meta`. Additive only, no backfill, no lock of hot tables (`messages` untouched).
- Prod: run via normal deploy migration. If any DDL is run out-of-band, run `prisma migrate resolve --applied <name>` immediately.
- Rollback: drop `api_message_meta` and the added columns; no existing table is altered destructively.

## Security
- Tenant isolation: org comes only from the credential; no endpoint accepts an org id. Audit every query for `organizationId` (including the message-UUID lookup, which must be `findFirst({ id, organizationId })`).
- Auth token storage CONFLICT: Plivo signs callbacks with the auth token as the HMAC key, so exact compatibility needs the plaintext token server-side at send time. A hash-only `keyHash` cannot do that. Proposed: store an encrypted copy (AES-GCM with a server key from env) alongside `keyHash` (used for request auth), decrypt only inside the callback worker. This is a real security trade-off and needs your approval (Q9).
- Auth: request auth compares a hash of the presented token (single SHA-256 is acceptable for a 256-bit random token; confirm), constant-time compare, constant-time failure path (no user enumeration by timing/message), revocation immediate (no cache) or short TTL cache invalidated on revoke.
- RBAC: credential management gated by admin or an explicit new permission key; impersonation blocked (F14).
- Abuse: per-credential rate limit, request body size limits, `dst` fan-out cap per request (Plivo allows many via `<`; we cap, Q3), SSRF rules above, `message_expiry` honored or ignored explicitly.
- Secrets: never log token, Meta access token or callback secret. `IS_DEMO_MODE` behavior in sender helpers (`lib/whatsapp.ts:22`) preserved.
- Audit: credential create/rotate/revoke written to the audit log; each API send is already a `messages` row with `api_key_id`.

## Rollout and rollback
- Feature-flagged: `PUBLIC_API_ENABLED` env (default off) plus per-org `api_access` plan switch (F3). Rollout to the client's org only first.
- Rollback: set the flag off; routes return 404. Migration is additive so no data rollback is needed.
- Production impact: no change to existing routes, tables or workers except the status handler (F9) and inbound worker hook (extra enqueue), both guarded by "org has an active API credential".

## Acceptance criteria
1. With a valid credential, `POST /Message/` text, template, media, location and interactive deliver to a test WABA and appear in the WBMSG inbox.
2. A credential for org A cannot read, send as, or list anything of org B (automated test with two orgs).
3. Wrong/revoked token -> 401; inactive org or `api_access` off -> 403; over limit -> 429.
4. Status callbacks arrive with Plivo's field names; a 500 response from the client's endpoint is retried at 60s/120s/240s.
5. Private-IP/HTTP callback URLs are rejected.
6. Impersonation guard test stays green; existing API tests unchanged (2 known flaky failures excepted).

## Test plan
Vitest, same patterns as `routes/*.test.ts`: auth (valid/invalid/revoked/cross-org), each endpoint's happy path and validation errors, the Plivo<->Meta mappers, retry scheduling, SSRF validator, and a regression test that the dashboard send and webhook status paths behave as before.

## Risks
- **Compatibility fidelity:** Plivo's inbound/interactive payload and signature algorithm are undocumented in what I read; compatibility is only as good as the samples we get.
- **Meta rules:** the exact Meta error code for the 24h rule, and whether Meta status webhooks carry pricing/conversation data we could map to Plivo's `conversation_id`/`TotalRate`, are NOT verified here; must be checked against Meta docs before implementation.
- **One number per org (F10)** limits Plivo setups that use several `src` numbers.
- **Token storage inconsistency (F11):** the module must choose one source; wrong choice sends with a stale token.
- **App Review:** whether the Meta app already has advanced access for `whatsapp_business_messaging` and `whatsapp_business_management` for customers' WABAs is not verifiable from the repo.

## Decisions made (user, this session)
- Not a BSP; client pays Meta directly; embedded-signup/reseller API excluded.
- **Q1:** wire-compatible with Plivo.
- **Q2:** client will supply samples; phase 1 starts after they arrive.
- **Q7:** reuse the `api_keys` table.
- **Q8:** silent create of contact/conversation, no assignment rules or automations.
- Q3, Q4, Q5, Q6 below are NOT yet answered; the recommended defaults are proposals only until approved.

## Open questions (each with a recommended default)
- **Q1 Compatibility level.** Wire-compatible with Plivo (client changes only base URL and credentials; includes Plivo's signature scheme) vs. same capabilities in our own cleaner shape. Recommended: wire-compatible for messages, status callback and inbound; our own shape is acceptable for credential management.
- **Q2 Samples.** Can the client supply a real inbound webhook payload, an interactive-message request and a status callback? Without them inbound/interactive fidelity is a guess. Recommended: get them before phase 1 starts.
- **Q3 Fan-out cap.** Max recipients per `dst` list in one request. Recommended: 20 (matches Plivo's list page size; Plivo's own limit is not documented in what I read).
- **Q4 Pricing/carrier fields.** Units, TotalRate, TotalAmount, MCC, MNC are not available from Meta. Recommended: return empty/zero and document it.
- **Q5 Template lookup.** `Template` has no unique (org, name, language). Recommended: resolve by (org, name, language, status=approved) and return 400 on ambiguity; add a unique index only after checking prod for duplicates (prod read, needs your confirmation first).
- **Q6 `undelivered` vs `failed`.** Plivo has both; Meta has failed only. Recommended: map Meta failures after `sent` to `undelivered`, failures before to `failed`.
- **Q7 Credential storage.** Reuse the unused `api_keys` table (needs an additive migration) vs. a new `public_api_credentials` table. Recommended: reuse.
- **Q9 Recoverable auth token.** Needed for exact Plivo-style callback signatures (see Security). Recommended: encrypted-at-rest copy with an env-held key, token still shown once to the client.
- **Q8 Contact side effects.** Should an API send to a new number run contact-created assignment rules and routing (as inbound does) or stay silent? Recommended: create the contact silently, no assignment/automation, to avoid surprising the client's agents.

## Access model update (2026-10-06)

Org admins now manage API credentials themselves; no support or super-admin step is needed.

1. **Per-org plan switch removed for this API only.** `plan_feature_api_access` no longer gates the dashboard credential routes or the public API. Outbound webhooks (`lib/webhook-dispatch.ts`) and billing still use it unchanged.
2. **Access helper.** `lib/public-api/access.ts` exports `checkPublicApiAccess(prisma, organizationId)` and `MAX_ACTIVE_CREDENTIALS = 10`. An org is allowed unless it is outside the rollout allow-list (`not_allowed`) or its kill switch is set (`blocked`).
3. **Rollout.** Temporary allow-list env var `PUBLIC_API_ALLOWED_ORGS` (comma-separated organization ids, read on every call). While non-empty, only listed orgs pass. To open the API to all orgs, delete the variable.
4. **Kill switch.** Vendor setting `plan_feature_public_api_blocked` = `1` or `true` blocks one org immediately, including its existing credentials. The `plan_feature_` prefix is refused by `PUT /v1/vendor-settings`, so tenants cannot set or clear it.
5. **Same response for both reasons.** Dashboard routes answer `403 API_NOT_AVAILABLE`; the public API answers `403` "API access is not available for this account". The reason is not revealed.
6. **Dashboard permission.** Routes require `settings_access@settings_api_key` (admin default allow; admins can grant it to other roles; labelled "API credentials" in the permissions grid). The permission check runs before the access check.
7. **Credential cap.** At most 10 active (non-revoked) credentials per org; `POST /api-credentials` answers `409 CREDENTIAL_LIMIT` before generating or storing anything. A tiny race between the count and the create is accepted.
