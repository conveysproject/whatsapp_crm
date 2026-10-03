# Auto-register phone numbers: implementation plan

Spec: `docs/prd-auto-register-phone.md`. TDD, small tasks. Work on branch `feat/auto-register-phone`.

## Task 1: Decision logic (pure, tested first)
- File: `apps/api/src/lib/auto-register-phone.ts` exports `decideRegistration({ platformType, isOnBizApp, attempts })` returning `"skip_registered" | "skip_biz_app" | "skip_max_attempts" | "register"`.
- Test file `auto-register-phone.test.ts`: one case per outcome (CLOUD_API, is_on_biz_app, 5 attempts, NOT_APPLICABLE + 0 attempts).

## Task 1b: Org selection (database only, no Meta calls)
- `selectEligibleOrgIds(prisma)` in the same file: active orgs with phone id and token, stored `phone_info_status` missing or `PENDING`, no `wa_register_done`, `wa_register_attempts < 5`.
- Tests: a CONNECTED org, a done org and a 5-attempt org are all excluded, and asserting that no fetch is made for them.

## Task 2: Per-org processor
- Same file: `processOrg(prisma, orgId, fetchFn)` reads the vendor settings, calls Meta GET then POST, writes `wa_register_*` settings and the audit row.
- Tests with mocked prisma and fetch: registers once, reuses stored PIN, skips registered and Business-app numbers, counts failures, no token or PIN in logs or audit metadata.

## Task 3: Worker, events and daily sweep
- `apps/api/src/workers/register-phone.worker.ts` modeled on `message-cleanup.ts` (queue, worker with concurrency 1).
- `enqueueRegisterCheck(orgId, delayMs)` with `jobId = register-phone:<orgId>` so repeated enqueues collapse. Call it after connect and connect-manual (+3 min, then the backoff ladder) and when a Sync stores `PENDING`.
- `scheduleRegisterPhoneSweepCron()` with `0 3 * * *` and a fixed `jobId`: DB-only, enqueues at most 20 eligible orgs.
- Redis lock per org, backoff via `wa_register_next_at`, error classification (transient vs permanent), and the 3-minute connect grace, as in the PRD skip table.
- Tests: one case per skip rule (asserting zero fetch calls), plus each error class and the lock.
- Wire into `apps/api/src/index.ts` next to the other workers, only when `AUTO_REGISTER_PHONE_ENABLED === "true"`.

## Task 4: Reset on reconnect
- In `whatsapp-account.ts` connect and connect-manual, upsert `wa_register_attempts = 0` and clear `wa_register_done` after a successful connect. Existing route tests must still pass.

## Task 5: Verify and release
- `/check` and the API tests (known flaky: 2 segments/conversations tests, Redis noise).
- Security audit of touched routes (connect, connect-manual): org scoping unchanged.
- Dry check before enabling: with user approval, list production orgs with `platform_type !== CLOUD_API` via a read-only Meta call, so the first run is not a surprise.
- Merge locally, push, set `AUTO_REGISTER_PHONE_ENABLED=true` on Railway after the user approves.
