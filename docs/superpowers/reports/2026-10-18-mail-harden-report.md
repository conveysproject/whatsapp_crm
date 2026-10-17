# mail-harden report

## What changed
- `/api/internal/send-email` now accepts ONLY `INTERNAL_EMAIL_SECRET` (user Clerk JWTs and own access tokens are rejected in both auth modes). `apps/web/lib/internal-email-auth.ts` simplified.
- Only browser caller (invite email, members/page.tsx) moved server-side: `POST /v1/invitations` renders a fixed template (`apps/api/src/lib/invitation-email.ts`, role/link HTML-escaped), sends to the invitation's own address, returns `emailSent`. Invite still 201 if mail fails; UI shows a warning.
- `POST /v1/invitations` rate-limited to 30/hour per org (it now triggers email).
- Deleted unused `/api/email/send` (no callers; same relay hole).
- Tests: web auth + route in both modes (allowed: secret; blocked: user token, empty, wrong, short secret); API invitation email tests, escape/URL tests.

## Results
type-check and lint 0 errors; web 444/444; api 2762/2762 (195 files).

## Decisions (if wrong:)
- Removed user path rather than whitelisting templates. If wrong: a future browser feature needs email -> add an API endpoint that sends server-side.
- Accept link uses `WEB_URL` fallback `https://wbmsg.com`. If wrong: invite links point to wrong host (previously hardcoded wbmsg.com).
- Rate limit 30/hour/org. If wrong: large bulk invites get 429.

## Open questions / deploy notes
- Deploy API before web (reverse order = no invite email in the gap; API-first = invitee may get two emails briefly).
- Railway needs WEB_URL + INTERNAL_EMAIL_SECRET (already required by mail.ts).
- Mobile app has no invite-email caller.
