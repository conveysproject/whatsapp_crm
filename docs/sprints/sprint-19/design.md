# Sprint 19 — Mobile App (Expo)

## Sprint Goal
Give agents a native mobile inbox so they can handle WhatsApp conversations from any device — supporting the reality that SMB agents often work from their phones.

## What We're Building

- **Expo Router v3 shell** — `apps/mobile/app/_layout.tsx`: `ClerkProvider` wraps a `Stack` navigator. `AuthGuard` component redirects unauthenticated users to the sign-in screen. Token cache uses `expo-secure-store`.
- **Sign-in screen** — `apps/mobile/app/(auth)/sign-in.tsx`: email + password form using `@clerk/clerk-expo`'s `useSignIn`. No OAuth in Sprint 19 (added Sprint 24).
- **Tab navigator** — `apps/mobile/app/(tabs)/_layout.tsx`: three tabs — Inbox (`index.tsx`), Contacts (`contacts.tsx`), Settings (`settings.tsx`) — using Expo Router's `<Tabs>` with `lucide-react-native` icons.
- **Inbox tab** — `apps/mobile/app/(tabs)/index.tsx`: flat list of open conversations via `useConversations` React Query hook. Pull-to-refresh. Tapping a row navigates to the conversation detail screen.
- **Conversation detail** — `apps/mobile/app/conversation/[id].tsx`: flat list of messages (`useMessages` hook) + `SendMessageForm`. `KeyboardAvoidingView` for iOS keyboard handling.
- **Push notifications** — `apps/mobile/lib/notifications.ts`: registers Expo push token after sign-in, saves to API (`POST /v1/users/push-token`). Inbound message worker sends a push via `expo-server-sdk` when a conversation is assigned to an agent.

## Key Technical Decisions

- **Expo Router v3 over React Navigation** — File-system routing matches Next.js conventions already used on the web app. The team has one mental model for routing across platforms.
- **`@clerk/clerk-expo` + `expo-secure-store`** — Clerk manages JWT; tokens persist securely in the device keychain via SecureStore. No custom token management.
- **React Query in mobile app** — Same caching and invalidation patterns as the web app. `useConversations` and `useMessages` hooks are conceptually identical to their web counterparts — different fetch URLs, same pattern.
- **Expo Push Notifications (not APNs/FCM directly)** — Expo's push gateway abstracts APNs and FCM. `expo-server-sdk` on the Node API sends to the Expo gateway. This avoids configuring separate APNs certificates and FCM keys in Sprint 19.
- **`KeyboardAvoidingView` with `behavior="padding"` on iOS** — Standard pattern for chat UIs on iOS. `height` behavior on Android.

## Dependencies

- **External:** Expo Go app (development), EAS account (production build); `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` and `EXPO_PUBLIC_API_URL` env vars
- **Internal:** Sprints 1–18 complete; `POST /v1/conversations/:id/messages` exists; auth middleware validates Clerk tokens

## Definition of Done

- [ ] Sign-in screen authenticates with Clerk; tab navigator visible after sign-in
- [ ] Inbox tab shows open conversation list; pull-to-refresh works
- [ ] Tapping conversation → message thread renders; send a message → appears in thread + in web inbox
- [ ] New inbound message → push notification delivered to agent's device
- [ ] `pnpm type-check` — no errors in `apps/mobile`
- [ ] `pnpm lint` — no errors in `apps/mobile`

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Expo Go version mismatch with SDK 51 | Medium | Medium | Pin Expo SDK 51 in `package.json`; run `npx expo install --fix` to align native module versions |
| Push token not saved (permission denied) | Medium | Low | Graceful failure — app works without push; token saving is best-effort |
| `KeyboardAvoidingView` incorrect offset on Android | Medium | Low | Use `behavior="height"` on Android; tested on both platforms before marking DoD complete |
