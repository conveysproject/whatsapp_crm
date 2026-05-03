# Sprint 6 — Inbox MVP

## Sprint Goal
Deliver a working real-time inbox where agents can read incoming WhatsApp messages and reply — the core interaction loop that defines WBMSG's value proposition.

## What We're Building

- **Socket.io server** — Fastify plugin that creates a `socket.io` server on the same HTTP server. Clients join org-scoped rooms (`org:{organizationId}`) on connect. The inbound message worker emits `new-message` to the org room after storing each message.
- **Socket.io client** — `socket.io-client` singleton (`lib/socket.ts`) + `useSocket` hook that connects on mount, joins the org room via Clerk `orgId`, and disconnects on unmount.
- **Real-time conversation list** — `useConversations` React Query hook fetches the conversation list from `GET /v1/conversations`. A socket `new-message` listener invalidates the query, causing the list to re-sort (most recent first) without a page refresh.
- **Message thread** — `useMessages` React Query hook fetches messages for the selected conversation. Same invalidation pattern — socket event triggers refetch. `MessageThread` renders inbound (left, white bubble) and outbound (right, `wa-light` green bubble) messages with timestamps.
- **Send message form** — `POST /v1/conversations/:id/messages` with `{ text }`. Optimistic UX: sends, clears input, React Query refetches. No optimistic insertion to avoid flicker from the socket echo.
- **Inbox page** — Split-pane layout: 288px conversation list on the left, message thread + send form on the right. No URL-based conversation selection — state is local to the page component (avoids complexity of dynamic routes in Sprint 6).

## Key Technical Decisions

- **Socket.io over raw WebSockets** — Socket.io provides automatic reconnection, namespace/room support, event-based API, and fallback transports. The org-room pattern (`socket.join("org:X")`) is a single line. With raw WebSockets we'd hand-roll all of this.
- **`io-ref.ts` singleton for cross-module io access** — The BullMQ worker runs in the same Node.js process as the Fastify server. Rather than passing the `io` instance around via function arguments (which would require restructuring the worker), a module-level singleton (`setIo`/`getIo`) lets the worker emit events without coupling to Fastify internals.
- **React Query invalidation over socket-pushed data** — Pushing full message objects via socket and inserting them into the query cache is fragile (ordering, deduplication). Invalidation is simpler: "something changed → refetch from the source of truth". Latency is acceptable for an inbox (sub-100ms on LAN).
- **Local state for selected conversation** — Sprint 6 doesn't need URL-based navigation to a specific conversation (deep linking, browser back/forward). Local `useState` in the Inbox page is sufficient. URL-based routing is added in Sprint 6's follow-up or Sprint 12 (Routing & Assignment) when direct links to conversations become a requirement.
- **No message pagination in Sprint 6** — The messages query fetches the latest 100 messages. Full pagination (infinite scroll) is added in Sprint 6's follow-up. 100 is sufficient for an MVP inbox.

## Dependencies

- **External:** None beyond existing env vars
- **Internal:** Sprint 3 complete — conversations/messages in DB, WhatsApp send/receive working. Sprint 4 complete — `GET /v1/conversations` and `GET /v1/conversations/:id/messages` routes exist. Sprint 5 complete — UI components, nav shell, React Query provider in root layout.

## Definition of Done

- [ ] Sign in → navigate to /inbox → conversation list loads from API
- [ ] Receive a WhatsApp message → conversation appears in list within 2 seconds (without page refresh)
- [ ] Click a conversation → message thread shows all messages in chronological order
- [ ] Receive a new message while thread is open → thread updates without refresh
- [ ] Type a reply and click Send → message appears in the thread; WhatsApp receives it
- [ ] Socket disconnects on navigate away; reconnects on return (no duplicate events)
- [ ] `pnpm --filter @WBMSG/api test` — all pass including `conversations.test.ts`
- [ ] `pnpm type-check` — no errors
- [ ] `pnpm lint` — no errors

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Socket.io CORS blocks web → API connection | Medium | High | Configure `cors.origin` in socket.io plugin to match `NEXT_PUBLIC_APP_URL`; add `NEXT_PUBLIC_APP_URL` to `.env.example` |
| Socket.io not compatible with Next.js edge runtime | Low | Medium | Socket.io client runs only in browser (client components); never imported in RSC or Edge middleware |
| `io-ref` singleton undefined when worker runs before server | Low | Medium | `getIo()` returns `null` and logs a warning — worker doesn't crash; emit is skipped |
| Stale conversation list after sending message | Medium | Low | `SendMessageForm` invalidates `["messages", conversationId]` after send; `useConversations` invalidates on socket event |
