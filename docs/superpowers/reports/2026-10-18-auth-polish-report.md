# Auth polish report (feat/auth-polish)

## What changed
1. Deep link: `middleware-wbmsg.ts` now forwards `x-pathname` (pathname+search) on request headers for every non-/api page (pass-through, public, 503, refresh paths). Client-supplied values are deleted; set only if `safeRedirect` accepts it. Cookie forwarding on refresh unchanged (byte-identical test still passes). Readers (`(dashboard)/layout.tsx:99`, `lib/api.ts:32`, `lib/auth/server.ts:42`) already consume it, so the original page is preserved.
2. `SIGNUP_EXPIRED` code in `apps/api/src/auth/routes/signup.ts` (400, same message/padding). Web: `flows.ts` `errorCode()` + `isSignupExpired()`; `SignUpForm.verify` uses the code with the /expired/i regex as fallback.
3. BFF `session-expired` clears cookies only if `Sec-Fetch-Site` is same-origin/same-site/none, or (header absent) Origin/Referer origin equals request or `NEXT_PUBLIC_APP_URL` origin. Otherwise it still 303s to /sign-in with the safe redirect_url, without clearing.

## Results
- type-check: 5/5 tasks ok. lint: 0 errors (59 existing API warnings).
- API full suite: 194 files, 2757 tests passed. Web full suite: 40 files, 447 tests passed. No failures.

## Decisions (if wrong:)
- x-pathname also set on public pages. If wrong: harmless, only unused header.
- `same-site` accepted for Sec-Fetch-Site. If wrong: a sibling subdomain could force logout; tighten to same-origin/none.
- No signal at all (no Sec-Fetch-Site/Origin/Referer) = no clearing. If wrong: ancient/privacy-stripped clients keep a dead session until middleware/sign-in handles it.
- Mobile/other clients matching on INVALID_CODE for the expired message: none found in repo (grep). If a client does, it needs the new code.

## Open questions
None. Docs (prd-own-auth, asvs checklist) mention signup/verify but I did not edit them.
