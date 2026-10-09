# Public API payload logging: runbook

Applies to the public (Plivo-style) message API. Design and decisions: `docs/prd-public-api-request-payload-logging.md`.

Payload logging stores a redacted copy of each API request and response, and one row per callback delivery attempt, so
support can answer "what did we receive and what did we answer". It is controlled by `API_PAYLOAD_LOGGING_ENABLED`
(default `false`).

## 1. Looking up a request

### The client (self-service)

Settings > API Usage > Request history. Shows the organization's own stored requests (newest first, filters for outcome and
endpoint), the redacted request and response bodies, and the callback attempts for a message. The client quotes the `api_id`
from any response body; it is the id of the stored row. A request that is not listed was either made while the flag was off,
was a 401, was sampled out of the raw log, or is older than the retention window.

### Staff (audited)

Use the script `apps/api/scripts/lookup-api-request.ts`. It is read-only and every run writes one row to
`api_payload_access_audit` (actor, organization, reason, exact filter, rows returned) BEFORE any body is printed. If the audit
insert fails nothing is printed and the exit code is non-zero.

```bash
cd apps/api
railway run --service Postgres pnpm tsx scripts/lookup-api-request.ts \
  --org <organizationId> --reason "<ticket or why, 8+ characters>" \
  [--api-id <uuid>] [--since-hours 24] [--show-meta]
```

- `--org` and `--reason` are mandatory. Max 50 rows, newest first. `--api-id` looks up one request.
- `railway run --service Postgres` injects `DATABASE_PUBLIC_URL`; never copy or print a connection string.
- `--show-meta` additionally prints the client IP and user agent (off by default).
- Use it only for a concrete support case. The audit table is the record of who looked at whose data and why.

## 2. What is stored, redacted or never stored

| Item | Handling |
|---|---|
| Request and response bodies (JSON text) | Stored, each capped at 16 KB (16384 characters); `request_truncated` / `response_truncated` mark a cut |
| Any JSON key matching `token`, `secret`, `authorization`, `password`, `api_key` / `api-key` (any case, any depth) | Value replaced by `[redacted]` before truncation |
| Long strings, deep or wide JSON | Strings cut at 2000 characters, depth 8, 200 items per object/array |
| URL query strings | Stored; values of secret-looking parameters are `[redacted]`; URLs inside bodies lose their query string |
| `Authorization` header | Never read, never stored. Neither is the credential token |
| 401 responses | No payload row at all (credential-guessing noise). Their metadata row (api_request_logs) is kept |
| Requests with no organization (unknown credential, pre-auth 429) | No payload row |
| Requests whose raw metadata row is sampled out or capped | No payload row |
| Callback attempts | Stored: url without userinfo, query and fragment; form fields we sent (capped); outcome, HTTP status, short reason, duration. Callback signatures and response bodies are never stored |
| NUL characters and lone surrogates | Removed before storing |
| Client IP and user agent | Stored; shown to staff only with `--show-meta` |

The bodies contain end-customer phone numbers and message text: treat them as personal data.

## 3. Retention

| Data | Kept |
|---|---|
| Payloads (`api_request_payloads`) and callback attempts (`api_callback_attempts`) | 365 days (`API_PAYLOAD_RETENTION_DAYS`, default 365, minimum 90) |
| Per-request metadata (`api_request_logs`) | 30 days (`API_REQUEST_LOG_RETENTION_DAYS`) |
| Daily totals (`api_usage_daily`) | Forever |
| Staff access audit (`api_payload_access_audit`) | Not deleted automatically |

Deleted by the hourly cleanup job in batches. A payload write failure never affects metering (payloads are written in a
separate transaction after the metering transaction commits).

## 4. Erasure (manual, audited)

There is no erasure tool yet (owner decision pending on building one). Until then it is a manual SQL procedure. Do it only for
a documented request (customer or data-subject request, ticket id required) and ALWAYS log it.

1. Run through Railway so no connection string is handled: `railway run --service Postgres psql "$DATABASE_PUBLIC_URL"`.
2. Look first, count before deleting, and use a transaction:

```sql
BEGIN;

-- A. Whole organization (offboarding, contract end)
SELECT count(*) FROM api_request_payloads  WHERE organization_id = '<ORG_ID>';
SELECT count(*) FROM api_callback_attempts WHERE organization_id = '<ORG_ID>';
DELETE FROM api_request_payloads  WHERE organization_id = '<ORG_ID>';
DELETE FROM api_callback_attempts WHERE organization_id = '<ORG_ID>';

-- B. One end customer inside an organization (phone number as digits, e.g. 14155552672; always keep the organization filter)
SELECT count(*) FROM api_request_payloads
 WHERE organization_id = '<ORG_ID>' AND (request_body LIKE '%<PHONE_DIGITS>%' OR response_body LIKE '%<PHONE_DIGITS>%');
DELETE FROM api_request_payloads
 WHERE organization_id = '<ORG_ID>' AND (request_body LIKE '%<PHONE_DIGITS>%' OR response_body LIKE '%<PHONE_DIGITS>%');
DELETE FROM api_callback_attempts
 WHERE organization_id = '<ORG_ID>' AND fields::text LIKE '%<PHONE_DIGITS>%';

-- Log the erasure (the audit table is the permanent record; rows_returned = rows deleted in total)
INSERT INTO api_payload_access_audit (id, actor, organization_id, reason, query, rows_returned)
VALUES (gen_random_uuid()::text, '<your name>', '<ORG_ID>', 'ERASURE <ticket id>: <why>',
        'DELETE api_request_payloads/api_callback_attempts (scope A or B, phone <PHONE_DIGITS or none>)', <ROWS_DELETED>);

COMMIT;  -- or ROLLBACK if a count looks wrong
```

Run block A or block B, not both (delete the block you do not need before pasting). Numbers may be stored with a leading `+`
or spaces in free-text bodies; also try the national format when the count looks too low. The metadata table
(`api_request_logs`) holds no phone numbers or bodies and needs no erasure.

**Warning:** every erasure MUST end with the audit INSERT above. An erasure without an audit row is a compliance gap.

## 5. Release checklist

Steps marked **OWNER** can only be done by the owner (production variables and legal text are not touched by Claude).

1. Deploy with the flag OFF (`API_PAYLOAD_LOGGING_ENABLED` unset or `false`). The migration
   `20261009000000_api_payload_logging` is additive and runs through `start.sh` (`prisma migrate deploy`). If the SQL was
   applied out-of-band, mark it applied or the next deploy crash-loops on P3009:
   `prisma migrate resolve --applied 20261009000000_api_payload_logging`.
2. **OWNER:** publish the privacy policy and terms line covering API payload retention (request/response content, 365 days).
   This must be live before the flag is turned on.
3. **OWNER:** set `API_PAYLOAD_LOGGING_ENABLED=true` on Railway, production environment, service `api`, and redeploy.
   Optionally set `API_PAYLOAD_RETENTION_DAYS` (default 365, never below 90).
4. Verify: send one test message and one deliberately invalid request with a real credential, then open Settings > API Usage >
   Request history and confirm both rows show with redacted bodies; confirm a wrong-token request does not appear.
5. Rollback: set the flag back to `false`. Existing rows stay until retention removes them (or erase them per section 4); the
   tables are additive and can stay.
