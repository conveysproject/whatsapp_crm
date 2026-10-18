# Report — own-auth Phase 3 (mobile)

Branch `feat/mobile-auth` (worktree `E:\Product\WhatsApp_CRM-mobile-auth`). Not pushed, not merged. Plan: `docs/superpowers/plans/2026-10-18-own-auth-phase3-mobile.md`.

## What changed
- **Switch:** `EXPO_PUBLIC_AUTH_PROVIDER=clerk|wbmsg|auto` (default `clerk`). `lib/auth/index.tsx` exports `AuthProvider`, `useAuth()` (same shape as `@clerk/expo`: `isLoaded, isSignedIn, userId, getToken, signOut`), `useAuthMode()`, `wbmsgSession()`. In Clerk mode it renders the same `ClerkProvider` + token cache as before and passes Clerk's `useAuth()` values through unchanged (same `getToken` function identity, so the socket effect behaves as before).
- **Token handling (`lib/auth/session-store.ts`):** refresh token, user id and device id in `expo-secure-store` only; access token in memory only. One refresh at a time (rotation reuse would revoke the session family); 60 s refresh skew; 401 from `/v1/auth/refresh` → signed out (device id kept); 503/offline → stays signed in, `getToken` throws; a refresh finishing after sign-out is discarded. Sign-out calls `POST /v1/auth/signout` with a valid access token when one can be obtained, then clears local state regardless.
- **Auth client (`lib/auth/client.ts`):** direct API calls, `client: "mobile"` on every sign-in, stored `deviceId` sent with the password step.
- **Screens (`components/auth/WbmsgSignIn.tsx`):** email → password → new-device code; `next: "set_password"` → code + new password via `POST /v1/auth/password/reset` (client mobile → signed in); "Email me a code" (email or password step); "Forgot password?" (forgot → reset); "Create an account on the web" link (`/sign-up`), no sign-up in the app.
- **Super admins:** after every WBMSG sign-in the app reads `GET /v1/users/me` with the new token; `superAdmin` → the new session is revoked (`/auth/signout`), nothing is stored, and the screen says to use the web dashboard. The existing `(app)` gate message stays as a second line of defence (e.g. if `/users/me` failed at sign-in).
- **Version gate:** `lib/app-headers.ts` adds `X-App-Client: mobile` and `X-App-Version` (expo-constants `expoConfig.version`) to every API call (`lib/api.ts`, `lib/media-upload.ts`, auth client). Any 426 flips a global flag and the root layout renders `components/auth/UpdateRequired.tsx` ("Update the app", store button when `EXPO_PUBLIC_APP_STORE_URL` / `EXPO_PUBLIC_PLAY_STORE_URL` are set, plus "Open web dashboard").
- **Sockets:** unchanged code; `connectRealtime` already asks `getToken()` on every handshake and retries after `unauthorized`, so reconnects get a fresh (refreshed) token. `getToken` is stable in WBMSG mode.
- **Config check:** the Clerk key is not required when the mode is `wbmsg` (still required for `clerk` and `auto`).

## Files touched (all under `apps/mobile/`)
Owner has local edits in these — **one import line changed each** (`@clerk/expo` → `lib/auth`): `app/(app)/_layout.tsx`, `app/(app)/(tabs)/me.tsx`, `components/chat/Composer.tsx`.
Not touched: `lib/badge.ts`, `lib/push.ts`, `lib/notifications.ts`, `lib/pending-messages.ts`, `package.json`, `.gitignore`, `pnpm-lock.yaml`.
Other changed: `app/_layout.tsx` (AuthProvider + update screen), `app/index.tsx`, `app/(auth)/_layout.tsx`, `app/(app)/push-permission.tsx`, `lib/api-context.tsx` (import line), `app/(auth)/sign-in.tsx` (mode switch; Clerk screen body unchanged; styles moved to `components/auth/sign-in-styles.ts`), `lib/api.ts`, `lib/media-upload.ts`, `lib/config.ts`, `lib/config-check.ts`, tests `lib/api.test.ts`, `lib/media-upload.test.ts`, `lib/config-check.test.ts`.
New: `lib/app-headers.ts`, `lib/auth/{index.tsx,session-store.ts,client.ts,flows.ts,provider.ts,jwt.ts}`, `components/auth/{WbmsgSignIn.tsx,UpdateRequired.tsx,sign-in-styles.ts}`, tests for each.
No new dependencies; lockfile unchanged.

## Results
- Mobile `npx jest`: **23 suites, 165 tests passed** (baseline 15 / 107).
- Mobile `tsc --noEmit`: 0 errors. Mobile eslint: 0 problems.
- Repo root `pnpm type-check`: 5/5 tasks OK. `pnpm lint`: 0 errors (59 pre-existing API warnings).
- API / web untouched, so their suites were not re-run.

## Decisions I made (with "if wrong")
1. **`auto` mode** probes `GET /v1/auth/.well-known/jwks.json` (200 → wbmsg, 404 → clerk, else last known, else clerk; 5 s timeout). Reason: PRD §4.5 needs the new build in the stores *before* cutover, so one build must work with either API mode. If wrong: drop `auto`, ship two builds.
   Note: after cutover, a running app keeps its mode until it restarts.
2. **Super admin check inside the sign-in flow** (session revoked, never stored), rather than signing in and then signing out. If wrong: small change in `finishSignIn`.
3. **Version from expo-constants**, not expo-application (no new dependency). For OTA updates this is the manifest version. If wrong: add expo-application and use `nativeApplicationVersion`.
4. **Headers + 426 screen also active in Clerk mode.** They do no harm (the API only applies the gate in wbmsg mode). If wrong: gate `appHeaders()` on the mode.
5. **Email-code sign-in with `mustSetPassword: true`** signs in normally; setting a password happens on the web (Settings → Security). If wrong: route to the set-password step after the code.
6. **"Forgot password?" now runs in the app** (forgot → reset) instead of opening the web page, in WBMSG mode only.
7. **deviceId is kept across sign-outs** (device trust is per device, the server ties it to the account).

## Open questions for the owner
1. **Turnstile:** `/v1/auth/signin/code/request` and `/password/forgot` require a Turnstile token when `TURNSTILE_SECRET_KEY` is set. The app has no Turnstile widget, so "Email me a code" and "Forgot password?" would fail on prod. The app shows "This step isn't available in the app right now. Sign in with your password, or use the web dashboard." The password and new-device paths are not affected. Options: skip Turnstile for `X-App-Client: mobile` on these routes (with their existing per-IP/per-target limits), or add a Turnstile WebView.
2. **Store links:** the API's 426 has no store URL (PRD says "with a store link"). Set `EXPO_PUBLIC_APP_STORE_URL` / `EXPO_PUBLIC_PLAY_STORE_URL` in EAS when the store listings exist.
3. **`AUTH_MIN_MOBILE_VERSION`** must be ≤ the version in `app.config.ts` (currently 1.0.0) for the new build.

## Not done / limits
- Google/Facebook and WhatsApp-code sign-in on mobile (PRD §4.5): not in this task's scope.
- No device run (no simulator here); flows are covered by component tests with a mocked API.
- Socket handshake does not send `X-App-Version` (the API's socket auth has no version gate).

## Review follow-up (commit d7053e9e)
1. **Safe auto mode** (`lib/auth/provider.ts`): `classifyProbe` accepts WBMSG only for a 200 JWKS body (`{keys:[...]}`) and Clerk only for the API's JSON 404 `{error:{code:"NOT_FOUND"}}`; anything else is "unknown" and changes nothing. WBMSG is sticky: running WBMSG (remembered, or a stored WBMSG refresh token with no record) needs a Clerk answer on two launches in a row before the record flips to Clerk; a WBMSG answer resets the count. The downgrade takes effect on the following launch, which deletes the `wbmsg.auth.*` keys (refresh, user, device). Clerk → WBMSG flips at once (next launch). The record now lives under `wbmsg.mode` as JSON `{mode, clerkSeen}`, outside the wiped keys.
2. **No blank start:** `auto` renders as soon as the local SecureStore read finishes (remembered mode, default clerk; no network wait). The probe runs in the background and only updates the record for the next launch; the running session never switches login.
3. **Revoked-session recovery:** `lib/auth/recovery.ts` (registered by the WBMSG bridge only). `lib/api.ts` and `lib/media-upload.ts`: a 401 on a sent token → one `store.forceRefresh(staleToken)` (bypasses the cached token, joins a refresh already running, reuses a token another caller already got) → one retry. Refresh 401 → signed out. Never more than one retry. Clerk mode: nothing registered, behaviour unchanged. `Composer.tsx` untouched.
4. **Timeouts:** every auth-client fetch has a 15 s AbortController timeout; a timeout is a network error (status 0), so a hung refresh throws, releases the single-flight lock and the user stays signed in.
5. **Dev log:** a failed SecureStore write of the rotated refresh token logs `auth: could not save the rotated refresh token to SecureStore` in `__DEV__` only (no token value).
6. **Sockets:** verified, no change needed. `RealtimeBridge` mounts only in the `(app)` layout's `ok` gate branch, which returns early unless `isLoaded && isSignedIn` and `/users/me` succeeded, so `connectRealtime` never runs before `restore()` finishes. `resolveGate` → `super_admin` already has a test (`lib/session-gate.test.ts`, "blocks super admins").

Results: mobile jest **23 suites / 191 tests passed**; mobile tsc + eslint 0 problems; root `pnpm type-check` 5/5, `pnpm lint` 0 errors (59 pre-existing API warnings).
Remaining note: `auto` still waits for one local SecureStore read (milliseconds) before the first render, since the remembered mode cannot be read synchronously.
