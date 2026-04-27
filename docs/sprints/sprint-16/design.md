# Sprint 16 — Chatbot Engine

## Sprint Goal
Let teams deploy a WhatsApp chatbot that handles routine queries autonomously and escalates to a human agent exactly when needed — cutting after-hours ticket volume without hiring overnight staff.

## What We're Building

- **Bot runner** — `apps/api/src/lib/bot-runner.ts`: `handleBotMessage(prisma, conversationId, organizationId, inboundBody)`. Loads the active `Chatbot` for the org, looks up or creates a `BotSession` for the conversation, resumes the flow from `currentNodeId`, and calls `runFlow` (Sprint 15's flow runner) with the inbound message as the payload. Updates `BotSession.currentNodeId` after each step.
- **Prisma models** — `Chatbot { id, organizationId, name, flowId, isActive, createdAt }` and `BotSession { id, chatbotId, conversationId, currentNodeId, isEscalated, createdAt, updatedAt }`. `flowId` links to the `Flow` model from Sprint 15.
- **Escalation node** — New node type `escalate` added to the flow runner: sets `BotSession.isEscalated = true`, sets `conversation.assignedTo` to the configured agent, emits a Socket.io `conversation:escalated` event so the inbox shows a live handoff notification. After escalation, `handleBotMessage` is skipped for subsequent inbound messages (human takes over).
- **Chatbot CRUD API** — `apps/api/src/routes/chatbots.ts`: `GET/POST/PATCH/DELETE /v1/chatbots`. `POST /v1/chatbots/:id/activate` — sets `isActive = true` on the specified chatbot and `isActive = false` on all others for the org (one active bot per org in Sprint 16). `GET /v1/chatbots/:id/sessions` — paginated list of bot sessions for monitoring.
- **Integration with inbound worker** — `apps/api/src/workers/inbound-message.worker.ts`: After routing, if the org has an active chatbot and the session is not escalated, calls `handleBotMessage`. If escalated or no active chatbot, falls through to normal assignment.
- **Chatbot settings UI** — `apps/web/app/(dashboard)/settings/chatbot/page.tsx`: shows the active chatbot name + linked flow, activate/deactivate toggle, and a link to the flow canvas editor. Session count and escalation rate displayed as summary stats.

## Key Technical Decisions

- **Bot runner delegates to flow runner** — No separate execution engine. `handleBotMessage` is a thin adapter that maps the inbound WhatsApp message to the flow payload and calls `runFlow`. All node execution logic stays in `flow-runner.ts`.
- **One active bot per org** — Multiple simultaneous bots create routing ambiguity. Sprint 16 enforces one active bot; multi-bot routing (by phone number or contact tag) is Sprint 22.
- **`BotSession` tracks current node, not full history** — Storing only `currentNodeId` minimizes writes. Full execution history (for debugging) is the BullMQ job log; we don't duplicate it in Postgres.
- **Escalation is permanent per session** — Once escalated, the bot never resumes for that conversation. The human agent has taken over. Starting a new conversation creates a new session.
- **`conversation:escalated` Socket.io event** — Agents see a live banner in the inbox when a bot escalates to them. No polling required — the event arrives on the existing org room socket.

## Dependencies

- **External:** None
- **Internal:** Sprint 15 complete (flow runner, `Flow` model); Sprint 6 complete (Socket.io org rooms)

## Definition of Done

- [ ] `POST /v1/chatbots` creates a chatbot linked to a flow
- [ ] `POST /v1/chatbots/:id/activate` activates the bot; deactivates others
- [ ] Inbound WhatsApp message → active chatbot executes flow → automated reply sent
- [ ] `escalate` node → `BotSession.isEscalated = true` → subsequent messages routed to human
- [ ] Socket.io `conversation:escalated` event fires when bot escalates
- [ ] `/settings/chatbot` page shows active chatbot + toggle
- [ ] `pnpm --filter @trustcrm/api test` — all pass including `chatbots.test.ts`
- [ ] `pnpm type-check` — no errors
- [ ] `pnpm lint` — no errors

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Bot loop (flow has no `end` or `escalate` node) | Medium | High | Bot runner enforces max 20 node steps per inbound message; logs error and escalates automatically |
| Race condition: two inbound messages before first completes | Medium | Medium | BullMQ processes one job per conversation at a time (per-conversation queue key); second message queued behind first |
| Flow deleted while bot session is mid-flow | Low | Medium | `handleBotMessage` checks if flow still exists; if not, escalates automatically |
