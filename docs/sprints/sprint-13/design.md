# Sprint 13 — Smart Replies (AI Suggestions)

## Sprint Goal
Surface Claude-powered reply suggestions inside the inbox so agents can respond faster and more consistently, reducing average handle time without sacrificing the personal touch.

## What We're Building

- **Claude client** — `apps/api/src/lib/claude.ts`: wraps `@anthropic-ai/sdk` with three functions — `generateSuggestions(history, count)`, `detectIntent(body)`, `analyzeSentiment(body)`. Model: `claude-haiku-4-5-20251001` (fast, cheap). Prompts are self-contained and include conversation history as a user-turn list.
- **AI routes** — `apps/api/src/routes/ai.ts`: `POST /v1/conversations/:id/suggestions` (returns 3 reply suggestions), `POST /v1/messages/:id/analyze` (returns `{ intent, sentiment }`). Both endpoints are auth-gated and scoped to `organizationId`.
- **SmartReplies UI** — `apps/web/components/inbox/SmartReplies.tsx`: renders up to 3 suggestion chips below the message thread. Clicking a chip populates the send box. Chips display a ✨ prefix. Loading state shows skeleton chips. Error state shows nothing (silent failure — AI is optional).
- **Intent + sentiment** — Analyzed per-message on render (debounced 1 s after last message). Intent types: `question`, `complaint`, `order`, `greeting`, `other`. Sentiment: `positive`, `neutral`, `negative`. Displayed as a small badge on message bubbles in the thread (agent-only view).

## Key Technical Decisions

- **Claude Haiku, not Sonnet/Opus** — Suggestions must feel instant (<500 ms p95). Haiku is 3–5× faster and 10× cheaper than Sonnet at this call volume. Quality is sufficient for short WhatsApp replies.
- **Suggestions requested on conversation open, not on every inbound message** — Fetching suggestions on every inbound message fires too many API calls. The frontend requests suggestions when the agent opens a conversation (and re-requests when a new inbound arrives while the conversation is active).
- **Silent failure for AI features** — If the Claude API is down or rate-limited, the SmartReplies component renders nothing. The inbox remains fully functional. No error toast for AI failures.
- **`ANTHROPIC_API_KEY` in env, not in DB** — One key per deployment (staging / production). No per-org key management in Sprint 13; multi-key support is Sprint 22.
- **History truncated to last 10 turns** — Sending full conversation history inflates tokens and latency. 10 turns (5 inbound + 5 outbound) gives Claude enough context for relevant suggestions.

## Dependencies

- **External:** `ANTHROPIC_API_KEY` provisioned in staging/production env
- **Internal:** Sprints 1–12 complete; conversation + message models exist

## Definition of Done

- [ ] `POST /v1/conversations/:id/suggestions` returns `{ suggestions: string[] }` (3 items)
- [ ] `POST /v1/messages/:id/analyze` returns `{ intent: IntentType; sentiment: SentimentType }`
- [ ] SmartReplies component renders chips in the inbox; clicking populates send box
- [ ] Intent/sentiment badges visible on messages in agent view
- [ ] `pnpm --filter @trustcrm/api test` — all pass including `ai.test.ts`
- [ ] `pnpm type-check` — no errors
- [ ] `pnpm lint` — no errors

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Claude API latency >1 s causes jank | Medium | Medium | Silent failure; component shows nothing if request takes >2 s (AbortController timeout) |
| `ANTHROPIC_API_KEY` missing in staging | Medium | Low | Env var check at startup; API logs warning but does not crash |
| Suggestion quality poor for non-English WhatsApp | Medium | Low | Haiku handles multilingual; no action in Sprint 13 — language support reviewed in Sprint 22 |
