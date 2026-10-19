# Remove Clerk (own-auth Phase 6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Delete every Clerk code path, package and setting so WBMSG's own login is the only login, with no change to how production behaves today.

**Architecture:** Production has run `AUTH_PROVIDER=wbmsg` (API) and `NEXT_PUBLIC_AUTH_PROVIDER=wbmsg` (web) since 2026-10-18. Every Clerk usage sits behind a provider switch next to a WBMSG branch. Each change keeps the WBMSG branch exactly as it runs today, deletes the Clerk branch, then deletes the switch. The mobile app is not live, so it moves to WBMSG-only with no migration.

**Tech Stack:** Fastify 4 + Prisma 7 + Vitest (api), Next.js 15 + Vitest (web), Expo + jest (mobile).

**Spec:** docs/prd-own-auth.md (Phase 6: "remove Clerk").

## Global Constraints

- Owner decision 2026-10-19: remove Clerk now ("Go ahead until all done"); trade-off (no rollback to Clerk) was explained and accepted.
- Production behaviour must not change: every kept code path is the one that runs when the provider is `wbmsg`.
- No database migration. `users.id` values stay as they are (they were Clerk ids; they are just string ids now).
- No new features, no refactors beyond removing the Clerk branch and the switch.
- Never print or hardcode secrets.
- Deleting prod env vars (Railway/Vercel) happens only after the deploy is verified, and only with the owner's confirmation.
- `apps/conveys` is out of scope: its "Clerk" mentions are agency marketing copy about client tech stacks, not WBMSG's login.
- Customer-facing text: say "WBMSG" / neutral wording; never name a competitor.
- Tests run once at the end of the batch (owner rule), not per task.

## Review Focus

1. `/v1/auth/*` must answer on every environment once the 404 gate is gone (it used to 404 unless `AUTH_PROVIDER=wbmsg`).
2. Invitation accept: only the signed-in path (`acceptSignedIn`) remains; a body with `clerkUserId` must no longer create a user.
3. Super-admin create and bootstrap: only the "auth account + must set password" path remains; no 502 "Failed to create Clerk account".
4. Web middleware: only the WBMSG middleware; protected routes still redirect to `/sign-in` when signed out.
5. Mobile: the app always uses WBMSG sign-in; a missing `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` is no longer reported as missing config.

---

### Task 1: API — WBMSG-only

**Files (delete):** `src/lib/clerk.ts`, `src/lib/clerk.test.ts`, `src/lib/clerk-admin.ts`, `src/routes/clerk-webhook.ts`, `src/routes/clerk-webhook.test.ts`.
**Files (modify):** `src/auth/identity.ts` (remove `isWbmsgAuth` and the Clerk branch of `verifyBearer`; `mobileUpgradeRequired` keeps its wbmsg behaviour), `src/auth/routes/index.ts` (remove the 404 gate), `src/plugins/auth.ts`, `src/lib/socket-auth.ts`, `src/plugins/socketio.ts`, `src/routes/admin.ts` (cleanup uses the "no_valid_users" logic only), `src/routes/bootstrap.ts`, `src/routes/super-admins.ts`, `src/routes/invitations.ts` (drop the `clerkUserId` body path and schema field), `src/routes/register.ts`, `src/routes/index.ts` (unregister the webhook router), `src/routes/contacts-import.ts` + `src/types/fastify.d.ts` (comments), `package.json` (remove `@clerk/backend`, `svix`), all tests that mention Clerk or `AUTH_PROVIDER`.
**Delete script:** `scripts/audit-auth-readiness.mjs` (cutover-only).

- [ ] Inline every `isWbmsgAuth()` branch as true; delete the else branches.
- [ ] Tests: delete Clerk-mode tests; keep wbmsg-mode tests without the `AUTH_PROVIDER` stubbing; the gate test becomes "/v1/auth answers without any env switch".
- [ ] `git grep -i clerk apps/api` returns only historical lines (the own-auth migration SQL and the schema comment, which may be reworded).
- [ ] Commit.

### Task 2: Web — WBMSG-only

**Files (delete):** `app/api/invitations/accept/route.ts` (Clerk user creation), `lib/auth/config.ts` (+test) once no caller remains.
**Files (modify):** `middleware.ts` (export the WBMSG middleware only), `lib/auth/client.tsx`, `lib/auth/server.ts`, `lib/auth/session-expired.ts` (+test; drop the provider parameter), `app/layout.tsx` (no `ClerkProvider`), sign-in / sign-up / admin sign-in / forgot / reset / confirm-email pages, `app/(dashboard)/layout.tsx`, `app/(dashboard)/settings/security/page.tsx`, `app/(setup)/business-details/page.tsx`, `app/invitations/[token]/accept/page.tsx`, `app/api/auth/[...action]/route.ts`, `app/api/v1/[...path]/route.ts`, `components/layout/ProfileMenu.tsx`, `lib/settings-tiles.ts`, `lib/api.ts`, admin organizations page ("Validate users" wording, no Clerk), admin super-admins page (new admin sets their password via Forgot password), privacy page (remove the Clerk processor line), comments in `ImpersonationBanner.tsx`, `TeamLeaderboard.tsx`, `DashboardView.tsx`, `useSocket.ts`, `server-api.ts`, `internal-email-auth.ts`, `middleware-wbmsg.ts`, `signup-steps.ts`, `cypress/support/e2e.ts`, `.gitignore`, `.env.test.example`, `package.json` (remove `@clerk/nextjs`, `@clerk/testing`); tests that mention Clerk or `NEXT_PUBLIC_AUTH_PROVIDER`.

- [ ] Inline every `authProvider() === "wbmsg"` branch as true; delete Clerk branches and imports.
- [ ] `git grep -i clerk apps/web` returns nothing.
- [ ] Commit.

### Task 3: Mobile — WBMSG-only

**Files (modify):** `lib/auth/index.tsx` (no `ClerkProvider`/`ClerkBridge`/mode detection; WBMSG provider always), `lib/auth/provider.ts` (+test; delete the mode logic, or the file if nothing remains), `app/(auth)/sign-in.tsx` (WBMSG screen only), `lib/config.ts`, `lib/config-check.ts` (+test), `lib/sign-in-steps.ts` (+test; delete if Clerk-only), comments in `push.ts`, `realtime.ts`, `session-gate.ts`, `recovery.ts`, `sign-in-styles.ts`; `package.json` (remove `@clerk/expo`); tests that mention Clerk.

- [ ] `git grep -i clerk apps/mobile` returns nothing.
- [ ] Commit.

### Task 4: Repo-wide (controller, inline)

- [ ] `pnpm install` to update `pnpm-lock.yaml`.
- [ ] `.env.example`: remove the `CLERK_*` lines; add nothing new beyond what already exists.
- [ ] `CLAUDE.md`: replace the `CLERK_SECRET_KEY` example with a current variable.
- [ ] Docs: mark Phase 6 done in docs/prd-own-auth.md and the own-auth roadmap; update docs/auth-and-permissions.md where it describes Clerk as the identity provider.
- [ ] One full run: root `pnpm type-check`, `pnpm lint`, api + web + mobile suites, `next build`.
- [ ] Push to main, watch CI and the deploy, smoke-test prod sign-in.
- [ ] With owner confirmation: delete prod env vars — Railway api: `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET`, `AUTH_PROVIDER`; Vercel: `NEXT_PUBLIC_CLERK_*`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_AUTH_PROVIDER`. Owner: delete the Clerk webhook endpoint and cancel the Clerk plan.
