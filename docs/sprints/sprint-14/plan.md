# Sprint 14 — Implementation Plan

> Full task details are in the batch plan: `docs/superpowers/plans/2026-04-28-sprint-planning-batch-4.md`
> Task 4 covers Sprint 14.

## Pre-conditions
- Sprints 1–13 complete and merged
- All test suites green: `pnpm test`, `pnpm type-check`, `pnpm lint`
- `OPENAI_API_KEY` available in local `.env` and staging secrets

## Task Summary

| # | Task | Key files |
|---|---|---|
| 4 | Whisper client + auto-transcription + VoiceMessage UI | `apps/api/src/lib/whisper.ts`, `apps/api/src/routes/transcriptions.ts`, `apps/api/src/routes/transcriptions.test.ts`, `apps/api/src/workers/inbound-message.worker.ts`, `apps/web/components/inbox/VoiceMessage.tsx` |

## Test Checklist

- [ ] `pnpm --filter @WBMSG/api test` — all pass including `transcriptions.test.ts`
- [ ] `pnpm type-check` — no errors across all packages
- [ ] `pnpm lint` — no errors
- [ ] Manual: Send a WhatsApp voice note → message appears in inbox with transcript below audio controls
- [ ] Manual: `POST /v1/messages/:id/transcribe` → returns `{ transcription: "..." }`
- [ ] Manual: Large audio file (>25 MB) → transcript shows "[Audio too long to transcribe]"

## Deployment / Environment Notes

Add to `.env` (and staging/production secrets):
```
OPENAI_API_KEY=sk-...
```

Run migration after schema change:
```bash
cd apps/api
pnpm exec prisma migrate dev --name add_message_transcription
pnpm exec prisma generate
```

Install new dependency:
```bash
pnpm --filter @WBMSG/api add openai
```
