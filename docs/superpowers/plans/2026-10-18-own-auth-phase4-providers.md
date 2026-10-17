# Own auth, Phase 4: WhatsApp code, Google and Facebook sign-in (web)

Spec: `docs/prd-own-auth.md` §4.6, §4.7, §5, §10a. Scope: API + web. Mobile is a separate session.
Everything here is wbmsg-only: the whole `/v1/auth` router 404s in Clerk mode (`apps/api/src/auth/routes/index.ts:29`), and
the BFF 404s in Clerk mode (`apps/web/app/api/auth/[...action]/route.ts:186`).

## Goal
1. WhatsApp one-time code sign-in for accounts with a **verified** phone, plus phone verification in Settings → Security.
2. Google and Facebook sign-in, link and unlink, with the PRD §4.6 linking rules.

## Scan (what exists)
- Codes: `apps/api/src/auth/codes.ts:5` already has `signin_whatsapp` and `phone_verify` purposes; phone targets are not
  email-normalized (`codes.ts:33`). Throttle 3 codes / 10 min per target (`codes.ts:19`).
- Schema: `auth_accounts.phone_e164` (unique) + `phone_verified_at`; `auth_oauth_links` with unique (provider, provider_sub)
  and unique (account_id, provider) (`apps/api/prisma/schema.prisma:1806,1826`). No migration needed.
- WhatsApp send: `sendTemplateMessage(phoneNumberId, to, name, lang, components, accessToken)`
  (`apps/api/src/lib/whatsapp.ts:134`); credentials are `organization.phoneNumberId` + `organization.wabaAccessToken`
  (same as `routes/templates.ts:409`).
- E.164: `normalizeFullPhone` (`apps/api/src/lib/phone-normalize.ts:17`, libphonenumber-js) returns digits.
- Sign-in patterns: 202-before-work (`routes/signin.ts:300`), 300 ms padding (`signin.ts:77`), `logAttempt` (`signin.ts:91`),
  `userRow` (`signin.ts:80`), Turnstile on code requests (`signin.ts:295`), credential limiter 20/10 min/IP (`routes/index.ts:13`).
- Account-session preHandler: `account-auth.ts:16` (blocks impersonation, needs a session id).
- `/me/security` already returns `phone` and `oauth` (`routes/security.ts:28`).
- Web: BFF catch-all route + `callAuthApi`/`setSessionCookies` (`apps/web/lib/auth/bff.ts`), cookies `wb_rt`/`wb_at`/`wb_dev`
  (`lib/auth/config.ts:6`), `/sign-in/*` is public (`lib/auth/middleware-wbmsg.ts:10`), sign-in form
  `components/auth/SignInForm.tsx`, Security page `app/(dashboard)/settings/security/page.tsx` calling `/api/v1/auth/*` via the proxy.
- New OAuth users have no workspace: the dashboard layout already sends org-less users to `/business-details`, and
  `POST /v1/register` creates the workspace in wbmsg mode when the email is verified (`apps/api/src/routes/register.ts:61`).
- No audit-log table exists; `login_logs` is the audit trail for sign-ins (method column).

## Design
### OAuth: BFF-driven, tokens never reach the browser
```
Browser --form POST--> web /api/auth/oauth/:p/start  --POST--> API /v1/auth/oauth/:p/start  -> { url, state }
        <-- 303 to provider, httpOnly cookie wb_oauth=state (path /api/auth/oauth, 10 min)
Provider --GET ?code&state--> web /api/auth/oauth/:p/callback (state must equal the cookie: login-CSRF guard)
        --POST {code,state}--> API /v1/auth/oauth/:p/callback -> session | linked | confirm_email | error
        BFF sets wb_rt/wb_at/wb_dev cookies and 303s to /dashboard, /business-details, /settings/security or /sign-in/confirm-email
```
- The PRD lists `GET /oauth/:provider/start|callback` on the API. I made them **POST, called only by the BFF** (and later
  mobile), because the redirect URI must be on the web origin for the BFF to set httpOnly cookies; a GET on the API
  would need tokens handed back through a URL.
- PKCE (S256) + `state` (256-bit) + Google `nonce`; state is stored in Redis (`auth:oauth:state:*`, 10 min, single use via GETDEL)
  with provider, intent (`signin`|`link`), accountId (link only), verifier, nonce, safe redirect.
- Providers behind one `OAuthProvider` interface (`authorizeUrl`, `exchange` → `{ sub, email, emailVerified, firstName, lastName }`).
  Hand-written `fetch` adapters + `jose` (already a dependency) instead of `arctic` (decision 1).
- Google: verify the ID token with Google's JWKS (issuer, audience, nonce). Facebook: token exchange, then Graph `/me` with
  `appsecret_proof`; Facebook email is always treated as unverified.

### Linking rules (PRD §4.6)
- Existing link (provider, sub) → sign in to that account.
- Google, email verified and an account has that email → link + sign in. No account → create one (email verified, no password,
  no workspace) → `/business-details`.
- Facebook (any case) and Google with an unverified/missing email → **confirm-email step**: a pending entry in Redis
  (`auth:oauth:pending:*`, 30 min, id in an httpOnly cookie). The user gets an email code (to the provider's email, or one they
  type when Facebook gave none). After the code: link to the existing account with that email, or create a new account.
- Intent `link` (Settings → Security, needs a session): link to the signed-in account; 409 if that provider identity is linked
  elsewhere or the account already has that provider.
- Super admins never use social or WhatsApp sign-in (they use `/admin/sign-in` with a code every time). Locked/disabled
  accounts are refused.
- Unlink: `DELETE /v1/auth/oauth/:provider`, refused with 409 `LAST_SIGN_IN_METHOD` when nothing else would remain
  (password, another link, or a verified WhatsApp number while WhatsApp sign-in is on). Email codes are a recovery path and
  are not counted.

### WhatsApp
- Enabled only when `AUTH_WHATSAPP_ORG_ID` and `AUTH_WHATSAPP_TEMPLATE` are set (`AUTH_WHATSAPP_TEMPLATE_LANG`, default `en_US`).
  Routes 404 `FEATURE_DISABLED` otherwise. `GET /v1/auth/methods` tells the web which buttons to show.
- Template components: body `{{1}}` = code, plus the copy-code URL button parameter (Meta's authentication template format).
- `POST /signin/whatsapp/request {phone}` → 202 before any lookup; background: verified, active, unlocked, non-super-admin
  account with that number → `signin_whatsapp` code → WhatsApp. `POST /signin/whatsapp/verify {phone, code}` → session.
- The UI always offers "Didn't get it? Email me a code" (no delivery-status endpoint, so no enumeration through failures).
- `POST /phone/verify/request {phone}` (signed in) sends synchronously and reports a send failure (authenticated, nothing to
  enumerate); per-account 5/h and per-IP 10/h limits on top of the per-number throttle (cost/pumping guard).
  `POST /phone/verify/confirm {phone, code}` stores the number; 409 `PHONE_IN_USE` if another account already has it.

## Files
API: `src/auth/phone.ts`, `src/auth/whatsapp-codes.ts`, `src/auth/oauth/{types,google,facebook,registry,state}.ts`,
`src/auth/routes/{whatsapp,oauth,methods}.ts`, small edits to `routes/index.ts`, `routes/signin.ts` (exports), `emails.ts`
(optional lead line). Web: `app/api/auth/[...action]/route.ts`, `lib/auth/oauth.ts`, `components/auth/{SocialButtons,
WhatsAppSignIn,OAuthConfirmEmail}.tsx`, `SignInForm.tsx`, `app/(auth)/sign-in/confirm-email/page.tsx`, security page sections.
Docs: `docs/runbooks/own-auth-sign-in-providers.md` (Meta template text, Google/Facebook app setup, env vars).

## TDD tasks
1. phone.ts (E.164) + whatsapp-codes.ts (config gate, template payload) — unit tests.
2. WhatsApp routes: request 202 + background rules, verify, phone verify request/confirm, feature-off 404.
3. OAuth state store + providers (mocked fetch, local JWKS for Google ID tokens).
4. OAuth routes: start, callback (all linking branches), pending send/verify, unlink rules, methods.
5. Web BFF: start (form POST, origin, cookie, link bearer), callback (state cookie check, each result), pending send/verify, methods.
6. Web UI: sign-in buttons + WhatsApp flow + confirm-email page + Security sections (pure helpers tested).
7. Docs + report; full suites, type-check, lint.

## Risks
- Facebook PKCE support on the web dialog: we send `code_challenge` and `code_verifier`; the app secret is also sent, so
  security does not depend on PKCE there. Verify on the first real test.
- WhatsApp cost abuse through phone verification: limits above; codes go only to numbers the signed-in user types.
- The Conveys org's billing guard (`assertSendingAllowed`) can block auth sends if that org were ever marked overdue.

## Decisions I made
1. No `arctic`: two small `fetch` adapters + `jose` avoid a new dependency and lockfile churn across parallel branches.
2. API OAuth routes are POST + BFF-driven (see above), not GET redirects.
3. Facebook always needs the email code before an account is linked or created, even when it returns an email.
4. Google with an unverified email follows the same confirm-email step instead of creating an unverified account.
5. Super admins cannot use Google/Facebook/WhatsApp sign-in or link providers.
6. Phone verification request is synchronous (authenticated) so the user sees a WhatsApp delivery failure.
7. "Email me a code instead" is always shown on the WhatsApp code screen instead of a delivery-status endpoint.
8. Email codes do not count as a sign-in method for the unlink check.
