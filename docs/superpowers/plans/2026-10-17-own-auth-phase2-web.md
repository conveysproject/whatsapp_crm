# Own Auth Phase 2 (Web + API integration) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The web app (and the API pieces it needs) can run entirely on WBMSG's own login, switchable per build by `NEXT_PUBLIC_AUTH_PROVIDER`, with Clerk still the default until cutover.

**Architecture:** The web app keeps calling the API directly with a Bearer access token (119 components use `useAuth().getToken()`), so a drop-in `useAuth()` facade hides the provider. A Next.js backend-for-frontend (`/api/auth/*`) is the only caller of `/v1/auth/*`. It keeps the refresh token and device id in httpOnly cookies and a short-lived access token in an httpOnly cookie that server code reads. The middleware refreshes that cookie on navigation, and the API's 10 s refresh grace window absorbs races. API changes make `/register`, invitations, super-admin creation and live sockets work in `wbmsg` mode.

**Tech Stack:** Next.js 15 (App Router, middleware), React 18, TanStack Query, `jose` (JWKS verification on the web side), Vitest (node environment), Fastify API, Socket.IO.

**Spec:** `docs/prd-own-auth.md` (§4.4 web, §4.6 flows, §4.8 abuse, §7 security). Phase 1 plan and interfaces: `docs/superpowers/plans/2026-10-17-own-auth.md`. Security checklist: `docs/security/asvs-l2-auth-checklist.md`.

## Design decisions (this phase)

| # | Decision | Why |
|---|---|---|
| D1 | **Dual mode in the web app.** `NEXT_PUBLIC_AUTH_PROVIDER=clerk` (default) or `wbmsg`, read at build time. One facade (`@/lib/auth/client`, `@/lib/auth/server`) picks Clerk or WBMSG. Clerk code is deleted in Phase 6. | `main` stays deployable and mergeable; cutover = set env on Vercel + API, redeploy. |
| D2 | **Cookies set by the BFF** (all `HttpOnly; Secure; SameSite=Lax`): `wb_rt` refresh token, path `/`, 30 days; `wb_dev` device id, path `/`, 90 days; `wb_at` access token, path `/`, max-age 600. | No token is ever readable by page JS (httpOnly), and none is sent to the API domain (the browser sends only the in-memory access token there). The refresh cookie must be on `/` so the middleware receives it on page navigations (D4); server components read `wb_at`. |
| D3 | **Client access token** comes from `GET /api/auth/token`. It returns `{ accessToken, expiresAt }` from `wb_at`, refreshing first when under 60 s remain. The client keeps it in memory only and dedupes concurrent calls. | `getToken()` keeps its current contract (`Promise<string \| null>`). |
| D4 | **Middleware** (wbmsg mode): public-route list unchanged. On a protected route with no valid `wb_at` but a `wb_rt`, it refreshes against the API (shared helper with the BFF `token` action) and sets the new cookies on the response. With no session it redirects to `/sign-in?redirect_url=…`. `/admin/*` redirects to `/admin/sign-in`. | Server components always have a fresh `wb_at`. |
| D5 | **Server identity** (`auth()` facade, wbmsg): verify `wb_at` with `jose` against the API JWKS (`createRemoteJWKSet`, cached), returning `{ userId, sid, typ, getToken }`. Never trust an unverified decode for identity. | The impersonation and email-send routes act on `userId`. |
| D6 | **CSRF:** every non-GET `/api/auth/*` handler requires `Origin` to equal the app origin; cookies are `SameSite=Lax`. | No token-based CSRF needed. |
| D7 | **BFF → API headers:** `x-wbmsg-bff: AUTH_BFF_SECRET`, `x-wbmsg-client-ip` (from `x-forwarded-for` on Vercel), `user-agent` passthrough. | Required by the Phase 1 `authClientIp`. |
| D8 | **Pages reuse the existing sign-in/sign-up layout** (left marketing panel, right card) with our own form in place of the Clerk widget. No new visual system. | Owner rule: show only existing patterns. |
| D9 | **Invitations (wbmsg):** a new public `POST /v1/auth/invitations/:token/accept` creates the account (email verified: the link proves ownership), the user row with the invitation role and team, and a session. If an account already exists for that email, it returns `409 ACCOUNT_EXISTS` and the page asks the person to sign in. The signed-in path keeps `POST /v1/invitations/:token/accept`, which in wbmsg mode takes the identity from the bearer (never the body) and requires a matching email and no existing user row. | Removes the body-supplied user id. |
| D10 | **`/register` (wbmsg):** email and names come from `auth_accounts`, not the request body. | Today the client sends the email it claims. |
| D11 | **Super admins (wbmsg):** bootstrap and "create super admin" create an `auth_accounts` row with `must_set_password=true` (email verified). The new admin uses **Forgot password** to set it. No temp password. | Matches the owner's forced-setup flow. |
| D12 | **Sockets close on revoke.** The socket handshake records `sid`; session revocation calls a registered listener that disconnects sockets in room `sid:<id>`. | PRD acceptance #6 (load-bearing follow-up from Phase 1). |
| D13 | **Turnstile** is built behind env: the API verifies `turnstileToken` on `/signup`, `/signin/code/request` and `/password/forgot` only when `TURNSTILE_SECRET_KEY` is set; the web renders the widget only when `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is set. | Ships now, switched on when the owner creates the free Cloudflare keys. |
| D14 | **Live-update org id** comes from `useCurrentUser().user.organizationId` (`GET /v1/users/me` already returns it), not Clerk's `useOrganization()`. | Clerk org ids are not our org ids (`TopBar.tsx:18-21`). |

## Global Constraints

- Default stays Clerk: with `NEXT_PUBLIC_AUTH_PROVIDER` unset or `clerk`, web behavior and output are unchanged. With API `AUTH_PROVIDER` unset, all new API paths keep today's behavior.
- Facade contract: `useAuth()` returns `{ isLoaded: boolean; isSignedIn: boolean; userId: string | null; getToken: () => Promise<string | null>; signOut: (opts?: { redirectUrl?: string }) => Promise<void> }`. Server `auth()` returns `{ userId: string | null; getToken: () => Promise<string | null> }`.
- Never store any token in `localStorage`/`sessionStorage`; never log tokens, codes, cookies or secrets.
- Web tests run in Vitest `environment: "node"` and live under `app/`, `components/` or `lib/` as `*.test.ts`; put logic in plain functions that can be tested without a browser.
- API rules from Phase 1 apply: 202-before-work for request endpoints, padded failures, `authClientIp`, `normalizeEmail`, P2002 as existing, credential routes inside `credentialRoutes`.
- User-facing copy: plain language, no mention of Clerk or competitors.
- New env vars (never committed): web `NEXT_PUBLIC_AUTH_PROVIDER`, `AUTH_BFF_SECRET`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (optional), `AUTH_JWKS_URL` (default `${API_URL}/v1/auth/.well-known/jwks.json`); API `TURNSTILE_SECRET_KEY` (optional).

## Review Focus

1. **Two tabs, expired access token, simultaneous navigation and `getToken()`**: both refresh at once; the user must stay signed in (API grace window + client dedupe). Tested in Tasks 7 and 9.
2. **Signed out in one tab**: the other tab's next `getToken()` returns `null` and the UI routes to `/sign-in`, not an error loop. Tested in Task 9.
3. **Open redirect**: `redirect_url` must be a same-origin relative path; anything else falls back to `/dashboard`. Tested in Task 8.
4. **Invitation for an email that already has an account**: no second account, clear "sign in to accept" path. Tested in Task 2.
5. **Clerk mode untouched**: every facade and page renders the Clerk path when the flag is unset. Tested in Tasks 9 and 10.

---

## File structure

```
API (apps/api/src)
  routes/register.ts                 T1  wbmsg identity from auth_accounts
  auth/routes/invitations.ts         T2  POST /v1/auth/invitations/:token/accept (new)
  routes/invitations.ts              T2  signed-in accept: wbmsg branch
  routes/super-admins.ts, routes/bootstrap.ts, routes/admin.ts   T3
  auth/session-events.ts             T4  onSessionRevoked(listener) registry (new)
  auth/sessions.ts, plugins/socketio.ts, lib/socket-auth.ts      T4
  auth/turnstile.ts                  T5  verifyTurnstile() (new)

Web (apps/web)
  lib/auth/config.ts                 T6  authProvider(), cookie names, API urls
  lib/auth/jwt.ts                    T6  accessTokenExpiry(), verifyAccessToken() (JWKS)
  lib/auth/bff.ts                    T7  callAuthApi(), setSessionCookies(), clearSessionCookies(), requireSameOrigin()
  app/api/auth/[...action]/route.ts  T7  BFF handlers
  lib/auth/redirect.ts               T8  safeRedirect()
  middleware.ts                      T8
  lib/auth/client.tsx                T9  AuthProvider, useAuth() facade
  lib/auth/server.ts                 T9  auth() facade
  app/layout.tsx + ~150 import swaps T9
  app/(auth)/sign-in, sign-up, forgot-password, reset-password pages; components/auth/* forms   T10
  app/admin/sign-in/page.tsx         T10
  app/(setup)/business-details/page.tsx, components/layout/ProfileMenu.tsx, components/layout/TopBar.tsx,
  app/admin/(protected)/_components/admin-sign-out.tsx, app/invitations/[token]/accept/page.tsx,
  app/api/invitations/accept/route.ts                                   T11
  app/(dashboard)/settings/security/page.tsx (+ settings tile)          T12
  app/api/internal/send-email/route.ts, app/api/email/send, app/api/impersonation, app/api/billing/*   T13
  e2e/fixtures/auth-wbmsg.ts, e2e/tests/auth-wbmsg.spec.ts              T14
```

---

## API tasks (do first; web tasks depend on them)

### Task 1: `/register` identity from `auth_accounts` (wbmsg)

**Files:** Modify `apps/api/src/routes/register.ts`; Test `apps/api/src/routes/register.test.ts`.

- [ ] **Step 1: Failing tests** (wbmsg mode, `verifyBearer` mocked to `{ userId: "usr_a", sid: "s1", typ: "user" }`, `authAccount.findUnique` → `{ email: "a@x.com", firstName: "Ann", lastName: "Lee", emailVerifiedAt: date }`): body `email: "evil@x.com", firstName: "Eve"` → `user.create` receives `email: "a@x.com"`, `fullName: "Ann Lee"`; account missing or unverified → `403 { error: { code: "EMAIL_NOT_VERIFIED" } }`; clerk mode → existing tests unchanged (body email still used).
- [ ] **Step 2:** Run `npx vitest run src/routes/register.test.ts` → new tests FAIL.
- [ ] **Step 3:** In wbmsg mode (`isWbmsgAuth()`), load the account by `userId` and use its email and names; ignore body `email/firstName/lastName`.
- [ ] **Step 4:** Run → PASS. **Step 5: Commit** `feat(auth): register takes identity from auth_accounts in wbmsg mode`

### Task 2: Invitations (wbmsg)

**Files:** Create `apps/api/src/auth/routes/invitations.ts` (+ test); register it inside `credentialRoutes`; modify `apps/api/src/routes/invitations.ts` accept route (+ test).

**Interfaces — Produces:**
- `POST /v1/auth/invitations/:token/accept` body `{ firstName, lastName, password, mobileNumber?, client: "web" | "mobile" }`:
  - invalid, expired or non-pending token → padded `400 { error: { code: "INVALID_INVITATION", message: "This invitation link is invalid or has expired." } }`
  - weak password → `400 WEAK_PASSWORD`
  - an account already exists for the invitation email → `409 { error: { code: "ACCOUNT_EXISTS", message: "You already have an account. Sign in to accept this invitation." } }`
  - success, in one `$transaction`: create `auth_accounts` (`email` = invitation email normalized, `emailVerifiedAt` now, argon2 hash), create `users` (id = account id, org, role, team/teamRole from the invitation, `fullName`, `mobileNumber`), mark the invitation `accepted`; then `createSession` + `trustDevice` → `201 { accessToken, refreshToken, expiresIn: 600, deviceId, organizationId }`. P2002 on the account → the same 409.
- `POST /v1/invitations/:token/accept` in wbmsg mode: requires an authenticated bearer (no longer `public` in wbmsg mode; keep `public` + the old body in clerk mode). Identity = `request.auth`-style `verifyBearer` userId. The account email must equal the invitation email (`403 EMAIL_MISMATCH`), and no `users` row may exist for that id (`409 ALREADY_MEMBER`). Body `{ fullName, mobileNumber? }`.

- [ ] **Step 1: Failing tests** for every bullet above (including the transaction rollback when the user create fails, and that `clerkUserId` in the body is ignored in wbmsg mode).
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run `npx vitest run src/auth src/routes/invitations.test.ts` → PASS; also `src/lib/impersonation-guard.test.ts` (the new POST is under `/v1/auth`, already blocked).
- [ ] **Step 5: Commit** `feat(auth): invitation accept without Clerk`

### Task 3: Super admins without Clerk (wbmsg)

**Files:** Modify `apps/api/src/routes/super-admins.ts`, `apps/api/src/routes/bootstrap.ts`, `apps/api/src/routes/admin.ts` (~line 674 cleanup check); tests beside them.

- [ ] **Step 1: Failing tests** (wbmsg mode): create super admin → `auth_accounts` row created with `mustSetPassword: true`, `emailVerifiedAt` set, id `newAccountId()`; `users` row uses that id; **no** Clerk call (`clerk-admin.js` mocked, assert not called); the response no longer contains a temp password; an existing account for that email → reuse its id (no duplicate). Bootstrap: same. Admin cleanup: "has valid users" = an `auth_accounts` row exists for the user id (no Clerk call). Clerk mode: existing tests unchanged.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement behind `isWbmsgAuth()`. **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** `feat(auth): super-admin creation and org cleanup without Clerk in wbmsg mode`

### Task 4: Disconnect sockets on session revoke

**Files:** Create `apps/api/src/auth/session-events.ts` (+ test); modify `auth/sessions.ts`, `lib/socket-auth.ts`, `plugins/socketio.ts` (+ tests).

**Interfaces — Produces:** `onSessionsRevoked(listener: (sessionIds: string[]) => void): () => void` and `emitSessionsRevoked(sessionIds: string[]): void` (listener errors caught and logged by name). `authenticateSocket` returns `{ userId, organizationId, sid: string | null }`. The socket plugin joins each socket to room `sid:<sid>` when `sid` is set and registers a listener that runs `io.in("sid:<id>").disconnectSockets(true)`.

- [ ] **Step 1: Failing tests:** `revokeSession`, `revokeAllSessions` and family revoke (reuse) emit the revoked ids; the socket plugin disconnects only sockets in the matching room; clerk-mode sockets (sid null) never join a `sid:` room.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run `npx vitest run src/auth src/plugins src/lib` → PASS.
- [ ] **Step 5: Commit** `feat(auth): close live sockets when their session is revoked`

### Task 5: Turnstile verification (optional by env)

**Files:** Create `apps/api/src/auth/turnstile.ts` (+ test); modify `auth/routes/signup.ts`, `signin.ts` (code/request), `password.ts` (forgot) (+ tests).

**Interfaces — Produces:** `verifyTurnstile(token: string | undefined, ip: string): Promise<boolean>`. Returns `true` when `TURNSTILE_SECRET_KEY` is unset. Otherwise POST `https://challenges.cloudflare.com/turnstile/v0/siteverify` (`secret`, `response`, `remoteip`; 5 s timeout) and returns `success === true`. Network errors return `false` (fail closed).

- [ ] **Step 1: Failing tests:** unset secret → true without fetch; success/failure mapping; timeout → false. Routes: with the secret set and a bad or missing token → `400 { error: { code: "BOT_CHECK_FAILED", message: "Please complete the check and try again." } }` **before** the 202 (this reveals nothing about accounts); body field `turnstileToken` optional in the schemas.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** `feat(auth): optional Cloudflare Turnstile check on sign-up and code/reset requests`

---

## Web tasks

### Task 6: Auth config and JWT helpers

**Files:** Create `apps/web/lib/auth/config.ts`, `apps/web/lib/auth/jwt.ts` (+ tests). Add `jose` to apps/web.

**Interfaces — Produces:**
- `authProvider(): "clerk" | "wbmsg"` (from `process.env.NEXT_PUBLIC_AUTH_PROVIDER`, default `"clerk"`)
- `COOKIE = { refresh: "wb_rt", device: "wb_dev", access: "wb_at" } as const`; `ACCESS_MAX_AGE = 600`; `REFRESH_MAX_AGE = 2_592_000`; `DEVICE_MAX_AGE = 7_776_000`
- `apiBaseUrl(): string` (`API_URL` ?? `NEXT_PUBLIC_API_URL` ?? `http://localhost:4000`, no trailing slash)
- `accessTokenExpiry(token: string): number | null`: exp in ms from an unverified decode, used only for refresh timing; null if malformed
- `verifyAccessToken(token: string): Promise<{ userId: string; sid: string; typ: "user" | "admin" } | null>`: jose `jwtVerify` with `createRemoteJWKSet(AUTH_JWKS_URL)`, `algorithms: ["EdDSA"]`, `issuer: "wbmsg"`, `audience: "wbmsg-api"`; null on any failure

- [ ] **Step 1: Failing tests:** default provider is clerk; `accessTokenExpiry` on a sample token and on garbage; `verifyAccessToken` with a locally generated Ed25519 key served by a mocked JWKS fetch (valid → claims; wrong iss / expired / other key → null).
- [ ] **Step 2:** Run `pnpm --filter web exec vitest run lib/auth` → FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat(web-auth): config and token helpers`

### Task 7: BFF route handlers

**Files:** Create `apps/web/lib/auth/bff.ts`, `apps/web/app/api/auth/[...action]/route.ts` (+ `lib/auth/bff.test.ts`, `app/api/auth/route.test.ts`).

**Interfaces — Produces:**
- `requireSameOrigin(req: Request): boolean` (Origin equals `new URL(req.url).origin`)
- `callAuthApi(path: string, init: { method: string; body?: unknown; req: Request; bearer?: string }): Promise<Response>`: adds D7 headers
- `setSessionCookies(res: NextResponse, tokens: { accessToken: string; refreshToken: string; deviceId?: string })`, `clearSessionCookies(res)`
- Handlers (POST unless noted; each maps 1:1 to the API path and returns the API's status and body **with `refreshToken` stripped**; tokens go to cookies):

| BFF action | API | Sets cookies when |
|---|---|---|
| `sign-up` | `/v1/auth/signup` | never |
| `sign-up/verify` | `/v1/auth/signup/verify` (client `web`) | 200 |
| `sign-in/password` | `/v1/auth/signin/password` (adds `deviceId` from `wb_dev`) | 200 with tokens |
| `sign-in/new-device` | `/v1/auth/signin/new-device` | 200 |
| `sign-in/code/request`, `sign-in/code/verify` | `/v1/auth/signin/code/*` | verify 200 |
| `password/forgot`, `password/reset` (client `web`) | `/v1/auth/password/*` | reset 200 with tokens |
| `invitations/accept` | `/v1/auth/invitations/:token/accept` | 201 |
| `token` (GET) | `/v1/auth/refresh` when `wb_at` is missing or has under 60 s left | refreshed; 401 → clears cookies, returns `401 { accessToken: null }` |
| `sign-out` | `/v1/auth/signout` with bearer `wb_at` | always clears |

- [ ] **Step 1: Failing tests** (mock global `fetch`): cross-origin POST → 403 and no upstream call; `sign-in/password` 200 sets the three cookies with the D2 attributes and strips `refreshToken` from the body; `next:"new_device"` sets nothing; `token` with a fresh `wb_at` makes no upstream call; with a stale one it refreshes once even under two concurrent calls (Review Focus #1: the in-process dedupe map keyed by refresh token); refresh 401 clears cookies; API 503 on refresh → `503`, cookies kept; BFF headers present on every upstream call.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat(web-auth): backend-for-frontend auth routes`

### Task 8: Middleware (dual mode) and safe redirects

**Files:** Create `apps/web/lib/auth/redirect.ts` (+ test), `apps/web/lib/auth/middleware-wbmsg.ts` (+ test); modify `apps/web/middleware.ts`.

**Interfaces — Produces:** `safeRedirect(raw: string | null, fallback = "/dashboard"): string` (only same-origin paths starting with a single `/`; rejects `//`, `/\`, schemes and encoded variants). `wbmsgMiddleware(req: NextRequest): Promise<NextResponse>` implements D4 with the existing public-route list copied unchanged. `middleware.ts` exports Clerk's middleware when `authProvider() === "clerk"`, else `wbmsgMiddleware`.

- [ ] **Step 1: Failing tests:** `safeRedirect` table (`/inbox` ok; `//evil.com`, `https://evil.com`, `/\evil`, `%2F%2Fevil` → fallback) (Review Focus #3); middleware: public route passes; protected with fresh `wb_at` passes; stale `wb_at` + `wb_rt` → refreshes and sets cookies on the response; no session → redirect to `/sign-in?redirect_url=<path>`; `/admin/x` → `/admin/sign-in`; signed-in on `/` → `/dashboard`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat(web-auth): middleware for own sessions`

### Task 9: Client and server facades, provider switch, import codemod

**Files:** Create `apps/web/lib/auth/client.tsx`, `apps/web/lib/auth/server.ts`, `apps/web/lib/auth/token-store.ts` (+ `token-store.test.ts`); modify `apps/web/app/layout.tsx`; codemod every `import { useAuth } from "@clerk/nextjs"` → `from "@/lib/auth/client"` and every `import { auth } from "@clerk/nextjs/server"` → `from "@/lib/auth/server"`.

**Interfaces — Produces:**
- `createTokenStore(fetchToken: () => Promise<{ accessToken: string | null; expiresAt: number | null }>)` → `{ getToken(): Promise<string | null>; clear(): void }`. It caches in memory until 30 s before expiry, dedupes concurrent calls, and returns null after a 401.
- `AuthProvider` (wbmsg: loads `/api/auth/token` once; `userId` from `/api/v1/users/me` or a token decode; on `getToken() === null` after being signed in, routes to `/sign-in`) and `useAuth()` facade: Clerk's `useAuth` in clerk mode, ours in wbmsg mode, same contract (Global Constraints). `signOut` posts `/api/auth/sign-out`, clears the store and TanStack Query cache, then navigates.
- Server `auth()` facade: Clerk's `auth()` in clerk mode; in wbmsg mode reads `wb_at`, `verifyAccessToken`, returns `{ userId, getToken: async () => token }`.
- `layout.tsx` wraps with `ClerkProvider` in clerk mode, `AuthProvider` in wbmsg mode.

- [ ] **Step 1: Failing tests** (`token-store.test.ts`): cached until near expiry; two concurrent `getToken()` → one fetch (Review Focus #1); a 401 → null and subsequent calls re-fetch; after `clear()` → null without a fetch (Review Focus #2).
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement the store and facades; run the codemod (a node script in the scratchpad; review the diff: imports only); `ProfileMenu.tsx`'s `orgRole` use is removed in Task 11, so leave that file's import for Task 11.
- [ ] **Step 4:** Run `pnpm --filter web exec vitest run` and `pnpm --filter web exec tsc --noEmit` → PASS / 0 errors; `grep -rn 'from "@clerk/nextjs"' apps/web --include=*.tsx --include=*.ts` lists only `lib/auth/*`, `app/layout.tsx`, `middleware.ts`, the Clerk sign-in/up pages, and Task 11 files.
- [ ] **Step 5: Commit** `feat(web-auth): provider-agnostic useAuth and auth facades`

### Task 10: Sign-in, sign-up, forgot and reset pages; admin sign-in

**Files:** Create `apps/web/components/auth/` forms (`SignInForm.tsx`, `SignUpForm.tsx`, `CodeStep.tsx`, `ForgotPasswordForm.tsx`, `ResetPasswordForm.tsx`, `Turnstile.tsx`) and `apps/web/lib/auth/flows.ts` (+ `flows.test.ts`); create `app/(auth)/forgot-password/page.tsx`, `app/(auth)/reset-password/page.tsx`; modify the sign-in, sign-up and admin sign-in pages to render the Clerk widget in clerk mode and our form in wbmsg mode, inside the existing layout (D8).

**Interfaces — Produces:** `nextStep(response: { status: number; body: unknown }): { kind: "done" } | { kind: "new_device"; challengeId: string } | { kind: "set_password"; challengeId: string } | { kind: "error"; message: string }`: a pure mapper from BFF responses to UI steps.

Flows:
- Sign-in: email + password → done (redirect `safeRedirect(redirect_url)`), or a code step (new device), or set-password (reset form prefilled with the email, code already sent). An "Email me a code instead" link uses `sign-in/code/*`. A "Forgot password?" link goes to `/forgot-password`.
- Sign-up: names + email + password (+ Turnstile when configured) → "check your email" code step → `sign-up/verify` → `/business-details`.
- Forgot → reset: email → code + new password → signed in → `/dashboard`.
- Admin sign-in: same form styled as today's admin page; after success it checks `/v1/admin/super-admins/me` (existing logic) else shows the existing "Access denied".
- Copy: errors from API messages; never say whether an email exists.

- [ ] **Step 1: Failing tests** (`flows.test.ts`): every BFF response shape maps to the right step, including 401, 429, 503 messages and `mustSetPassword:true`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement mapper and pages. **Step 4:** Unit tests PASS; type-check 0 errors; manual run per Task 14.
- [ ] **Step 5: Commit** `feat(web-auth): own sign-in, sign-up and password pages`

### Task 11: Remaining Clerk touchpoints in the app shell

**Files:** `app/(setup)/business-details/page.tsx` (name/email from `/v1/auth/me/security` + users/me; `organization.name` prefill dropped in wbmsg mode), `components/layout/ProfileMenu.tsx` (facade `signOut`; "Manage account" → `/settings/security`; remove the "Clerk:" role line in both modes), `components/layout/TopBar.tsx` (D14), `app/admin/(protected)/_components/admin-sign-out.tsx` (facade), `app/invitations/[token]/accept/page.tsx` + `app/api/invitations/accept/route.ts` (wbmsg: new-account form → BFF `invitations/accept`; `409 ACCOUNT_EXISTS` → "Sign in to accept" → after sign-in the signed-in accept), `lib/can.ts` (`CurrentUser.organizationId`).

- [ ] **Step 1: Failing tests** for any extracted logic (e.g. `invitationNextStep()` mapping 201/409/400 → UI step) in `lib/auth/invitation.test.ts`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement both modes. **Step 4:** PASS; type-check 0.
- [ ] **Step 5: Commit** `feat(web-auth): app shell, invitations and admin sign-out on the auth facade`

### Task 12: Settings → Security page

**Files:** Create `app/(dashboard)/settings/security/page.tsx`, `lib/security-settings.ts` (+ test); add a "Security" tile in `lib/settings-tiles.ts` (visible to every signed-in role; wbmsg mode only) with its test.

Content (all through the existing `/api/v1` proxy with the user's token): **Password** (change form; when `mustSetPassword`, no current-password field); **Signed-in devices** (`GET /v1/auth/sessions`: client, device label, IP, last used, "This device"; "Sign out" per row; "Sign out everywhere else" → `revoke-all`). In clerk mode the page shows "Managed by your current sign-in provider" and nothing else.

- [ ] **Step 1: Failing tests:** `lib/security-settings.ts` formatting (relative last-used, client label) and the tile visibility rule (wbmsg only).
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS; `settings-tiles.test.ts` still passes.
- [ ] **Step 5: Commit** `feat(web-auth): Settings → Security (password and devices)`

### Task 13: Server routes and the email bridge

**Files:** `app/api/internal/send-email/route.ts` (accept our access token via `verifyAccessToken` in wbmsg mode, Clerk `verifyToken` in clerk mode, `INTERNAL_EMAIL_SECRET` in both), `app/api/email/send/route.ts`, `app/api/impersonation/route.ts`, `app/api/billing/checkout/route.ts`, `app/api/billing/portal/route.ts`, `app/api/register/route.ts`, `app/api/v1/[...path]/route.ts`, `app/admin/(protected)/layout.tsx`, `lib/api.ts` (all on the server facade; most were swapped by the Task 9 codemod; this task verifies behavior).

- [ ] **Step 1: Failing tests** for send-email: wbmsg + valid token → 200 path; forged/expired → 401; internal secret still works; clerk mode unchanged (mock `@clerk/nextjs/server`).
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat(web-auth): server routes and email bridge accept own tokens`

### Task 14: End-to-end check in wbmsg mode

**Files:** Create `apps/web/e2e/fixtures/auth-wbmsg.ts`, `apps/web/e2e/tests/auth-wbmsg.spec.ts`; `docs/runbooks/own-auth-local-wbmsg.md` (how to run the local stack in wbmsg mode: env vars, `gen-auth-keys`, reading codes from the API log in dev).

- [ ] **Step 1:** Add a dev-only code sink: when `NODE_ENV !== "production"` **and** `AUTH_DEV_LOG_CODES=1`, `sendCodeEmail` also logs `[dev-code] <purpose> <email> <code>` (never in production; test asserts it is off when `NODE_ENV=production`).
- [ ] **Step 2:** Playwright spec (runs only when `E2E_AUTH_PROVIDER=wbmsg`): sign up → code → business details → dashboard; sign out; sign in on a fresh context (new-device code); Settings → Security shows two devices; "sign out everywhere else" logs the other context out on its next navigation; forgot → reset.
- [ ] **Step 3:** Run it against the local stack per the runbook; record the result in the report.
- [ ] **Step 4: Commit** `test(web-auth): end-to-end sign-up, sign-in, devices and reset in wbmsg mode`

### Phase 2 exit

- [ ] Full API suite (known flaky: segments, conversations, billing upi-qr) and web `vitest` + `tsc` clean; `/check` passes.
- [ ] Security audit note appended to `docs/security/asvs-l2-auth-checklist.md` for new routes (Tasks 1–3, 7, 13), plus the items this phase closes (socket revoke, BFF secret, Turnstile).
- [ ] Merge locally; push only with owner approval. Production stays on Clerk (`NEXT_PUBLIC_AUTH_PROVIDER` and `AUTH_PROVIDER` unset).
- [ ] Next: Phase 3 (mobile) plan.
