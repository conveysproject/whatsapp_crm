# Own-auth Phase 3 — mobile (Expo) sign-in

Goal: `apps/mobile` can sign in with WBMSG's own login (`/v1/auth/*`), selected by `EXPO_PUBLIC_AUTH_PROVIDER=clerk|wbmsg|auto` (default `clerk`). Clerk mode behaves exactly as today. PRD: `docs/prd-own-auth.md` §4.5, §10a.7.

## Scan (file:line)
- `@clerk/expo` `useAuth` is imported in: `lib/api-context.tsx:1`, `app/_layout.tsx:1` (ClerkProvider + tokenCache :20-23, UserChangeReset :26-31), `app/index.tsx:1`, `app/(auth)/_layout.tsx:1`, `app/(auth)/sign-in.tsx:1` (`useSignIn`), `app/(app)/_layout.tsx:1` (RealtimeBridge :56, PushBridge :97, AppLayout :133 + super-admin gate :149-150), `app/(app)/(tabs)/me.tsx:1` (signOut :19/:69), `app/(app)/push-permission.tsx:1`, `components/chat/Composer.tsx:2` (getToken for uploads :27/:65).
- Shape used: `{ getToken(), userId, isLoaded, isSignedIn, signOut() }`.
- `lib/api.ts:15` fetch wrapper; `lib/media-upload.ts:13` separate fetch; `lib/realtime.ts:53` socket auth callback already calls `getToken()` per handshake and retries on `unauthorized` (:58-64) — a fresh token comes for free.
- `lib/session-gate.ts:22` already maps `superAdmin` → `super_admin` message screen.
- `lib/config-check.ts:8` requires the Clerk key unconditionally.
- API contract: `apps/api/src/auth/routes/signin.ts` (`/signin/password` → tokens | `{next:"new_device"|"set_password", challengeId}`; `/signin/new-device` → tokens + deviceId; `/signin/code/request` 202 (Turnstile-gated when the secret is set); `/signin/code/verify` → tokens + deviceId [+ mustSetPassword]), `routes/password.ts:109` (`/password/reset` with `client` → tokens + deviceId), `routes/session.ts:11` (`/refresh` body token, rotation), `:48` (`/signout` Bearer). `plugins/auth.ts:93` 426 `UPGRADE_REQUIRED` from `identity.ts:52 mobileUpgradeRequired` (needs `X-App-Client: mobile` + `X-App-Version`). `routes/index.ts:30` — all `/v1/auth/*` 404 in clerk mode.

## Design
- `lib/auth/` — `provider.ts` (mode from env; `auto` probes `GET /v1/auth/.well-known/jwks.json`: 200 → wbmsg, 404 → clerk, network failure → last known value in SecureStore, else clerk), `session-store.ts` (pure: in-memory access token, dedupe refresh, rotation persisted via an injected secure storage), `jwt.ts` (decode `sub`/`exp`, no verification), `client.ts` (auth API calls, `client:"mobile"`, app headers), `flows.ts` (pure response → step mapping), `index.tsx` (`AuthProvider`, `useAuth()`; Clerk mode wraps `ClerkProvider` and bridges Clerk's `useAuth` into the same context).
- Storage: refresh token, userId, deviceId in `expo-secure-store` only. Access token in memory only. deviceId survives sign-out (device trust); refresh token + userId cleared.
- Refresh: one in-flight refresh at a time (rotation reuse revokes the family). 401 → signed out; 503/network → stay signed in, getToken throws (transient).
- Super admin: after any wbmsg sign-in, `GET /v1/users/me` with the new token; `superAdmin` → `POST /auth/signout`, nothing stored, message shown. The existing gate stays as defense in depth.
- `lib/app-headers.ts`: `X-App-Client: mobile`, `X-App-Version` (expo-constants `expoConfig.version`) on every API call (api.ts, media-upload.ts, auth client); a 426 flips a small global store → root layout renders "Update the app".
- Screens (wbmsg): email → password → new-device code, set-password (code + new password via reset), "Email me a code" (email → code). No sign-up; "Create an account on the web" link.

## Files
New: `lib/auth/{provider,session-store,jwt,client,flows}.ts`, `lib/auth/index.tsx`, tests for each pure module, `lib/app-headers.ts` (+test), `components/auth/WbmsgSignIn.tsx`, `components/auth/UpdateRequired.tsx`.
Changed (import swap only where the owner has local edits): `app/(app)/_layout.tsx`, `app/(app)/(tabs)/me.tsx`, `components/chat/Composer.tsx`. Others: `app/_layout.tsx`, `app/index.tsx`, `app/(auth)/_layout.tsx`, `app/(auth)/sign-in.tsx`, `app/(app)/push-permission.tsx`, `lib/api-context.tsx`, `lib/api.ts`, `lib/media-upload.ts`, `lib/config.ts`, `lib/config-check.ts` (+test).

## TDD tasks
1. jwt decode + app-headers/upgrade store tests → code.
2. session-store (restore, getToken cache/skew, dedupe, 401 vs transient, signOut, persist rotation) tests → code.
3. flows mapping tests → code. 4. provider resolution tests → code. 5. config-check per mode tests → code.
6. api.ts / media-upload 426 + headers tests → code. 7. Wire AuthProvider, screens, import swaps. 8. type-check, lint, jest.

## Risks
- Owner's uncommitted edits in `(app)/_layout.tsx`, `me.tsx`, `Composer.tsx`: import-line swap only.
- `/signin/code/request` needs a Turnstile token when `TURNSTILE_SECRET_KEY` is set; the app has no Turnstile widget → "Email me a code" would fail with BOT_CHECK_FAILED. Flagged for the owner.
- Rotation write to SecureStore can fail after the server rotated → next launch signs out (acceptable).

## Decisions I made
1. Added `auto` mode (probe JWKS) so one store build works before and after cutover (PRD §4.5 "build must be live before cutover"). Default stays `clerk`.
2. Super-admin check happens inside the sign-in flow (no session kept); gate message kept.
3. Version from expo-constants (no new dependency, no lockfile change); expo-application not added.
4. Email-code sign-in with `mustSetPassword` proceeds signed in; setting a password is done on the web.
5. Headers + 426 handling also active in Clerk mode (harmless: the API ignores them in clerk mode).
