# WBMSG WhatsApp API: Developer Guide

For developers integrating an existing application with WBMSG's WhatsApp messaging and template API.

Items marked **(confirm)** are shapes we have built from public documentation and are verifying against real traffic; tell us if your integration sees a difference.

## 1. Before you start
1. In the WBMSG dashboard open **Settings > API Credentials** (needs the Settings > API permission; org admins have it).
2. Create a credential. You receive an **Auth ID** (UUID) and an **Auth Token**. The token is shown **once**: store it securely. Rotate it any time (the old token stops working immediately); revoke a credential to disable it.
3. Optionally set a **status callback URL** and an **inbound URL** on the credential (both must be public `https` URLs).
4. Your WhatsApp Business number and templates are your own, managed in WBMSG, and Meta bills you directly for conversations.

An organization can hold up to 10 active credentials.

## 2. Basics
- Base URL: `https://<your-WBMSG-API-host>/v1/Account/{auth_id}/` (we give you the host).
- Authentication: HTTP Basic, user = Auth ID, password = Auth Token. The `{auth_id}` in the path must be the same credential.
- Bodies are JSON (`Content-Type: application/json`).
- Rate limit: 300 requests per minute per credential by default. Over the limit returns HTTP `429` with `{"api_id": "...", "error": "Request was throttled."}`.
- Error bodies: `{"api_id": "<uuid>", "error": "<message>"}` **(confirm)**. Typical statuses: `400` validation, `401` bad credentials, `403` account not active or API not available, `404` unknown resource (also used for another account's resources), `429` throttled, `502` Meta unavailable.
- Usage: Settings > API Usage shows your request counts, success and error rates, per credential and per endpoint.

## 3. Send a message
`POST /Message/`

| Field | Notes |
|---|---|
| `src` | Your connected WhatsApp Business number, digits only (for example `918269150291`) |
| `dst` | One or more recipients in international format, separated by `<`. At most 20 per request; duplicates are removed |
| `type` | `whatsapp` |
| exactly one of `text`, `media_urls`, `template`, `interactive`, `location` | see below |
| `url` | Optional status callback URL for this request (overrides the credential's) |
| `method` | `POST` (default) or `GET`, how the callback is delivered |

- `text`: a string up to 4096 characters.
- `media_urls`: array of `https` URLs to an image, video, audio or document.
- `template`: `{"name": "...", "language": "en", "components": [...]}`. The template must exist in your account with status `approved`, and `language` must match exactly the code it was created with. Components:
  `[{"type": "header", "parameters": [{"type": "media", "media": "https://..."}]}, {"type": "body", "parameters": [{"type": "text", "text": "Alex"}]}]`
  Button parameters use `sub_type` (`quick_reply` or `url`) and `index`.
- `interactive` **(confirm)** and `location` (`{"latitude", "longitude", "name", "address"}`, all strings) are also supported.

Example:
```
curl -u AUTH_ID:AUTH_TOKEN -H "Content-Type: application/json" \
  -X POST https://HOST/v1/Account/AUTH_ID/Message/ \
  -d '{"src":"918269150291","dst":"919876543210","type":"whatsapp",
       "template":{"name":"welcome_new_customer_test","language":"en",
       "components":[{"type":"body","parameters":[{"type":"text","text":"Alex"},{"type":"text","text":"WB-1001"}]}]}}'
```
Response, HTTP 202:
```
{"api_id":"...","message":"message(s) queued","message_uuid":["<uuid per recipient>"]}
```
The call returns as soon as the message is queued; delivery is reported by callbacks or by retrieving the message.

WhatsApp rules still apply: free-form (`text`, `media_urls`, `interactive`, `location`) messages are only delivered inside the 24-hour window after the customer last wrote to you (otherwise the message ends as `failed`, `ErrorCode` `380`); outside it use an approved template. Marketing templates are subject to Meta's per-user limits (see section 7).

## 4. Read messages
- `GET /Message/` list. Query: `limit` (max 20), `offset`, `message_direction`, `message_state`, `message_type`, `error_code`. Response has `meta` (`limit`, `offset`, `total_count`, `previous`, `next`) and `objects`.
- `GET /Message/{message_uuid}/` one message: `message_uuid`, `message_state` (`queued`, `sent`, `delivered`, `read`, `failed`, `undelivered`), `to_number`, `from_number`, `error_code`, `message_time`.

## 5. Callbacks
**Status callbacks** are sent to your callback URL as a form-encoded `POST` (or query-string `GET`) on every status change: `MessageUUID`, `To`, `From`, `Type`, `Status`, `ErrorCode`, `Sequence`, `MessageTime`, plus billing-style fields we fill with fixed placeholder values **(confirm)**. Respond with any 2xx within a few seconds. Failed deliveries are retried after 60, 120 and 240 seconds.

**Inbound messages** from your customers are forwarded to your inbound URL with `From`, `To`, `Text`, `Type`, `MessageUUID` **(confirm; media, location and button replies are being aligned with your samples)**.

**Signature:** every callback carries `X-WBMSG-Signature` and `X-WBMSG-Signature-Nonce`. Verify with your Auth Token: `base64(HMAC-SHA256(auth_token, callback_url_without_query + nonce))`. Callbacks only go to public `https` URLs; private or internal addresses are refused.

## 6. Templates
All under `/WhatsApp/Template/{waba_id}/`; `waba_id` is your WhatsApp Business Account ID (any other ID returns `404`).

| Call | Purpose |
|---|---|
| `POST /WhatsApp/Template/{waba_id}/` | Create and submit to Meta. Body: `name` (lowercase letters, digits, underscore), `language`, `category` (`MARKETING`, `UTILITY`, `AUTHENTICATION`), `components` (must include a `BODY`), optional `allow_category_change`. Image/video/document headers need `example.header_handle` (a Meta upload handle) |
| `GET /WhatsApp/Template/{waba_id}/` | List. Query: `template_name` (substring), `limit` (max 20), `offset` |
| `GET /WhatsApp/Template/{waba_id}/{template_id}/` | One template with `quality_score`, `rejected_reason`, `components` |
| `POST /WhatsApp/Template/{waba_id}/{template_id}/` | Edit components (name, language and category cannot change). Returns the template to review. Meta limits edits |
| `DELETE /WhatsApp/Template/{waba_id}/{template_id}/?name=<template name>` | Delete. `204` on success. If Meta refuses, the template is kept and you get `502` |

`template_id` is Meta's template ID. Status values you will see: `PENDING`, `APPROVED`, `REJECTED` (paused and disabled templates are not reported yet). Meta usually reviews utility templates within minutes, other categories can take up to 24 hours.

## 7. Error codes
`ErrorCode` on a failed or undelivered message:

| Code | Meaning |
|---|---|
| 310 | Phone number not registered on WhatsApp |
| 330 | Message type not supported |
| 340 | Template does not exist, is paused or disabled |
| 350 | Template parameters do not match the template |
| 360 | WhatsApp Business account locked or disabled |
| 370 | WhatsApp throughput or rate limit reached |
| 380 | More than 24 hours since the customer last wrote: use a template |
| 6-digit number | Meta's own error code, passed through unchanged (for example `131049`) |

`131049` means Meta chose not to deliver a marketing template to that person to protect user experience. Do not retry immediately; wait at least 24 hours, or use a utility template or an open 24-hour window. Details for any failure are visible in the WBMSG Message Log.

## 8. Support checklist
Send us the `message_uuid` or `api_id`, the time (with time zone) and the Auth ID (never the token).
