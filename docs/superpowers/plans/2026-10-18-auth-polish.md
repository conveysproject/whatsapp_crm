# Auth polish (own-auth, wbmsg mode only)

Goal: three small fixes; Clerk mode unchanged.

1. Deep link: `lib/auth/middleware-wbmsg.ts` forwards `x-pathname` (pathname+search) on the request headers for page requests (never /api/*; only values passing `safeRedirect`). Readers already exist: `app/(dashboard)/layout.tsx:99`, `lib/api.ts:32`, `lib/auth/server.ts:42`. Also set on the refresh path (same headers object, cookies kept byte-identical).
2. `POST /v1/auth/signup/verify` pending-expired reply gets code `SIGNUP_EXPIRED` (`routes/signup.ts:74`, used at :164). Web: `flows.ts` gains `errorCode()`; `SignUpForm.verify` checks the code, regex kept as fallback.
3. BFF GET `session-expired` (`app/api/auth/[...action]/route.ts`): clear cookies only if `Sec-Fetch-Site` in {same-origin, same-site, none}, or (header absent) Origin/Referer origin matches the app origin; else redirect to /sign-in without clearing.

TDD: tests first in middleware-wbmsg.test.ts, signup.test.ts, flows.test.ts, route.test.ts.

Risks: header-less clients (old browsers, privacy tools stripping Referer) will fail to clear cookies on forced sign-out; the sign-in page and middleware still handle the dead session, so low impact.

## Decisions I made
- x-pathname is set only when the value passes `safeRedirect` (same-origin relative, no control chars/backslash/`//`); otherwise not set.
- Middleware strips any client-supplied `x-pathname` so it cannot be spoofed.
- `Sec-Fetch-Site: same-site` is accepted (sibling subdomain), as asked; with no Sec-Fetch-Site and no Origin/Referer, the request is treated as cross-site (no clearing).
