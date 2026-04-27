# Sprint 19 — Implementation Plan

> Full task details are in the batch plan: `docs/superpowers/plans/2026-04-28-sprint-planning-batch-5.md`
> Tasks 1–3 cover Sprint 19.

## Pre-conditions
- Sprints 1–18 complete and merged
- All test suites green: `pnpm test`, `pnpm type-check`, `pnpm lint`
- Expo Go installed on a physical device or simulator

## Task Summary

| # | Task | Key files |
|---|---|---|
| 1 | Expo Router shell + Clerk sign-in + tab navigator | `apps/mobile/app/_layout.tsx`, `apps/mobile/app/(auth)/sign-in.tsx`, `apps/mobile/app/(tabs)/_layout.tsx` |
| 2 | Inbox conversation list + conversation detail + send message | `apps/mobile/hooks/useConversations.ts`, `apps/mobile/hooks/useMessages.ts`, `apps/mobile/hooks/useSendMessage.ts`, `apps/mobile/components/ConversationListItem.tsx`, `apps/mobile/components/MessageBubble.tsx`, `apps/mobile/components/SendMessageForm.tsx`, `apps/mobile/app/(tabs)/index.tsx`, `apps/mobile/app/conversation/[id].tsx` |
| 3 | Push notifications (Expo push token + inbound worker notify) | `apps/mobile/lib/notifications.ts`, `apps/api/src/workers/inbound-message.worker.ts`, `apps/api/prisma/schema.prisma` |

## Test Checklist

- [ ] `pnpm type-check` — no errors across all packages including `apps/mobile`
- [ ] `pnpm lint` — no errors
- [ ] Manual (Expo Go): Sign in → inbox tab visible with conversation list
- [ ] Manual: Tap conversation → message thread renders with all messages
- [ ] Manual: Type and send message → message appears in thread; web inbox also shows it
- [ ] Manual: Send inbound WhatsApp from a test number → push notification appears on device with contact name + message preview
- [ ] Manual: Deny push permission → app still works; no crash

## Deployment / Environment Notes

Install mobile dependencies:
```bash
cd apps/mobile
npx expo install expo-router @clerk/clerk-expo expo-secure-store expo-linking expo-constants expo-status-bar expo-notifications expo-device @tanstack/react-query
pnpm add expo-server-sdk  # in API for push sending
```

Create `apps/mobile/.env`:
```
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
EXPO_PUBLIC_API_URL=http://<your-local-IP>:4000
```

Add to API `.env`:
```
# No new vars — uses existing REDIS_URL, DATABASE_URL
```

Run migration (adds `pushToken` to `UserProfile`):
```bash
cd apps/api
pnpm exec prisma migrate dev --name add_user_push_token
pnpm exec prisma generate
```
