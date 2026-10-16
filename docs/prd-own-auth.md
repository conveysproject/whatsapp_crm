# PRD: WBMSG's own login (replace Clerk)

**Status:** Approved for planning. Owner delegated remaining decisions to engineering on 2026-10-17 ("all yours"); calls made under that delegation are marked *my call*.
**Date:** 2026-10-17
**Owner decision so far:** build our own login system and remove Clerk completely. Existing users keep their passwords. Authenticator-app 2FA comes in a later phase.

---

## 1. Why

WBMSG depends on Clerk for its front door: sign-up, sign-in, sessions, invitations and the mobile login. Competitors own their login experience; we want the same:

- **Own the experience.** Our branding, our screens and our flows, including flows Clerk can't do well for us, such as a WhatsApp one-time code.
- **Own the data and the cost.** Identity data lives in our own Postgres, with no per-user vendor bill and no vendor outage taking our login down.
- **Own the rules.** Sign-up, invitation and super-admin flows run in our code instead of being split between Clerk widgets, Clerk webhooks and our API.

**End state: zero Clerk.** No `@clerk/*` package, no `CLERK_*` env var, no Clerk webhook, no Clerk account. **Clerk is not touched at all** for the migration (owner decision 2026-10-17, see §6.1).

## 2. What exists today (scan evidence)

| Area | Today | Evidence |
|---|---|---|
| API token check | Every request verifies a Clerk JWT; `sub` = user ID | `apps/api/src/lib/clerk.ts`, `apps/api/src/plugins/auth.ts` |
| User identity key | `User.id` **is** the Clerk user ID (no default; set from the Clerk `sub`) | `schema.prisma` model `User` (`id String @id`), `register.ts` `user.create({ id: userId })` |
| Roles and permissions | Already 100% ours (`User.role`, `OrganizationMember.permissions`, `VendorSetting role_permissions_*`). **Not affected.** | `plugins/auth.ts` `resolveAuthContext` |
| Org IDs | Ours (uuid). Clerk org IDs are only used by the legacy webhook upsert. | `Organization.id @default(uuid())` |
| Socket.IO | Verifies a Clerk token on handshake | `apps/api/src/lib/socket-auth.ts` |
| Clerk webhook | Syncs users, orgs, memberships and sessions; writes `login_logs` | `apps/api/src/routes/clerk-webhook.ts` |
| Super-admin creation and bootstrap | Creates Clerk users with a temp password | `lib/clerk-admin.ts`, `routes/super-admins.ts`, `routes/bootstrap.ts` |
| Admin org cleanup | Checks whether users still exist in Clerk | `routes/admin.ts:674` |
| Impersonation | The bearer must be the issuing super admin's live Clerk session | `plugins/auth.ts` (impersonation branch), `web/app/api/impersonation/route.ts` |
| Web pages | Clerk `<SignIn>`/`<SignUp>` widgets; admin sign-in uses `<SignIn routing="hash">` | `web/app/(auth)/…`, `web/app/admin/sign-in/page.tsx` |
| Web route guard | `clerkMiddleware` + `auth.protect()` | `web/middleware.ts` |
| Web data fetching | 117 files `import { useAuth } from "@clerk/nextjs"` → `getToken()`; 27 files use server `auth()` | grep count |
| Web Clerk profile | `useUser`/`useOrganization` on business-details; `useClerk().openUserProfile`/`signOut` in `ProfileMenu` | `web/app/(setup)/business-details/page.tsx`, `web/components/layout/ProfileMenu.tsx` |
| Invitations | The web route creates a Clerk user and a Clerk org membership, then calls the API | `web/app/api/invitations/accept/route.ts`, `api/routes/invitations.ts:89-130` |
| Email bridge | Accepts a Clerk JWT **or** `INTERNAL_EMAIL_SECRET` | `web/app/api/internal/send-email/route.ts` |
| Mobile | `@clerk/expo` provider, custom sign-in screen using Clerk's password and new-device email code, `getToken()` | `mobile/app/_layout.tsx`, `mobile/app/(auth)/sign-in.tsx`, `mobile/lib/api-context.tsx` |
| E2E tests | `@clerk/testing/playwright` | `web/e2e/global-setup.ts`, `web/e2e/fixtures/auth.ts` |

Total: about 190 source files reference Clerk. About 150 of them change only one import line (see §6.4).

### 2.1 Security issues found during the scan (fix now, independent of this project)

1. **Clerk webhook signature bypass (critical, live).** ✅ *Fixed 2026-10-17 in commit `fcd7669` (merged to local main, not yet deployed).* `clerk-webhook.ts` verifies the Svix signature only `if (webhookSecret && svixId && svixTs && svixSig)`. A request **without** the `svix-*` headers skips verification and is processed. An attacker can POST a forged `organizationMembership.created` event and create or activate a user in any org, or `user.deleted` and deactivate any user. **Fix:** reject when the secret or any header is missing.
2. **Invitation accept trusts a body-supplied user ID.** `POST /v1/invitations/:token/accept` is public and takes `clerkUserId` from the body. Anyone holding a valid invite token picks the new user's ID. Lower risk because the token is required, but the new design removes this (the ID comes from the session, never the body).

## 3. Goals, non-goals, anti-goals

**Goals**
1. Sign-in methods at launch: **email + password**, **email one-time code**, **WhatsApp one-time code**, **Google sign-in**, and **Facebook sign-in** (Google, Facebook and phone/SMS are enabled in Clerk today; owner-confirmed 2026-10-17). **SMS codes are dropped by owner decision (2026-10-17):** the WhatsApp code covers phone sign-in and the email code is the universal fallback.
2. Existing users sign in with their **current password** after cutover; nobody is forced to reset.
3. Same protections Clerk gives today: email verification at sign-up, new-device email code, password reset, brute-force and bot protection, session revocation, breached-password check.
4. Fully branded web, admin and mobile screens.
5. Zero Clerk at the end (code, deps, env, webhook, account).
6. No change to roles, permissions, org scoping or impersonation behavior.

**Non-goals (this project)**
- Authenticator-app 2FA (TOTP), passkeys and SSO/SAML. These come in a later phase; the design leaves room for them.
- Multi-org users (one user in several orgs). Today one user has one `organizationId`; that stays.
- Moving hosting to India.

**Anti-goals (it fails even if it "works")**
- Any existing customer locked out at cutover.
- A login that is weaker than Clerk's (enumerable emails, no rate limits, long-lived tokens in `localStorage`, unhashed codes).
- A one-off auth pattern that differs between web, mobile and sockets.

## 4. Architecture

### 4.1 Where it lives
A new **auth module inside the API** (`apps/api/src/auth/`), exposed under `/v1/auth/*`. The API becomes the single identity authority for web, mobile, sockets and the email bridge. No new service.

Built on small, well-audited standard libraries, not a framework:
- Password hashing: **argon2id** (`@node-rs/argon2`). No legacy hash import (§6.1).
- Tokens: **`jose`**. EdDSA (Ed25519) signed JWTs, `kid` header, public **JWKS** at `/v1/auth/.well-known/jwks.json`.
- Google and Facebook: **OAuth 2.0 authorization code + PKCE + `state`** (`arctic`). Google ID tokens are verified with `jose`; Facebook identity is read from the Graph `/me` endpoint with the exchanged token. Both run through one `OAuthProvider` interface, so adding Apple or Microsoft later is one adapter.
- Codes: CSPRNG 6-digit codes, stored **hashed** (HMAC-SHA256 with server pepper), single use.

> **Why our own module and not an auth framework:** our identity must exist *before* an org exists (sign-up → verify → business details → org), `User.id` must stay the old Clerk ID, and impersonation, demo tokens and WhatsApp codes through our own WABA are custom. Fitting a framework's fixed `user/session` tables onto our `users` table costs more than writing a focused module on standard primitives. The risk of building it ourselves is covered by §8 (OWASP ASVS L2 checklist + external pen test before cutover).

### 4.2 Data model (new tables, hand-written SQL migration)

| Table | Purpose | Key columns |
|---|---|---|
| `auth_accounts` | One login identity per person | `id` (text PK; **= existing `users.id`** for migrated users, new IDs `usr_<random>`), `email` (citext unique), `email_verified_at`, `password_hash` (nullable), `phone_e164` (unique, nullable), `phone_verified_at`, `first_name`, `last_name`, `status` (`active`\|`locked`\|`disabled`), `failed_attempts`, `locked_until`, `password_changed_at`, `must_set_password` (bool, default false), `created_at`, `updated_at` |
| `auth_oauth_links` | Linked social logins (Google, Facebook, future providers) | `id`, `account_id`, `provider` (`google`\|`facebook`), `provider_sub`, `email_at_link`, `created_at`, `last_used_at`; unique (`provider`, `provider_sub`); unique (`account_id`, `provider`) |
| `auth_sessions` | One row per signed-in device | `id`, `account_id`, `refresh_token_hash` (unique), `family_id`, `client` (`web`\|`mobile`\|`admin`), `device_label`, `ip`, `user_agent`, `created_at`, `last_used_at`, `expires_at`, `revoked_at`, `revoked_reason` |
| `auth_codes` | One-time codes and links | `id`, `account_id` (nullable for pre-account email checks), `purpose` (`email_verify`\|`signin_email`\|`signin_whatsapp`\|`new_device`\|`password_reset`\|`phone_verify`), `target` (email or phone), `code_hash`, `attempts`, `expires_at`, `consumed_at`, `created_at` |
| `auth_trusted_devices` | Skip the new-device code on known devices | `id`, `account_id`, `device_id_hash`, `created_at`, `last_seen_at`, `expires_at` |

- `users.id` gains a **foreign key → `auth_accounts.id`** after the import (integrity: no app user without an identity).
- `login_logs` is reused for every attempt (success **and** failure, with a `method` column added).
- The `users` table is otherwise unchanged. `users.email` stays in sync from `auth_accounts.email` on change.

### 4.3 Tokens and sessions

- **Access token:** JWT, EdDSA, **10-minute** TTL. Claims: `iss=wbmsg`, `aud=wbmsg-api`, `sub` (account ID), `sid` (session ID), `typ` (`user`\|`admin`), `iat`, `exp`. Stateless check on every API call; then the existing `resolveAuthContext` runs unchanged.
- **Refresh token:** 256-bit random, stored **hashed**. **Rotated on every use**; reusing an old one revokes the whole `family_id` (theft detection). Lifetime: 30 days sliding (web/mobile), **12 hours** for super-admin sessions.
- **Revocation:** password change, account disable, "sign out everywhere" and admin deactivation revoke sessions. A revoked `sid` is cached in Redis until the access token expires, so revocation applies within seconds, not 10 minutes.
- **Signing keys:** Ed25519 private key in env (`AUTH_JWT_PRIVATE_KEY`, `AUTH_JWT_KID`). The previous public key stays in JWKS for rotation.

### 4.4 Web (Next.js on Vercel)
- **Backend-for-frontend:** Next route handlers `/api/auth/*` call the API, then set the refresh token in an **httpOnly, Secure, SameSite=Lax cookie** scoped to `path=/api/auth`. The access token is **never** stored in `localStorage`. It is held in memory and fetched from `/api/auth/token` when it is close to expiry.
- **Drop-in hook:** `apps/web/lib/auth/` exports `useAuth()` with the same shape the code uses today: `{ getToken, userId, isLoaded, isSignedIn, signOut }`. Server-side `auth()` gets the same shape. A codemod swaps the import line in about 150 files; no logic changes.
- **Middleware:** replaces `clerkMiddleware`. It checks for a session cookie for redirects and keeps the same public-route list. Real authorization stays in the API, as it is today.
- **CSRF:** `/api/auth/*` POSTs require a same-origin `Origin` header plus SameSite cookies. API calls use a Bearer header, so they are not cookie-based and not CSRF-exposed.
- **Pages (own design):** `/sign-in`, `/sign-up`, `/verify-email`, `/forgot-password`, `/reset-password`, `/admin/sign-in`, `/invitations/[token]/accept`, plus a new **Settings → Security** page (change password, linked Google/Facebook, verified WhatsApp number, active devices, sign out everywhere). It replaces Clerk's `openUserProfile`.

### 4.5 Mobile (Expo)
- `apps/mobile/lib/auth/` provides `AuthProvider` and the same `useAuth()` shape. Tokens live in **SecureStore**; refresh happens via `POST /v1/auth/refresh` (body, not cookie).
- The sign-in screen keeps its current steps (email → password → new-device code) and adds "Email me a code" and "Send code on WhatsApp". Google and Facebook sign-in use the system browser (Expo AuthSession, PKCE).
- **The new app build must be live in the stores before cutover.** Old builds (Clerk) stop working at cutover, so we use a minimum-version gate: the API returns `426 UPGRADE_REQUIRED` with a store link.

### 4.6 Sign-in methods

| Method | Who can use it | Flow |
|---|---|---|
| Email + password | Everyone with a password | Password → if the device isn't trusted, email code → session |
| Email code | Everyone | Enter email → 6-digit code by email → session (marks the device trusted) |
| WhatsApp code | Accounts with a **verified** WhatsApp number (verified in Settings → Security) | Enter number → code via **Conveys org WABA**, Meta **Authentication**-category template → session. Not a sign-up method (sign-up needs an email: invitations, billing and notifications are email-based). |
| Google | Everyone | OIDC + PKCE. Links to an existing account **only if Google's email is verified and matches**; otherwise creates a new account (still goes through business details). |
| Facebook | Everyone | Facebook Login (OAuth + PKCE, scopes `email,public_profile`). Facebook doesn't guarantee an email or its verification, so auto-linking to an existing account happens **only after an email code to that address** (my call). If Facebook returns no email, the user must enter and verify one before the account is created. |
| ~~SMS code~~ | Not in this project (owner decision 2026-10-17) | Phone sign-in is the WhatsApp code; when WhatsApp delivery fails, the email code is offered. SMS can come back later behind an `SmsProvider` interface if a market needs it. |

**Sign-up:** email + password (or Google) → email verification code → `/business-details` → `POST /v1/register` (unchanged logic, now using our session). The webhook-stub race code in `register.ts` goes away because there is no webhook any more.

**Invitations:** accept page → set name + password (or Google) → account created **with email already verified** (the invite link proves ownership) → user row with the invitation role. The user ID comes from the new session, never from the request body.

**Super admins:** separate `/admin/sign-in`, `typ=admin` session with a 12-hour lifetime, **new-device code required every time** until TOTP ships. Bootstrap and "create super admin" send a one-time **set-your-password link** instead of a temp password.

### 4.7 Email and WhatsApp delivery
- Email: the existing bridge (API → Vercel `/api/internal/send-email` → GoDaddy SMTP) with `INTERNAL_EMAIL_SECRET`. The bridge's "Clerk JWT" caller path is replaced by verifying our JWT against the API JWKS.
- WhatsApp: a new env var `AUTH_WHATSAPP_ORG_ID` points at the Conveys org; the code sends the approved authentication template through the existing WhatsApp send path. If the send fails, the user is offered the email code.

### 4.8 Abuse protection (replaces Clerk's built-ins)
- Redis rate limits: per IP, per account, per target email/phone (for example, 5 password tries per 15 min per account, 3 codes per 10 min per target, 20 attempts per IP per 10 min).
- Lockout with exponential backoff after repeated failures; unlocks automatically, or by email reset.
- **No user enumeration:** the same response and timing for "no such account" and "wrong password"; reset and code requests always say "If an account exists…".
- Codes: 10-minute expiry, 5 attempts, single use, hashed.
- Breached-password check (k-anonymity range query) on sign-up and password change; fails open if the service is down.
- Bot protection on sign-up and after failed attempts: **Cloudflare Turnstile** (my call; open question §11).
- Passwords: 8–128 chars, no composition rules, blocked if breached.

## 5. API contract

New (all under `/v1/auth`, `config.public: true`, each with explicit rate limits):

`POST /signup` · `POST /signup/verify` · `POST /signin/password` · `POST /signin/code/request` · `POST /signin/code/verify` · `POST /signin/whatsapp/request` · `POST /signin/whatsapp/verify` · `GET /oauth/:provider/start` · `GET /oauth/:provider/callback` (`provider` ∈ `google`, `facebook`) · `POST /refresh` · `POST /signout` · `POST /password/forgot` · `POST /password/reset` · `GET /.well-known/jwks.json`

Authenticated: `GET /me/security` · `POST /password/change` · `POST /phone/verify/request` · `POST /phone/verify/confirm` · `GET /sessions` · `DELETE /sessions/:id` · `POST /sessions/revoke-all` · `DELETE /oauth/:provider` (blocked if it is the account's only way to sign in)

Changed:
- `POST /v1/register`: unchanged body; identity now from our token.
- `POST /v1/invitations/:token/accept`: body `{ fullName, password?, mobileNumber? }`; **`clerkUserId` removed**.
- `POST /v1/admin/super-admins`, `POST /v1/bootstrap`: no temp password; send a set-password link.
- Removed at cleanup: `POST /webhooks/clerk`.

**Switching mechanism:** one env flag, `AUTH_PROVIDER=clerk|wbmsg`, on API, web and mobile (remote config). The API accepts **only** the active provider's tokens, never both at once (simpler and smaller attack surface; possible because of the maintenance-window cutover, §6.2). New code ships dark with `AUTH_PROVIDER=clerk` until the window.

## 6. Migration and cutover

### 6.1 User import
1. **Owner decision 2026-10-17 ("simplify"):** production has **6 accounts** (1 customer admin in 1 org, 1 super admin, 4 in our own orgs; `scripts/audit-auth-readiness.mjs`, 2026-10-17). So there is **no Clerk export** and no password-hash import.
2. The import script (dry-run by default, `--apply` after owner confirmation) creates one `auth_accounts` row per non-deleted `users` row: `id = users.id`, normalized email marked verified, names split from `fullName`, **no password**, `must_set_password = true`. **No email is sent at import** (owner decision 2026-10-17).
3. **Forced password setup at first login.** When a `must_set_password` account enters its email on the sign-in screen (any method that asks for a password), the API answers `{ next: "set_password", challengeId }` and emails **one 6-digit code** to that address. The user enters the code and chooses a new password on the normal **reset-password** screen, then is signed in. **Forgot password** works the same way for these accounts (owner, 2026-10-17); both use one flow. The code is required so nobody who merely knows the email can take over the account. Email-code, Google and Facebook sign-in also work, but the user is sent to the set-password screen right after, until a password is set. *Accepted trade-off:* for these 6 migrated accounts, the "set your password" response shows that the email exists; the flag clears after setup, so this ends as each user finishes.
3. Users with no password (Google/Facebook-only in Clerk) sign in with that provider or an email code.
4. Report: counts imported, skipped, mismatched (DB `users` without a Clerk user, and the reverse).

### 6.2 Cutover: planned maintenance window (owner decision 2026-10-17)
0. **Owner decision:** customers do not sign in or sign up during the switch; the support team handles them. So the cutover is a planned maintenance window, not a gradual migration.
1. Mobile build with the new auth live in the stores (switches on the `AUTH_PROVIDER` remote flag) at least 1 week earlier.
2. Run the import (§6.1). No emails; support tells the one customer that the next login asks them to set a new password.
3. Flip `AUTH_PROVIDER=wbmsg` on API, web and mobile config. All Clerk sessions end; users sign in once with the **same password**.
4. Customer communication is done by the support team (no in-app banner or system email in scope). The window opens with a short "maintenance" page on web; it closes after the smoke tests in step 5 pass.
5. Watch: login success rate, 401 rate, lockouts, code delivery failures (Sentry + logs) for 48 hours.

### 6.3 Rollback
- Until Phase 6, flipping `AUTH_PROVIDER=clerk` restores Clerk login (Clerk accounts are untouched). With 6 users, any post-cutover issue is handled directly by support. The Clerk account is deleted in Phase 6, 7 days after a clean cutover.
- No destructive DB change: new tables only, plus one FK added after import.

### 6.4 Clerk removal (cleanup phase)
Codemod imports → delete `lib/clerk*.ts`, `routes/clerk-webhook.ts`, `svix` and `@clerk/*` deps, `CLERK_*` / `NEXT_PUBLIC_CLERK_*` / `EXPO_PUBLIC_CLERK_*` env vars on Railway, Vercel and EAS, `@clerk/testing` → our own Playwright login fixture → close the Clerk account. **Acceptance:** `git grep -i clerk` returns only historical docs.

## 7. Security, tenancy and RBAC
- `resolveAuthContext`, permissions, org scoping and the Redis auth cache are **unchanged**; only the identity source changes.
- Account disable or user deactivation → revoke all sessions + invalidate `auth:user:<id>` (the existing pattern).
- Impersonation: "bearer must be the issuing super admin" now checks our `typ=admin` token. Behavior is otherwise identical.
- Demo tokens: unchanged.
- Secrets: argon2id, hashed refresh tokens and codes, pepper and JWT keys in env only; never logged.
- Audit: every sign-in (success/fail, method, IP, UA) in `login_logs`; password change, session revoke, social link/unlink, phone verify and super-admin creation in the audit log.
- Every new route gets a security review entry (org scoping N/A for pre-auth routes; enumeration and rate-limit checks instead).

## 8. Quality gates
- TDD for every auth unit (hashing, tokens, rotation and reuse detection, codes, rate limits, each flow).
- **OWASP ASVS Level 2** (V2 Authentication, V3 Session Management) checklist completed and filed in `docs/`.
- **Internal security review** (owner decision 2026-10-17: no external pen test): a dedicated security-reviewer pass on every auth PR, an automated OWASP ZAP baseline + authenticated scan against staging, and an abuse-test suite (enumeration, brute force, token reuse, code replay, CSRF, open redirect in OAuth) that must pass before cutover.
- Load test: 200 sign-ins/min sustained without errors (argon2 cost tuned to keep p95 under 300 ms on Railway).

## 9. Acceptance criteria
1. A migrated user signs in on web and mobile with their old password and keeps their ID, role, org and data.
2. New sign-up via email+password, Google and Facebook ends on `/business-details` with a verified email.
3. Email code, WhatsApp code (verified number), password reset and new-device code all work on web and mobile.
4. An invited user accepts, sets a password, and lands with the invited role and team.
5. Super-admin sign-in requires a code on every new session; impersonation still works and is bound to the issuing admin.
6. A reused refresh token revokes the device's session family; "sign out everywhere" ends all sessions within 60 s.
7. Wrong password / unknown email give identical responses; rate limits and lockout trigger as specified.
8. Socket.IO connects with the new token; the email bridge accepts the new token.
9. `git grep -i clerk` is clean (code); no `@clerk/*` in any `package.json`; no Clerk env on Railway, Vercel or EAS.
10. All existing API/web/mobile tests pass (except the 2 known flaky API tests).

## 10. Phases and rough effort

| Phase | Content | Estimate |
|---|---|---|
| 0 | ~~Fix webhook bypass~~ (done, deployed 2026-10-17). Hash-export check and invitation hardening **dropped** (simplification). | 0 days |
| 1 | API auth core: schema, hashing, tokens, sessions, email+password, email codes, reset, new-device, rate limits, JWKS; `AUTH_PROVIDER`-switched auth plugin + sockets (dark) | 1.5–2 weeks |
| 2 | Web: BFF, `useAuth` shim + codemod, middleware, all pages, Security settings, invitations, admin sign-in, email bridge | 1.5 weeks |
| 3 | Mobile: auth provider, screens, Google, version gate; store release | 1 week (+ store review) |
| 4 | WhatsApp code (template approval), Google + Facebook OAuth (web + mobile) | 1–1.5 weeks |
| 5 | Import script, staging rehearsal, pen test, cutover | 1 week |
| 6 | Clerk removal (7 days after a clean cutover) | 2–3 days |
| Later | TOTP 2FA, passkeys | separate PRD |

**Total: about 5.5–7.5 weeks** of focused work, plus store review and pen-test lead time.

## 10a. Builder-check decisions (my calls, marked for review)
1. ~~Task 0 go/no-go~~: dropped; no Clerk export (§6.1).
2. **IDs.** No code assumes a `user_` prefix (grep of `apps/` and `packages/`: no matches). New accounts get `usr_<26-char random>`; migrated accounts keep their Clerk ID.
3. **Orphan `users` rows** (DB user with no Clerk user): an `auth_accounts` row is created with no password and a verified email, so the person signs in with an email code or reset. Nothing is deleted. The FK is added only after the import report shows zero orphans.
4. **Super admins** live in `users` with `organizationId: "platform"` (`routes/bootstrap.ts:92`). They are imported like everyone else; `typ=admin` is issued when `users.role = superAdmin`.
5. **Impersonation binding.** The impersonation Redis payload stores the issuing admin's `sid` as well as `issuedBy`. Every impersonated request requires a valid admin access token whose `sid` matches and is not revoked. When the admin session ends or is revoked, impersonation ends.
6. **Clerk users with MFA:** irrelevant now (all 6 users set a new password); super admins get the new-device code on every new session until TOTP ships.
7. **Mobile version gate.** Current builds send no version header (grep: none). New builds send `X-App-Version`. After cutover the API answers any **Clerk-issued** token with `426 UPGRADE_REQUIRED`, so old builds show "update the app". The new build ships at least 1 week early, and we check adoption in the store consoles before setting the cutover date.
8. **Unfinished sign-ups** (verified email, no org): the account stays; on sign-in the user is sent to `/business-details`. A daily job deletes such accounts after 30 days if no org was ever created.
9. **Rollback:** see §6.3.
10. **Other Clerk references:** `scripts/setup.sh` (env setup) is updated in Phase 6. No other script or job uses the Clerk SDK.

## 11. Open questions (owner)
Answered 2026-10-17: Clerk has **Google**, **Facebook** and **phone/SMS** enabled (SMS **dropped**, WhatsApp code replaces it) · **simplify: no Clerk export; the 6 users are forced to set a password at first login (no bulk email)** · WhatsApp codes from the **Conveys number** · **internal review only** (no external pen test).

Still open (none of these blocks Phases 0–3):
0. **Meta app for Facebook Login:** add Facebook Login to the existing WBMSG Meta app (used for WhatsApp embedded signup) or create a separate one? *(My default: a separate "WBMSG Login" app, so a login-related review or restriction can't touch the WhatsApp business app.)*
1. ~~SMS provider~~: not needed (SMS dropped).
2. **Bot protection:** Cloudflare Turnstile on sign-up and after failed attempts? *(My default: yes.)*
3. **Session length:** 30 days for customers, 12 hours for super admins. *(My default.)*
4. **Cutover date** (maintenance window). Decided at Phase 5 with the support team.

## 12. Risks
| Risk | Mitigation |
|---|---|
| User can't receive the setup code | Support checks the email address in the DB; the code can be re-requested (3 / 10 min) |
| Old mobile builds break at cutover | New build shipped at least 1 week earlier + `426` version gate |
| Security bug in our own auth | Standard primitives only, TDD, ASVS L2 checklist, internal security review + ZAP scan + abuse-test suite (no external pen test, by owner decision; residual risk accepted), `AUTH_PROVIDER` flag for rollback |
| Email deliverability (codes via GoDaddy SMTP) | Monitor bounce/failure; WhatsApp code as alternative; SPF/DKIM check before Phase 5 |
| Meta rejects the Authentication template | Submit in Phase 1 so approval is ready by Phase 4; email code is the fallback |
| Late rollback needed | Clerk accounts untouched until Phase 6; 6 users handled by support |
