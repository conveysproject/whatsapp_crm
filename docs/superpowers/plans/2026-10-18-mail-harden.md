# Plan: harden the internal email bridge (mail-harden)

## Goal
Stop any signed-in user of any workspace from sending arbitrary HTML to arbitrary recipients from our domain.

## Caller inventory (scan)
- `apps/api/src/lib/mail.ts:25-35` posts to `/api/internal/send-email` with `INTERNAL_EMAIL_SECRET` (server-to-server). Used by: `auth/emails.ts:39,47`, `lib/billing/{alerts:127,automation:91,165,cancellation:53,59,122,payment-failed-email:13,statement-payment:65,102,166}.ts`, `routes/admin.ts:389`, `workers/closure-deadline.worker.ts:69`.
- ONLY browser caller: `apps/web/app/(dashboard)/settings/members/page.tsx:167` (invite email, user token, recipient = the invitee, HTML built client-side by `buildInvitationEmail` at :612).
- `apps/web/app/api/email/send/route.ts`: no caller anywhere (web, mobile, api); same relay hole via any session (`auth()`), plus logs recipients/stack.
- `apps/web/lib/internal-email-auth.ts:10-32` accepts Clerk JWT / own access token / secret.
- `apps/conveys` has its own separate mail lib (not part of the bridge).

## Design
Narrowest rule: the bridge accepts ONLY the shared secret. The single legitimate browser use (invitations) moves server-side: `POST /v1/invitations` (apps/api/src/routes/invitations.ts:79) already creates the invitation scoped to the caller's org with RBAC; it now also renders the email server-side (recipient = the invitation email, fixed template, accept URL from the token) and sends it through `sendMail` (secret path). Response gains `emailSent` boolean. Web page drops the bridge call. `/api/email/send` deleted. Because no user token reaches the bridge, there is nothing to rate-limit there; instead `POST /v1/invitations` gets a per-org rate limit (30/hour) since it now triggers email.
Clerk and wbmsg modes behave identically (user tokens rejected in both; invitations work in both because they ride the existing API auth).

## Files
- api: `src/lib/invitation-email.ts` (+test), `src/routes/invitations.ts` (+test)
- web: `lib/internal-email-auth.ts` (+test), `app/api/internal/send-email/route.ts` (+test), delete `app/api/email/send/route.ts`, `settings/members/page.tsx`.

## TDD tasks
1. Auth tests (both modes): secret ok; valid Clerk JWT / own access token rejected; wrong/short/empty rejected. Then simplify auth.
2. Route test: 401 with user token, 200 with secret.
3. API invitation test: email sent to invitation email only, `emailSent` true/false on failure (invite still 201), rate-limit config present.
4. Web page change; delete unused route.

## Risks
- Deploy order: new API before new web = invitee gets two emails; new web before API = no email until API deploys. Deploy API first (double mail is harmless).
- `WEB_URL` must be set on Railway (already needed by mail.ts) to build the accept link; fallback `https://wbmsg.com`.

## Decisions I made
- Remove the user-token path entirely rather than whitelist templates.
- Delete the unused `/api/email/send`.
- Invitation accept link uses `WEB_URL` fallback `https://wbmsg.com`.
