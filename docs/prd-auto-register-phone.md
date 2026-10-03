# PRD: Auto-register WhatsApp numbers (cron)

Status: draft, awaiting approval. Role: backend engineer.

## Problem and evidence
- A number connected through Meta can stay unregistered on the Cloud API: Meta reports `status: PENDING`, `platform_type: NOT_APPLICABLE`, `is_pin_enabled: false`. Production example (Signalz, Oct 3 2026): the org could not send until `/register` was called manually; after it, status became `CONNECTED`, `platform_type: CLOUD_API`.
- Registration only runs once, in the connect flow (`apps/api/src/routes/whatsapp-account.ts:528-550`). A failure there is logged and swallowed ("non-fatal"), nothing is stored and nothing retries. Railway logs only keep the current deployment, so the cause is lost.
- The connect flow uses a fixed PIN `123456` for every customer.
- The connect flow also registers when `is_on_biz_app === true` (line 534). Registering a number that is also used in the WhatsApp Business app can disconnect it from that app (coexistence). Not verified against Meta docs in this repo; treat as a risk and never auto-register such numbers.

## Goals
- Detect connected numbers that are not on the Cloud API and register them automatically, within about 15 minutes.
- Record every attempt (result, error, time) per org so failures are visible and survive log retention.
- Use a random 6-digit PIN per org, stored so it can be read back for the customer.

## Non-goals
- Fixing payment-method, business-verification or display-name blockers (Meta side).
- Changing the connect flow's own registration (except resetting retry state on reconnect).
- A UI for the status (data is stored so a UI can follow later).

## Design
- New BullMQ queue + worker in `apps/api/src/workers/register-phone.worker.ts`, same pattern as `message-cleanup.ts`, started from `apps/api/src/index.ts`. Event-driven first, polling only as a safety net:
  1. **Per-org delayed check jobs** (`jobId = register-phone:<orgId>`, so duplicates collapse): enqueued after a successful connect/connect-manual (first check at +3 min, then +15 min, +1 h, +6 h, +24 h while still unregistered), and when a manual Sync stores `phone_info_status = PENDING`. With no connects there are no runs at all.
  2. **Daily sweep** (`0 3 * * *`, fixed `jobId`) that only looks at the database and enqueues a delayed job for each eligible org. It catches orgs the events missed (for example connected before this shipped).
- Eligible orgs are chosen from the database first, so the job does not call Meta for orgs that are already done: organization `status = 'active'`, vendor settings `current_phone_number_id` and `whatsapp_access_token` both present (same keys `registerPhoneNumber` reads, `lib/whatsapp.ts:522-523`), and ALL of:
  - stored `phone_info_status` is missing or `PENDING` (an org stored as `CONNECTED` is never checked),
  - `wa_register_done` is not set,
  - `wa_register_attempts < 5`.
- Per eligible org: `GET /{phoneNumberId}?fields=status,platform_type,is_on_biz_app` with the org token.
  - `platform_type === "CLOUD_API"` or `status === "CONNECTED"`: already registered. Write `phone_info_status = CONNECTED` and `wa_register_done = true`. The org is never checked again. No `/register` call.
  - `is_on_biz_app === true`: write `wa_register_done = true` with result `skipped_biz_app` (never register, never re-check).
  - otherwise: `POST /{phoneNumberId}/register` with `{ messaging_product: "whatsapp", pin }`, then re-fetch the status. If it is now `CLOUD_API`/`CONNECTED`, store `phone_info_status = CONNECTED` and `wa_register_done = true`.
- Known trade-off: an org stored as CONNECTED that later becomes unregistered is not re-checked by this job. The existing manual Sync, which refreshes `phone_info_status`, makes it eligible again if it turns PENDING. Reconnecting also clears `wa_register_done`.
- PIN: reuse the org's stored `wa_register_pin`; generate a random 6-digit PIN (crypto) on first attempt and store it before calling Meta.
- State per org in `vendor_settings` (existing table, no migration): `wa_register_pin`, `wa_register_done`, `wa_register_blocked`, `wa_register_next_at`, `wa_register_checks` (every check, drives the backoff ladder), `wa_register_attempts` (failed `/register` calls only), `wa_register_last_at`, `wa_register_last_result` (`ok` | `skipped_biz_app` | error text, no tokens). After a successful register, re-fetch status and store it.
- Audit: one `adminAuditLog` row per register call, `actorId: "system:auto-register"`, `action: "whatsapp.auto_register"`, `targetType: "organization"`, metadata `{ phoneNumberId, result }`. Never log token or PIN.
- Limits: process orgs sequentially, one Meta call at a time; 5 failed attempts then stop until reconnect or manual reset.
- Reconnect: the connect and connect-manual routes reset `wa_register_attempts` to 0.

## When the job must NOT do work (skip rules, checked in this order)
Each rule is checked from the database before any Meta call, so a skipped org costs one local query and zero HTTP calls.

| # | Skip when | Why |
|---|---|---|
| 1 | `AUTO_REGISTER_PHONE_ENABLED` is not `true` | Kill switch; nothing is enqueued or run. |
| 2 | No eligible orgs | The sweep exits after one DB query; no jobs, no Meta calls. |
| 3 | Org not `active` (banned, suspended) | Do not touch blocked tenants. |
| 4 | No `current_phone_number_id` or no `whatsapp_access_token` | Not connected; nothing to register. |
| 4b | `whatsapp_access_token_expired = "1"` (existing flag) | The token is known to be dead; a Meta call would only fail. |
| 5 | Stored `phone_info_status = CONNECTED` | Already working. |
| 6 | `wa_register_done = true` | Already registered, or a Business-app number (never re-checked). |
| 7 | Stored `phone_info_is_on_biz_app = true` | Coexistence number; registering could disconnect the phone app. Marked done. |
| 8 | Connected less than 3 minutes ago | The connect flow's own registration may still be running; avoids racing it. |
| 9 | `wa_register_next_at` is in the future | Backoff: 15 min, 1 h, 6 h, 24 h between attempts. A job that fires early exits at once. |
| 10 | `wa_register_attempts >= 5` | Gives up; needs a reconnect or a manual reset. |
| 11 | `wa_register_blocked` is set | Permanent failure recorded (see below); cleared only by reconnect. |
| 12 | Another run holds the org lock (`SET NX EX 120` in Redis) | Two API instances or two jobs never work on the same org at once. |

After the Meta status call (the only call for an eligible org), stop without registering when:
- `platform_type = CLOUD_API` or `status = CONNECTED`: mark done and stop. Never re-checked.
- `is_on_biz_app = true`: mark done (coexistence) and stop.
- `code_verification_status` is not `VERIFIED`: registration cannot succeed yet (inferred from Signalz, where it was VERIFIED when registration worked; verify during implementation). Record `waiting_for_verification`, back off, do not call `/register`, and do not count it as a failed attempt.

**Error handling, so failures do not become retry loops:**
- Token invalid or expired (HTTP 401 / OAuth error): set `wa_register_blocked = token_invalid` and stop until the org reconnects. Retrying cannot succeed.
- HTTP 403 and 404 from Meta: permanent; set `wa_register_blocked` (`permission_denied` / `not_found`).
- A different two-step PIN already set at Meta: its Meta error code is not verified here, so it is treated like any other unrecognised error (counts as a failed attempt, stops at 5).
- Network errors, timeouts, HTTP 5xx and Meta rate limiting (HTTP 429): transient. Retry with backoff; do not count toward the 5 attempts.
- Any error not recognised: counts as a failed attempt, backoff applies, stops at 5. The exact Meta error codes will be checked against Meta's docs while implementing; the classification above is by HTTP status and error type, not on codes I have not verified.

**Load limits:** at most 20 orgs per sweep, processed one at a time with a 10 s timeout per Meta call, and a run is skipped if the previous one is still active (worker concurrency 1). A webhook-triggered check is out of scope.

## Security
- Tenant isolation: every read and write is keyed by that org's own `organizationId` and token; no cross-org data.
- Secrets: token and PIN never logged or put in audit metadata. PIN is stored like the access token (vendor setting); the existing impersonation guard already audits reads of `/v1/vendor-settings`.
- Writes to Meta happen only for orgs whose number is demonstrably unregistered and not a Business-app number.

## Rollout and rollback
- No schema change. Ships behind a `AUTO_REGISTER_PHONE_ENABLED` env flag (default off); enable on Railway after deploy. Rollback: unset the flag.
- Production impact: first run may register any currently unregistered number (expected: Signalz is already done, others unknown; run a dry check first, see plan Task 5).

## Acceptance criteria
- Unregistered, non-Business-app number: registered once, status stored, audit row written.
- Registered number: no `/register` call.
- An org stored as CONNECTED, or with `wa_register_done`, causes NO Meta call at all on later runs.
- An org found already registered at Meta is marked done and not checked again.
- `is_on_biz_app: true`: no `/register` call, result `skipped_biz_app`.
- Meta error: attempt counted, error stored without secrets, stops after 5.
- Same PIN reused on retries; token and PIN absent from logs and audit rows.

## Risks and open questions
- Unverified: whether Meta then reports `is_pin_enabled: true` (it stayed `false` after the Signalz registration). Not a blocker for registration, but the PIN may not be enforceable.
- Unverified: which token store is authoritative (`organizations.waba_access_token` vs vendor setting `whatsapp_access_token`); the plan reads the vendor setting like `registerPhoneNumber`.
- If a number already has a different two-step PIN at Meta, `/register` fails; the job records it and stops after 5.
