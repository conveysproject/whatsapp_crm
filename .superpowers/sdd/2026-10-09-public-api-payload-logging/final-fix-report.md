# Final fix report

All items done: I1, I2, I3, M1, M4, M5, M7/M8/M9 (runbook), smoke script hardening, T5, T4. (I1c raw-text fallback left unchanged: non-JSON text is arbitrary content, not trivially safe.)

## Verification
- vitest src/lib/public-api src/routes scripts src/workers: 1308 passed, 2 failed (src/routes/segments.test.ts "creates segment with match field", "defaults match to all"): the known pre-existing flaky segments failures (untouched files; also fail in isolation). Plus a Redis-rejection noise error from conversations.test.ts (known).
- pnpm tsc --noEmit: 0 errors. pnpm typecheck:scripts: pass. eslint on 6 touched src files: clean.
- grep -rIn -i plivo docs/runbooks docs/api: no hits. Runbook moved with git mv to docs/runbooks/; only other reference (docs/superpowers/plans) updated; no refs in .env.example / PRD / scripts.

## I3 real smoke output (committed script, fresh postgres:16 on 15432 + redis:7 on 16379, containers removed afterwards)
Real count: 29 checks, 29 PASS, 0 FAIL, exit 0, "ALL CHECKS PASSED". The earlier "31" was wrong. The script header states no count, so no doc needed fixing.
```

== (1) 202 / 400 / 401 through the real router + real flush
PASS  statuses are 202, 400, 401
PASS  every response carries an api_id
PASS  payload rows exist for the 202 and the 400 and NOT for the 401
PASS  payload id equals the response api_id, organization is org A
PASS  metadata row id equals api_id for all three (the 401 keeps its metadata row)
PASS  stored statuses: 202 and 400, response body contains the api_id

== (2) secrets never stored
PASS  no stored row contains the Basic header value, its base64, the real token, the wrong token or the raw auth_token
PASS  the 400 request body keeps the field name auth_token with the value [redacted]

== (3) 17 KB body is truncated at 16384
PASS  17 KB request: stored length is exactly 16384 and requestTruncated is true
PASS  a small request is not flagged truncated

== (4) cross-org isolation at the query level
PASS  findFirst with the other organizationId returns null; with the right one returns the row

== (5) dashboard endpoints through the real router, auth faked
PASS  GET /payloads (org A): flag reported on, only org A's rows (202, 400, big), none of org B's
PASS  GET /payloads (org B): exactly its own single row
PASS  GET /payloads/:id (org A, own id) -> 200 with the stored bodies
PASS  GET /payloads/:id (org A asking for org B's id) -> 404
PASS  GET /payloads/:id with a malformed id -> 400

== (6) callback attempt row, url sanitised
PASS  attempt row stored with url reduced to scheme+host+port+path (no userinfo, query or fragment)
PASS  attempt row has outcome, status, message id
PASS  GET /callbacks: org A sees the attempt, org B sees none
PASS  no stored attempt contains the query secret or the password

== (7) 365-day cleanup deletes only the old rows
PASS  deleted exactly 2 rows (one payload, one attempt), both 400 days old
PASS  the 10-day-old rows and today's rows survived, the 400-day-old rows are gone

== (8) staff lookup: exactly one audit row, bodies printed only after it
PASS  exactly one audit row written, with actor, org, reason and rows returned
PASS  audit happened before the first printed line, and bodies were printed
PASS  lookup is org-scoped: org B's row is not printed

== (9) a duplicate payload id does not abort the batch; metering still commits
PASS  the second payload row was inserted and the pre-existing duplicate was left untouched (skipDuplicates)
PASS  both raw metadata rows and the rollup (2 requests, 2 messages) committed

== (10) migration SQL vs prisma db push: table structure
      38 columns / 9 indexes compared
PASS  columns, types and nullability are identical (3 tables)
PASS  index names and definitions are identical

ALL CHECKS PASSED
```
