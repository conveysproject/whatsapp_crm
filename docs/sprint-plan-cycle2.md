# TrustCRM — Cycle 2 Sprint Plan

> **Goal:** Close all Critical + High + Medium parity gaps vs WhatsJet v7.2.0
> **Source:** `docs/whatsjet-parity-comparison.md` — 46 gaps (11 Critical · 16 High · 22 Medium · 15 Low)
> **Target:** ~97% feature parity + our existing CRM/AI advantages
> **Format:** 10 sprints × 2 weeks = 20 weeks (~5 months)
> **Start:** May 2026

---

## Sprint Overview

| Sprint | Theme | Gaps Closed | Est. Effort |
|---|---|---|---|
| 2.1 | Labels & Tags System | C1, H4, M21 | 2 weeks |
| 2.2 | Media Pipeline | C2, C3, C10, M20 | 2 weeks |
| 2.3 | Interactive Messages & Carousel Templates | C4, H10, H16, M18, M19 | 2 weeks |
| 2.4 | Campaign Engine Hardening | C6, C7, C8, C9, C11, H14, M13 | 2 weeks |
| 2.5 | Inbox Chat Upgrade | H3, M15, M22 | 2 weeks |
| 2.6 | Campaign UI Completion | C5, H1, H2, H12 | 2 weeks |
| 2.7 | Bot/Flow Enhancements + Info Materials | H7, H13, H15, L6 | 2 weeks |
| 2.8 | Billing UI + AI Summaries | H5, H6, M2, M17 | 2 weeks |
| 2.9 | Admin, Multi-tenant & Device APIs | H8, H9, H11, M9, M11, M12 | 2 weeks |
| 2.10 | Platform Polish | M1, M3, M4, M5, M6, M7, M8, M16, M18, M20 | 2 weeks |

**After Cycle 2:** ~97% parity. Remaining ~3% = intentional architectural divergence (Clerk auth, BullMQ vs DB queue, YooMoney/Paystack).

---

## Sprint 2.1 — Labels & Tags System

**Duration:** 2 weeks
**Depends on:** Nothing (standalone)
**Unlocks:** Sprint 2.5 inbox label filtering

### Goal
Full labels/tags system — CRUD, assignment, filtering — matching WhatsJet's 6 API endpoints plus UI.

### Tasks

#### API (`apps/api`)
- [ ] `GET /v1/labels` — list all org labels
- [ ] `POST /v1/labels` — create label (`name`, `textColor`, `bgColor`)
- [ ] `PATCH /v1/labels/:id` — update label name/colors
- [ ] `DELETE /v1/labels/:id` — delete label
- [ ] `POST /v1/contacts/:id/labels` — assign labels to contact
- [ ] `DELETE /v1/contacts/:id/labels/:labelId` — unassign label from contact
- [ ] `POST /v1/messages/:id/labels` — assign label to a message (message_labels)
- [ ] `GET /v1/contacts?labelId=` — filter contacts by label

#### DB (`apps/api/prisma/schema.prisma`)
- [ ] Add `textColor` + `bgColor` String fields to `Label` model (defaults `#ffffff` / `#6366f1`)
- [ ] Run `prisma db push` + create migration file

#### Web (`apps/web`)
- [ ] `/settings/labels` page — label list with create/edit/delete + color picker
- [ ] `LabelBadge` component — renders colored pill from `textColor`/`bgColor`
- [ ] Contact detail page — label manager section (assign/unassign)
- [ ] Contacts list page — label filter dropdown

### Definition of Done
- All 6 API endpoints tested with `app.inject()`
- Labels visible on contact detail page with correct colors
- Label filter works on contacts list

---

## Sprint 2.2 — Media Pipeline

**Duration:** 2 weeks
**Depends on:** Nothing (standalone)
**Unlocks:** Sprint 2.3 (interactive messages need media upload)

### Goal
Complete the media roundtrip: upload to WhatsApp, download incoming media, and mark messages as read.

### Tasks

#### API (`apps/api`)
- [ ] `POST /v1/media/upload` — multipart upload; calls Meta `uploadMedia`; returns `{ mediaId, url, mimeType }`
- [ ] `GET /v1/media/:mediaId` — proxy download of a WhatsApp media file (signed URL or stream)
- [ ] Wire `apps/api/src/lib/whatsapp.ts` — implement real `uploadMedia()`, `downloadMedia()`, `uploadResumableMedia()` (currently stubs)

#### Workers (`apps/api/src/workers`)
- [ ] `inbound-message.worker.ts` — after storing message, if `mediaId` present: call `downloadMedia()`, upload to S3/R2, store `mediaUrl` on `Message`
- [ ] `inbound-message.worker.ts` — call `markAsRead(messageId, phoneNumberId)` after every processed message

#### Web (`apps/web`)
- [ ] Attachment menu in inbox — wire document/image/video/audio buttons to `POST /v1/media/upload` then send message
- [ ] `MediaMessage` component — renders image/video/document/audio from `mediaUrl` in conversation thread

### Definition of Done
- Incoming image messages download and render in inbox
- Agent can send an image from inbox attachment menu
- All incoming messages are marked as read via Meta API

---

## Sprint 2.3 — Interactive Messages & Carousel Templates

**Duration:** 2 weeks
**Depends on:** Sprint 2.2 (media upload for media headers in carousel)

### Goal
Send all 5 interactive message types and build carousel template support in the template builder.

### Tasks

#### API (`apps/api`)
- [ ] `POST /v1/conversations/:id/messages` — extend `contentType` to accept `interactive`
  - Payload schema for `button` (up to 3 buttons)
  - Payload schema for `list` (sections + rows)
  - Payload schema for `cta_url` (header + body + CTA button)
  - Payload schema for `flow` (flow ID + CTA)
  - Payload schema for `catalog` (thumbnail product ID)
- [ ] Wire `whatsapp.ts` — implement real `sendInteractiveMessage()` for all 5 types
- [ ] `POST /v1/templates/:id/send-carousel` — send carousel template to contact
- [ ] Wire `whatsapp.ts` — implement `sendCarouselTemplateMessage()`
- [ ] `GET /v1/templates/:id/rejection-reason` — calls Meta `getTemplateRejectionReason()`
- [ ] `PATCH /v1/templates/:id` — update template via Meta API
- [ ] `DELETE /v1/templates/:id` — delete template via Meta API
- [ ] `GET /v1/whatsapp-account/qr-code` — calls Meta `getQrCode()`

#### Web (`apps/web`)
- [ ] Template builder — add carousel type with card editor (body, media header, up to 2 buttons per card, button types: QUICK_REPLY/URL/PHONE_NUMBER/FLOW)
- [ ] Template builder — add interactive type selector (button / list / CTA URL)
- [ ] Template detail — show rejection reason if `status === "rejected"`
- [ ] WhatsApp account settings — QR code display panel
- [ ] Conversation composer — "Send Interactive" button opening modal with type selector

### Definition of Done
- Can create and send a button message from inbox
- Carousel template renders in builder with card/button editor
- Rejected templates show rejection reason from Meta

---

## Sprint 2.4 — Campaign Engine Hardening

**Duration:** 2 weeks
**Depends on:** Sprint 2.3 (field substitution uses template variables)

### Goal
Production-grade campaign sending: per-message retry, rate limit compliance, dynamic fields, auto result groups, and scheduled maintenance workers.

### Tasks

#### Workers (`apps/api/src/workers`)
- [ ] `campaign.worker.ts` — refactor sending loop:
  - Send in chunks of 50 messages with 200ms sleep between chunks
  - Detect WhatsApp error codes `130429` (rate limit) and `613` (throttled) → exponential backoff
  - Per-message status update to `CampaignRecipient` (pending → sent / failed)
  - On failure: store error in `CampaignRecipient.errorMessage`, do not skip silently
  - Retry failed recipients up to 3 times before marking as `permanent_fail`
- [ ] `campaign.worker.ts` — dynamic field substitution:
  - Replace `{first_name}`, `{last_name}`, `{phone_number}`, `{email}` from Contact
  - Replace `{custom_field_name}` from `ContactCustomFieldValue` lookup
- [ ] `campaign.worker.ts` — auto create contact groups after campaign completes:
  - Create groups: `[CampaignName] - Delivered`, `[CampaignName] - Read`, `[CampaignName] - Failed`, `[CampaignName] - Expired`
  - Add matching contacts into each group
- [ ] `campaign.worker.ts` — 24-hour delivery window check before sending each message
- [ ] `message-cleanup.worker.ts` — wire to cron: run daily, delete messages older than `vendor_settings.auto_delete_days`
- [ ] New `template-sync.worker.ts` — scheduled worker (runs every 6 hours):
  - Calls `getTemplates()` from Meta for each org
  - Updates `Template.status` (pending/approved/rejected)
  - Updates `Template.rejectionReason` if rejected

#### DB (`apps/api/prisma/schema.prisma`)
- [ ] `CampaignRecipient` — add `errorMessage String?`, `attemptCount Int default 0`, `lastAttemptAt DateTime?`
- [ ] `Campaign` — add `createdByUserId String?` → relation to `User`

#### API (`apps/api`)
- [ ] `POST /v1/campaigns/:id/requeue-failed` — re-enqueue all `permanent_fail` recipients back to pending

### Definition of Done
- 1000-contact test campaign sends in chunks without hitting rate limits
- `{first_name}` is replaced correctly in sent messages
- Template statuses sync from Meta within 6 hours of approval/rejection
- Auto result groups created after campaign completion

---

## Sprint 2.5 — Inbox Chat Upgrade

**Duration:** 2 weeks
**Depends on:** Sprint 2.1 (label filtering)

### Goal
Transform the inbox into a full agent workspace: conversation tabs, assignment, right sidebar, and online status tracking.

### Tasks

#### API (`apps/api`)
- [ ] `GET /v1/conversations` — add query params: `filter=mine|unassigned|all`, `assignedTo=userId`, `labelId=`, `unreadOnly=true`
- [ ] `PUT /v1/conversations/:id/assign` — assign conversation to user or team
- [ ] `GET /v1/users/online-status` — return map of `{ userId: "online"|"idle"|"offline" }`
- [ ] `POST /v1/users/heartbeat` — update user's `lastSeenAt` (called every 60s from client)

#### DB (`apps/api/prisma/schema.prisma`)
- [ ] `User` — add `lastSeenAt DateTime?` field
- [ ] `Contact` — add `disableAiBot Boolean default false`, `disableReplyBot Boolean default false` (split the single `disableBot`)

#### Workers / Socket.io
- [ ] `inbound-message.worker.ts` — emit `conversation:assigned`, `conversation:unassigned` events via Socket.io
- [ ] Online status helper: `lastSeenAt < 2min` = online, `2–5min` = idle, `>5min` = offline

#### Web (`apps/web`)
- [ ] Inbox sidebar — tab bar: **All / Mine / Unassigned / Others**
  - "Others" opens a dropdown listing team members with their online status badge
- [ ] Inbox sidebar — unread-only toggle
- [ ] Inbox sidebar — debounced search input (500ms)
- [ ] Inbox sidebar — label filter dropdown (from Sprint 2.1)
- [ ] Conversation right panel (new):
  - Assign agent dropdown with online status indicators
  - AI bot toggle + Reply bot toggle (separate)
  - Labels manager (assign/remove/color)
  - Notes text editor (`PUT /v1/contacts/:id/notes`)
- [ ] `useHeartbeat` hook — calls `POST /v1/users/heartbeat` every 60s
- [ ] `OnlineStatusDot` component — green/yellow/grey dot

### Definition of Done
- "Mine" tab shows only conversations assigned to logged-in user
- Agent can assign a conversation to another agent from right panel
- Online status dot updates without page refresh

---

## Sprint 2.6 — Campaign UI Completion

**Duration:** 2 weeks
**Depends on:** Sprint 2.4 (campaign engine must support plain text before UI exposes it)

### Goal
Complete campaign management screens and emit real-time progress events.

### Tasks

#### API (`apps/api`)
- [ ] `POST /v1/campaigns` + `PATCH /v1/campaigns/:id` — support `campaignType: "template" | "text"` with `textBody` field for plain text campaigns
- [ ] `campaign.worker.ts` — handle `text` campaign type: call `sendMessage()` instead of `sendTemplateMessage()`

#### Workers / Socket.io
- [ ] `campaign.worker.ts` — emit via Socket.io every 50 messages:
  - `campaign:progress` — `{ campaignId, sent, failed, total, percentage }`
- [ ] `campaign.worker.ts` — emit `campaign:completed` and `campaign:aborted` events

#### Web (`apps/web`)
- [ ] `/campaigns` — add "Active / Archived" tab toggle
- [ ] `/campaigns/[id]/edit` — campaign edit page (template/target/schedule)
- [ ] `/campaigns/new` — add campaign type selector: "Template Message" vs "Text Message"
  - Text campaign: textarea for body with `{first_name}` insert button
- [ ] `/campaigns/[id]` — campaign detail page:
  - Abort button → `POST /v1/campaigns/:id/abort` (visible when status=running)
  - Archive/Unarchive button
  - Real-time progress bar using Socket.io `campaign:progress` event
  - Recipient status breakdown: sent / failed / delivered / read counts
- [ ] `/campaigns` — "Requeue Failed" button per campaign card

### Definition of Done
- Can create and send a plain text broadcast campaign
- Campaign detail shows live progress bar while running
- Abort button stops campaign within one chunk (≤50 messages)

---

## Sprint 2.7 — Bot/Flow Enhancements + Info Materials

**Duration:** 2 weeks
**Depends on:** Sprint 2.2 (media upload for bot media replies)

### Goal
Complete the bot experience: timing windows, media library, preview endpoint, and interactive reply types in the flow builder.

### Tasks

#### DB (`apps/api/prisma/schema.prisma`)
- [ ] New `InfoMaterial` model:
  ```
  id, organizationId, name, type (image|video|document|audio), url, fileUrl, description, createdAt, updatedAt
  ```

#### API (`apps/api`)
- [ ] `GET /v1/info-materials` — list org's media library
- [ ] `POST /v1/info-materials` — upload + create entry (calls `POST /v1/media/upload` internally)
- [ ] `PATCH /v1/info-materials/:id` — update name/description
- [ ] `DELETE /v1/info-materials/:id` — delete
- [ ] `GET /v1/auto-replies/:id/preview/:contactId` — simulate bot reply for a contact (substitute dynamic fields)
- [ ] `PUT /v1/vendor-settings` — extend to accept `botStartTime`, `botEndTime`, `botTimezone`, `aiBotStartTime`, `aiBotEndTime`

#### Workers (`apps/api/src/workers`)
- [ ] `inbound-message.worker.ts` — before triggering bot/AI bot, check vendor timing window:
  - Parse `botStartTime`/`botEndTime` in `botTimezone`
  - Suppress bot if current time is outside window
- [ ] `flow.worker.ts` — support `interactive` node type in flow: send button/list message via `sendInteractiveMessage()`
- [ ] `flow.worker.ts` — support `media` node type: send image/document/audio from `InfoMaterial`

#### Web (`apps/web`)
- [ ] `/settings/media-library` — info materials page (grid of assets, upload button, delete)
- [ ] `/settings/vendor-settings` — add bot timing section: start time, end time, timezone picker
- [ ] Flow builder — add interactive node type (button/list) to node palette
- [ ] Flow builder — add media node type with info material picker
- [ ] Bot reply list — "Preview" button → calls preview endpoint → shows rendered response

### Definition of Done
- Bot does not respond outside configured hours
- Agent can preview a bot reply for any contact
- Flow can send a button message node
- Info materials grid shows uploaded assets

---

## Sprint 2.8 — Billing UI + AI Summaries

**Duration:** 2 weeks
**Depends on:** Nothing (standalone)

### Goal
Full billing management UI and AI-powered conversation summaries per contact.

### Tasks

#### API (`apps/api`)
- [ ] `GET /v1/billing/subscriptions` — list org's subscriptions with plan tier, status, next billing date
- [ ] `POST /v1/billing/switch-plan` — upgrade/downgrade plan tier (Stripe `subscriptions.update`)
- [ ] `GET /v1/billing/transactions` — paginated transaction history across all gateways
- [ ] `GET /v1/billing/plans` — return plan tiers with feature limits (contacts/campaigns/bots/etc.)
- [ ] `POST /v1/conversations/:id/summarize` — generate AI summary via Claude; store result in `Contact.pastAiSummary`
- [ ] `GET /v1/contacts/:id` — include `pastAiSummary` in response
- [ ] `POST /v1/vendor-settings/marketing-messages/enable` — calls `processEnableTemplateAnalytics()` and `getMarketingMessageOnboardingStatus()`

#### DB (`apps/api/prisma/schema.prisma`)
- [ ] `Contact` — add `pastAiSummary String?`

#### Workers (`apps/api/src/workers`)
- [ ] `inbound-message.worker.ts` — after conversation ends (24h inactivity), enqueue summary job
- [ ] New `conversation-summary.worker.ts` — calls Claude API with last N messages + existing summary → generates concise summary → updates `Contact.pastAiSummary`

#### Web (`apps/web`)
- [ ] `/settings/billing` — full billing page:
  - Current plan card with feature limits (contacts used / limit, campaigns used / limit)
  - "Upgrade Plan" / "Downgrade Plan" buttons with plan comparison table
  - Transaction history table (date, amount, gateway, status)
- [ ] Contact detail page — "AI Summary" card showing `pastAiSummary` with "Regenerate" button
- [ ] WhatsApp account settings — "Enable Marketing Messages" section with onboarding status

### Definition of Done
- Billing page shows current plan limits with usage bars
- Plan switching triggers Stripe subscription update
- AI summary generates and displays on contact detail page

---

## Sprint 2.9 — Admin, Multi-tenant & Device APIs

**Duration:** 2 weeks
**Depends on:** Nothing (standalone)

### Goal
Super-admin can manage vendors; push notifications work on mobile; missing API endpoints filled.

### Tasks

#### DB (`apps/api/prisma/schema.prisma`)
- [ ] `Organization` — add `type String?` (org vertical: Restaurant / Retail / Healthcare / etc.)
- [ ] `LoginLog` model — `id, userId, orgId, ipAddress, userAgent, success Boolean, createdAt`

#### API (`apps/api`)
- [ ] `POST /v1/users/device-token` — register/update `UserDevice.pushToken` (Expo token)
- [ ] Custom fields management:
  - `GET /v1/contacts/custom-fields` — list org custom fields
  - `POST /v1/contacts/custom-fields` — create field (name, type: text/number/date/select, options[])
  - `PATCH /v1/contacts/custom-fields/:id` — update
  - `DELETE /v1/contacts/custom-fields/:id` — delete
- [ ] Admin routes (`/v1/admin/`):
  - `GET /v1/admin/organizations` — list all orgs with plan tier, member count, message count
  - `GET /v1/admin/organizations/:id` — org detail
  - `POST /v1/admin/organizations/:id/impersonate` — generate short-lived impersonation token (JWT scoped to that org, 1h TTL)
  - `DELETE /v1/admin/organizations/:id/impersonate` — revoke impersonation
  - `PATCH /v1/admin/organizations/:id` — update plan tier / ban / unban
- [ ] `POST /v1/auth/login-log` — record login event (called from Clerk webhook on `session.created`)
- [ ] `GET /v1/admin/login-logs` — audit log for super-admin

#### Web (`apps/web`)
- [ ] `/settings/custom-fields` — field list with add/edit/delete; field type selector
- [ ] `/(admin)/organizations` — improve: vendor table with plan tier, status, member count, actions
- [ ] `/(admin)/organizations/[id]` — vendor detail:
  - Plan/status management
  - "Login as this vendor" button → stores impersonation token in session → redirects to dashboard
  - Subscription history
  - Usage stats (messages sent, contacts, active campaigns)
- [ ] Impersonation banner — when impersonating, show banner "Viewing as [OrgName]" with "Exit" button
- [ ] `/(admin)/login-logs` — audit log table

### Definition of Done
- Super-admin can click "Login as Vendor" and see their dashboard
- Mobile device token registers and receives push notification on test send
- Custom fields appear on contact detail page

---

## Sprint 2.10 — Platform Polish

**Duration:** 2 weeks
**Depends on:** All previous sprints (visual polish on completed features)

### Goal
Navigation, theming, i18n scaffolding, and remaining WhatsApp API gaps. Get the product to GA-ready visual quality.

### Tasks

#### API (`apps/api`)
- [ ] `GET /v1/whatsapp-account/qr-code` — call Meta `getQrCode()` (if not done in 2.3)
- [ ] `PATCH /v1/templates/:id` — update template via Meta API (if not done in 2.3)
- [ ] `DELETE /v1/templates/:id` — delete via Meta API (if not done in 2.3)
- [ ] `POST /v1/campaigns/:id/requeue-failed` — manual requeue UI endpoint (if not done in 2.4)
- [ ] `GET /v1/contacts/export` — add download button to contacts page (if not done)

#### Web (`apps/web`)
- [ ] **Breadcrumbs** — `Breadcrumb` component added to all dashboard page layouts
- [ ] **Dark mode** — Tailwind dark mode class strategy; toggle switch in top bar; persisted in `localStorage`
- [ ] **Custom app colors** — 12 CSS variable system:
  - `configurations` table stores `app_primary_color` … `dark_mode_app_danger_color`
  - Admin `/platform-config` page — color picker for each variable
  - CSS variables injected via `<style>` tag in root layout
- [ ] **Language switcher** — top bar locale selector; `next-intl` or `react-i18next` setup; English only at launch, i18n strings extracted for future translation
- [ ] **Contact export button** — "Export CSV" button on `/contacts` page
- [ ] **Advanced contact filter** — filter panel: lifecycle stage, label, group, custom field values, date range
- [ ] **Manual requeue UI** — `/campaigns/[id]` page — "Requeue Failed Recipients" button
- [ ] **Template sync button** — `/templates` page — "Sync from Meta" button → triggers template-sync worker
- [ ] **WhatsApp QR code** — `/settings/whatsapp-account` — QR code section with display + regenerate
- [ ] **Bot execution Socket.io events** — `flow.worker.ts` emits `bot:triggered`, `bot:completed` → inbox shows "Bot is responding…" indicator
- [ ] **Assignment Socket.io events** — `conversation:assigned` event → inbox sidebar updates tab counts in real-time

#### Mobile (`apps/mobile`)
- [ ] Wire device token registration — call `POST /v1/users/device-token` on app launch with Expo push token
- [ ] Campaign list screen — show status badge + progress for running campaigns
- [ ] Conversation screen — render media messages (image/audio) using Sprint 2.2 `mediaUrl`

### Definition of Done
- Dark mode toggle works across all pages
- Primary brand color changes propagate immediately
- Breadcrumbs present on all dashboard pages
- Mobile app registers for push notifications

---

## Gap Coverage Tracker

| Gap ID | Description | Sprint | Done? |
|---|---|---|---|
| C1 | Labels/Tags API | 2.1 | — |
| C2 | Media upload endpoint | 2.2 | — |
| C3 | Incoming media download | 2.2 | — |
| C4 | Interactive messages | 2.3 | — |
| C5 | Non-template campaigns | 2.6 | — |
| C6 | Per-message retry | 2.4 | — |
| C7 | Template Meta sync | 2.4 | — |
| C8 | Message cleanup scheduling | 2.4 | — |
| C9 | Request pooling + rate limiting | 2.4 | — |
| C10 | markAsRead() call | 2.2 | — |
| C11 | Dynamic field substitution | 2.4 | — |
| H1 | Campaign editing UI | 2.6 | — |
| H2 | Campaign abort UI | 2.6 | — |
| H3 | Chat assignment/routing UI | 2.5 | — |
| H4 | Label/tag UI | 2.1 | — |
| H5 | Billing/subscription UI | 2.8 | — |
| H6 | AI conversation summaries | 2.8 | — |
| H7 | Bot preview endpoint | 2.7 | — |
| H8 | Custom fields management UI | 2.9 | — |
| H9 | Device token storage endpoint | 2.9 | — |
| H10 | Carousel/interactive template types | 2.3 | — |
| H11 | Vendor/multi-tenant admin screens | 2.9 | — |
| H12 | Campaign progress Socket.io events | 2.6 | — |
| H13 | Bot timing windows | 2.7 | — |
| H14 | Dynamic campaign result groups | 2.4 | — |
| H15 | Info materials / media library | 2.7 | — |
| H16 | Template rejection reason | 2.3 | — |
| M1 | Platform i18n scaffolding | 2.10 | — |
| M2 | Subscription plan management | 2.8 | — |
| M3 | Contact export UI | 2.10 | — |
| M4 | Advanced contact filtering | 2.10 | — |
| M5 | Breadcrumb navigation | 2.10 | — |
| M6 | Theme / dark mode | 2.10 | — |
| M7 | Language switcher | 2.10 | — |
| M8 | Manual requeue UI | 2.10 | — |
| M9 | Login as vendor | 2.9 | — |
| M10 | User timezone/language (normalized) | Deferred | — |
| M11 | Organization type/vertical | 2.9 | — |
| M12 | Login audit tracking | 2.9 | — |
| M13 | Campaign creator tracking | 2.4 | — |
| M14 | Mobile app feature parity | 2.10 | — |
| M15 | User online status | 2.5 | — |
| M16 | Custom app colors (12-variable) | 2.10 | — |
| M17 | Marketing Messages onboarding | 2.8 | — |
| M18 | WhatsApp QR code | 2.3 / 2.10 | — |
| M19 | Template update/delete via Meta | 2.3 | — |
| M20 | Resumable media upload | 2.2 | — |
| M21 | Label custom colors | 2.1 | — |
| M22 | Separate AI bot / reply bot flags | 2.5 | — |

**Intentionally deferred (Low / architectural divergence):**
- L1 Addon/plugin architecture — post-GA
- L9 OpenAI 3-mode RAG — evaluate after GA
- L12–L15 PayPal/Paystack/YooMoney/PhonePe — by market demand
- L10 RTL support — i18n phase 2
- L11 Microsoft Translator — i18n phase 2
- M10 User timezone normalized field — refactor post-GA

---

## Dependencies Graph

```
2.1 Labels ──────────────────────────────► 2.5 Inbox (label filter)
2.2 Media ───────────────────────────────► 2.3 Interactive (media in carousel)
                                          ► 2.7 Bot/Flow (media nodes)
2.3 Interactive ─────────────────────────► 2.4 Campaign (text type)
2.4 Campaign Hardening ──────────────────► 2.6 Campaign UI
All sprints 2.1–2.9 ─────────────────────► 2.10 Polish (polish what's built)
```

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Meta API stubs take longer to wire | Medium | High (blocks 2.2, 2.3) | Spike in week 1 of 2.2; stub with real API key early |
| WhatsApp rate limits in campaign testing | Medium | Medium | Use test phone numbers; send to ≤10 contacts in dev |
| Prisma migrations on Windows (no interactive TTY) | Low | Medium | Always use `db push + migrate resolve` per CLAUDE.md |
| Dark mode Tailwind class conflicts | Low | Low | Use `darkMode: 'class'` strategy; test on `/inbox` first |
| Impersonation security (Sprint 2.9) | Medium | High | Short-lived JWT (1h), audit log every use, admin-only endpoint |

---

*Generated: 2026-05-09 | Covers 46 gaps → targets ~97% WhatsJet parity*
*Reference: `docs/whatsjet-parity-comparison.md`*
