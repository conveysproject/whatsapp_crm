# Sprint 20 — Self-Serve Onboarding

## Sprint Goal
Remove the manual admin setup step from closed beta — let any business sign up, connect their WhatsApp Business Account, and start receiving messages without Anthropic/WBMSG intervention.

## What We're Building

- **WABA OAuth wizard** — `apps/web/app/(onboarding)/`: a 4-step onboarding flow with its own layout (no sidebar, centered card). Steps: (1) Connect WABA via Meta Business OAuth, (2) Provision phone number ID, (3) Invite team members, (4) Checklist / "you're ready" confirmation.
- **OAuth callback handler** — `apps/web/app/(onboarding)/connect-waba/callback/page.tsx`: receives Meta's `?code=` param, calls `POST /v1/onboarding/waba-callback` (Node API), which exchanges code for access token and persists it on the org record.
- **Onboarding API routes** — `apps/api/src/routes/onboarding.ts`: `POST /v1/onboarding/waba-callback` (code → access token exchange with Meta Graph API v20.0) and `GET /v1/onboarding/status` (returns `{ wabaConnected, numberProvisioned, onboardingStep }`).
- **Organization schema additions** — `wabaAccessToken: String?` and `onboardingStep: String?` fields added to the `Organization` Prisma model (token stored encrypted in production via AWS Secrets Manager rotation; stored as plaintext in dev).
- **Clerk org invitations** — Invite team page uses `useOrganization().organization.inviteMember({ emailAddress, role: "org:member" })` from `@clerk/nextjs`. No custom invite system — Clerk handles email delivery and signup link.

## Key Technical Decisions

- **Meta Business OAuth flow (system user token exchange)** — The standard WABA connection flow uses the Facebook Login for Business OAuth dialog. The app redirects to `facebook.com/v20.0/dialog/oauth` with `whatsapp_business_management` scope. On callback, the server exchanges the short-lived code for a long-lived user access token via `GET /oauth/access_token`. This token is stored and used for the Meta Cloud API.
- **Server-side code exchange (not client-side)** — The OAuth code is sent to the Node API for exchange, not exchanged directly from the browser. This keeps `META_APP_SECRET` server-only.
- **`onboardingStep` tracks wizard progress** — On first login, if `onboardingStep` is null or not "complete", the web app redirects to `/onboarding/connect-waba`. Middleware in Next.js middleware.ts handles this redirect before the dashboard renders.
- **Phone number ID entered manually in Sprint 20** — Full WABA phone number listing (via Meta API) is Sprint 22. In Sprint 20, the admin pastes the Phone Number ID from Meta Business Manager. This is acceptable for controlled rollout.
- **Clerk org invitations for team members** — Clerk handles invitation emails and the invitee's signup flow. No custom email service needed in Sprint 20.

## Dependencies

- **External:** `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI` env vars; Meta App configured with WABA OAuth scopes
- **Internal:** Sprints 1–19 complete; `Organization` model exists; Clerk configured

## Definition of Done

- [ ] New user signs up via Clerk → redirected to `/onboarding/connect-waba`
- [ ] Clicking "Connect with Meta" → Facebook OAuth dialog → returns to callback page → access token stored
- [ ] Admin enters phone number ID → saved to org record → webhook URL shown
- [ ] Admin invites team members via Clerk org invitation → they receive email
- [ ] Checklist page shows all steps complete → "Go to Inbox" button
- [ ] `GET /v1/onboarding/status` returns correct `wabaConnected` and `numberProvisioned` state
- [ ] `pnpm --filter @WBMSG/api test` — all pass including `onboarding.test.ts`
- [ ] `pnpm type-check` — no errors
- [ ] `pnpm lint` — no errors

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Meta OAuth app not approved for WABA scopes in dev | High | Medium | Use a Meta test business account with pre-approved test WABA during development |
| `wabaAccessToken` stored in plaintext in DB | Medium | High | Plaintext in dev only; production uses AWS Secrets Manager reference (Sprint 22 security hardening) |
| User refreshes callback page → code reused (Meta code is one-time) | Medium | Low | Callback page checks if token already stored and skips exchange if so |
