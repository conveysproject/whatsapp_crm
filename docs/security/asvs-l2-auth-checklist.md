# OWASP ASVS Level 2: authentication checklist (own-auth, Phase 1 API core)

Scope: the `/v1/auth/*` API, `apps/api/src/auth/*`, the auth plugin and the impersonation guard, as of Phase 1 (API only; `AUTH_PROVIDER` unset = Clerk, so nothing here is live for customers until cutover). Spec: `docs/prd-own-auth.md` §4.8, §7, §8. Chapters: V2 (Authentication) and V3 (Session Management).

Status values: **met** (implemented and tested in Phase 1), **Phase 2-5** (belongs to a later phase, named), **open (deferred)** (known gap accepted for now, owner named in the notes), **N/A** (reason given).
Evidence is a file plus function or test name (line numbers drift). `abuse.test.ts` = `apps/api/src/auth/abuse.test.ts`.

## V2 Authentication

### V2.1 Password security

| Req | Requirement | Status | Evidence / reason |
|---|---|---|---|
| 2.1.1 | Passwords are at least 12 characters (ASVS 4.0.3) | deviation (PRD decision) | We enforce a minimum of 8 (`password.ts` `checkPasswordPolicy`; `password.test.ts`), owner-approved in PRD §4.8. Risk: shorter passwords are easier to guess. Mitigated by lockout, rate limits and argon2id. |
| 2.1.2 | Passwords of 64 characters or more are allowed; over 128 may be denied | met | `PASSWORD_MAX_LENGTH` = 128; `checkPasswordPolicy` |
| 2.1.3 | No truncation; only consecutive spaces may be collapsed | met (code-read only) | The full string goes to argon2; no trimming or collapsing in `hashPassword`. |
| 2.1.4 | All printable Unicode, including spaces, allowed | met (code-read only) | Length-only policy in `checkPasswordPolicy`, no character filter |
| 2.1.5 | Users can change their password | met | `POST /v1/auth/password/change` (`routes/password.ts`); `password.test.ts` |
| 2.1.6 | Change requires current and new password | met | Same route; current password verified with argon2 unless the account is flagged `mustSetPassword` (invited or migrated users with no usable password) |
| 2.1.7 | New passwords checked against breached lists | Phase 2-5 | PRD §4.8 range query (k-anonymity), fail-open. Not in Phase 1; tracked for the web phase |
| 2.1.8 | Strength meter offered | Phase 2-5 | UI (web and mobile) |
| 2.1.9 | No composition rules | met | `password.test.ts` (length-only policy) |
| 2.1.10 | No periodic rotation | met (code-read only) | No expiry logic exists |
| 2.1.11 | Paste and password managers allowed | Phase 2-5 | UI |
| 2.1.12 | Option to show the typed password | Phase 2-5 | UI |

### V2.2 General authenticator security

| Req | Requirement | Status | Evidence / reason |
|---|---|---|---|
| 2.2.1 | Anti-automation against credential stuffing and brute force | met | 5 failures / 15 min lock with doubling backoff (`limits.ts` `recordPasswordFailure`, `isLocked`); 20 requests / 10 min per IP on credential routes (`routes/index.ts` `credentialRoutes`); 3 codes / 10 min per target (`codes.ts` `issueCode`). Tests: `abuse.test.ts` "brute force", `lockout.test.ts`, `limits.test.ts` |
| 2.2.1b | Bot protection on signup and after failures | Phase 2-5 | Cloudflare Turnstile (PRD §4.8, open question §11); web phase |
| 2.2.2 | Weaker methods (SMS, email) are not the only strong factor | N/A | Email and WhatsApp codes are first-factor alternatives and new-device confirmations, not an MFA claim. Platform admins get a code on every new session (`signin.ts` new-device flow) |
| 2.2.3 | Users notified of security-relevant changes | met (partial) | Password-changed email on reset and change (`emails.ts` `sendPasswordChangedEmail`; `password.test.ts`). New-device sign-in sends a confirmation code. Social link/unlink and phone-change notices: Phase 3-4 |
| 2.2.4 | Impersonation resistance of phishing-resistant factors | N/A | No MFA/WebAuthn at L2 scope for this project |
| 2.2.5, 2.2.6, 2.2.7 | Out-of-band verifier requirements | N/A | No CSP/TLS-terminating verifier or authenticator-bound channels in this module |

### V2.3 Authenticator lifecycle

| Req | Requirement | Status | Evidence / reason |
|---|---|---|---|
| 2.3.1 | System-generated initial passwords are random and single use | N/A | No initial passwords are generated. Invited and migrated users get `mustSetPassword` and must set one through a `password_reset` code (`signin.ts` `next:"set_password"`; `password.ts` reset clears the flag) |

### V2.4 Credential storage

| Req | Requirement | Status | Evidence / reason |
|---|---|---|---|
| 2.4.1 | Passwords stored with an approved salted one-way function | met | argon2id, per-hash random salt, `memoryCost=65536` KiB, `timeCost=3`, `parallelism=1` (`password.ts` `PARAMS`). Test: `password.test.ts` |
| 2.4.2 | Salt at least 32 bits, random | met (code-read only) | argon2 library generates a 16-byte random salt per hash; not asserted by a test |
| 2.4.3 | Iteration/work factor meets current guidance | met | Parameters above exceed the OWASP argon2id minimum (19 MiB, t=2). Load-test of p95 is a PRD §8 gate (Phase 5) |
| 2.4.4 | Work factor can be raised; rehash on login | met | `verifyPassword` returns `needsRehash`; sign-in rewrites the hash (`signin.ts`) |
| 2.4.5 | Additional secret (pepper) | met (codes) / N/A (passwords) | One-time codes use HMAC-SHA256 with `AUTH_CODE_PEPPER` (`codes.ts` `hashCode`). Password hashes rely on argon2 salt, which is within the requirement |

### V2.5 Credential recovery

| Req | Requirement | Status | Evidence / reason |
|---|---|---|---|
| 2.5.1 | No plaintext or reversible recovery secret | met (code-read only) | Codes are HMAC-hashed at rest (`codes.ts` `hashCode`); no password hints or security questions exist |
| 2.5.2 | No password hints or knowledge-based answers | met (code-read only) | None implemented |
| 2.5.3 | Recovery does not reveal the current password | met | `password.test.ts` (reset sets a new hash only) |
| 2.5.4 | No shared or default accounts | met (code-read only) | Accounts are created per user; migration creates them from the `users` table |
| 2.5.5 | User notified when an authenticator changes | met | `sendPasswordChangedEmail` on reset and change |
| 2.5.6 | Recovery uses a secure channel, no weaker than the primary method | met | Emailed 6-digit code, 10 min expiry, 5 attempts, single use (`codes.ts`); `abuse.test.ts` "one-time codes" |
| 2.5.7 | Lost authenticator recovery does not bypass MFA | N/A | No MFA enrolment in scope |

### V2.6 Look-up secret verifier / V2.7 Out-of-band verifier

| Req | Requirement | Status | Evidence / reason |
|---|---|---|---|
| 2.6.x | Look-up secrets (recovery codes) | N/A | Not offered |
| 2.7.1 | Out-of-band authenticators are not SMS/PSTN unless restricted | met (email) / Phase 2-5 (WhatsApp) | Email codes only in Phase 1. WhatsApp code sign-in and phone verify: Phase 4 (Meta Authentication template) |
| 2.7.2 | Out-of-band code expires within 10 minutes | met | `CODE_TTL_MS` = 600 000 (`codes.ts`) |
| 2.7.3 | Out-of-band code is single use | met | `consumedAt` set atomically; `abuse.test.ts` "a signup code cannot be replayed" |
| 2.7.4 | Code transport is independent and authenticated | met | Mail through `sendMail`; Railway to Vercel HTTPS relay (see email architecture note) |
| 2.7.5 | Only a hash of the code is stored | met | `codes.ts` `hashCode`; the plaintext exists only in the email |
| 2.7.6 | Code has at least 20 bits of entropy, or is rate limited | met | 6 digits (about 20 bits) from CSPRNG `randomInt`, plus 5 attempts per code and 3 issues / 10 min per target; `abuse.test.ts` "stops working after 5 wrong guesses" |

### V2.8 One-time verifier

| Req | Requirement | Status | Evidence / reason |
|---|---|---|---|
| 2.8.x | TOTP/hardware OTP | N/A | Not offered |

### V2.9, V2.10 Cryptographic verifier and service authentication

| Req | Requirement | Status | Evidence / reason |
|---|---|---|---|
| 2.9.x | Cryptographic authenticators (WebAuthn) | N/A | Not offered |
| 2.10.1 | No hardcoded or default service secrets | met | Keys and pepper come from env (`AUTH_JWT_PRIVATE_KEY`, `AUTH_CODE_PEPPER`, `AUTH_BFF_SECRET`); `pepper()` throws if shorter than 32 bytes. `DUMMY_HASH` in `signin.ts` is a public throwaway hash used only for timing parity |
| 2.10.2, 2.10.3, 2.10.4 | Service credentials stored safely and not in source | met | Env only; secrets never logged (routes log error names only). Generation script: `apps/api/scripts/gen-auth-keys.ts` |

### Other V2 items tied to Phase 1 decisions

| Item | Status | Evidence / reason |
|---|---|---|
| No user enumeration (signup, signin, code request, forgot) | met | Signup, code request and forgot answer `202 {"ok":true}` before any lookup; password sign-in runs a dummy argon2 verify and pads to at least 300 ms. Tests: `abuse.test.ts` "user enumeration"; per-route tests |
| Timing floor for password sign-in | met, with watch item | Floor 300 ms (`signin.ts` `padTo`). Task 9 deferred: padding may be exceeded under load on known-account paths; measure p99 before cutover (Phase 5) |
| Generic error body for bad credentials | met | `INVALID_CREDENTIALS` identical for unknown, wrong password, locked, unverified and inactive accounts |
| Login audit (success/fail, IP, UA) | met | `login_logs` writes in `signin.ts` `logAttempt` |
| Audit-log entries for password change, session revoke, social link, phone verify | open (deferred) | PRD §7 asks for audit-log rows; only `login_logs` and security emails exist in Phase 1. Add in the phase that ships the matching UI (2 for password/sessions, 3 for social, 4 for phone) |
| Social login (Google, Facebook): state, PKCE, open redirect | Phase 2-5 | Phase 3; abuse suite adds CSRF and open-redirect cases then (PRD §8) |
| CSRF on the BFF cookie routes | Phase 2-5 | Phase 2: same-origin `Origin` check plus SameSite cookies (PRD §4.4). The API itself is Bearer-only and not cookie-based |
| Trusted IP for rate limits behind the Vercel BFF | met (API) / Phase 2-5 (BFF) | `limits.ts` `authClientIp` honours `x-wbmsg-client-ip` only with a matching `x-wbmsg-bff` secret (`limits.test.ts`; `abuse.test.ts` "ignores spoofed client-IP headers"). The BFF must send both headers and `AUTH_BFF_SECRET` must be set on Railway and Vercel (Task 8 follow-up, Phase 2) |
| Rate limiter outage behaviour | open (deferred) | A Redis failure in the per-IP `onRequest` hook answers 500 on `/v1/auth/*` (fail closed). Decide fail-open versus closed before cutover (Task 8) |

## V3 Session management

### V3.1 Fundamental

| Req | Requirement | Status | Evidence / reason |
|---|---|---|---|
| 3.1.1 | Session tokens are never exposed in URLs | met (code-read only) | Tokens travel in the JSON body, `Authorization` header, or the BFF cookie (Phase 2); no route takes a token in the query string |

### V3.2 Session binding

| Req | Requirement | Status | Evidence / reason |
|---|---|---|---|
| 3.2.1 | A new session token is generated on authentication | met | Every sign-in, signup verify and reset creates a new session row, refresh token and access token (`sessions.ts` `createSession`) |
| 3.2.2 | Tokens have at least 64 bits of entropy | met | Refresh token = 32 CSPRNG bytes (256 bits), stored as SHA-256 hex only (`sessions.ts`). Access token is a signed JWT |
| 3.2.3 | Tokens stored in the browser only in secure ways | Phase 2-5 | Phase 2: refresh token in an httpOnly, Secure, SameSite=Lax cookie via the BFF; access token in memory only (PRD §4.4). Mobile: SecureStore |
| 3.2.4 | Tokens generated with approved cryptographic algorithms | met | EdDSA (Ed25519) access tokens, `algorithms: ["EdDSA"]` pinned on verify (`tokens.ts`); `alg:none` rejected (`abuse.test.ts`) |

### V3.3 Session termination

| Req | Requirement | Status | Evidence / reason |
|---|---|---|---|
| 3.3.1 | Logout invalidates the session server-side | met | `POST /v1/auth/signout` marks the row revoked and sets a Redis marker; the access token stops working (`session.test.ts`; `abuse.test.ts` "rejects a token whose session was revoked") |
| 3.3.2 | Re-authentication after the idle or absolute timeout | met | User sessions: 30 days sliding; admin sessions: 12 h absolute (`sessions.ts`). Access token TTL 600 s |
| 3.3.3 | Option to end all other sessions after a credential change | met | Reset revokes all sessions; change revokes all except the current one (`routes/password.ts`); `POST /sessions/revoke-all` |
| 3.3.4 | Users can view and end their sessions | met | `GET /sessions`, `DELETE /sessions/:id` (owner-scoped, 404 for another account's id), `POST /sessions/revoke-all` |
| Open sockets close when a session is revoked | open (deferred, load-bearing) | Task 7 follow-up. Socket.IO connections stay open after revoke, which breaks PRD acceptance #6 ("sign out everywhere within 60 s"). Must be handled before cutover (Phase 2 or the final wave) |
| Revocation marker durability | open (deferred) | `markRevoked` failure after the DB revoke rejects the caller (Task 5); `revokeAll`/`revokeFamily` read-then-update is not atomic, bounded by the 600 s access-token TTL (Tasks 5, 11). Reset hash update and `revokeAllSessions` are not one transaction (Task 12). Accepted for Phase 1 |

### V3.4 Cookie-based session management

| Req | Requirement | Status | Evidence / reason |
|---|---|---|---|
| 3.4.1 to 3.4.5 | Secure, HttpOnly, SameSite, `__Host-` prefix, path scoping | Phase 2-5 | The API sets no cookies. The Next BFF owns the refresh cookie (Phase 2) |

### V3.5 Token-based session management

| Req | Requirement | Status | Evidence / reason |
|---|---|---|---|
| 3.5.1 | Users can revoke OAuth/refresh tokens tied to devices | met | Session list and revoke routes above |
| 3.5.2 | Stateless tokens verified before trust; claims checked | met (signature, alg, iss, aud, exp when present) - see deferred row below | `verifyAccessToken` in `tokens.ts` checks signature, EdDSA only, `iss="wbmsg"`, `aud="wbmsg-api"`, `kid` lookup, `typ` shape; session must not be revoked (`identity.ts` `verifyBearer`). Tests: `tokens.test.ts`, `abuse.test.ts` "access tokens" |
| 3.5.2b | Token verification hardening (Task 4) | open (deferred - fix in final wave) | `jwtVerify` lacks `requiredClaims` [exp, iat, sub] and does not reject an empty `sub`; no check that the private key is Ed25519; no error on a half-set previous key pair or on previous kid equal to current kid |
| 3.5.3 | Stateless tokens do not carry sensitive data; reference tokens preferred for sessions | met | Claims are `sub`, `sid`, `typ` only; the long-lived credential is an opaque, hashed, rotating refresh token |
| Refresh rotation and reuse detection | met | Rotate on every use; reuse after the 10 s grace revokes the family (`sessions.ts` `rotateRefreshToken`). Test: `abuse.test.ts` "refresh token reuse" |
| Rotation does not recheck `expiresAt` inside the conditional update | open (deferred, ms window) | Task 5 |
| Public key distribution and rotation | met | `GET /v1/auth/.well-known/jwks.json` (public keys only, `Cache-Control: public, max-age=300`); previous key kept verifiable via `AUTH_JWT_PREVIOUS_*`. Tests: `abuse.test.ts` "JWKS", `tokens.test.ts` |

### V3.6 Re-authentication and V3.7 Defenses against session abuse

| Req | Requirement | Status | Evidence / reason |
|---|---|---|---|
| 3.6.x | Re-authentication for sensitive operations | met (partial) | Password change requires the current password. Sensitive actions that appear later (phone change, social unlink) are Phase 3-4 |
| 3.7.1 | Valid session required for sensitive transactions | met | `/password/change`, `/sessions*`, `/signout`, `/me/security` need a verified Bearer plus `request.auth.sid` (`requireSid`, `NO_SESSION` otherwise) |
| Impersonation cannot touch the target's auth | met | `/v1/auth` is in `BLOCKED_PREFIXES` (writes) and `BLOCKED_GET_PREFIXES` (reads) in `lib/impersonation-guard.ts`; the impersonation bearer must be the issuing admin's own `typ=admin` session. Test: `abuse.test.ts` "is refused while a super admin impersonates" |
| Mobile minimum version gate | met (UX nudge, not a security boundary) | `AUTH_MIN_MOBILE_VERSION` (`identity.ts` `mobileUpgradeRequired`) trusts client-asserted `x-app-client`/`x-app-version` headers, so it only steers honest clients to upgrade; a malformed value silently disables the gate (deferred: warn at boot, Task 7) |

## Security audit note (Phase 1 route inventory)

Rule: every new `/v1/auth` route is either **public with limits and no enumeration**, or **authenticated and scoped to `request.auth.userId`**. No route reads or writes another account's rows: authenticated handlers filter by `request.auth.userId` (taken from the verified token, never from the body, query or params), and the only client-supplied id (`DELETE /sessions/:id`) is matched together with `accountId = request.auth.userId`, answering 404 otherwise. Org scoping does not apply to pre-auth routes; enumeration and rate-limit checks apply instead. Roles, permissions, `resolveAuthContext` and org scoping are unchanged.

| Route | Class | Limits and notes |
|---|---|---|
| `POST /signup` | public, limited | 20 / 10 min per IP; always `202 {"ok":true}` before lookup; existing accounts never get their password or names overwritten |
| `POST /signup/verify` | public, limited | per-IP; 5 attempts per code; single use |
| `POST /signin/password` | public, limited | per-IP; 5 failures / 15 min per account then lock; identical 401 body; padded to 300 ms; dummy hash for unknown emails |
| `POST /signin/new-device` | public, limited | per-IP; code bound to purpose `new_device` (cross-purpose rejected) |
| `POST /signin/code/request` | public, limited | per-IP; 3 codes / 10 min per target; always `202` |
| `POST /signin/code/verify` | public, limited | per-IP; 5 attempts; identical 400 body, padded |
| `POST /password/forgot` | public, limited | per-IP; 3 codes / 10 min per target; always `202` |
| `POST /password/reset` | public, limited | per-IP; code bound to `password_reset`; revokes all sessions |
| `POST /refresh` | public, own limit | 300 / 10 min per IP (`auth:ipr:`); 256-bit opaque token; reuse revokes the family; infrastructure errors answer 503, not 401 |
| `GET /.well-known/jwks.json` | public, no credentials | Public keys only (no `d`), cacheable 300 s; deliberately outside the credential limiter, app-wide limiter still applies |
| `POST /signout` | authenticated, own session | scoped to `request.auth.sid` |
| `GET /sessions` | authenticated, own account | `accountId = request.auth.userId` |
| `DELETE /sessions/:id` | authenticated, own account | `id` AND `accountId = request.auth.userId`; foreign id gives 404 |
| `POST /sessions/revoke-all` | authenticated, own account | keeps the current session |
| `POST /password/change` | authenticated, own account | needs current password (unless `mustSetPassword`); revokes other sessions |
| `GET /me/security` | authenticated, own account | one account row by `request.auth.userId`; OAuth links expose provider names only, never `providerSub`; no hashes |

Phase 2-5 routes (not yet present, to be added to this table with their class when built): `POST /signin/whatsapp/*`, `GET /oauth/:provider/start|callback`, `DELETE /oauth/:provider`, `POST /phone/verify/*`.

## Decisions recorded from the Phase 1 reviews

- Re-signup of an existing unverified account only re-sends a code (no overwrite): prevents pre-account hijack. A user who mistypes a password at signup uses reset.
- Auth endpoints always return `refreshToken` in the JSON body; the Next BFF moves it into an httpOnly cookie.
- A locked user who submits a valid email code burns that code (fails closed, accepted, Task 10).
- A users-table lookup failure answers 503 during a DB outage, which reveals existence only while the DB is down (accepted fail-closed, Tasks 9 and 10).
- The new-device step does not re-check lock, `emailVerifiedAt` or `mustSetPassword` after the password step (code single use, 10 min; accepted, Task 9).
- Reset should also compare the code's `accountId` with the looked-up account (future email-change safety; hardening, Task 12).
- `issueCode` throttle, invalidate and create are not one transaction: a burst can exceed 3 sends by a small bounded amount (Task 6).
- `settleSignupWork`-style test hooks are exported from production modules (Task 8): harmless, cleanup later.
- `@node-rs/argon2` Linux prebuilt on the Railway build must be confirmed at the first deploy (Task 3).
- Remaining test gaps (Task 12): reset for a disabled account; change with a null hash and no flag; client reset with no users row.
- Task 2 deferred check: SQL migration versus `schema.prisma` drift is not machine-verified (no shadow DB). Verify with `prisma migrate status` at the Phase 1 exit deploy.
