# PRD: WBMSG Mobile App (iOS + Android)

Status: Draft for owner review · Date: 2026-10-14 · Owner: Product

## 1. Goal

Ship a native mobile app that **matches every competitor on the team inbox at launch**, then **pulls ahead** on the things they do poorly: reliable notifications, AI help while replying, and a business owner's view of money and campaigns.

The app is a **companion to the web app, not a replacement**. Builders (flows, campaign wizard, template editor, most settings) stay on the web, as they do for WATI, respond.io and Interakt. Phase 3 adds a few owner actions on mobile, like AiSensy.

### Success criteria

| Metric | Target (90 days after launch) |
|---|---|
| Push delivered to the right agent within 5 s of an inbound message | ≥ 99% |
| Crash-free sessions | ≥ 99.5% (respond.io claims 99.9%) |
| Median time from push tap to first reply | < 60 s |
| Share of active orgs with ≥ 1 mobile user | ≥ 30% |
| Store rating | ≥ 4.5 |

## 2. Competitor research summary

| Capability | WATI | Interakt | AiSensy | respond.io | DoubleTick | **WBMSG target** |
|---|---|---|---|---|---|---|
| Team inbox, assign, quick replies, push | ✅ | ✅ | ✅ | ✅ | ✅ | **P1** |
| Contact card inside chat | – | ✅ | – | ✅ | ✅ | **P1** |
| Internal notes | – | – | – | ✅ | – | **P1** |
| Campaign monitor + pause/abort | View | – | ✅ | ❌ | ✅ | **P1** |
| AI suggested replies / summary | ❌ | ❌ | ❌ | ✅ | ❌ | **P2** |
| Translate messages | ❌ | ❌ | ❌ | ✅ | ❌ | **P2** |
| Manager team view | ❌ | ❌ | ❌ | ✅ | – | **P2** |
| Balance / billing on mobile | ❌ | ✅ (wallet) | ❌ | ❌ | ❌ | **P2** |
| Create template / send broadcast on mobile | ❌ | – | ✅ | ❌ | ✅ | **P3** |
| Sign up + connect WhatsApp on mobile | ❌ | ❌ | ✅ | ❌ | – | **P3** |
| Voice calls | ❌ | ❌ | ❌ | ✅ | ❌ | Not planned |

**Main weakness in the market:** WATI's public reviews complain about "no notifications, messages disappearing and reappearing." Reliable real-time sync and push is our first selling point.

## 3. Users and roles

Access is driven by the existing DB role and permissions (Clerk is identity only). The app hides what a user cannot do and never relies on hiding alone; the API stays the authority.

| Persona | Typical role | What they need on mobile |
|---|---|---|
| **Agent** | `agent` (or custom permissions) | Their chats, fast replies, contact context, alerts for their chats |
| **Manager** | `manager` | All chats, reassigning, dashboard, campaign status |
| **Admin** | `admin` | Everything above plus message usage and billing standing |
| **Viewer** | `viewer` | Read-only inbox and dashboard |

The system roles are `admin`, `manager`, `agent` and `viewer`. There is no separate "owner" role: the business owner is an `admin`.

**Rule (owner, 2026-10-15): super admins do not log in to the mobile app.** A `superAdmin` sign-in is refused after Clerk sign-in with the message "Super admin accounts use the web dashboard" and a Sign out button (no app access). Admin console, billing admin and "Login As" (impersonation) stay web-only and are out of scope for mobile.

## 4. Navigation structure

Bottom tab bar with 4 tabs, named like the web sidebar. Sections a user has no permission for are hidden.

```
┌──────────────────────────────────────────────────────┐
│  Inbox      Contacts      Dashboard*     Me          │
└──────────────────────────────────────────────────────┘
  * Dashboard items are permission-filtered by the API (same as web dashboard v2)
```

> **Alignment rule (2026-10-14):** the mobile app shows only features that exist in the system today. Anything new is listed in section 9 and marked "New". The screen-by-screen alignment check against the schema, API and web components is in section 5a.

```
Root
├── (auth) Sign in (Clerk) → Pick organization (if more than one) → Notification permission
├── Inbox tab
│   ├── Inbox list  [All | Open | Pending | Closed] + quick filters (Unread, Assigned to me) + label filter + search
│   └── Chat  (header: status, assignee, inbox label)
│       ├── Contact details (status, lead status, groups, tags, custom fields, notes, deals, bot on/off, block)
│       ├── Assign sheet (one agent, with Online / Away)
│       ├── Template picker (when the 24-hour window is closed, or "/")
│       ├── Composer actions: attach, media library, canned responses, template, interactive message, bot automations, create deal
│       └── Smart replies above the composer
├── Contacts tab
│   ├── Contact list + search + filters (All tags, All groups)
│   ├── Contact details (same as above)
│   └── New / edit contact
├── Dashboard tab*
│   ├── Overview (range today / 7d / 30d, Needs attention, key metrics, last campaign, message usage for admins, billing standing banner)
│   ├── Campaigns → Campaign detail (live progress, pause / resume / abort / retry failed)
│   └── Templates → Template detail (status, quality, rejected reason, analytics)
└── Me tab
    ├── Availability (Online / Away)
    ├── Push notifications on this phone (New), message sound
    ├── Switch organization
    ├── Canned responses (view)
    ├── Language
    ├── Open web dashboard
    └── Sign out

Global: bell icon in the header → Notifications (new message, conversation assigned, lead closure overdue)
```

## 5. Screen inventory

### Phase 1: Launch (match competitors)

| # | Screen | Key contents | Existing API |
|---|---|---|---|
| 1 | Sign in | Our own screens driven by Clerk's Expo SDK (`useSignIn`; Clerk has no prebuilt mobile `<SignIn/>` like web). Steps: email → password (or email code) → verification code when Clerk returns `needs_client_trust` (new device) or `needs_second_factor` (2FA) → session. Google via Clerk SSO in the system browser, shown only if enabled in the Clerk dashboard. Forgot password via Clerk reset flow. Sign-up stays on web. | Clerk |
| 2 | Org picker | Shown only for users in more than one org | `/users/me` |
| 3 | Inbox list | Tabs All / Open / Pending / Closed; quick filters Unread, Assigned to me; label filter; unread badges; status chips (Open, Pending, Resolved, Bot); search; pull to refresh | `/conversations`, `/conversations/search` |
| 4 | Chat | Message bubbles (text, image, video, audio, document, template, location); delivery ticks; 24-hour window banner with time left; composer with smart replies, attach, media library, canned responses, template, interactive message, bot automations, create deal; typing indicator | `/conversations/:id/messages`, `/read`, `/typing`, `/media` |
| 5 | Template picker | Search approved templates, fill variables, preview, send | `/templates` |
| 6 | Contact details | Status, lead status, email, groups, tags, custom fields, notes (one field), deals, bot on/off, block | `/contacts/:id`, `/notes`, `/toggle-bot`, `/block` |
| 7 | Assign sheet | Agents with Online / Away, role and team; unassign | `/conversations/:id/assign`, `/users` |
| 8 | Contacts list + detail + create/edit | Search, All tags, All groups | `/contacts*` |
| 9 | Dashboard overview | Range, Needs attention, 6 KPIs, last campaign funnel, message usage (admins), billing standing banner | `/analytics/dashboard`, billing usage, `/billing/standing` |
| 10 | Campaigns + detail | Status, live progress bar, delivered/read/failed, pause / resume / abort / retry failed | `/campaigns*` + socket `campaign:progress` |
| 11 | Templates list + detail | Status, quality, rejected reason, sent / delivery rate / read rate | `/templates*` |
| 12 | Notification center | Feed with mark-all-read | `/notifications`, `/notifications/read-all` |
| 13 | Me | Online / Away, push on/off (New), message sound, switch organization, canned responses, language | `/users/me/availability` |

### 5a. Alignment with the current system (checked 2026-10-14)

| Screen | Uses (existing) | Source |
|---|---|---|
| Inbox | Tabs All / Open / Pending / Closed; quick filters Unread, Assigned to me; filter by label; status chips open / pending / resolved / bot; one inbox label per chat; 24h window from `lastInboundAt` | `ConversationList.tsx`, `lib/inbox-params.ts`, `ConversationStatus`, `ConversationLabel` (unique per conversation) |
| Chat | Status change, assign, inbox label, smart replies, attach, media library, canned responses, templates (`/`), interactive message, bot automations, create deal, delivery ticks | `ConversationHeader.tsx`, `SendMessageForm.tsx`, `/conversations/:id/suggestions`, `MessageStatus` |
| Contact | Status, lead status, email, groups, first contact, last message, tags (`Contact.tags`), custom fields, one notes field, deals, bot on/off, block | `ContactPanel.tsx`, `PUT /contacts/:id/notes`, `/toggle-bot`, `/block` |
| Assign | Assign to one user; availability online / away; role and team shown | `POST /conversations/:id/assign` (`assignedTo` only), `User.availability` |
| Dashboard | Range today / 7d / 30d; KPIs Messages (in/out), Open conversations, New conversations, New contacts, Campaigns sent, Avg time to first reply; Needs attention; Last campaign funnel; message usage vs 500 free + bands | `GET /v1/analytics/dashboard`, `KpiGrid.tsx`, `AttentionList.tsx`, billing usage + `/v1/billing/standing` |
| Campaign | Sent / Delivered / Read / Failed / Pending / Expired; pause, resume, abort, retry failed | `/campaigns/:id/report`, `/pause`, `/resume`, `/abort`, `/requeue-failed` |
| Templates | Status, category, language, quality, rejected reason; Sent, delivery rate, read rate | `Template` model, `lib/template-analytics.ts` |
| Notifications | `new_message`, `conversation_assigned`, `closure_overdue` | `Notification` rows + socket `notification` event |
| Me | Availability online / away, message sound, organization switch, canned responses, language | `/users/me/availability`, settings > notifications (message sound), `OrganizationMember` |

Removed from the mockups because the system does not have them: internal notes and @mentions in chats, team assignment of a chat, "offline" availability, quiet hours, per-type notification settings, spend-vs-cap in currency, campaign cost estimate and creator, template reply counts, team workload screen, calling.

### Phase 2: Pull ahead

| Feature | Detail | Existing API |
|---|---|---|
| AI suggested replies | Already on web; ship in P1 on mobile | `/conversations/:id/suggestions` |
| AI conversation summary | "Catch me up" button at the top of long chats | `/conversations/:id/summarize` |
| AI answer from knowledge base | Answer drafted from info materials | `/ai/rag-answer` |
| Translate | Tap a message to translate; composer translate-before-send | **New** |
| Voice note transcription | Text under incoming voice notes | transcriptions route |
| Team workload (proposal) | Agents online, open chats per agent. Not in web today, so not drawn in the mockups | **New endpoint + web parity first** |
| Billing | Balance, current statement, pay link, payment-pause banner | billing routes |
| Deals quick view | Deals on the contact sheet, move stage | `/deals/:id/stage` |
| Home screen widget + app icon badge | Unread count for my chats | **New** |

### Phase 3: Owner all-in-one (AiSensy match)

- Send a broadcast from an approved template to a group or segment (simple 3-step wizard, no flow builder).
- Create a template with AI (`/ai/creator/template/generate`), then submit for approval.
- Sign up and connect WhatsApp (embedded Meta signup in an in-app browser).
- Simple keyword auto-reply on/off.

### Not planned on mobile

Flow builder, chatbot builder, roles and permissions editor, webhooks, API credentials, custom field definitions, branding, CSV import, the admin console, and voice calls. These show an "Open on web" link.

## 6. Key user flows

**F1: First launch**
Install → Sign in with Clerk (email → password → code if new device or 2FA) → (Org picker) → Explain why we need notifications → System permission prompt → Inbox (Mine). If permission is denied, show a persistent banner on Inbox with a "Turn on" link to system settings.

**F2: Reply from a notification (main flow)**
Push "Priya Shah: Is the order shipped?" → Tap → Opens Chat directly (deep link `wbmsg://conversation/:id`) → Message marked read → Reply → Back goes to Inbox. With the app open, an in-app banner appears instead of a system push.

**F3: 24-hour window closed**
Agent opens chat → Banner "Free-form replies closed, send a template" → Composer replaced with "Choose template" → Template picker → Fill variables → Preview → Send.

**F4: Manager triages unassigned chats**
Inbox → Unassigned → Swipe left on a chat → Assign → Pick agent (online first) → Agent gets a push.

**F5: Admin checks a campaign**
Dashboard → Last campaign → Campaign detail → Retry failed. While a campaign is running, the progress bar updates live (socket `campaign:progress`) and Pause / Resume / Abort are available (Abort asks for confirmation). Needs the `campaigns_pause_resume` permission.

**F6: Sending paused for non-payment**
Red banner on Inbox and Today: "Sending is paused, payment overdue" → Tap → Billing → Pay link (web checkout). Agents see the banner without the payment link.

**F7: Going away**
Me → Availability → Away → teammates see the agent as Away (same as web). Away does not change auto-assignment or alerts today; changing that would be new backend work.

## 7. Notifications design

Mobile push mirrors the in-app notification types that already exist:

| Type (existing) | Who gets it today | Mobile push |
|---|---|---|
| `new_message` | Assignee of the conversation | **New:** push to all the assignee's devices (today: in-app row + socket only) |
| `conversation_assigned` | The assigned user | Push (today only fires for new auto-assigned chats; extend to manual assigns) |
| `closure_overdue` | The contact's assigned user | Push |

Rules: group pushes per conversation (no flood of 10 pushes for 10 messages); app icon badge = unread chats assigned to me (not push count, which is WATI's known complaint); tap opens the exact screen (the notification's `action` already holds the target, e.g. `/inbox?conversation=<id>`).

## 8. Non-functional requirements

- **Real time:** Socket.IO connection while the app is open (same events as web: `new-message`, `conversation:assigned`, `campaign:progress`, `notification`), with refetch on reconnect and when the app comes to the foreground. No 3-second polling.
- **Offline:** Cache the last 50 chats and their latest messages; queue outgoing messages and retry with a visible "Sending… / Failed, tap to retry" state.
- **Security:** Every request sends the Clerk session token; tokens kept in SecureStore; no data in push payload beyond the contact name and a 100-character preview (setting to hide previews); optional biometric app lock.
- **Global product:** All text in translation files from day one (English first), RTL-safe layouts, local time and number formats.
- **Accessibility:** Dynamic text size, screen reader labels, 44 pt minimum tap targets, contrast checked in light and dark.
- **Performance:** Cold start < 2 s on a mid-range Android; long chat lists virtualized.
- **Distribution:** EAS Build + EAS Update (over-the-air fixes); internal → TestFlight / Play internal track → staged rollout.

## 9. Engineering changes required

### Mobile app (existing prototype in `apps/mobile`)
The current code is a prototype and should be rebuilt on the same folder:
- API calls send no auth header; two different push-token registrations (`PUT {token, platform}` and `POST {pushToken}`).
- Dependency versions mismatch (Expo SDK 51 with `expo-*` 55 packages); the build scripts use the retired `expo build`.
- One QueryClient per screen; Inbox polls every 3 s instead of using the socket.
- Contacts and Settings tabs are placeholders.

Plan: upgrade to one consistent Expo SDK, a single API client with the Clerk token, one QueryClient at the root, Socket.IO client, shared types from `@WBMSG/shared`, a design token system matching web branding.

### API
| Change | Why |
|---|---|
| Start using the existing `UserDevice` table (many devices per user) instead of the single `User.pushToken` | Users with phone + tablet; sign-out removes only that device. Table exists but nothing writes to it today |
| One push-token endpoint (drop the duplicate) | Consistency |
| Push on every inbound message to the assignee, and on new unassigned chats to eligible users | Today push fires only when a new chat is auto-assigned |
| Push on/off per device | Me screen |
| (Later, optional) more notification types: campaign done, template status, billing standing | Not in the system today; decide separately |
| Unread count endpoint for badge | Badge accuracy |
| Team workload endpoint (P2) | Manager view |
| Translation endpoint (P2) | Translate |

All touched routes need the standard org scoping + RBAC audit.

## 10. Delivery phases

| Phase | Scope | Rough size |
|---|---|---|
| **P0: Foundation** | SDK upgrade, auth client, API client, socket, design system, navigation shell, device table + push pipeline, CI builds | 2 weeks |
| **P1: Launch** | Screens 1–13, flows F1–F7, notifications section 7, store listings | 4–5 weeks |
| **P2: Lead** | AI summary / translate, transcription, team workload (needs web parity first), widget/badge | 3–4 weeks |
| **P3: Owner** | Mobile broadcast, AI template creation, mobile signup + WhatsApp connect, keyword auto-reply | 3–4 weeks |

Sizes are estimates for planning only and will be firmed up in the implementation plan.

## 11. Open decisions for the owner

1. **Store identity:** app name and publisher account (Apple Developer + Google Play) under which company?
2. **Brand look:** reuse the web app's colours/logo as-is, or a mobile-specific refresh?
3. **Biometric lock:** optional per user, or enforceable by org admins?
4. **Push preview text:** show message text by default, or hide by default for privacy?
5. **Phase 3:** confirm we want mobile signup and broadcast creation, or keep the app agent/manager focused.
6. **Minimum OS:** iOS 16.4+ (the Expo SDK 57 floor) and Android 10+ (same as respond.io).

## 12. Next steps

1. Owner reviews this PRD and answers section 11.
2. Clickable visual mockups of the Phase 1 screens and flows for sign-off.
3. Implementation plan for P0 + P1.
