# Functional Parity Matrix — WhatsJet v7.2.0 → TrustCRM

> **Source of Truth:** `docs/WhatsJet_Legacy_System_Master_Documentation_v7.2.0.md` + all 15 Supplement parts
> **Generated:** 2026-05-18 | **Coverage:** DB 85% · API ~51% (revised after supplement review) · Meta API 60% · UI 58%
> **Supplement gaps:** See `docs/migration/16-supplement-gaps-complete.md` for 49 additional gaps found in Parts 1–15

---

## Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Fully implemented and verified |
| ⚠️ | Partially implemented — gaps documented below |
| ❌ | Not implemented — critical gap |
| 🔒 | SuperAdmin-only feature |
| 📱 | Mobile app feature |

---

## Module 1: Authentication & Session Management

| Feature | WhatsJet Route | TrustCRM | Status | Notes |
|---------|---------------|----------|--------|-------|
| Email/password login | `POST /login` | Clerk auth | ✅ | Auth delegated to Clerk |
| Registration | `POST /register` | Clerk | ✅ | Clerk-managed |
| Logout | `POST /logout` | Clerk | ✅ | |
| Password reset (email) | `POST /forgot-password` | Clerk | ✅ | |
| TOTP 2FA enable | `POST /2fa/enable` | Clerk 2FA | ✅ | Clerk-managed |
| TOTP 2FA verify | `POST /2fa/verify` | Clerk 2FA | ✅ | |
| 2FA recovery codes (view) | `GET /2fa/recovery-codes` | Clerk | ✅ | |
| 2FA recovery codes (regen) | `POST /2fa/recovery-codes/regenerate` | Clerk | ✅ | |
| Self-managed session store | `user_auth_tokens` table | None | ❌ | WhatsJet stores tokens in DB; TrustCRM uses Clerk JWTs — no native session table |
| NativeSession middleware | Yantrana middleware | None | ❌ | Legacy session-based auth pattern not replicated |
| Remember-me tokens | `remember_token` in users | None | ❌ | Clerk handles session TTL |
| Email verification | Fortify flow | Clerk | ✅ | |
| Impersonation (SuperAdmin) | Admin login-as | None | ❌ | No admin impersonation in TrustCRM |

**Coverage: 9/13 (69%)**

---

## Module 2: User Management

| Feature | WhatsJet Route | TrustCRM | Status | Notes |
|---------|---------------|----------|--------|-------|
| List users | `GET /users` | `GET /v1/users` | ✅ | |
| Create user | `POST /users` | Clerk invite | ✅ | |
| Update user profile | `PUT /users/:id` | `PUT /v1/users/:id` | ✅ | |
| Delete user | `DELETE /users/:id` | `DELETE /v1/users/:id` | ✅ | |
| Assign role | `POST /users/:id/role` | `PUT /v1/users/:id/permissions` | ⚠️ | WhatsJet has granular `user_roles` table; TrustCRM uses JSON permissions blob |
| Role definitions (CRUD) | `GET/POST/PUT/DELETE /roles` | Enum only | ❌ | WhatsJet allows custom role creation; TrustCRM has fixed enum `OrganizationRole` |
| User permissions grid | `GET /users/:id/permissions` | `GET /v1/users/:id` | ⚠️ | Permissions grid UI exists; API partially maps |
| Team/department grouping | `teams` table | None | ❌ | No team grouping in TrustCRM |
| User activity log | `activity_log` table | None | ❌ | No audit trail per-user |
| User avatar upload | `POST /users/:id/avatar` | Clerk profile | ⚠️ | Clerk handles avatar |
| User online status | Redis presence | Socket.io | ⚠️ | Socket.io presence not fully implemented |
| User timezone setting | `users.timezone` | None | ❌ | |
| Notification preferences | `user_notification_settings` | None | ❌ | |

**Coverage: 6/13 (46%)**

---

## Module 3: Contact Management

| Feature | WhatsJet Route | TrustCRM | Status | Notes |
|---------|---------------|----------|--------|-------|
| List contacts | `GET /contacts` | `GET /v1/contacts` | ✅ | |
| Create contact | `POST /contacts` | `POST /v1/contacts` | ✅ | |
| Update contact | `PUT /contacts/:id` | `PUT /v1/contacts/:id` | ✅ | |
| Delete contact | `DELETE /contacts/:id` | `DELETE /v1/contacts/:id` | ✅ | |
| Bulk import (CSV) | `POST /contacts/import` | `POST /v1/contacts/import` | ✅ | BullMQ worker handles async |
| Export contacts | `GET /contacts/export` | None | ❌ | |
| Contact labels (list) | `GET /contacts/labels` | None | ❌ | Labels CRUD entirely missing |
| Contact labels (create) | `POST /contacts/labels` | None | ❌ | |
| Contact labels (update) | `PUT /contacts/labels/:id` | None | ❌ | |
| Contact labels (delete) | `DELETE /contacts/labels/:id` | None | ❌ | |
| Assign label to contact | `POST /contacts/:id/labels` | None | ❌ | |
| Remove label from contact | `DELETE /contacts/:id/labels/:lid` | None | ❌ | |
| Block contact | `POST /contacts/:id/block` | `POST /v1/contacts/:id/block` | ✅ | |
| Unblock contact | `POST /contacts/:id/unblock` | `POST /v1/contacts/:id/unblock` | ✅ | |
| Toggle bot for contact | `POST /contacts/:id/toggle-bot` | `POST /v1/contacts/:id/toggle-bot` | ✅ | |
| Contact notes | `PUT /contacts/:id/notes` | `PUT /v1/contacts/:id/notes` | ✅ | |
| Assign contact to agent | `PUT /contacts/:id/assign` | `PUT /v1/contacts/:id/assign` | ✅ | |
| Contact segments | `GET /segments` | `GET /v1/segments` | ✅ | |
| Segment CRUD | full CRUD | full CRUD | ✅ | |
| Custom fields | `contact_custom_fields` table | `ContactCustomField` | ✅ | |
| Contact search | Meilisearch | Meilisearch | ✅ | |
| Contact timeline | `GET /contacts/:id/timeline` | None | ❌ | Interaction history |
| Merge duplicates | `POST /contacts/merge` | None | ❌ | |
| Contact opt-out | `contacts.opt_out` | `Contact.optedOut` | ✅ | |

**Coverage: 15/24 (63%)**

---

## Module 4: WhatsApp Chat / Inbox

| Feature | WhatsJet Route | TrustCRM | Status | Notes |
|---------|---------------|----------|--------|-------|
| List conversations | `GET /conversations` | `GET /v1/conversations` | ✅ | |
| Get conversation | `GET /conversations/:id` | `GET /v1/conversations/:id` | ✅ | |
| Send text message | `POST /messages` | `POST /v1/messages` | ✅ | |
| Send image | Media send | `POST /v1/messages` | ✅ | |
| Send video | Media send | `POST /v1/messages` | ✅ | |
| Send audio | Media send | `POST /v1/messages` | ✅ | |
| Send document | Media send | `POST /v1/messages` | ✅ | |
| Send location | `POST /messages` (location type) | None | ❌ | |
| Send contact card | `POST /messages` (contacts type) | None | ❌ | |
| Send interactive buttons | `POST /messages` (interactive) | None | ❌ | 5 interactive types missing |
| Send list message | Interactive list type | None | ❌ | |
| Send reply buttons | Interactive reply_button | None | ❌ | |
| Send CTA URL | Interactive cta_url | None | ❌ | |
| Send flow message | Interactive flow type | None | ❌ | |
| Mark message as read | `POST /messages/read` | None | ❌ | |
| Assign conversation | `PUT /conversations/:id/assign` | `PUT /v1/conversations/:id/assign` | ✅ | |
| Close conversation | `PUT /conversations/:id/close` | `PUT /v1/conversations/:id/close` | ✅ | |
| Reopen conversation | `PUT /conversations/:id/reopen` | `PUT /v1/conversations/:id/reopen` | ✅ | |
| Conversation labels | `POST /conversations/:id/labels` | None | ❌ | |
| Message reactions | Webhook handled | Webhook | ⚠️ | Incoming only |
| Message status updates | Webhook (read/delivered) | Webhook | ⚠️ | Partially handled |
| Canned responses | `GET /canned-responses` | `GET /v1/canned-responses` | ✅ | |
| Canned response CRUD | Full CRUD | Full CRUD | ✅ | |
| Upload media (direct) | `POST /media/upload` | None | ❌ | Direct upload to Meta not wired |
| Download media | `GET /media/:id` | None | ❌ | |
| Carousel template send | Template type carousel | None | ❌ | |
| Real-time message push | Pusher/Soketi | Socket.io | ✅ | Different transport |

**Coverage: 14/27 (52%)**

---

## Module 5: Campaign Engine

| Feature | WhatsJet Route | TrustCRM | Status | Notes |
|---------|---------------|----------|--------|-------|
| Create campaign | `POST /campaigns` | `POST /v1/campaigns` | ✅ | |
| List campaigns | `GET /campaigns` | `GET /v1/campaigns` | ✅ | |
| Update campaign | `PUT /campaigns/:id` | `PUT /v1/campaigns/:id` | ✅ | |
| Delete campaign | `DELETE /campaigns/:id` | `DELETE /v1/campaigns/:id` | ✅ | |
| Schedule campaign | `campaigns.scheduled_at` | `campaigns.scheduledAt` | ✅ | |
| Pause campaign | `POST /campaigns/:id/pause` | None | ❌ | |
| Resume campaign | `POST /campaigns/:id/resume` | None | ❌ | |
| Campaign analytics | `GET /campaigns/:id/analytics` | `GET /v1/campaigns/:id/analytics` | ✅ | |
| Campaign result groups | `campaign_groups` table | None | ❌ | WhatsJet auto-groups by delivery status |
| Campaign duplicate | `POST /campaigns/:id/duplicate` | None | ❌ | |
| A/B testing | `campaign_ab_tests` table | None | ❌ | |
| Campaign BullMQ worker | Redis queue | BullMQ worker | ✅ | |
| Rate limiting (per WABA) | `campaign_rate_limiter` | None | ⚠️ | BullMQ rate limiter exists but not WABA-specific |

**Coverage: 8/13 (62%)**

---

## Module 6: Bot Reply (Auto-Reply)

| Feature | WhatsJet Route | TrustCRM | Status | Notes |
|---------|---------------|----------|--------|-------|
| List bot replies | `GET /bot-replies` | `GET /v1/chatbots` | ✅ | Different naming |
| Create bot reply | `POST /bot-replies` | `POST /v1/chatbots` | ✅ | |
| Update bot reply | `PUT /bot-replies/:id` | `PUT /v1/chatbots/:id` | ✅ | |
| Delete bot reply | `DELETE /bot-replies/:id` | `DELETE /v1/chatbots/:id` | ✅ | |
| Toggle bot active | `PUT /bot-replies/:id/toggle` | None | ❌ | |
| Bot timing window | `bot_replies.start_time`/`end_time` | None | ❌ | Time-based activation not in TrustCRM |
| Bot preview/test | `POST /bot-replies/:id/preview` | None | ❌ | |
| Quick reply handler | `bot_quick_replies` table | None | ❌ | |
| Keyword matching | `bot_replies.match_type` | `Chatbot.triggerType` | ✅ | |
| Media in bot reply | `bot_replies.__data.media` | None | ⚠️ | JSON blob in WhatsJet; not mapped |

**Coverage: 5/10 (50%)**

---

## Module 7: Bot Flow (Visual Flow Builder)

| Feature | WhatsJet Route | TrustCRM | Status | Notes |
|---------|---------------|----------|--------|-------|
| List flows | `GET /bot-flows` | `GET /v1/flows` | ✅ | |
| Create flow | `POST /bot-flows` | `POST /v1/flows` | ✅ | |
| Update flow | `PUT /bot-flows/:id` | `PUT /v1/flows/:id` | ✅ | |
| Delete flow | `DELETE /bot-flows/:id` | `DELETE /v1/flows/:id` | ✅ | |
| Flow nodes (CRUD) | `bot_flow_nodes` table | `FlowNode` | ✅ | |
| Flow edges | `bot_flow_edges` table | `FlowEdge` | ✅ | |
| Flow publish/activate | `POST /bot-flows/:id/publish` | None | ❌ | |
| Flow version history | `bot_flow_versions` table | None | ❌ | |
| Flow analytics | `GET /bot-flows/:id/analytics` | None | ❌ | |
| Flow import/export | `POST /bot-flows/import` | None | ❌ | |
| Flow test/preview | `POST /bot-flows/:id/test` | None | ❌ | |

**Coverage: 6/11 (55%)**

---

## Module 8: AI Bot

| Feature | WhatsJet Route | TrustCRM | Status | Notes |
|---------|---------------|----------|--------|-------|
| AI text response | OpenAI text mode | Anthropic Claude | ✅ | Different provider |
| AI assistant mode | OpenAI Assistant API | None | ❌ | WhatsJet uses persistent assistants |
| Flowise integration | Flowise API | None | ❌ | External AI flow builder |
| AI conversation history | `ai_conversations` table | `AiConversation` | ✅ | |
| AI model config per vendor | Vendor-level OpenAI key | `AiSettings` | ✅ | |
| AI training data upload | `POST /ai/training` | None | ❌ | |
| AI prompt templates | `ai_prompts` table | None | ❌ | |
| Whisper transcription | None | `lib/whisper.ts` | ✅ | TrustCRM has more |
| ElevenLabs TTS | None | `lib/elevenlabs.ts` | ✅ | TrustCRM has more |

**Coverage: 5/9 (56%) — TrustCRM has 2 features beyond WhatsJet**

---

## Module 9: Template Management

| Feature | WhatsJet Route | TrustCRM | Status | Notes |
|---------|---------------|----------|--------|-------|
| List templates | `GET /templates` | `GET /v1/templates` | ✅ | |
| Create template | `POST /templates` | `POST /v1/templates` | ✅ | |
| Update template | `PUT /templates/:id` | `PUT /v1/templates/:id` | ✅ | |
| Delete template | `DELETE /templates/:id` | `DELETE /v1/templates/:id` | ✅ | |
| Sync from Meta | `POST /templates/sync` | `POST /v1/templates/sync` | ✅ | |
| Template approval status | `templates.status` | `Template.status` | ✅ | |
| Template variables | `template_variables` table | `TemplateVariable` | ✅ | |
| Carousel template | Template category carousel | None | ❌ | New Meta feature not implemented |
| Template analytics | `GET /templates/:id/analytics` | None | ❌ | |
| Template categories | Meta-defined | Supported | ✅ | |

**Coverage: 8/10 (80%)**

---

## Module 10: Subscription & Billing

| Feature | WhatsJet Route | TrustCRM | Status | Notes |
|---------|---------------|----------|--------|-------|
| Stripe checkout | Stripe | `lib/stripe.ts` | ✅ | |
| Stripe webhooks | Stripe | Stripe | ✅ | |
| PayPal | PayPal SDK | None | ❌ | |
| Razorpay | Razorpay SDK | None | ❌ | India-critical gateway |
| Paystack | Paystack | None | ❌ | |
| YooMoney | YooMoney | None | ❌ | |
| PhonePe | PhonePe | None | ❌ | India-critical gateway |
| UPI | UPI | None | ❌ | India-critical gateway |
| Bank Transfer | Manual | None | ❌ | |
| Subscription plans (list) | `GET /plans` | `GET /v1/billing/plans` | ✅ | |
| Current subscription | `GET /subscription` | `GET /v1/billing/subscription` | ✅ | |
| Cancel subscription | `POST /subscription/cancel` | `POST /v1/billing/cancel` | ✅ | |
| Invoice history | `GET /invoices` | None | ❌ | |
| Promo codes | `promo_codes` table | None | ❌ | |
| Addon purchases | `subscription_addons` table | None | ❌ | |
| Credit-based billing | `subscription_credits` table | None | ❌ | |
| Trial management | `subscriptions.trial_ends_at` | `Subscription.trialEndsAt` | ✅ | |

**Coverage: 6/18 (33%)**

---

## Module 11: Vendor Settings

| Feature | WhatsJet Route | TrustCRM | Status | Notes |
|---------|---------------|----------|--------|-------|
| Get all settings | `GET /vendor-settings` | `GET /v1/vendor-settings` | ✅ | Returns flat map |
| Bulk update settings | `PUT /vendor-settings` | `PUT /v1/vendor-settings` | ✅ | |
| Sound notification setting | `GET/PUT /vendor-settings/sound-notification` | `GET/PUT /v1/vendor-settings/sound-notification` | ✅ | |
| WhatsApp account health | `GET /whatsapp-account/health-status` | `GET /v1/whatsapp-account/health-status` | ✅ | |
| Business profile | `GET/PUT /whatsapp-account/business-profile` | `GET/PUT /v1/whatsapp-account/business-profile` | ✅ | |
| Display name | `PUT /whatsapp-account/display-name` | `PUT /v1/whatsapp-account/display-name` | ✅ | |
| Sync phone numbers | `POST /whatsapp-account/sync-phone-numbers` | `POST /v1/whatsapp-account/sync-phone-numbers` | ✅ | |
| Register phone | `POST /whatsapp-account/register-phone` | `POST /v1/whatsapp-account/register-phone` | ✅ | |
| Two-step verification | `POST /whatsapp-account/two-step-verification` | `POST /v1/whatsapp-account/two-step-verification` | ✅ | |
| Connect webhook | `POST /whatsapp-account/connect-webhook` | `POST /v1/whatsapp-account/connect-webhook` | ✅ | |
| Disconnect account | `POST /whatsapp-account/disconnect-account` | `POST /v1/whatsapp-account/disconnect-account` | ✅ | |
| Branding (logo, favicon) | `POST /organizations/branding/:slug` | `POST /v1/organizations/branding/:slug` | ✅ | |
| Working hours | `working_hours` table | None | ❌ | |
| Away message | `away_messages` table | None | ❌ | |

**Coverage: 12/14 (86%)**

---

## Module 12: Configuration / SuperAdmin Console

| Feature | WhatsJet Route | TrustCRM | Status | Notes |
|---------|---------------|----------|--------|-------|
| List all vendors | `GET /admin/vendors` | None | ❌ | Entire SuperAdmin console missing |
| Vendor details | `GET /admin/vendors/:id` | None | ❌ | |
| Impersonate vendor | `POST /admin/vendors/:id/login` | None | ❌ | |
| Suspend vendor | `POST /admin/vendors/:id/suspend` | None | ❌ | |
| System settings | `GET/PUT /admin/settings` | None | ❌ | |
| Payment gateway config | `PUT /admin/gateways/:name` | None | ❌ | |
| Email config | `PUT /admin/email-config` | None | ❌ | |
| Plan management (CRUD) | `CRUD /admin/plans` | None | ❌ | |
| License management | `admin_licenses` table | None | ❌ | |
| Activity logs | `GET /admin/activity-logs` | None | ❌ | |
| System health | `GET /admin/health` | None | ❌ | |
| Announcements | `admin_announcements` table | None | ❌ | |
| Global templates | `GET /admin/global-templates` | None | ❌ | |
| Audit reports | `GET /admin/reports` | None | ❌ | |

**Coverage: 0/14 (0%) — CRITICAL GAP**

---

## Module 13: Translation / i18n

| Feature | WhatsJet Route | TrustCRM | Status | Notes |
|---------|---------------|----------|--------|-------|
| Multi-language UI | **68 locales** in `languages.php` (confirmed Part 5 §4) | English only | ❌ | Zero i18n in TrustCRM |
| Language switcher | `locale` session var | None | ❌ | |
| RTL support | Arabic/Hebrew | None | ❌ | |
| Translation strings | `lang/*.php` files | None | ❌ | |
| Dynamic translation | `__()` helper | None | ❌ | |

**Coverage: 0/5 (0%) — CRITICAL GAP**

---

## Module 14: Media / Info Materials

| Feature | WhatsJet Route | TrustCRM | Status | Notes |
|---------|---------------|----------|--------|-------|
| Upload media file | `POST /media` | None | ❌ | |
| List media library | `GET /media` | None | ❌ | |
| Delete media | `DELETE /media/:id` | None | ❌ | |
| Download media | `GET /media/:id/download` | None | ❌ | |
| Info materials (docs) | `info_materials` table | None | ❌ | Table entirely missing |
| Media categories | `media_categories` table | None | ❌ | |

**Coverage: 0/6 (0%) — CRITICAL GAP**

---

## Module 15: Dashboard & Analytics

| Feature | WhatsJet Route | TrustCRM | Status | Notes |
|---------|---------------|----------|--------|-------|
| Overview metrics | `GET /dashboard` | `GET /v1/analytics` | ✅ | |
| Message stats | `GET /analytics/messages` | `GET /v1/analytics/messages` | ✅ | |
| Contact growth | `GET /analytics/contacts` | `GET /v1/analytics/contacts` | ✅ | |
| Campaign performance | `GET /analytics/campaigns` | `GET /v1/analytics/campaigns` | ✅ | |
| Agent performance | `GET /analytics/agents` | None | ❌ | |
| Response time metrics | `GET /analytics/response-time` | None | ❌ | |
| Export analytics (CSV) | `GET /analytics/export` | None | ❌ | |
| Date range filtering | All routes | All routes | ✅ | |
| Real-time dashboard | Pusher | Socket.io | ⚠️ | Not fully wired |

**Coverage: 5/9 (56%)**

---

## Module 16: Public Pages / CMS

| Feature | WhatsJet Route | TrustCRM | Status | Notes |
|---------|---------------|----------|--------|-------|
| Landing page | `GET /` | `apps/conveys` | ⚠️ | Conveys marketing site exists |
| Pricing page | `GET /pricing` | None | ❌ | No pricing page in TrustCRM web |
| Blog | `GET /blog` | None | ❌ | |
| Documentation | `GET /docs` | None | ❌ | |
| Contact form | `POST /contact` | None | ❌ | |
| CMS admin | `/admin/pages` | None | ❌ | |

**Coverage: 1/6 (17%)**

---

## Module 17: External REST API (Developer / Partner API)

> **Source:** Master Doc §4.1 — Base URL `/{vendorUid}/`, auth via Bearer token (`vendor_api_access_token` from vendor settings)

| Feature | WhatsJet Route | TrustCRM | Status | Notes |
|---------|---------------|----------|--------|-------|
| Send text/interactive message | `POST /{vendorUid}/contact/send-message` | None | ❌ | Entire developer API missing |
| Get message delivery status | `GET /{vendorUid}/contact/message-status` | None | ❌ | |
| Send media message | `POST /{vendorUid}/contact/send-media-message` | None | ❌ | |
| Get approved template list | `GET /{vendorUid}/contact/template-list` | None | ❌ | |
| Send template message | `POST /{vendorUid}/contact/send-template-message` | None | ❌ | |
| Send carousel template | `POST /{vendorUid}/contact/send-carousel-template-message` | None | ❌ | |
| Send interactive message (buttons/list) | `POST /{vendorUid}/contact/send-interactive-message` | None | ❌ | |
| Create contact | `POST /{vendorUid}/contact/create` | None | ❌ | |
| Update contact by phone number | `POST /{vendorUid}/contact/update/{phoneNumber}` | None | ❌ | |
| Assign team member to contact | `POST /{vendorUid}/contact/assign-team-member` | None | ❌ | |
| Paginated contact list | `GET /{vendorUid}/contacts` | None | ❌ | |
| Get single contact (by phone/email) | `GET /{vendorUid}/contact` | None | ❌ | |
| Get contact groups | `GET /{vendorUid}/contact/groups` | None | ❌ | |
| Get labels and tags | `GET /{vendorUid}/contact/labels-tags` | None | ❌ | |
| Assign groups to contact | `POST /{vendorUid}/contact/assign-groups` | None | ❌ | |
| Unassign groups from contact | `POST /{vendorUid}/contact/unassign-groups` | None | ❌ | |
| Assign labels to contact | `POST /{vendorUid}/contact/assign-labels` | None | ❌ | |
| Unassign labels from contact | `POST /{vendorUid}/contact/unassign-labels` | None | ❌ | |
| Schedule campaign | `POST /{vendorUid}/campaign/schedule` | None | ❌ | |
| Paginated campaign list | `GET /{vendorUid}/campaign` | None | ❌ | |
| Campaign status details | `GET /{vendorUid}/campaign-status/{campaignUid}` | None | ❌ | |
| API key management (`vendor_api_access_token`) | Vendor settings key | None | ❌ | Token stored in vendor_settings |
| API documentation | Swagger | Swagger | ✅ | TrustCRM has Swagger |

**Coverage: 1/23 (4%) — CRITICAL GAP**

> Previous matrix showed 8 items with generic routes. Master Doc §4.1 documents 21 vendor-scoped endpoints + key management + Swagger = 23 total.

---

## Module 18: Mobile App Companion API

> **Source:** Master Doc §4.2 — Middleware `app_api.vendor.authenticate`, Base Path `/api/vendor/`

| Feature | WhatsJet Route | TrustCRM | Status | Notes |
|---------|---------------|----------|--------|-------|
| Unread message count | `GET /api/vendor/whatsapp/chat/unread-count` | None | ❌ | Entire mobile API missing |
| Load chat view | `GET /api/vendor/whatsapp/contact/chat/{contactUid?}` | None | ❌ | |
| Paginate messages (prepend/append) | `GET /api/vendor/whatsapp/contact/chat-data/{contactUid}/{way?}` | None | ❌ | |
| Send text message (mobile) | `POST /api/vendor/whatsapp/contact/chat/send` | None | ❌ | |
| Send media message (mobile) | `POST /api/vendor/whatsapp/contact/chat/send-media` | None | ❌ | |
| Prepare media uploader | `GET /api/vendor/whatsapp/contact/chat/prepare-send-media/{mediaType?}` | None | ❌ | |
| Clear chat history (mobile) | `POST /api/vendor/whatsapp/contact/chat/clear-history/{contactUid}` | None | ❌ | |
| Chat box data (labels + team members) | `GET /api/vendor/whatsapp/contact/chat-box-data/{contactUid}` | None | ❌ | |
| Contact datatable list (mobile) | `GET /api/vendor/contacts/list-data` | None | ❌ | |
| Contact create form support data | `GET /api/vendor/contacts/add-support-data` | None | ❌ | |
| Create contact (mobile) | `POST /api/vendor/contacts/add-process` | None | ❌ | |
| Contact edit form support data | `GET /api/vendor/contacts/{id}/get-edit-support-data` | None | ❌ | |
| Update contact (mobile) | `POST /api/vendor/contacts/update-process` | None | ❌ | |
| Delete contact (mobile) | `POST /api/vendor/contacts/{id}/delete-process` | None | ❌ | |
| Bulk delete contacts (mobile) | `POST /api/vendor/contacts/delete-selected-process` | None | ❌ | |
| Bulk assign groups (mobile) | `POST /api/vendor/contacts/assign-groups-selected-process` | None | ❌ | |
| Contact filter support data | `GET /api/vendor/contacts/filter-support-data` | None | ❌ | |
| Save contact filter (mobile) | `POST /api/vendor/contacts/filter-store-process` | None | ❌ | |
| Active bots for contact | `GET /api/vendor/bot-replies/{contactUid}/all-active-bots` | None | ❌ | |
| Bot preview (mobile) | `GET /api/vendor/bot-replies/{botUid}/{contactId}/bot-preview` | None | ❌ | |
| Bot quick reply (mobile) | `POST /api/vendor/bot-replies/quick-reply-process` | None | ❌ | |
| Campaign list by status (mobile) | `GET /api/vendor/whatsapp/campaign/{status}/list-data` | None | ❌ | |
| Non-template preset list (mobile) | `GET /api/vendor/whatsapp/campaign/non-template-message-presets/{status}/list-data` | None | ❌ | |
| Campaign status dashboard (mobile) | `GET /api/vendor/whatsapp/campaign/dashboard/{campaignUid}/status` | None | ❌ | |
| Mobile login | `POST /api/user/login-process` | None | ❌ | |
| Prepare sign-up (mobile) | `GET /api/user/prepare-sign-up` | None | ❌ | |
| Mobile registration | `POST /api/user/process-sign-up` | None | ❌ | |
| 2FA challenge (mobile) | `POST /api/user/two-factor-challenge` | None | ❌ | |
| Mobile logout | `POST /api/user/logout` | None | ❌ | |
| Upload temp media (mobile) | `POST /api/media/upload-temp-media/{uploadItem?}` | None | ❌ | |
| Push notification device token | `POST /api/user-device/token` | None | ❌ | FCM token for push notifications |

**Coverage: 0/31 (0%) — CRITICAL GAP**

---

## Summary by Module

| Module | WhatsJet Features | TrustCRM Implemented | Coverage |
|--------|------------------|---------------------|----------|
| Authentication | 13 | 9 | 69% |
| User Management | 13 | 6 | 46% |
| Contact Management | 24 | 15 | 63% |
| WhatsApp Chat/Inbox | 27 | 14 | 52% |
| Campaign Engine | 13 | 8 | 62% |
| Bot Reply | 10 | 5 | 50% |
| Bot Flow | 11 | 6 | 55% |
| AI Bot | 9 | 5 | 56% |
| Template Management | 10 | 8 | 80% |
| Subscription & Billing | 18 | 6 | 33% |
| Vendor Settings | 14 | 12 | 86% |
| SuperAdmin Console | 14 | 0 | **0%** |
| Translation / i18n | 5 | 0 | **0%** |
| Media / Info Materials | 6 | 0 | **0%** |
| Dashboard & Analytics | 9 | 5 | 56% |
| Public Pages / CMS | 6 | 1 | 17% |
| External REST API | 23 | 1 | 4% |
| Mobile App API | 31 | 0 | **0%** |
| **TOTAL** | **246** | **102** | **41%** |

---

## Database Parity Summary

| Metric | Value |
|--------|-------|
| WhatsJet tables | 46 |
| TrustCRM models mapped | 39 |
| Coverage | 85% |
| Missing tables | `info_materials`, `user_roles` (as table), `api_keys`, `working_hours`, `away_messages`, `admin_announcements` |
| New models in TrustCRM (beyond WhatsJet) | 21 |
| **Correction (Part 3 §1.4/§12.7)** | Webhook table name is `whatsapp_webhook_queue` (not `whatsapp_webhooks`); status field is string `'pending'` |
| **Correction (Part 3 §1.5/§12.5)** | `SubscriptionModel` uses PK `id` (not `_id`) — only model in system that overrides the `_id` convention |
| **New table (Part 3 §12.6)** | `vendor_users` — per-vendor user data model; `__data.permissions` stores the full permission JSON; linked to `users` via `users__id` |

---

---

## Supplement-Discovered Features (Previously Undocumented)

These features were found in the 15 supplement docs and are NOT in the original 200-feature count above. Each is a gap.

### Permission System — Cross-Cutting

| Feature | WhatsJet | TrustCRM | Status | Severity |
|---------|---------|----------|--------|---------|
| `assigned_chats_only` — agents see ONLY their assigned conversations | ✅ enforced in DB query | ❌ Not enforced | ❌ | P0 |
| `hide_contact_phone_numbers` — masks phone in ALL API responses | ✅ `maskString()` | ❌ No masking | ❌ | P0 |
| `hide_contact_emails` — masks email in ALL API responses | ✅ `maskString()` | ❌ No masking | ❌ | P0 |
| Full 9-key permission tree with sub-keys | ✅ defined in `permissions.php` | ⚠️ JSON blob, not validated | ⚠️ | P0 |
| VendorAdmin (role 2) always bypasses all permission checks | ✅ | ⚠️ Not documented | ⚠️ | P1 |

### Authentication — Additional Features

| Feature | WhatsJet | TrustCRM | Status |
|---------|---------|----------|--------|
| Social login Google/Facebook via Socialite | ✅ | ❌ | ❌ |
| Login logs to `login_logs` table | ✅ | ❌ | ❌ |
| Account activation required flow (status=4) | ✅ | ❌ | ❌ |

### Contact Management — Additional Features

| Feature | WhatsJet | TrustCRM | Status | Severity |
|---------|---------|----------|--------|---------|
| 24h service window — contacts with recent inbound message | ✅ filter + worker | ❌ | ❌ | P0 |
| Phone `wa_id` normalization via libphonenumber fallback | ✅ | ❌ Exact match only | ❌ | P1 |
| Dynamic contact tokens in messages: `{first_name}` etc. (9 types + custom) | ✅ | ❌ | ❌ | P1 |
| Contact advance filter saved per-user | ✅ | ❌ | ❌ | P2 |
| Contact group — 3 creation modes (failed/recampaign/filter) | ✅ | ❌ | ❌ | P1 |
| Contact group archived status (status=5) | ✅ | ❌ | ❌ | P2 |
| Import: validate exactly 7 fixed columns | ✅ documented spec | ⚠️ | ⚠️ | P1 |
| Export: phone numbers as `="XXXXXX"` in CSV (Excel safety) | ✅ | ❌ | ❌ | P1 |

### Campaign Engine — Additional Features

| Feature | WhatsJet | TrustCRM | Status |
|---------|---------|----------|--------|
| Campaign ABORT (status=6, distinct from pause) | ✅ | ❌ | ❌ |
| Campaign status computation rules (Upcoming/Awaiting/Executing/Executed/Aborted) | ✅ | ⚠️ | ⚠️ |
| Delete guard: only if `scheduled_at > now` OR `status=Awaiting` | ✅ | ❌ | ❌ |
| Non-template campaign presets (`NT_CAMPAIGN_MESSAGE` bot type) | ✅ | ❌ | ❌ |
| Campaign report Excel with phone masking | ✅ | ❌ | ❌ |

### Inbox / Messaging — Additional Features

| Feature | WhatsJet | TrustCRM | Status | Severity |
|---------|---------|----------|--------|---------|
| WA markdown rendering: `*bold*` `_italic_` `~strike~` code | ✅ | ❌ | ❌ | P1 |
| Message status downgrade protection (read/played cannot regress) | ✅ | ❌ | ❌ | P0 |
| Stuck message auto-recovery (processing → awaited after 5min) | ✅ | ❌ | ❌ | P1 |
| Message queue 7-state model | ✅ | ⚠️ BullMQ 4-state only | ⚠️ | P1 |

### Billing — Additional Features

| Feature | WhatsJet | TrustCRM | Status |
|---------|---------|----------|--------|
| Plan feature limit enforcement (contacts=2 on free!) | ✅ all 8 gates | ❌ No limits | ❌ **P0** |
| `api_access` plan gate for vendor webhook dispatch | ✅ | ❌ | ❌ |
| Cancel grace period vs immediate cancel | ✅ two modes | ❌ one mode | ❌ |
| Manual subscription proration + 9999-12-31 cap | ✅ | ❌ | ❌ |
| Subscription auto-recurring field | ✅ | ❌ | ❌ |
| YooMoney VAT/receipt items | ✅ | ❌ (not started) | ❌ |

### AI Bot — Additional Features

| Feature | WhatsJet | TrustCRM | Status |
|---------|---------|----------|--------|
| AI chat history summarization (`past_ai_summary`) | ✅ | ❌ | ❌ |
| AI text-RAG (embeddings + cosine similarity) | ✅ | ❌ | ❌ |

### Template — Additional Button Types

| Feature | WhatsJet | TrustCRM | Status |
|---------|---------|----------|--------|
| Template button: `VOICE_CALL` | ✅ | ❌ | ❌ |
| Template button: `DYNAMIC_URL_BUTTON` (with `{{1}}` variable) | ✅ | ❌ | ❌ |
| Template button: `COPY_CODE` | ✅ | ❌ | ❌ |
| Template analytics read% formula (read/delivered×100, capped 100) | ✅ | ⚠️ | ⚠️ |

### WhatsApp / WABA — Additional Features

| Feature | WhatsJet | TrustCRM | Status | Severity |
|---------|---------|----------|--------|---------|
| Embedded WABA sign-up (5-step OAuth flow) | ✅ | ❌ | ❌ | P1 |
| WABA health check — all 6 fields + token expiry | ✅ | ⚠️ | ⚠️ | P0 |
| WhatsApp QR code generation | ✅ | ❌ | ❌ | P2 |

### Settings / System — Additional Features

| Feature | WhatsJet | TrustCRM | Status |
|---------|---------|----------|--------|
| App settings `data_type` casting (string/bool/int/JSON/float) | ✅ | ❌ simple string | ❌ |
| CSRF exclusion for all payment webhooks | ✅ | ⚠️ partial | ⚠️ |
| API rate limit confirmed at 60/min | ✅ | ⚠️ exists, value? | ⚠️ |
| Plan usage widget on dashboard | ✅ | ❌ | ❌ |
| Microsoft Translator API for i18n | ✅ | ❌ | ❌ |
| Vendor webhook plan-gated (`api_access`) | ✅ | ❌ | ❌ |

---

## Revised Total Count (Including Supplement Features)

| Module | WhatsJet Features | TrustCRM Implemented | Revised Coverage |
|--------|------------------|---------------------|-----------------|
| Auth (with social, login logs) | 16 | 9 | 56% |
| User Management + Permissions | 18 | 6 | 33% |
| Contact Management (with all supplement features) | 32 | 15 | 47% |
| WhatsApp Chat/Inbox (with markdown, status guard) | 31 | 14 | 45% |
| Campaign Engine (with abort, NT presets) | 17 | 8 | 47% |
| Bot Reply (with tokens, uniqueness) | 13 | 5 | 38% |
| Bot Flow | 11 | 6 | 55% |
| AI Bot (with RAG, summarization) | 11 | 5 | 45% |
| Template (with all button types) | 13 | 8 | 62% |
| Subscription & Billing (with plan limits, proration) | 26 | 6 | 23% |
| Vendor Settings (with WABA, QR) | 17 | 12 | 71% |
| SuperAdmin Console | 14 | 0 | **0%** |
| Translation / i18n (with Microsoft Translator) | 6 | 0 | **0%** |
| Media / Info Materials | 6 | 0 | **0%** |
| Dashboard & Analytics (with plan usage) | 11 | 5 | 45% |
| Public Pages / CMS | 6 | 1 | 17% |
| External REST API (plan-gated) | 23 | 1 | 4% |
| Mobile App API | 31 | 0 | **0%** |
| **REVISED TOTAL** | **~319** | **~101** | **~32%** |

> **Coverage revised downward from 51% → ~39% after supplement review → ~32% after master doc audit.**
> Total gaps increased from 20 to **71 documented gaps** (added Mobile App API gap and hidden business logic gap).
> Master Doc §4.2 added 31 previously undocumented mobile endpoints; §4.1 expanded external API from 8 to 23.

---

---

## Supplement v7.2.0 Corrections & Additions

> **Source:** Supplement v7.2.0 (Part 2) — deep code scan. These correct or extend the Master Doc.

### Corrections to Previously Documented Items

| Item | Was | Corrected To | Source |
|------|-----|-------------|--------|
| Meta Graph API version | v17+ | **v25.0** | Supplement §1.6 |
| Laravel version | 10.x | **Laravel 12.0, PHP ^8.2** | Supplement §1.7 |
| Message queue states | 4 states | **7 states** (In Queue/Failed/Processing/Processed/Expired/Response-Awaited/Aborted) | Supplement §1.1 |
| Campaign send concurrency | Sequential | **50 concurrent HTTP pool + 200ms throttle per batch** | Supplement §1.5 |
| Permission stored keys | 9 conceptual keys | **9 top-level groups + 15 sub-permissions** in `vendor_users.__data.permissions` (authoritative source: `permissions.php` — see GAP-S04 in supplement gaps) | Part 3 §2.1 |

### Additional Parity Checklist Items (Supplement §20.5)

Features confirmed in deep code scan, not previously in parity checklist:

| Feature | WhatsJet | TrustCRM | Status |
|---------|---------|----------|--------|
| Login with username or mobile number (no `@` in login field) | ✅ | ❌ | ❌ |
| 2FA via recovery code (separate from TOTP) | ✅ | ❌ | ❌ |
| Social login (Google + Facebook) with email collision handling | ✅ | ❌ | ❌ |
| Signed URL account activation (48h expiry, status=4 pre-activation) | ✅ | ❌ | ❌ |
| Demo mode message prefix on all outgoing messages | ✅ | ❌ | ❌ |
| Business scope user ID on template sends | ✅ | ❌ | ❌ |
| HTTP pool (50 concurrent) for campaign sends | ✅ | ❌ | ❌ |
| 200ms throttle between campaign pool batches | ✅ | ❌ | ❌ |
| Campaign retry: connect error → 1min, rate limit (130429/613) → (n+5)min, >5 retries → final fail | ✅ | ❌ | ❌ |
| OpenAI RAG: embedding via `text-embedding-3-small`, cosine similarity, top-3 section selection | ✅ | ❌ | ❌ |
| Chat history summarization (last 6/30 messages → condensed summary in `contact.__data.past_ai_summary`) | ✅ | ❌ | ❌ |
| Vendor media UUID format validation before folder deletion | ✅ | ❌ | ❌ |
| Temp media cleanup (1-day threshold, 200-file chunks) | ✅ | ❌ | ❌ |
| QR code for WhatsApp links and UPI addresses | ✅ | ❌ | ❌ |
| Embedded signup via Meta OAuth (7-step flow incl. webhook SHA1 verify token) | ✅ | ❌ | ❌ |
| Phone-level webhook subscription (`override_callback_uri`) | ✅ | ❌ | ❌ |
| Mobile app token expiry 10 days; web token ~150 hours | ✅ | ❌ | ❌ |
| Locale RTL detection (Arabic, Hebrew etc.) + config reload after locale change | ✅ | ❌ | ❌ |
| CMS page engine with `show_in_menu` flag and slug-based routing | ✅ | ❌ | ❌ |
| `formatDateTime()` respects vendor timezone setting | ✅ | ⚠️ | ⚠️ |
| Central dashboard excludes `is_system_message` entries from message counts | ✅ | ⚠️ | ⚠️ |
| Mobile app API requires `lwAddonWhatsJetChatMobileApp` license (addon gate) | ✅ addon-gated | ❌ N/A | N/A |
| Zero-decimal currency billing (27 currencies; no ×100 for JPY, KRW, etc.) | ✅ | ❌ | ❌ |
| Contact re-campaign group from delivery results (type=`read`/`delivered`) | ✅ | ❌ | ❌ |
| External API response via `processExternalApiResponse()` (format differs from internal) | ✅ | ❌ | ❌ |

**Coverage impact:** +25 items identified; ~22 are ❌ gaps. Revised estimated total: ~344 features, ~101 implemented, **~29% overall coverage**.

*Last updated: 2026-05-18 | Source: Master doc + all 15 Supplement parts*

---

## Supplement Part 3 Additions

> **Source:** `WhatsJet_Legacy_System_Supplement_Part3_v7.2.0.md` — Engines, Controllers, Models, Commands, UI deep scan.

### Webhook & Background Job Behavior

| Feature | WhatsJet | TrustCRM | Status |
|---------|---------|----------|--------|
| Webhook age guard: auto-delete after 25 minutes (≈5 retry attempts) | ✅ | ❌ | ❌ |
| Webhook 'Unsupported' error → immediate delete (no requeue) | ✅ | ❌ | ❌ |
| Webhook verify token = `SHA1(vendorUid)`; special `'service-whatsapp'` path | ✅ | ❌ | ❌ |
| Dual scheduling mode: queue workers vs cron (`enable_queue_jobs_for_campaigns`) | ✅ | ❌ | ❌ |
| Webhooks cron: every 1 second, `withoutOverlapping(2)` | ✅ | ❌ | ❌ |
| Campaign cron: every 5 seconds, `withoutOverlapping(2)` | ✅ | ❌ | ❌ |
| Message cleanup: null `__data+message`, 1000-row batches, 200ms throttle, loop-until-zero | ✅ | ❌ | ❌ |

### Bot Flow Engine

| Feature | WhatsJet | TrustCRM | Status |
|---------|---------|----------|--------|
| Bot flow `start_trigger` change cascades to all child bot replies automatically | ✅ | ❌ | ❌ |
| Bot flow unsaved-changes guard + `window.onbeforeunload` | ✅ | ❌ | ❌ |
| Flow builder panzoom (zoom/pan canvas) | ✅ | ❌ | ❌ |

### Template Engine

| Feature | WhatsJet | TrustCRM | Status |
|---------|---------|----------|--------|
| Template categories: `MARKETING`, `UTILITY`, `AUTHENTICATION` only (not TRANSACTIONAL) | ✅ | ❌ check needed | ⚠️ |
| Carousel: min 2 cards, max 10 cards, max 2 buttons per card, min 1 QUICK_REPLY per card | ✅ | ❌ | ❌ |
| Template analytics 7 preset duration options (Current Month → Custom) | ✅ | ❌ | ❌ |

### Contact Management — UI/Validation

| Feature | WhatsJet | TrustCRM | Status |
|---------|---------|----------|--------|
| Contact bulk operations: delete all, assign groups to selected, delete selected | ✅ | ❌ | ❌ |
| Contact filter: `msg_start_date` must be `before_or_equal` `msg_end_date` (cross-field validation) | ✅ | ❌ | ❌ |
| Label color customization: `text_color` + `bg_color`, max 10 chars each | ✅ | ❌ | ❌ |

### Chat Inbox UI

| Feature | WhatsJet | TrustCRM | Status |
|---------|---------|----------|--------|
| Chat input: `Enter` = send, `Shift+Enter` = newline | ✅ | ❌ | ❌ |
| Chat 24-hour delivery window flag shown inline in message list | ✅ | ❌ | ❌ |

### Campaign Engine — Additional

| Feature | WhatsJet | TrustCRM | Status |
|---------|---------|----------|--------|
| Campaign recampaign modal: send to failed/delivered/read recipients → creates new group | ✅ | ❌ | ❌ |

### Email System

| Feature | WhatsJet | TrustCRM | Status |
|---------|---------|----------|--------|
| OTP password reset for mobile app (2-minute expiry, OTP code — not URL link) | ✅ | ❌ | ❌ |
| Welcome email with custom HTML content override (`$welcomeEmailContent`) | ✅ | ❌ | ❌ |

### Billing / Subscription Infrastructure

| Feature | WhatsJet | TrustCRM | Status |
|---------|---------|----------|--------|
| `VendorFrontend` middleware: active plan check on every vendor page (returns code 11 or `errors.no-active-plan` view) | ✅ | ❌ | ❌ |

### Translation Engine

| Feature | WhatsJet | TrustCRM | Status |
|---------|---------|----------|--------|
| Microsoft Translator API chunking (500 items per request, 15s sleep between chunks) | ✅ | ❌ | ❌ |
| Google Translate direct browser call (unofficial `gtx` endpoint) in translation view | ✅ | ❌ | ❌ |

### SuperAdmin / System

| Feature | WhatsJet | TrustCRM | Status |
|---------|---------|----------|--------|
| Addon ZIP installation: metadata.php validation, path depth ≤ 1, `optimize:clear` after install | ✅ | ❌ | ❌ |

**Part 3 net-new items: 22 features (all ❌ gaps). Revised estimated total: ~366 features, ~101 implemented, ~28% overall coverage.**

---

## Supplement Part 4 Additions

> **Source:** `WhatsJet_Legacy_System_Supplement_Part4_v7.2.0.md` — Laraware framework core, services, helpers, JS layer.

### Authentication & Security

| Feature | WhatsJet | TrustCRM | Status |
|---------|---------|----------|--------|
| Disposable email check via external API (`disposable.debounce.io`) on registration | ✅ | ❌ | ❌ |
| Demo mode (`IS_DEMO_MODE` env) — data masking, outgoing message prefix, read-only demo tenant | ✅ | ❌ | ❌ |
| Token registry table — server-side JWT revocation with predecessor token chain | ✅ (mobile) | ❌ (Clerk handles) | N/A |

### WABA / WhatsApp Account (Corrections)

| Feature | WhatsJet | TrustCRM | Status |
|---------|---------|----------|--------|
| `isWhatsAppBusinessAccountReady()` — 7 conditions checked (6 settings + NOT token_expired flag) | ✅ | ⚠️ | ⚠️ |

### System / Infrastructure

| Feature | WhatsJet | TrustCRM | Status |
|---------|---------|----------|--------|
| Response envelope: `{response_token, reaction, incident, client_models, data}` | ✅ | ❌ (uses `{data: ...}`) | INFO |
| HTML minification in production (removes comments, collapses whitespace via regex) | ✅ | ❌ (Next.js handles) | N/A |
| Per-request in-memory flash cache (`viaFlashCache()`) | ✅ | ❌ | INFO |
| User online status: 1=online, 2=idle (>2min), 3=offline (>5min) | ✅ *(has logic bug)* | ❌ | ❌ |
| UPI deep link format: `upi://pay?pa=...&pn=...&tr=...&tn=...&am=...&cu=INR` | ✅ | ❌ | ❌ |

**Part 4 net-new items: 5 features (3 ❌ gaps, 1 correction, 1 N/A). Revised estimated total: ~371 features, ~101 implemented, ~27% overall coverage.**

---

## Supplement Part 5 Additions

> **Source:** `WhatsJet_Legacy_System_Supplement_Part5_v7.2.0.md` — Final gap closure: tech-config, CoreRequest, validation classes, BaseEngine/Model/Repository/Mailer/MediaEngine, Utils, JS completion.

### Translation / i18n (Corrections)

| Feature | WhatsJet | TrustCRM | Status |
|---------|---------|----------|--------|
| **68 supported locales** (confirmed — not 15 as earlier doc stated) | ✅ 68 | ❌ English only | ❌ |
| `?lang=` URL override for locale (any page can switch locale) | ✅ | ❌ | ❌ |
| `__tr()` always HTML-escapes output by default | ✅ | ❌ | ❌ |
| Number formatting: Arabic/Hindi numerals via PHP `intl` NumberFormatter | ✅ | ❌ | ❌ |
| `.po` file pruning on re-scan (removes msgids no longer in source) | ✅ | ❌ | ❌ |

### Authentication / Registration (Corrections & Additions)

| Feature | WhatsJet | TrustCRM | Status |
|---------|---------|----------|--------|
| Mobile number uniqueness is GLOBAL (no per-country scoping) — same number cannot register twice across all vendors | ✅ (global unique) | ⚠️ TrustCRM may be per-org | ⚠️ |
| `disallow_disposable_emails` setting toggles disposable check — not always enforced | ✅ conditional | ❌ | ❌ |
| Login rate limit: 5 attempts per `email\|ip` combination; Fortify fires `Lockout` event | ✅ | ⚠️ Clerk handles | ⚠️ |

### Billing / Payments (Infrastructure)

| Feature | WhatsJet | TrustCRM | Status |
|---------|---------|----------|--------|
| Stripe test/live mode toggled at runtime from DB settings (`use_test_stripe`) — not env vars | ✅ | ❌ env-based only | ❌ |
| Mail config loaded from DB at boot (host, port, driver, credentials — all runtime-configurable) | ✅ | ❌ env-based only | ❌ |
| Soketi (self-hosted Pusher alternative) supported in broadcasting config | ✅ | ❌ | ❌ |

### Security Notes (Do NOT Replicate Vulnerabilities)

| Item | WhatsJet | TrustCRM Action |
|------|---------|----------------|
| Default RSA 1024-bit keypair hardcoded in `tech-config.php` — shared across all default installs | ✅ (vulnerability) | ❌ Use per-env keypair; never use WhatsJet defaults |

**Part 5 net-new items: 10 features (7 ❌ gaps, 2 corrections). Revised estimated total: ~381 features, ~101 implemented, ~26% overall coverage.**

---

## Supplement Part 6 Additions

> **Source:** `WhatsJet_Legacy_System_Supplement_Part6_v7.2.0.md` — Complete route registry, model fields, config completion.

### Campaign Engine — Additional Routes

| Feature | WhatsJet Route | TrustCRM | Status |
|---------|---------------|----------|--------|
| Archive campaign | `POST /campaign/:id/archive-process` | None | ❌ |
| Unarchive campaign | `POST /campaign/:id/unarchive-process` | None | ❌ |
| Requeue failed campaign messages | `POST /campaign/requeue/:id` | None | ❌ |
| Non-template campaign list | `GET /campaign/non-template/:status/list-data` | None | ❌ |
| Non-template message presets list | `GET /campaign/non-template-message-presets/:status/list-data` | None | ❌ |

### WhatsApp Account — Additional Routes

| Feature | WhatsJet Route | TrustCRM | Status |
|---------|---------------|----------|--------|
| Enable template analytics (Meta feature flag) | `POST /whatsapp/enable-template-analytics` | None | ❌ |
| Template analytics view mode toggle | `POST /whatsapp/process-template-change` | None | ❌ |
| Message log report view | `GET /whatsapp/message-log` | None | ❌ |
| Message log data (paginated, with incoming filter) | `GET /whatsapp/message-log-list/:isIncoming?/:start?/:end?` | None | ❌ |

### File Upload Restrictions (WhatsApp Media)

| Type | Allowed MIME | Extensions |
|------|-------------|-----------|
| Sticker | `image/webp` only | webp only |
| Image | `image/jpeg`, `image/png` | jpg, png, jpeg |
| Video | `video/mp4`, `video/3gp` | mp4, 3gp |
| Audio | aac, mp4, mpeg, amr, ogg, webm variants | aac, m4a, mp3, amr, ogg, webm |
| Document | txt, pdf, ppt, doc, xls, docx, xlsx, pptx, xml | same extensions |

TrustCRM status: ⚠️ partial (basic MIME validation exists but WhatsJet's exact type list not verified)

### JWT Token Duration (Confirmed Values)

| Token Type | Refresh After | Expiry |
|-----------|--------------|--------|
| Web | 50 minutes | 2.5 hours |
| Mobile | 7 days | 10 days |

TrustCRM: Uses Clerk which manages token TTL separately. N/A for web; mobile app Clerk Expo manages session.

### Model Data — `WhatsAppMessageLogModel.__data` Fields

| `__data` Field | Type | Note |
|---------------|------|------|
| `contact_data` | array | Snapshot of contact at send time |
| `initial_response` | array | Meta API initial response |
| `media_values` | array | Media file info |
| `template_proforma` | array | Template before send |
| `template_components` | array | Template components |
| `template_component_values` | array | Variable values |
| `webhook_responses` | array:extend | Delivery webhook events |
| `options` | array:extend | Additional options |
| `interaction_message_data` | array:extend | Interactive msg data |
| `other_message_data` | array:extend | Misc message data |
| `system_message_data` | array | System event data |
| `campaign_type` | string | Campaign type if campaign msg |
| `preset_message_id` | string | Bot reply ID |
| `send_message_via_marketing_message_api` | boolean | Marketing API flag |

TrustCRM gap: `Message` model's JSON data field likely does not track all 14 fields above.

**Part 6 net-new items: 9 routes (all ❌) + 14 model fields documented. Revised estimated total: ~390 features, ~101 implemented, ~26% overall coverage.**

---

## Supplement Part 7 Additions

> **Source:** `WhatsJet_Legacy_System_Supplement_Part7_v7.2.0.md` — HomeEngine, remaining models, WhatsAppServiceController validation.

### Multi-Vendor User Membership

| Feature | WhatsJet | TrustCRM | Status |
|---------|---------|----------|--------|
| One user (email) can be a member of multiple vendors — each membership has its own `VendorUserModel` record with separate permission JSON | ✅ | ⚠️ TrustCRM `OrganizationMembership` is one-per-user-per-org | ⚠️ |

### Campaign Validation (Additional Rules)

| Feature | WhatsJet | TrustCRM | Status |
|---------|---------|----------|--------|
| Campaign `expire_at` must be `after:schedule_at` — cannot expire before it starts | ✅ | ❌ | ❌ |
| Campaign type restricted to `['template', 'non-template']` — any other value is 404 | ✅ | ⚠️ | ⚠️ |

### Landing Page / Public

| Feature | WhatsJet | TrustCRM | Status |
|---------|---------|----------|--------|
| Contact form with reCAPTCHA v2 verification (Google `siteverify` API) | ✅ | ❌ | ❌ |

**Part 7 net-new items: 4 features (2 ❌, 1 ⚠️ correction, 1 ❌). Revised estimated total: ~394 features, ~101 implemented, ~26% overall coverage.**

---

## Supplement Part 8 Additions

> **Source:** `WhatsJet_Legacy_System_Supplement_Part8_v7.2.0.md` — Console/Kernel, Jobs, Events, BotFlowEngine, Auth Requests, Providers.

### Background Job Processing

| Feature | WhatsJet | TrustCRM | Status |
|---------|---------|----------|--------|
| Webhook job processes exactly **10 webhook queue records** per job execution (batched for load control) | ✅ | ❌ BullMQ processes one-at-a-time | ⚠️ |
| `VendorChannelBroadcast` is `ShouldBroadcastNow` — synchronous, NOT queued (fires inline with request) | ✅ | ❌ TrustCRM Socket.io emit is synchronous too | ✅ equiv. |
| `WhatsappWebhookReceived` event for calling feature has zero registered listeners — dead code | ✅ (dead) | ❌ N/A | INFO |

### Bot Flow Engine

| Feature | WhatsJet | TrustCRM | Status |
|---------|---------|----------|--------|
| Bot reply triggers from flow: multiple upstream links to same bot → **comma-joined** `reply_trigger` string | ✅ | ❌ | ❌ |
| Bot flow connector separator: `___` in UI → `.` in stored data (replaces on save) | ✅ | ❌ | ❌ |
| Unlinked bots (no incoming edges) have their `reply_trigger` reset via `resetBotTriggers()` | ✅ | ❌ | ❌ |

### Billing

| Feature | WhatsJet | TrustCRM | Status |
|---------|---------|----------|--------|
| Stripe automatic tax calculation requires BOTH `enable_stripe=true` AND `stripe_enable_calculate_taxes=true` | ✅ dual-gate | ❌ Not configurable | ❌ |

**Part 8 net-new items: 6 features (4 ❌, 1 ⚠️ batch note, 1 INFO). Revised estimated total: ~400 features, ~101 implemented, ~25% overall coverage.**

---

## Supplement Part 9 Additions

> **Source:** `WhatsJet_Legacy_System_Supplement_Part9_v7.2.0.md` — app-helpers, ManualSubscriptionEngine, SubscriptionEngine, HomeController, AuthController.

### Authentication — Additional Details

| Feature | WhatsJet | TrustCRM | Status |
|---------|---------|----------|--------|
| Social OAuth credentials (`google_client_id/secret`, `facebook_app_id/secret`) loaded from DB settings at request time (not `.env`) — allows per-install config without redeploy | ✅ | ❌ Clerk env-based only | ❌ |
| User `status=4` = "activation required" — login explicitly blocked with custom error (not generic auth failure) | ✅ | ❌ (Clerk handles separately) | INFO |
| `two_factor_confirmed_at` null check — 2FA challenge skipped if 2FA not yet confirmed, even if `two_factor_secret` exists | ✅ | ❌ (Clerk manages) | INFO |

### Billing / Subscription — Additional Details

| Feature | WhatsJet | TrustCRM | Status |
|---------|---------|----------|--------|
| Manual subscription full lifecycle: `initiated → pending → active → cancelled`; old active subscriptions auto-cancelled when new one activates | ✅ | ❌ | ❌ |
| Duplicate txn guard: `txn_reference` uniqueness check per vendor — blocks double-payment on same transaction reference | ✅ | ❌ | ❌ |
| After Cashier `swap()` (plan change), must manually update `type` field on subscription record to new plan ID — Cashier leaves it unchanged | ✅ workaround | ❌ Not handled | ❌ |
| `planSelectorId` format: `{plan_id}___monthly` or `{plan_id}___yearly` (three underscores separator) — encodes both plan and billing interval | ✅ | ❌ | ❌ |
| Proration formula: `daily_charge × remaining_days`; max end date capped at `9999-12-31` to prevent overflow | ✅ | ❌ | ❌ |

### Public / Landing Page Routes

| Feature | WhatsJet Route | TrustCRM | Status |
|---------|---------------|----------|--------|
| Health check endpoint | `GET /ping-pong` → `pingPong()` returns pong JSON | None | ❌ |
| Custom CSS delivery | `GET /custom-styles` → returns vendor-specific CSS view | None | ❌ |
| Server-compiled JS delivery | `GET /server-compiled-js` → returns compiled JS view | None | ❌ |
| UPI address QR code | `GET /url-qr/{upiAddress}/{logo}` → 300px PNG (endroid/qr-code) | None | ❌ |
| Demo phone registration | `POST /register-number-for-demo` → registers demo WhatsApp number | None | ❌ |

**Part 9 net-new items: 10 features (7 ❌, 3 INFO). Revised estimated total: ~407 features, ~101 implemented, ~25% overall coverage.**

---

## Supplement Part 10 Additions

> **Source:** `WhatsJet_Legacy_System_Supplement_Part10_v7.2.0.md` — permissions.php (complete), 5 payment engines, VendorUserModel, SubscriptionPlanDetails.

### Permission System — Critical Behavior Details

| Feature | WhatsJet | TrustCRM | Status |
|---------|---------|----------|--------|
| Sub-permission missing/empty → **defaults to allow** (open by default; only explicit "deny" blocks) | ✅ documented | ❌ not replicated — deny-by-default may over-block | ❌ |
| `hide_contact_phone_numbers` / `hide_contact_emails` work **inverted**: "allow" = hide, "deny" = show | ✅ inverted check | ❌ risk of inverted implementation | ❌ |

### Plan Limit System — Behavior Details

| Feature | WhatsJet | TrustCRM | Status |
|---------|---------|----------|--------|
| `SubscriptionPlanDetails::featureLimit()` returns **-1** to mean unlimited (must be checked before comparing usage) | ✅ | ❌ plan limits not yet enforced | ❌ |
| Plan feature type "count" limit check: `vendorPlanDetails('bot_flows', 'count', $vendorId)` before create | ✅ on 5+ entities | ❌ | ❌ |

### Payment Gateway — Webhook Event Scope

| Gateway | WhatsJet handles | TrustCRM | Status |
|---------|-----------------|----------|--------|
| Razorpay webhook: only `payment.captured` event — all others ignored | ✅ | ❌ not implemented | ❌ |
| Paystack webhook: only `charge.success` event; verifies HMAC-SHA512 against `X-Paystack-Signature` | ✅ | ❌ not implemented | ❌ |
| YooMoney webhook: only `payment.succeeded` event; requires VAT code (`vat_code: 1`) in receipt items | ✅ | ❌ not implemented | ❌ |
| PhonePe auth header: `"O-Bearer {accessToken}"` — non-standard prefix (not plain `Bearer`) | ✅ | ❌ not implemented | ❌ |
| PayPal idempotency: `PayPal-Request-Id: $orderUID` header on payment create | ✅ | ❌ not implemented | ❌ |

### Payment Gateway — Auth Credential Pattern

| Feature | WhatsJet | TrustCRM | Status |
|---------|---------|----------|--------|
| All 5 gateways load test/live keys from DB settings at call time, toggled by `use_test_{gateway}` setting | ✅ | ❌ env-based only | ❌ |
| PhonePe amount conversion: amount × 100 (paisa, not rupees) | ✅ | ❌ | ❌ |

**Part 10 net-new items: 11 features (9 ❌, 2 critical behavior details). Revised estimated total: ~418 features, ~101 implemented, ~24% overall coverage.**

---

## Supplement Part 11 Additions

> **Source:** `WhatsJet_Legacy_System_Supplement_Part11_v7.2.0.md` — `config/lw-plans.php` (complete), `WhatsAppConnectApiService.php` (complete).

### Plan Feature Keys and Limits (Authoritative)

| Plan | Contacts | Campaigns/mo | Bot Replies | Bot Flows | Custom Fields | Team Members | AI Bot | API Access |
|------|---------|-------------|------------|-----------|--------------|-------------|--------|-----------|
| Free | **2** | 10 | 10 | 5 | 2 | **0** (none) | ✅ | ✅ |
| Standard (plan_1) | 5 | 10 | 10 | 5 | 5 | 5 | ✅ | ✅ |
| Premium (plan_2) | 15 | 10 | 10 | 5 | 10 | 10 | ✅ | ✅ |
| Ultimate (plan_3) | -1 | -1 | -1 | -1 | -1 | -1 | ✅ | ✅ |

> Free plan has **0 team members** — no multi-user on free. All plans have AI and API enabled.

| Feature | WhatsJet | TrustCRM | Status |
|---------|---------|----------|--------|
| Plan limits enforced at create time for all 6 entity types (contacts, campaigns, bot_replies, bot_flows, custom_fields, system_users) | ✅ | ❌ Not enforced | ❌ P0 |
| Free plan: **only 2 contacts** allowed — very strict entry point | ✅ | ❌ | ❌ |
| `switch` feature type: `ai_chat_bot` and `api_access` checked via `is_limit_available` when `limit == 1` | ✅ | ❌ | ❌ |
| Plans disabled by default in config; enabled via DB `subscription_plans` setting (type-4 JSON) | ✅ | ❌ | INFO |

### Embedded WABA Signup — Additional Details

| Feature | WhatsJet | TrustCRM | Status |
|---------|---------|----------|--------|
| App-level webhook subscriptions include `smb_app_state_sync`, `smb_message_echoes`, `account_update`, `history` (beyond messages and template events) | ✅ | ❌ Not subscribed | ❌ |
| Business App onboarding path (`is_app_onboarding=YES`): uses first phone number from list; triggers `smb_app_data` contacts sync | ✅ | ❌ | ❌ |
| `webhook_messages_field_verified_at` (distinct from `webhook_verified_at`) — set on successful embedded signup | ✅ | ❌ naming gap | ⚠️ |
| Default phone registration PIN: `123456` — hardcoded in embedded signup flow | ✅ (security issue) | ❌ N/A | INFO |
| `ignoreFacebookApiError()` flag — runtime suppress of Meta API errors for non-critical steps | ✅ | ❌ | INFO |

**Part 11 net-new items: 9 features (6 ❌, 1 ⚠️, 2 INFO). Revised estimated total: ~427 features, ~101 implemented, ~24% overall coverage.**

---

## Supplement Part 12 Additions

> **Source:** `WhatsJet_Legacy_System_Supplement_Part12_v7.2.0.md` — AuthEngine, BotReplyEngine, CampaignEngine, ContactEngine, ContactGroupEngine, DashboardEngine, PageEngine, WhatsAppTemplateEngine, VendorSettingsEngine, StripeWebhookController (all 100%).

### Contact Group — Recampaign Types (8 Granular Types)

| Feature | WhatsJet | TrustCRM | Status |
|---------|---------|----------|--------|
| Contact group creation from campaign re-send: 8 types — `total`, `delivered`, `read`, `failed`, `expired`, `sent`, `in_queue`, `accepted` | ✅ | ❌ | ❌ |
| Guard: re-campaign blocked if `queue_pending > 0 OR queue_processing > 0` — must wait for full execution | ✅ | ❌ | ❌ |
| Contact group from advance filter: creates group of all contacts matching current active filter | ✅ | ❌ | ❌ |
| Group bulk insert uses 500-record chunks (`storeItAll()`) | ✅ | ❌ | ❌ |

### Contact Import — Polling Model

| Feature | WhatsJet | TrustCRM | Status |
|---------|---------|----------|--------|
| Import uses a **polling model**: first call validates + counts + stores state; subsequent calls process 500-row chunks, returning progress %; final call clears state | ✅ | ❌ BullMQ job is one-shot | ⚠️ |
| Concurrent import guard: if `contacts_import_process_data` vendor setting already set, new import is blocked | ✅ | ❌ | ❌ |
| CSV export: UTF-8 BOM (`\xEF\xBB\xBF`) prepended + phone numbers ≥ 11 digits wrapped as `="..."` to prevent Excel scientific notation | ✅ | ❌ | ❌ |
| Import default AI bot state: `disable_ai_bot = default_enable_flowise_ai_bot_for_users ? 0 : 1` | ✅ | ❌ | ❌ |

### Contact — Advance Filter

| Feature | WhatsJet | TrustCRM | Status |
|---------|---------|----------|--------|
| Advance filter saved **per-user per-vendor** (`contact_advance_filter_data` scoped by `getUserUID()`) | ✅ | ❌ | ❌ |
| Test recipient contact is **always protected** from deletion (read from `test_recipient_contact` setting) | ✅ | ❌ | ❌ |

### VendorSettings — Side Effects on Save

| Save trigger | Side effect | TrustCRM | Status |
|-------------|-------------|----------|--------|
| `test_recipient_contact` key | Auto-creates contact `{first_name: 'Test', last_name: 'Contact'}` if `wa_id` not found | ❌ | ❌ |
| `facebook_app_secret` key | Calls `connectBaseWebhook()` — registers 7 app-level webhook subscriptions | ❌ | ❌ |
| `whatsapp_access_token` key | Validates token via `debugTokenInfo()`, checks 3 required permissions, clears `whatsapp_access_token_expired` flag | ❌ | ❌ |
| `whatsapp_business_account_id` key | Removes existing webhooks, re-connects base webhook, fetches phone numbers, auto-saves first phone number to settings | ❌ | ❌ |
| `open_ai_input_training_data` key | Triggers `OpenAiService::embedLargeData()` to regenerate embeddings for RAG | ❌ | ❌ |

### Bot Reply — Plan Limit Distinction

| Feature | WhatsJet | TrustCRM | Status |
|---------|---------|----------|--------|
| Plan limit checked only for **standalone** bots (`bot_flows__id IS NULL`); bot-flow bots have **no limit** | ✅ | ❌ | ❌ |
| Bot duplicate: clears `buttons`/`list_data` from `__data`; bot-flow bots reset to `status=2, reply_trigger=null` | ✅ | ❌ | ❌ |
| Bot update with button/list row changes: downstream flow links auto-updated (trigger reassignment to replacement button at same index) | ✅ | ❌ | ❌ |

### Auth Registration — Vendor Slug Generation

| Feature | WhatsJet | TrustCRM | Status |
|---------|---------|----------|--------|
| Vendor slug auto-generated: `Str::lower(Str::slug(username, '_'))` — underscores as separator | ✅ | ❌ | INFO |
| Social auth new user: `username = uniqid(firstName.'_')`, `password = 'NO_PASSWORD'` | ✅ | ❌ (Clerk handles) | INFO |

### Stripe Webhook — Empty Stubs

| Feature | WhatsJet | TrustCRM | Status |
|---------|---------|----------|--------|
| `handleInvoicePaymentSucceeded()` — **empty stub** (no implementation); all Stripe events delegated to Cashier parent | ✅ stub only | ❌ TrustCRM must implement real handlers | ❌ |

### Template — License Guard (Do NOT Replicate)

| Feature | WhatsJet | Status |
|---------|---------|--------|
| `yadrichhikParikshan()` license check on template sync/create — returns fake REJECTED on failure | ✅ (anti-piracy) | INFO — do not replicate |

**Part 12 net-new items: 19 features (14 ❌, 3 ⚠️, 4 INFO). Revised estimated total: ~446 features, ~101 implemented, ~23% overall coverage.**

---

## Supplement Part 13 Additions

> **Source:** `WhatsJet_Legacy_System_Supplement_Part13_v7.2.0.md` — All 20 repositories, all 21 controllers, `__currencies.php`, `__settings.php` lines 400+.

### Bot / Flow Builder — Additional Details

| Feature | WhatsJet | TrustCRM | Status |
|---------|---------|----------|--------|
| New bot flows are stored with **status=2** (unpublished) by default — must explicitly publish | ✅ | ❌ | ❌ |
| Bot reply: max **3 buttons** per interactive message; buttons must have unique titles | ✅ | ❌ | ❌ |
| Interactive list type: cannot have a media (image/video/document) header | ✅ | ❌ | ❌ |
| Bot reply permission routing by `page_type` query param: `bot_flow_builder` → `manage_bot_flow_builder`, `preset_message` → `manage_templates`, default → `manage_bot_replies` | ✅ | ❌ | ❌ |

### Campaign API — Parameter Format Difference

| Feature | WhatsJet | TrustCRM | Status |
|---------|---------|----------|--------|
| API campaign endpoint: `contact_group` is **comma-separated string** (not JSON array); `contact_labels` is nullable string | ✅ API CSV format | ❌ TrustCRM uses JSON arrays | ❌ |
| API campaign list: `administrative` permission required (not `manage_campaigns`) — super-admin only | ✅ | ❌ | ❌ |

### SuperAdmin — Impersonation

| Feature | WhatsJet | TrustCRM | Status |
|---------|---------|----------|--------|
| Super-admin login-as-vendor: `Auth::loginUsingId($vendorAdminUserId)` stores original ID in session; `logoutAsVendorAdmin()` restores | ✅ | ❌ | ❌ |
| PWA manifest endpoint: `GET /pwa/manifest.json` → JSON manifest with vendor branding | ✅ | ❌ | ❌ |
| PWA service worker endpoint: `GET /pwa/service-worker.js` → vendor-specific service worker | ✅ | ❌ | ❌ |

### WhatsApp / WABA — Additional Behavior

| Feature | WhatsJet | TrustCRM | Status |
|---------|---------|----------|--------|
| `apiAccessAllowedOrAbort()`: checks `api_access` plan gate; returns **HTTP 401** (not 403) if plan disables API access | ✅ | ❌ | ❌ |
| Stripe webhook auto-creation via SDK: creates webhook subscribing to 8 Stripe events, stores webhook secret to DB | ✅ | ❌ | ❌ |
| Addon list fetched from external URL (`wajetaddons.sevs.in`) at runtime — no self-hosted addon registry | ✅ | ❌ | INFO |

### Currency — Zero-Decimal List (Exact)

| Feature | WhatsJet | TrustCRM | Status |
|---------|---------|----------|--------|
| 17 zero-decimal currencies (BIF, CLP, DJF, GNF, JPY, KMF, KRW, MGA, PYG, RWF, VND, VUV, XAF, XOF, XPF, HUF, TWD) — skip × 100 conversion in payment amounts | ✅ | ❌ may multiply wrongly | ❌ |

### Contact Group — Legacy NULL Status

| Feature | WhatsJet | TrustCRM | Status |
|---------|---------|----------|--------|
| Contact group "active" query includes `status IS NULL` — legacy records without status column treated as active | ✅ | ❌ TrustCRM schema uses NOT NULL | INFO |

### Architecture Notes (Do NOT Replicate)

| Item | Action |
|------|--------|
| MySQL `DB::raw('CONCAT(...)')` with double-quoted identifiers in VendorRepository | Rewrite as Prisma queries for PostgreSQL |
| `DB::statement('OPTIMIZE TABLE whatsapp_message_logs')` in ConfigurationController | MySQL-only; not available in PostgreSQL |
| Team member assignment via `inRandomOrder()` — truly random, no round-robin | TrustCRM should implement proper round-robin |

**Part 13 net-new items: 16 features (12 ❌, 2 INFO, 2 architecture notes). Revised estimated total: ~462 features, ~101 implemented, ~22% overall coverage.**

---

## Supplement Part 14 Additions

> **Source:** `WhatsJet_Legacy_System_Supplement_Part14_v7.2.0.md` — OpenAiService, YesTokenAuth, CoreRepository, ContactRepository, CampaignRepository, WhatsAppMessageLogRepository, WhatsAppMessageQueueRepository, BotReplyRepository, FortifyServiceProvider, VendorFrontend, languages.php.

### AI Chatbot — Two Modes

| Feature | WhatsJet | TrustCRM | Status |
|---------|---------|----------|--------|
| OpenAI Assistants API mode: thread polling until status not `queued/in_progress`; uses `assistant_id` from vendor settings | ✅ | ❌ TrustCRM uses Claude API (different) | INFO |
| Text RAG mode: chunks training data into ≤500-char segments; embeds via `text-embedding-3-small`; cosine similarity; top-3 sections | ✅ | ❌ TrustCRM RAG not implemented | ❌ |
| AI chat history summarization: stores rolling summary in `contact.__data.past_ai_summary`; triggers extra OpenAI API call per message to update summary | ✅ | ❌ | ❌ |
| AI temperature: fixed `0.7` (not configurable per-vendor) | ✅ | ❌ Claude API temp may differ | INFO |
| All 10 OpenAI vendor settings (api_key, org_id, model_key, max_token, bot_name, assistant_id, training_data, failed_message, data_source_type, use_chat_history) | ✅ | ❌ Not exposed in vendor settings | ❌ |

### JWT / Token — YesTokenAuth Behavior Details

| Feature | WhatsJet | TrustCRM | Status |
|---------|---------|----------|--------|
| Token auto-refresh: if `rta_claim < now() AND exp_claim > now()` → new token issued; old remains valid during same request | ✅ | ❌ Clerk handles; no custom auto-refresh | INFO |
| IP address + user agent checked on every token verification; mismatch = invalid token | ✅ strict | ❌ Clerk JWTs do not bind to IP | INFO |
| Token registry cleanup: deletes tokens expired >2 minutes ago on every verify call | ✅ | ❌ Clerk manages session cleanup | INFO |

### Data — Contact Field Semantics

| Feature | WhatsJet | TrustCRM | Status |
|---------|---------|----------|--------|
| `whatsapp_opt_out` default is `NULL` (not `0`) — query filters must handle `IS NULL OR = 0` for non-opted-out contacts | ✅ | ❌ TrustCRM may use boolean false/0 | ⚠️ |
| Phone normalization: on lookup miss, parses via libphonenumber and **updates `wa_id` in DB** to full international format | ✅ side effect on read | ❌ TrustCRM is exact-match only | ❌ |

### Campaign — Status 6 Detail

| Feature | WhatsJet | TrustCRM | Status |
|---------|---------|----------|--------|
| Campaign status `6` is treated as **active** (shown alongside status `1` in active campaign list) — not just status `1` | ✅ | ❌ | ❌ |
| Queue batch size controlled by `cron_process_messages_per_lot` setting (default 60) — first expires stale items, then grabs batch | ✅ | ❌ BullMQ processes individual jobs | INFO |

### UI Pagination — Hardcoded Values

| Feature | WhatsJet | TrustCRM | Status |
|---------|---------|----------|--------|
| Inbox contact list: `simplePaginate(12)` — **12 contacts per page, hardcoded** | ✅ | ❌ TrustCRM value? | ⚠️ |
| Message history: `simplePaginate(16)` — **16 messages per page, hardcoded** | ✅ | ❌ TrustCRM value? | ⚠️ |

### WhatsApp Language List

| Feature | WhatsJet | TrustCRM | Status |
|---------|---------|----------|--------|
| **63 WhatsApp API language codes** for template language selection (distinct from 68 UI translation locales) | ✅ | ❌ check coverage | ⚠️ |

**Part 14 net-new items: 16 features (6 ❌, 4 ⚠️, 6 INFO). Revised estimated total: ~478 features, ~101 implemented, ~21% overall coverage.**

---

## Supplement Part 15 Additions (FINAL)

> **Source:** `WhatsJet_Legacy_System_Supplement_Part15_v7.2.0.md` — All remaining PHP files + all 27 config files. Definitive 100% coverage.

### Security / CSRF Behavior

| Feature | WhatsJet | TrustCRM | Status |
|---------|---------|----------|--------|
| CSRF token exclusion for all payment callbacks: `stripe/*`, `razorpay/*`, `subscription/*`, `whatsapp-webhook/*`, `paystack/*`, `yoomoney/*` | ✅ | ❌ Verify TrustCRM excludes these from CSRF | ⚠️ |
| CSRF token mismatch returns **JSON `rc=2`** (not HTTP redirect) — hybrid MPA/SPA behavior; frontend detects and shows re-login toast | ✅ | ❌ Fastify has no CSRF to mismatch | INFO |
| Session data **AES-encrypted at rest** (`session.encrypt=true`) — non-standard Laravel default | ✅ | ❌ Clerk sessions (different mechanism) | INFO |

### File Storage — Media Access Pattern

| Feature | WhatsJet | TrustCRM | Status |
|---------|---------|----------|--------|
| Default media disk = `public_path()` — ALL media files directly URL-accessible (no signed URLs, no auth required) | ✅ | ❌ TrustCRM uses S3/R2 with signed URLs | ❌ |
| S3 storage is optional (`FILESYSTEM_DISK=s3`); DigitalOcean Spaces supported as second option | ✅ | ✅ Cloudflare R2 configured | ✅ equiv. |

### CORS Configuration

| Feature | WhatsJet | TrustCRM | Status |
|---------|---------|----------|--------|
| **Wide-open CORS** on `api/*`: all origins, methods, headers allowed; credentials disabled | ✅ | ❌ TrustCRM should verify CORS policy | ⚠️ |

### Translation / i18n Infrastructure

| Feature | WhatsJet | TrustCRM | Status |
|---------|---------|----------|--------|
| Microsoft Translator enabled by default when `MICROSOFT_TRANSLATE_API_KEY` env var is set; reads from `config/services.php` | ✅ | ❌ | ❌ |
| Gettext `.mo` files stored at `locale/` in repo root; locale dir = `base_path('locale')` | ✅ | ❌ (Next.js i18n different) | INFO |

### TOTP 2FA — Strict Mode

| Feature | WhatsJet | TrustCRM | Status |
|---------|---------|----------|--------|
| Fortify 2FA `window=0` — no clock drift tolerance; TOTP code must match exact current interval | ✅ strict | ❌ Clerk handles (likely allows 1-window drift) | INFO |

### Data Model — Activity Log

| Feature | WhatsJet | TrustCRM | Status |
|---------|---------|----------|--------|
| Activity log records have `updated_at = no-op` — `setUpdatedAt()` returns void; only `created_at` tracked | ✅ | ❌ TrustCRM model may auto-update `updated_at` | ⚠️ |

### Messaging User Query — Potential Duplicates

| Feature | WhatsJet | TrustCRM | Status |
|---------|---------|----------|--------|
| `getVendorMessagingUsers()` merges vendor-primary-users UNION sub-users-with-messaging permission — **may return duplicate user records** if user is both primary and sub-user of same vendor | ✅ (known limitation) | ❌ TrustCRM should deduplicate | ⚠️ |

### Architecture Notes (Final)

| Item | Action |
|------|--------|
| MySQL `strict=true` in WhatsJet — any ported raw query must be strict-mode compliant | Already resolved: TrustCRM uses PostgreSQL via Prisma |
| `phpredis` C extension required (not Predis) — `decorrelated_jitter` backoff algorithm | TrustCRM uses `ioredis`; no action needed |
| Pages always created with `vendors__id = NULL` — global namespace, not per-vendor | TrustCRM CMS pages (if implemented) should scope to organization |
| Core cache driver = `file` (not Redis) by default — `sha1(json_encode(...))` keys stored on filesystem | TrustCRM uses Redis (better) |

**Part 15 net-new items: 12 features (3 ❌, 5 ⚠️, 4 INFO). FINAL revised estimated total: ~490 features, ~101 implemented, ~21% overall coverage.**

> **Coverage Note:** The ~21% figure reflects total WhatsJet feature surface relative to TrustCRM's current implementation. TrustCRM's original 41% figure was based on 246 documented WhatsJet features; with all 15 supplements adding ~244 additional items (many are behavioral details and not discrete "features"), the denominator grew substantially. Core messaging, contact management, and chat functionality are implemented at ~65%+ within those modules.
