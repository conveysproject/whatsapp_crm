# Report: own auth, Phase 4 (WhatsApp code, Google, Facebook; web + API)

Branch `feat/auth-providers` (worktree `E:\Product\WhatsApp_CRM-auth-providers`). Not pushed, not merged.
Plan: `docs/superpowers/plans/2026-10-18-own-auth-phase4-providers.md`. Owner setup: `docs/runbooks/own-auth-sign-in-providers.md`.

## What changed
**API (`apps/api/src/auth/`)**, all wbmsg-only (the `/v1/auth` router 404s in Clerk mode):
- `phone.ts` (E.164), `whatsapp-codes.ts` (config gate + Authentication template send from the `AUTH_WHATSAPP_ORG_ID` org, via `sendTemplateMessage`), `user-session.ts`.
- `routes/whatsapp.ts`: `POST /signin/whatsapp/request` (202 before work) and `/verify`; `POST /phone/verify/request`, `/phone/verify/confirm`, `DELETE /phone` (account session).
- `oauth/`: `OAuthProvider` interface, Google (OIDC, ID token verified with jose: issuer/audience/nonce) and Facebook (code exchange + Graph `/me` with `appsecret_proof`) adapters, Redis state (single use, 10 min) and pending entries (30 min), PKCE S256.
- `routes/oauth.ts`: `POST /oauth/:provider/start`, `POST /oauth/:provider/callback`, `POST /oauth/pending/send`, `POST /oauth/pending/verify`, `DELETE /oauth/:provider`, `GET /methods`.
- Small edits: `routes/index.ts` (registration), `routes/signin.ts` (export `bestEffort`/`padTo`/`logAttempt`), `emails.ts` (optional fixed lead line).

**Web**: BFF handlers `lib/auth/oauth-bff.ts` wired into `app/api/auth/[...action]/route.ts` (oauth start/callback, pending send/verify, methods, WhatsApp sign-in); pure helpers `lib/auth/oauth.ts`; sign-in form (WhatsApp code flow with "Email me a code instead", Google/Facebook buttons, oauth error messages); sign-up page buttons; new `/sign-in/confirm-email` page; Settings → Security: "Connected accounts" (connect/disconnect) and "WhatsApp number" (verify/remove).

**Docs**: runbook with the exact Meta template content and the Google/Facebook app setup (redirect URIs, scopes, env vars); Phase 4 section in `docs/security/asvs-l2-auth-checklist.md`.

## Design (tokens out of the browser)
Browser form-POSTs to the BFF → BFF gets `{url, state}` from the API, sets httpOnly `wb_oauth=<intent>:<state>` (path `/api/auth/oauth`) and 303s to the provider (only to the provider's own origin) → provider returns to the BFF callback → state must match the cookie → BFF POSTs the code to the API → API returns the session; BFF sets the usual httpOnly session cookies and redirects (`/business-details` for new accounts). The pending-email id also lives only in an httpOnly cookie.

## Results
- `pnpm type-check` (root): pass, exit 0.
- `pnpm lint` (root): 0 errors (61 warnings in API, all `no-explicit-any` in tests, same kind as before), 5/5 tasks.
- API full suite: 200 files, 2842 tests passed. Web full suite: 42 files, 466 tests passed. No flakes this run.
- New tests: phone (2), whatsapp-codes (4), whatsapp routes (24), providers (15), state (6), oauth routes (34), web oauth helpers (8), web BFF oauth routes (20).

## Decisions I made (with "if wrong:" costs)
1. **No `arctic`**; two `fetch` adapters + `jose` (already a dependency). If wrong: swap the adapter internals; the interface stays.
2. **API OAuth routes are POST, called only by the BFF** (PRD said GET). If wrong: small route change, but tokens would have to travel back through a URL.
3. **Facebook always needs an email code** before linking or creating, even with an email. If wrong: one branch in `signInWithIdentity`.
4. **Google with an unverified email** goes through the same email-code step (PRD said "creates a new account"). If wrong: one branch.
5. **Super admins** cannot use Google/Facebook/WhatsApp sign-in or link providers. If wrong: remove the `gate` super-admin check.
6. **Phone verification request is synchronous** (authenticated, reports WhatsApp delivery failure as 502); limits 5/h per account, 10/h per IP, 3/10 min per number.
7. **No delivery-status endpoint** for WhatsApp sign-in; the code screen always offers "Email me a code instead" (no enumeration).
8. **Unlink rule** counts password (not `mustSetPassword`), other providers, and a verified number while WhatsApp is on; email codes are not counted.
9. OAuth and WhatsApp sign-ins **trust the device** (like email-code sign-in). Locked accounts are refused.
10. Added `DELETE /v1/auth/phone` (remove number), not in the PRD list.
11. Client is `web` only for OAuth start/callback; mobile (another session) needs its own redirect URI handling on top.

## Open questions for the owner
- Separate "WBMSG Login" Meta app for Facebook Login (my default) or the existing WhatsApp app (PRD §11 q0)?
- Approve the Authentication template name `wbmsg_login_code` (en_US, Copy code, 10-minute expiry).
- Is `WEB_URL` on Railway the exact domain users sign in on? Otherwise set `AUTH_OAUTH_REDIRECT_BASE`.

## Not done / could not do
- Creating/submitting the Meta template and the Google/Facebook apps (owner steps in the runbook).
- Real end-to-end test against Google/Facebook/Meta (forbidden here). Facebook PKCE acceptance is unverified; the app secret still protects the exchange.
- No audit-log table exists, so link/unlink/phone changes are not audited beyond `login_logs` for sign-ins.
- Env examples not updated (`.env*` files are off-limits in this session); the vars are listed in the runbook:
  `AUTH_WHATSAPP_ORG_ID`, `AUTH_WHATSAPP_TEMPLATE`, `AUTH_WHATSAPP_TEMPLATE_LANG`, `AUTH_GOOGLE_CLIENT_ID`, `AUTH_GOOGLE_CLIENT_SECRET`, `AUTH_FACEBOOK_APP_ID`, `AUTH_FACEBOOK_APP_SECRET`, optional `AUTH_OAUTH_REDIRECT_BASE`.

## Review follow-up (verdict "With fixes"; commit `bef8217a`)
1. **WhatsApp send abuse (important), fixed.** There is now a global daily cap on all auth WhatsApp sends (sign-in codes and phone verification): `AUTH_WHATSAPP_DAILY_CAP` (default 500), counted in Redis under `auth:wa:daily:<UTC date>` with a 48 h TTL (`whatsappDailyCapHit` in `whatsapp-codes.ts`). Once the cap is reached:
   - phone verification answers 429 `{ code: "RATE_LIMITED", message: "Please try again later." }`;
   - sign-in requests skip the send silently and still answer 202.

   A warning is logged with `reason: "whatsapp_daily_cap"` and no PII. Only eligible accounts count against the cap (unknown numbers do not). `POST /phone/verify/request` now requires Turnstile when `TURNSTILE_SECRET_KEY` is set, and the Security page phone form shows the widget when `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is set.
2. **Last-method rule (important), fixed.**
   - `DELETE /oauth/:provider` and `DELETE /phone` now check and change inside one `$transaction` that first takes a row lock: `SELECT id FROM auth_accounts WHERE id = $1 FOR UPDATE` (`account-lock.ts`). Concurrent unlinks are serialized.
   - `DELETE /phone` refuses with 409 `LAST_SIGN_IN_METHOD` when a verified number is the last non-email method (password or a remaining OAuth link counts as another method). It is now behind the WhatsApp feature flag (404 when off).
   - The concurrent case is tested: two simultaneous unlinks on an account with only Google and Facebook give one 200 and one 409, and one link remains.
3. **Pending email step (minor), fixed.** At most 3 code emails per pending id (`auth:oauth:pending-sends:<id>`, 429 after that). Re-saving a pending entry uses `SET ... KEEPTTL XX`, so it keeps the original 30-minute expiry and never recreates an entry that has already expired.
4. **Facebook token exchange (minor), fixed.** It is now a `POST` with a form body, so the code and the app secret are never in a URL.
5. **Runbook, updated.** It now states plainly that the WhatsApp, Google and Facebook env vars must stay unset until the daily cap value is chosen and the Meta template is approved, and it documents `AUTH_WHATSAPP_DAILY_CAP`.

Verification after the fixes:
- root `pnpm type-check`: exit 0;
- root `pnpm lint`: 0 errors (61 pre-existing-style warnings), 5/5 tasks;
- API: 200 files, 2855 tests passed;
- web: 42 files, 466 tests passed.

New or changed tests: whatsapp-codes +2, whatsapp routes +7, oauth routes +3, state +1, providers (Facebook POST).

New owner decision: the value of `AUTH_WHATSAPP_DAILY_CAP` (default 500 messages per UTC day).
