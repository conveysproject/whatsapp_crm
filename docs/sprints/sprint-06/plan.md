# Sprint 6 — Implementation Plan

> Full task details are in the batch plan: `docs/superpowers/plans/2026-04-27-sprint-planning-batch-2.md`
> Tasks 20–27 cover Sprint 6.

## Pre-conditions
- Sprint 3 complete (conversations/messages in DB, WhatsApp send/receive working)
- Sprint 4 complete (`GET /v1/conversations` + `GET /v1/conversations/:id/messages` routes exist)
- Sprint 5 complete (web UI components, nav shell, React Query provider in root layout)
- Local environment running: `docker compose up -d` + API + web dev servers

## Task Summary

| # | Task | Key files |
|---|---|---|
| 20 | Socket.io server Fastify plugin | `apps/api/src/plugins/socketio.ts`, `apps/api/src/lib/io-ref.ts` |
| 21 | Emit real-time event from inbound worker | `apps/api/src/workers/inbound-message.worker.ts` |
| 22 | Socket.io client + useSocket hook + React Query provider | `apps/web/lib/socket.ts`, `apps/web/hooks/useSocket.ts`, `apps/web/components/providers/QueryProvider.tsx` |
| 23 | useConversations + useMessages hooks | `apps/web/hooks/useConversations.ts`, `apps/web/hooks/useMessages.ts` |
| 24 | ConversationList, MessageThread, SendMessageForm | `apps/web/components/inbox/` |
| 25 | Inbox page + layout | `apps/web/app/(dashboard)/inbox/page.tsx`, `apps/web/app/(dashboard)/inbox/layout.tsx` |
| 26 | Conversations route tests | `apps/api/src/routes/conversations.test.ts` |
| 27 | Final type-check + lint | All packages |

## Test Checklist

- [ ] `pnpm --filter @trustcrm/api test` — all pass (conversations.test, webhooks.test, contacts.test, health.test)
- [ ] `pnpm type-check` — no errors across all packages
- [ ] `pnpm lint` — no errors
- [ ] Manual: Open /inbox in browser → conversation list loads
- [ ] Manual: Send a WhatsApp message to the test number → conversation appears in list (within ~2s)
- [ ] Manual: Click conversation → thread shows messages
- [ ] Manual: Type reply → click Send → appears in thread, arrives on WhatsApp

## Deployment / Environment Notes

Add to `.env.example`:
```
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Add to `apps/web/.env.local`:
```
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Socket.io connects to `NEXT_PUBLIC_API_URL` (already set in Sprint 2). No new API env vars required.

Foundation Phase complete after this sprint. Internal alpha ready for team testing.
