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
- Rate limit: 300 requests per minute per credential by default. Over the limit returns HTTP `429` with a `Retry-After` header (see section 7).
- Error bodies: `{"api_id", "error", "error_code", "hint"}` (see section 7). Typical statuses: `400` validation, `401` bad credentials, `403` account not active or API not available, `404` unknown resource (also used for another account's resources), `413` body too large, `415` unsupported Content-Type, `429` throttled, `500` error on our side (retry), `502` Meta unavailable.
- Usage: Settings > API Usage shows your request counts, success and error rates, per credential and per endpoint.

## 3. Send a message
`POST /Message/`

| Field | Notes |
|---|---|
| `src` | Your connected WhatsApp Business number, digits only (for example `14155552671`) |
| `dst` | One or more recipients in international format, separated by `<`. At most 20 per request; duplicates are removed. Phone numbers may contain digits, an optional leading `+`, spaces, dashes and parentheses only |
| `type` | `whatsapp` |
| exactly one of `text`, `media_urls`, `template`, `interactive`, `location` | see below |
| `url` | Optional status callback URL for this request (overrides the credential's). Maximum 2000 characters |
| `method` | `POST` (default) or `GET`, how the callback is delivered. Must be `GET` or `POST`; blank means `POST` |

- `text`: a string up to 4096 characters.
- `media_urls`: array of `https` URLs to an image, video, audio or document.
- `template`: `{"name": "...", "language": "en", "components": [...]}`. The template must exist in your account with status `approved`, and `language` must match exactly the code it was created with (for example `en` or `en_US`). The template `name` uses lowercase letters, digits and underscores only. Components:
  `[{"type": "header", "parameters": [{"type": "media", "media": "https://..."}]}, {"type": "body", "parameters": [{"type": "text", "text": "Alex"}]}]`
  For numbered variables (`{{1}}`) body parameters go in order; for named variables order does not matter. Button parameters use `sub_type` (`quick_reply` or `url`) and `index`.
- `interactive` **(confirm)** and `location` (`{"latitude", "longitude", "name", "address"}`, all strings) are also supported.

Example:
```
curl -u AUTH_ID:AUTH_TOKEN -H "Content-Type: application/json" \
  -X POST https://HOST/v1/Account/AUTH_ID/Message/ \
  -d '{"src":"14155552671","dst":"919876543210","type":"whatsapp",
       "template":{"name":"welcome_new_customer_test","language":"en",
       "components":[{"type":"body","parameters":[{"type":"text","text":"Alex"},{"type":"text","text":"WB-1001"}]}]}}'
```
Response, HTTP 202:
```
{"api_id":"...","message":"message(s) queued","message_uuid":["<uuid per recipient>"]}
```
The call returns as soon as the message is queued; delivery is reported by callbacks or by retrieving the message.

Template with named variables:
```json
{
  "src": "14155552671",
  "dst": "14155552672",
  "type": "whatsapp",
  "template": {
    "name": "order_confirmation",
    "language": "en",
    "components": [
      { "type": "body", "parameters": [
        { "type": "text", "parameter_name": "username", "text": "Alex" },
        { "type": "text", "parameter_name": "order_id", "text": "WB-1001" }
      ] }
    ]
  }
}
```
For templates with named variables (`{{username}}`) send `parameter_name` on every parameter; order does not matter. For numbered variables (`{{1}}`) omit `parameter_name`. Typical 400 errors:
- `template parameters not matched for BODY: expected [username, order_id]; got [username]`
- `Template "x" not found`
- `Template "x" has no language "en"; available: en_US`
- `Template "x" (en) is not approved (status: pending)`

These checks now return `400` immediately when you send the request (they used to fail later, after queuing):
- wrong number of body parameters for the template
- empty parameter text
- a `parameter_name` sent to a template that uses numbered variables

WhatsApp rules still apply: free-form (`text`, `media_urls`, `interactive`, `location`) messages are only delivered inside the 24-hour window after the customer last wrote to you (otherwise the message ends as `failed`, `ErrorCode` `380`); outside it use an approved template. Marketing templates are subject to Meta's per-user limits (see section 7).

## 4. Read messages
- `GET /Message/` list. Query: `limit` (max 20), `offset`, `message_direction`, `message_state`, `message_type`, `error_code`. Response has `meta` (`limit`, `offset`, `total_count`, `previous`, `next`) and `objects`.
- `GET /Message/{message_uuid}/` one message: `message_uuid`, `message_state` (`queued`, `sent`, `delivered`, `read`, `failed`, `undelivered`), `to_number`, `from_number`, `error_code`, `error_message`, `message_time`. `error_message` is a readable sentence for `error_code` (`null` when there is no error); see section 7.

## 5. Callbacks
**Status callbacks** are sent to your callback URL as a form-encoded `POST` (or query-string `GET`) on every status change: `MessageUUID`, `To`, `From`, `Type`, `Status`, `ErrorCode`, `ErrorMessage`, `Sequence`, `MessageTime`, plus billing-style fields we fill with fixed placeholder values **(confirm)**. Respond with any 2xx within a few seconds. `ErrorCode` and `ErrorMessage` are only present when `Status` is `failed` or `undelivered` (see section 7). Failed deliveries are retried after 60, 120 and 240 seconds.

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

## 7. Errors
Every failed API call returns a JSON body with the same four fields:

```json
{
  "api_id": "3f1c2a9e-5b7d-4e0a-9c11-2d8f6a4b7e90",
  "error": "Template \"order_confirmation\" not found",
  "error_code": "TEMPLATE_NOT_FOUND",
  "hint": "Check the template name and language in your WBMSG account."
}
```

- `api_id`: identifies this exact request on our side. **Quote it when you contact support**; it lets us find the request immediately.
- `error`: what went wrong, in a sentence. For validation errors it names the field to fix.
- `error_code`: a stable code (table below). Branch your code on this, not on the `error` text, which can change.
- `hint`: a suggestion for fixing the problem. It is advice and may be absent.

On HTTP `429` the response also carries a `Retry-After` header with the number of seconds to wait before retrying.

| error_code | HTTP | Meaning | What to do |
|---|---|---|---|
| `INVALID_JSON` | 400 | The request body is not valid JSON. | Send a JSON object with `Content-Type: application/json`. |
| `EMPTY_BODY` | 400 | The request body is empty. | Send a JSON object with `Content-Type: application/json`. |
| `UNSUPPORTED_CONTENT_TYPE` | 415 | Content-Type must be application/json. | Add the header `Content-Type: application/json`. A `text/plain` body is not rejected with 415: it is read as text and returns 400 `VALIDATION_FAILED` "Request body must be a JSON object" with a Content-Type hint. |
| `BODY_TOO_LARGE` | 413 | The request body is too large. | Reduce the size of the request. |
| `VALIDATION_FAILED` | 400 | The request is invalid. | The `error` text names the missing or invalid field. Fix it and send again. Also used when WhatsApp rejects a template you create or edit. |
| `TEMPLATE_PARAMS_MISMATCH` | 400 | The template parameters do not match the template. | Send one parameter for every variable in the template body and header, using the same names (or numbers) as the template. |
| `TEMPLATE_NOT_FOUND` | 400 when sending, 404 on the template endpoints | Template not found. | When sending (400): check the template name and language in your WBMSG account. On the template endpoints (404): check the waba_id and template_id in the URL. |
| `TEMPLATE_NOT_APPROVED` | 400 | The template is not approved. | Only approved templates can be sent. Check its status in your WBMSG account. |
| `WHATSAPP_NOT_CONNECTED` | 400 | No WhatsApp number is connected to this account. | Connect a WhatsApp Business number in WBMSG first. |
| `SRC_MISMATCH` | 400 | `src` is not the WhatsApp Business number connected to this account. | Set `src` to the connected number. |
| `CALLBACK_URL_INVALID` | 400 | The callback `url` is not allowed. | Use a public `https` URL. |
| `AUTH_MISSING` | 401 | The Authorization header is missing. | Use HTTP Basic auth: auth_id as the username and the auth token as the password. |
| `AUTH_MALFORMED` | 401 | The Authorization header is not valid Basic auth. | Use HTTP Basic auth: `base64(auth_id:auth_token)`. |
| `AUTH_ID_MISMATCH` | 401 | The auth_id in the URL does not match the username in the Authorization header. | Use the same auth_id in `/v1/Account/{auth_id}/` and as the Basic-auth username. |
| `AUTH_INVALID` | 401 | The auth_id or auth token is invalid, or the credential was revoked. | Check both values, or create a new credential in WBMSG under Settings > API Credentials. |
| `ACCOUNT_INACTIVE` | 403 | This account is not active. | Contact WBMSG support. |
| `API_NOT_AVAILABLE` | 403 | API access is not available for this account. | Contact WBMSG support to enable it. |
| `MESSAGE_NOT_FOUND` | 404 | Message not found. | Check the `message_uuid`; it must belong to this account. |
| `NOT_FOUND` | 404 | The requested resource was not found. | Check the URL path and the id in it. Unknown paths under `/v1/Account/{auth_id}/` return this error. |
| `RATE_LIMITED` | 429 | Too many requests. | Wait for the number of seconds in the `Retry-After` header, then retry. |
| `QUEUE_FAILED` | 500 | We could not queue your message. | Nothing was sent. Retry in a few seconds. If it keeps failing, contact support and quote the `api_id`. |
| `INTERNAL_ERROR` | 500 | Something went wrong on our side. Your request was not processed. | Retry in a few seconds. If it keeps failing, contact support and quote the `api_id`. |
| `META_UNAVAILABLE` | 502 | WhatsApp (Meta) did not accept the request right now. | Retry later. If it keeps failing, contact support and quote the `api_id`. |

Any other `4xx` status not listed above is returned as `VALIDATION_FAILED`.

### Failures after a message is accepted
A `202` means the message was queued, not delivered. If it later fails, the outcome is reported on the message itself:

- In the status callback: `ErrorCode` plus a readable `ErrorMessage` (only when `Status` is `failed` or `undelivered`).
- In `GET /Message/{message_uuid}/` and the list: `error_code` plus `error_message`.

| ErrorCode | ErrorMessage |
|---|---|
| 310 | The sending phone number is not registered on the WhatsApp Business Platform. |
| 330 | WhatsApp does not support this message type. Check the message type and try again. |
| 340 | The template does not exist in this language, is not approved, or has been paused or disabled. Check its status in WBMSG. |
| 350 | The template parameters do not match the template (count, format or length). Send values for every parameter in the format the template defines. |
| 360 | The WhatsApp Business account is restricted or failed verification. Contact support. |
| 370 | WhatsApp is limiting sending from this number right now (too many messages too fast, too many to one recipient, or a spam/quality restriction). Retry later; if it persists, check your number's quality in WBMSG or contact support. |
| 380 | The customer has not replied in the last 24 hours, so only an approved template message can be sent. |
| 131049 | WhatsApp did not deliver this marketing message to this recipient to keep engagement healthy. Wait at least 24 hours before trying again. |
| 131026 | WhatsApp could not deliver the message. The recipient may not be a WhatsApp user, may not have accepted WhatsApp's terms, or may be on an outdated WhatsApp version. |
| any other number | WhatsApp's own error code, passed through unchanged. `ErrorMessage` is "WhatsApp could not deliver the message (code N)." with the code in place of N. |

`131049` means Meta chose not to deliver a marketing template to that person to protect user experience. Do not retry immediately; wait at least 24 hours, or use a utility template or an open 24-hour window. Details for any failure are visible in the WBMSG Message Log.

## 8. Support checklist
Send us the `message_uuid` or `api_id`, the time (with time zone) and the Auth ID (never the token).
