# Sprint 3 — WhatsApp Cloud API Integration

## Sprint Goal
Wire WBMSG to Meta's WhatsApp Cloud API so the platform can receive and send real WhatsApp messages, establishing the core messaging channel that every downstream feature depends on.

## What We're Building

- **Webhook receiver** — Two-endpoint handler: `GET` for Meta's verification challenge, `POST` for inbound messages. Validates HMAC-SHA256 signature on every payload. Public endpoints (no auth required — Meta calls them, not users).
- **BullMQ inbound queue** — Webhook handler enqueues jobs instantly and returns HTTP 200 to Meta within the 20-second timeout. A separate BullMQ Worker processes each job: finds or creates the `Conversation` row, stores the `Message` row, updates `lastMessageAt`.
- **Outbound message send** — `POST /v1/conversations/:id/messages` accepts `{ text }`, calls Meta's Cloud API (`/v20.0/{phoneNumberId}/messages`), stores the outbound message, returns the stored record.
- **Conversation auto-creation** — First inbound message from a WhatsApp number creates a new `Conversation` row automatically. Subsequent messages from the same number append to the existing conversation.
- **WhatsApp Cloud API client** — Raw `fetch` wrapper (`sendTextMessage`, `verifyWebhookSignature`) — no third-party SDK, fully typed.

## Key Technical Decisions

- **Raw fetch over Meta SDK** — The official `whatsapp-business-sdk` has poor TypeScript types and is under-maintained. Raw fetch with typed interfaces gives complete control and zero surprise dependencies.
- **BullMQ decoupling** — Meta retries webhooks if they don't get a 200 within 20 seconds. Database writes can take longer. Enqueue immediately, process asynchronously. BullMQ provides retry with exponential backoff if the worker fails.
- **IORedis over `bull`** — BullMQ requires IORedis (not `redis`). `maxRetriesPerRequest: null` is mandatory for BullMQ worker connections.
- **timingSafeEqual for HMAC comparison** — Prevents timing-based signature oracle attacks. Standard practice for HMAC verification.
- **phoneNumberId → organizationId lookup** — Meta sends the phone number ID in every webhook. We store it on the `Organization` row to route incoming messages to the correct tenant without requiring a phone number registry.
- **No media download in Sprint 3** — Image/document/voice message support is deferred to Sprint 6. Sprint 3 stores `contentType` and `mediaId`; the body is null for non-text messages.

## Dependencies

- **External:** Meta Developer account, WhatsApp Business Account (WABA) created, phone number provisioned and added to the WABA. Env vars: `WA_PHONE_NUMBER_ID`, `WA_ACCESS_TOKEN`, `WA_VERIFY_TOKEN`, `WA_WEBHOOK_SECRET`.
- **Internal:** Sprint 2 complete — Clerk auth, organizations/users tables, Fastify auth plugin, Prisma client.
- **Infrastructure:** Redis 7 running via `docker compose up -d`. The `inboundMessageQueue` connects to `REDIS_URL`.

## Definition of Done

- [ ] `GET /v1/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...` returns the challenge string
- [ ] `POST /v1/webhooks/whatsapp` with valid HMAC signature enqueues a BullMQ job and returns `{ status: "ok" }`
- [ ] `POST /v1/webhooks/whatsapp` with invalid signature returns 403
- [ ] Worker stores a `Conversation` row (auto-created if new) and a `Message` row with `direction: inbound`
- [ ] `POST /v1/conversations/:id/messages` sends a real WhatsApp message and stores outbound record
- [ ] `pnpm --filter @WBMSG/api test` — all pass including `webhooks.test.ts`
- [ ] `pnpm type-check` — no errors
- [ ] `pnpm lint` — no errors

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Meta webhook URL must be public HTTPS | High | High | Use `ngrok http 4000` for local testing; configure HTTPS in staging via ALB cert |
| WABA phone number provisioning delay | Medium | Medium | Use Meta's Test Phone Number during dev; provision real number in parallel |
| Redis connection failure crashes worker | Low | Medium | BullMQ retry with exponential backoff; monitor via Datadog |
| Duplicate inbound message IDs | Low | Low | `whatsappMessageId` has `@unique` constraint — duplicate jobs fail silently |
