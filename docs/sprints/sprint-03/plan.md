# Sprint 3 — Implementation Plan

> Full task details are in the batch plan: `docs/superpowers/plans/2026-04-27-sprint-planning-batch-2.md`
> Tasks 1–7 cover Sprint 3.

## Pre-conditions
- Sprint 2 complete and merged
- Meta Developer account created; WABA provisioned; `WA_PHONE_NUMBER_ID` and `WA_ACCESS_TOKEN` available
- Local Redis running: `docker compose up -d`
- `ngrok http 4000` running for webhook testing (or staging ALB URL configured in Meta dashboard)

## Task Summary

| # | Task | Key files |
|---|---|---|
| 1 | Install BullMQ + IORedis, add env vars | `.env.example`, `apps/api/package.json` |
| 2 | Prisma schema — Conversation + Message | `apps/api/prisma/schema.prisma` |
| 3 | WhatsApp client helper | `apps/api/src/lib/whatsapp.ts` |
| 4 | BullMQ queue + inbound worker | `apps/api/src/lib/queue.ts`, `apps/api/src/workers/inbound-message.worker.ts` |
| 5 | Webhook routes | `apps/api/src/routes/webhooks.ts` |
| 6 | Conversations + messages routes | `apps/api/src/routes/conversations.ts`, `apps/api/src/routes/messages.ts` |
| 7 | Type-check + lint | All packages |

## Test Checklist

- [ ] `pnpm --filter @WBMSG/api test` — all pass (webhooks.test, health.test, sentry.test, auth.test, organizations.test)
- [ ] `pnpm type-check` — no errors across all packages
- [ ] `pnpm lint` — no errors
- [ ] Manual: Send message from WhatsApp → webhook fires → conversation created → message appears in `GET /v1/conversations/:id/messages`
- [ ] Manual: `POST /v1/conversations/:id/messages` → message received on WhatsApp

## Deployment / Environment Notes

Add to `.env` (copy from `.env.example`):
```
REDIS_URL=redis://localhost:6379
WA_PHONE_NUMBER_ID=<from Meta Business dashboard>
WA_ACCESS_TOKEN=<permanent system user token>
WA_VERIFY_TOKEN=WBMSG_verify_2026
WA_WEBHOOK_SECRET=<random 32-char hex string>
```

Run migration after schema changes:
```bash
cd apps/api
pnpm exec prisma migrate dev --name add_whatsapp_conversations_messages
pnpm exec prisma generate
```

Configure Meta webhook:
1. Go to Meta Developer Console → Your App → WhatsApp → Configuration
2. Set Callback URL to `https://<your-ngrok-or-alb-domain>/v1/webhooks/whatsapp`
3. Set Verify Token to match `WA_VERIFY_TOKEN`
4. Subscribe to `messages` field
