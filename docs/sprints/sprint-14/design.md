# Sprint 14 — Voice Transcription

## Sprint Goal
Automatically transcribe WhatsApp voice notes so agents can read them instead of playing audio, cutting review time for voice-heavy support queues.

## What We're Building

- **Whisper client** — `apps/api/src/lib/whisper.ts`: `downloadWhatsAppMedia(mediaId, accessToken)` fetches the audio file from Meta's media API and saves it to a temp file. `transcribeAudio(mediaId, accessToken)` calls OpenAI Whisper (`whisper-1` model) and returns the transcript string.
- **Auto-transcription in inbound worker** — `apps/api/src/workers/inbound-message.worker.ts`: After persisting a message of `type === "audio"`, the worker calls `transcribeAudio` and writes the result to `message.transcription` (new nullable `String` column on the `Message` model).
- **Transcription route** — `apps/api/src/routes/transcriptions.ts`: `POST /v1/messages/:id/transcribe` — manual trigger for agents who want to re-transcribe or transcribe a message that auto-transcription missed. Returns `{ transcription: string }`.
- **VoiceMessage component** — `apps/web/components/inbox/VoiceMessage.tsx`: renders a play button + waveform placeholder + transcript text below the audio controls. If `transcription` is null, shows a "Transcribing…" skeleton (polling until the field populates, max 30 s, then shows "Transcript unavailable").

## Key Technical Decisions

- **OpenAI Whisper via `openai` SDK, not a self-hosted model** — Hosting Whisper requires a GPU container. At beta scale (<1,000 voice messages/day), the API cost is negligible (<$1/day). Self-hosted option is Sprint 22+ if volume grows.
- **Transcription in the BullMQ worker, not the webhook handler** — Same rationale as routing (Sprint 12): keeps the webhook fast. If Whisper is slow, it doesn't delay the 200 OK to Meta.
- **`transcription` stored on the `Message` row** — No separate table. Transcription is a property of the message, not an independent entity. One nullable text column is the simplest model.
- **Media download before Whisper call** — Meta's media URLs expire after ~10 minutes. The worker downloads the binary immediately upon receiving the webhook, writes to a temp file, then sends to Whisper. The temp file is deleted after transcription completes.
- **`OPENAI_API_KEY` for Whisper only** — The same env var is reused if the team later adds GPT calls. In Sprint 14, it is used exclusively for Whisper transcription.

## Dependencies

- **External:** `OPENAI_API_KEY` provisioned; `openai` npm package installed
- **Internal:** Sprints 1–12 complete; `Message` model exists; inbound message worker exists

## Definition of Done

- [ ] Inbound WhatsApp voice note → `message.transcription` populated within 30 s
- [ ] `POST /v1/messages/:id/transcribe` returns transcript on demand
- [ ] VoiceMessage component renders audio controls + transcript in inbox
- [ ] `pnpm --filter @trustcrm/api test` — all pass including `transcriptions.test.ts`
- [ ] `pnpm type-check` — no errors
- [ ] `pnpm lint` — no errors

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Meta media URL expires before worker processes it | Low | High | Worker processes audio messages with `priority: 1` (higher than text) in BullMQ queue |
| Whisper transcription wrong language | Medium | Low | Whisper auto-detects language; no action needed in Sprint 14 |
| Large audio file (>25 MB Whisper limit) | Low | Medium | Worker checks file size; skips transcription and sets `transcription = "[Audio too long to transcribe]"` |
| `OPENAI_API_KEY` not set | Medium | Low | Worker catches error, logs warning, leaves `transcription = null`; does not crash |
