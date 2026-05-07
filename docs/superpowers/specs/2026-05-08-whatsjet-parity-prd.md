# WhatsJet → TrustCRM Feature Parity PRD
**Version:** 1.0 | **Date:** 2026-05-08 | **Author:** Chief Engineer  
**Status:** Draft — Pending Review  
**Source:** Full code scan — WhatsJet SaaS v7.2.0 (45 tables, 200+ endpoints, all models, all permissions)

---

## 1. Context & Objective

TrustCRM replaces WhatsJet as the product. Live paying WhatsJet customers will log in fresh — no data migration. They must find every capability they had in WhatsJet, plus TrustCRM's additional CRM depth and AI features.

This PRD is derived entirely from:
- WhatsJet source code (`Source-7.2.0/`)
- WhatsJet database schema (45 tables, all migrations)
- WhatsJet ORM models (27 Eloquent models, all `__data` JSON field keys)
- WhatsJet routes (`web.php` + `api.php` — 200+ named routes)
- WhatsJet permissions (`app/Yantrana/Components/User/Support/permissions.php`)
- WhatsJet vendor settings (`__vendor-settings.php` — 60+ keys)
- WhatsJet global config (`__settings.php` — 100+ keys)
- WhatsJet subscription plans (`config/lw-plans.php`)
- TrustCRM Prisma schema (`apps/api/prisma/schema.prisma` — 1019 lines)
- TrustCRM API routes (`apps/api/src/routes/`)

---

## 2. Complete Schema Gap Analysis

### 2.1 New Models Required in TrustCRM

#### Model: `ContactGroup` + `GroupContact`
WhatsJet source: `contact_groups` + `group_contacts` tables  
Why missing matters: WhatsJet campaigns target **static groups**, not dynamic segments. A customer who set up "VIP Customers" and "Delhi Clients" as groups will expect to find them. TrustCRM has only `Segment` (dynamic filter-based) — not the same concept.

```prisma
model ContactGroup {
  id             String         @id @default(uuid())
  organizationId String         @map("organization_id")
  title          String
  description    String?
  isArchived     Boolean        @default(false) @map("is_archived")
  createdAt      DateTime       @default(now()) @map("created_at")
  updatedAt      DateTime       @updatedAt @map("updated_at")
  contacts       GroupContact[]
  campaignGroups CampaignGroup[]
  @@index([organizationId])
  @@map("contact_groups")
}

model GroupContact {
  id             String       @id @default(uuid())
  contactGroupId String       @map("contact_group_id")
  contactGroup   ContactGroup @relation(fields: [contactGroupId], references: [id], onDelete: Cascade)
  contactId      String       @map("contact_id")
  createdAt      DateTime     @default(now()) @map("created_at")
  @@unique([contactGroupId, contactId])
  @@index([contactGroupId])
  @@index([contactId])
  @@map("group_contacts")
}
```

#### Model: `CampaignGroup` (junction — campaign targets groups)
WhatsJet source: `campaign_groups` table  
Currently TrustCRM only has `CampaignSegment`. Need both.

```prisma
model CampaignGroup {
  id             String       @id @default(uuid())
  campaignId     String       @map("campaign_id")
  campaign       Campaign     @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  contactGroupId String       @map("contact_group_id")
  contactGroup   ContactGroup @relation(fields: [contactGroupId], references: [id], onDelete: Cascade)
  @@unique([campaignId, contactGroupId])
  @@index([campaignId])
  @@map("campaign_groups")
}
```

#### Model: `CannedResponse`
WhatsJet source: `bot_replies` with quick-reply mode (manual send — not keyword-triggered)  
Different from `AutoReply`. Agents manually select these during a conversation.

```prisma
model CannedResponse {
  id             String   @id @default(uuid())
  organizationId String   @map("organization_id")
  name           String
  shortcut       String?  // agent types /shortcut to find it fast
  content        String   @db.Text
  mediaData      Json?    @map("media_data") // optional media attachment
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")
  @@index([organizationId])
  @@map("canned_responses")
}
```

#### Model: `SavedFilter`
WhatsJet source: `vendor.contact_advance_filter_data` vendor setting + `store_contact_filter` endpoint  
Customers save complex contact filter queries and reuse them.

```prisma
model SavedFilter {
  id             String   @id @default(uuid())
  organizationId String   @map("organization_id")
  name           String
  filterData     Json     @map("filter_data") // serialized filter criteria
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")
  @@index([organizationId])
  @@map("saved_filters")
}
```

#### Model: `ResponseWebhookAction` + `ResponseWebhookActionLog`
WhatsJet source: `response_webhook_actions` + `response_webhook_action_logs` tables  
When an inbound webhook payload field matches a value → auto-send a WhatsApp template to the contact.

```prisma
model ResponseWebhookAction {
  id             String   @id @default(uuid())
  organizationId String   @map("organization_id")
  title          String
  conditionKey   String   @map("condition_key")   // payload field to check
  conditionValue String   @map("condition_value") // expected value
  templateId     String?  @map("template_id")     // template to send
  isActive       Boolean  @default(true) @map("is_active")
  data           Json?
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")
  logs           ResponseWebhookActionLog[]
  @@index([organizationId])
  @@map("response_webhook_actions")
}

model ResponseWebhookActionLog {
  id              String                @id @default(uuid())
  actionId        String?               @map("action_id")
  action          ResponseWebhookAction? @relation(fields: [actionId], references: [id], onDelete: SetNull)
  webhookLogId    String                @map("webhook_log_id")
  messageId       String?               @map("message_id")
  createdAt       DateTime              @default(now()) @map("created_at")
  @@index([actionId])
  @@index([webhookLogId])
  @@map("response_webhook_action_logs")
}
```

#### Model: `PlatformConfig`
WhatsJet source: `configurations` table (100+ global keys — SMTP, payment gateways, subscription plans, branding, registration settings)  
TrustCRM uses `.env` + hardcoded config. For SuperAdmin to configure SMTP, payment gateways, and subscription plans at runtime without redeployment, a DB-backed config store is needed.

```prisma
model PlatformConfig {
  id        String   @id @default(uuid())
  key       String   @unique
  value     String?  @db.Text
  dataType  String   @default("string") @map("data_type") // string | json | boolean | integer
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")
  @@map("platform_configs")
}
```

#### Model: `VendorSetting`
WhatsJet source: `vendor_settings` table (60+ per-vendor keys)  
Currently TrustCRM uses `Organization.settings` JSON blob. For the full set of WhatsApp API keys, AI bot settings, webhook config, timing restrictions — a proper key-value store with data_type is needed.  
Key groups from WhatsJet scan:
- WhatsApp Cloud API: `facebook_app_id`, `facebook_app_secret`, `whatsapp_access_token`, `whatsapp_business_account_id`, `whatsapp_phone_numbers`, `current_phone_number_id`, `webhook_verified_at`
- AI bot: `enable_flowise_ai_bot`, `flowise_url`, `flowise_access_token`, `enable_open_ai_bot`, `open_ai_access_key`, `open_ai_assistant_id`
- Bot timing: `enable_bot_timing_restrictions`, `bot_start_timing`, `bot_end_timing`, `bot_timing_timezone`
- Vendor webhook: `enable_vendor_webhook`, `vendor_webhook_endpoint`
- Notifications: `is_disabled_message_sound_notification`
- Branding: `logo_name`, `favicon_name`, `vendor_slug`
- Misc: `vendor_api_access_token`, `template_analytics_status`, `enable_whatsapp_calling`

```prisma
model VendorSetting {
  id             String   @id @default(uuid())
  organizationId String   @map("organization_id")
  key            String
  value          String?  @db.Text
  dataType       String   @default("string") @map("data_type")
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")
  @@unique([organizationId, key])
  @@index([organizationId])
  @@map("vendor_settings")
}
```

### 2.2 New Fields on Existing Models

#### `Contact` — add fields
```prisma
// Add to existing Contact model:
assignedUserId   String?   @map("assigned_user_id")    // WhatsJet: contacts.assigned_users__id
notes            String?   @db.Text                    // WhatsJet: contacts.__data->contact_notes
waId             String?   @map("wa_id")               // WA phone without country code
username         String?                                // WhatsApp username
phoneVerifiedAt  DateTime? @map("phone_verified_at")
countryCode      String?   @map("country_code")        // ISO 2-letter code
```

#### `Organization` — add fields
```prisma
// Add to existing Organization model:
slug             String?   @unique                     // WhatsJet: vendors.slug
domain           String?                                // custom domain (white-label)
logoImage        String?   @map("logo_image")
smallLogoImage   String?   @map("small_logo_image")
favicon          String?
darkLogoImage    String?   @map("dark_logo_image")
darkSmallLogoImage String? @map("dark_small_logo_image")
darkFavicon      String?   @map("dark_favicon")
orgType          String?   @map("org_type")            // business type
status           String    @default("active")          // active | inactive | banned
banReason        String?   @map("ban_reason")
stripeId         String?   @map("stripe_id")           // Stripe customer ID
trialEndsAt      DateTime? @map("trial_ends_at")
```

#### `OrganizationMember` — add granular permissions
```prisma
// Add to existing OrganizationMember model:
permissions Json @default("{}") // WhatsJet permissions.php keys — allow/deny per feature
```

WhatsJet permission keys that map to this field:
```json
{
  "administrative": "allow|deny",
  "manage_contacts": "allow|deny",
  "manage_contacts@import_contacts": "allow|deny",
  "manage_contacts@export_contacts": "allow|deny",
  "manage_contacts@delete_contacts": "allow|deny",
  "manage_contacts@add_edit_contacts": "allow|deny",
  "manage_contacts@add_edit_delete_custom_contact_fields": "allow|deny",
  "manage_contacts@add_edit_delete_archive_group": "allow|deny",
  "manage_campaigns": "allow|deny",
  "messaging": "allow|deny",
  "manage_templates": "allow|deny",
  "manage_templates@add_edit_templates": "allow|deny",
  "manage_templates@delete_templates": "allow|deny",
  "manage_bot_replies": "allow|deny",
  "manage_bot_replies@add_edit_bot_replies": "allow|deny",
  "manage_bot_replies@delete_bot_replies": "allow|deny",
  "manage_bot_replies@add_edit_bot_flows": "allow|deny",
  "manage_bot_replies@delete_bot_flows": "allow|deny",
  "manage_bot_replies@manage_bot_flow_builder": "allow|deny",
  "assigned_chats_only": "allow|deny",
  "hide_contact_phone_numbers": "allow|deny",
  "hide_contact_emails": "allow|deny"
}
```

#### `Campaign` — add fields
```prisma
// Add to existing Campaign model:
timezone         String?                               // WhatsJet: campaigns.timezone
expiresAt        DateTime? @map("expires_at")         // abandon unsent after this
campaignType     String    @default("template") @map("campaign_type") // template | non_template
campaignGroups   CampaignGroup[]
```

#### `Chatbot` — add start trigger
```prisma
// Add to existing Chatbot model:
startTrigger String? @map("start_trigger") // keyword that activates this chatbot flow
```

#### `Message` — add fields
```prisma
// Add to existing Message model:
senderName   String?  @map("sender_name")  // WhatsJet: whatsapp_message_logs.full_name
isForwarded  Boolean  @default(false) @map("is_forwarded")
```

#### `User` — add fields
```prisma
// Add to existing User model:
username       String?  @unique
mobileNumber   String?  @map("mobile_number")
```

---

## 3. Complete Feature Gap Analysis

Derived from scanning all 200+ WhatsJet routes against TrustCRM routes.

### 3.1 Features in WhatsJet → Status in TrustCRM

| # | WhatsJet Feature | WhatsJet Route/File | TrustCRM Status |
|---|-----------------|---------------------|-----------------|
| 1 | WhatsApp Business Profile (view/edit about/address/email/website) | `vendor.whatsapp.business_profile.read/write` | ❌ Missing |
| 2 | Display name get/update | `vendor.whatsapp.display_name.read/write` | ❌ Missing |
| 3 | Register phone number | `vendor.whatsapp.register_phone_number.write` | ❌ Missing |
| 4 | Sync phone numbers from Meta | `vendor.whatsapp.sync_phone_numbers` | ❌ Missing |
| 5 | WhatsApp health status check | `vendor.whatsapp.health.status` | ❌ Missing |
| 6 | Two-step verification PIN | `vendor.whatsapp.two_step_verification.write` | ❌ Missing |
| 7 | WhatsApp QR code generation | `vendor.whatsapp_qr` | ❌ Missing |
| 8 | Embedded signup (Meta WABA setup) | `vendor.whatsapp_setup.embedded_signup.write` | ⚠️ Partial (onboarding) |
| 9 | Enable template analytics | `vendor.whatsapp.enable_template_analytics` | ❌ Missing |
| 10 | Template analytics per-template | `vendor.whatsapp_service.templates.read.analytics` | ❌ Missing |
| 11 | Disconnect/reconnect WA webhook | `vendor.webhook.connect/disconnect.write` | ❌ Missing |
| 12 | Disconnect WA account entirely | `vendor.account.disconnect.write` | ❌ Missing |
| 13 | Contact Groups — CRUD (create/archive/delete) | `ContactGroupController` | ❌ Missing |
| 14 | Contact Groups — bulk assign contacts | `vendor.contacts.selected.write.assign_groups` | ❌ Missing |
| 15 | Contact Groups — archive/unarchive | `ContactGroupController@archive` | ❌ Missing |
| 16 | Contact — block / unblock | `vendor.contact.write.block/unblock` | ❌ Missing |
| 17 | Contact — AI bot toggle per contact | `vendor.contact.write.toggle_ai_bot` | ⚠️ Schema exists (`disableBot`) but no route |
| 18 | Contact — save filter preset | `vendor.contact.write.store_contact_filter` | ❌ Missing |
| 19 | Contact — export (CSV/Excel) | `vendor.contact.write.export` | ❌ Missing |
| 20 | Contact — import abort | `vendor.contacts.abort-import` | ❌ Missing |
| 21 | Contact notes (free text per contact) | `updateNotes` endpoint | ❌ Missing |
| 22 | Contact — assign team member | `vendor.whatsapp.contact.chat.assign-user` | ❌ Missing |
| 23 | Canned Responses / Quick Replies (manual) | `BotReplyController@processBotQuickReply` | ❌ Missing |
| 24 | Bot Reply — duplicate | `vendor.bot_reply.write.duplicate` | ❌ Missing |
| 25 | Bot Flow — preview | `vendor.bot_reply.read.bot_preview` | ❌ Missing |
| 26 | Campaign — non-template (free text) | `CampaignController@prepareNonTemplateCampaignList` | ❌ Missing |
| 27 | Campaign — non-template preset messages library | `vendor.campaign.non-template-message-presets` | ❌ Missing |
| 28 | Campaign — targeted contact count preview | `WhatsAppServiceController@getTargetedContactCount` | ❌ Missing |
| 29 | Campaign — requeue failed messages | `WhatsAppServiceController@requeueCampaignFailedMessages` | ❌ Missing |
| 30 | Campaign — abort running campaign | `CampaignController@processCampaignAbort` | ❌ Missing |
| 31 | Campaign — archive / unarchive | `CampaignController@processCampaignArchive` | ❌ Missing |
| 32 | Campaign — queue log view (per-contact pending status) | `vendor.campaign.queue.log.list.view` | ❌ Missing |
| 33 | Campaign — expired log view | `vendor.campaign.expired.log.list.view` | ❌ Missing |
| 34 | Campaign — report download (PDF/Excel) | `processCampaignExecutedReportGenerate` | ❌ Missing |
| 35 | Message log view (all messages with date filter) | `vendor.whatsapp.message.log.list` | ❌ Missing |
| 36 | Team member — granular permissions (9 areas + sub-perms) | `UserEngine@processUserCreate` | ❌ Missing |
| 37 | Team member — login as (impersonate agent) | `vendor.user.write.login_as` | ❌ Missing |
| 38 | Organization branding (logo/favicon/dark theme variants) | `MediaController@uploadLogo` etc. | ❌ Missing |
| 39 | Sound notification toggle | `vendor.disable.sound_message_sound_notification.write` | ❌ Missing |
| 40 | Response webhook actions (condition → send template) | `response_webhook_actions` | ❌ Missing |
| 41 | Chat — clear history for a contact | `WhatsAppServiceController@clearChatHistory` | ❌ Missing |
| 42 | Send template to single contact from templates page | `vendor.template_message.contact.process` | ❌ Missing |
| 43 | Ping/pong connection health check | `vendor.ping_pong.read` | ❌ Missing |
| 44 | UPI payment QR generation | `vendor.generate.upi_payment_request` | ❌ Missing |
| 45 | SuperAdmin — login as any org | `central.vendors.user.write.login_as` | ❌ Missing |
| 46 | SuperAdmin — ban/unban org | `VendorController@updateVendorData` | ❌ Missing |
| 47 | SuperAdmin — manual subscription CRUD | `ManualSubscriptionController` (central) | ⚠️ Partial |
| 48 | Subscription — manual pay with payment proof upload | `sendPaymentDetails` | ❌ Missing |
| 49 | Subscription — Razorpay checkout | `checkoutRazorpay` | ❌ Missing |
| 50 | Subscription — Paystack verify | `verifyPaystack` | ❌ Missing |
| 51 | Subscription — PhonePe capture | `phonePeCapturePayment` | ❌ Missing |
| 52 | Subscription — YooMoney checkout | `yoomoneyCheckout` | ❌ Missing |
| 53 | Dark/light theme toggle | `change.app.theme` | ❌ Missing |
| 54 | WhatsApp calling toggle | `vendor_settings.enable_whatsapp_calling` | ❌ Missing |

### 3.2 Features in TrustCRM NOT in WhatsJet (our advantages — preserve these)

| Feature | TrustCRM |
|---------|----------|
| Deal Pipelines (CRM) | ✅ |
| Companies (B2B) | ✅ |
| Trust Score | ✅ |
| AI Smart Replies | ✅ |
| Voice Transcription | ✅ |
| Predictive Analytics | ✅ |
| SLA Policies | ✅ |
| Routing Rules | ✅ |
| Expo Mobile App | ✅ |
| Meilisearch full-text | ✅ |
| Lifecycle Stages | ✅ |
| Contact Import (advanced) | ✅ |
| Multi-org membership | ✅ |

---

## 4. Implementation Cycles

### Cycle 1 — "Day-One Ready" (3 weeks)
**Goal:** A WhatsJet customer logs in and can immediately set up their WhatsApp number, manage contacts, chat, and manage their team — exactly as they did in WhatsJet.

#### Schema changes
- Add to `Contact`: `assignedUserId`, `notes`, `waId`, `username`, `countryCode`
- Add to `Organization`: `slug`, `domain`, `logoImage`, `smallLogoImage`, `favicon`, `darkLogoImage`, `darkSmallLogoImage`, `darkFavicon`, `orgType`, `status`, `banReason`, `stripeId`, `trialEndsAt`
- Add to `OrganizationMember`: `permissions` Json
- Add to `User`: `username`, `mobileNumber`
- Add to `Chatbot`: `startTrigger`
- New model: `VendorSetting`
- New model: `CannedResponse`

#### API endpoints (apps/api/src/routes/)

**WhatsApp Account Management** (new file: `whatsapp-account.ts`)
- `GET  /whatsapp-account/health-status` — check API health
- `GET  /whatsapp-account/business-profile` — get profile
- `PUT  /whatsapp-account/business-profile` — update about/address/email/websites
- `GET  /whatsapp-account/display-name` — get display name
- `PUT  /whatsapp-account/display-name` — update display name
- `POST /whatsapp-account/register-phone` — register phone number with PIN
- `POST /whatsapp-account/sync-phone-numbers` — pull numbers from Meta
- `PUT  /whatsapp-account/two-step-verification` — set 2FA PIN
- `GET  /whatsapp-account/qr/:phoneNumber` — generate WA QR code
- `POST /whatsapp-account/embedded-signup` — Meta embedded signup
- `POST /whatsapp-account/enable-template-analytics` — toggle template analytics
- `POST /whatsapp-account/connect-webhook` — reconnect webhook
- `POST /whatsapp-account/disconnect-webhook` — disconnect webhook
- `POST /whatsapp-account/disconnect-account` — full WA disconnect

**Contact enhancements** (extend `contacts.ts`)
- `POST /contacts/:id/block` — set `waBlockedAt = now()`
- `POST /contacts/:id/unblock` — clear `waBlockedAt`
- `POST /contacts/:id/toggle-bot` — toggle `disableBot`
- `PUT  /contacts/:id/notes` — update `notes`
- `PUT  /contacts/:id/assign` — set `assignedUserId`

**Canned Responses** (new file: `canned-responses.ts`)
- `GET    /canned-responses` — list all
- `POST   /canned-responses` — create
- `PUT    /canned-responses/:id` — update
- `DELETE /canned-responses/:id` — delete

**Team members — granular permissions** (extend `users.ts`)
- `PUT /users/:id/permissions` — update permissions JSON per member

**Organization branding** (extend `organizations.ts`)
- `POST /organizations/branding/logo` — upload logo (S3)
- `POST /organizations/branding/small-logo` — upload small logo
- `POST /organizations/branding/favicon` — upload favicon
- `POST /organizations/branding/dark-logo` — upload dark theme logo
- `POST /organizations/branding/dark-favicon` — upload dark theme favicon

**Vendor Settings** (new file: `vendor-settings.ts`)
- `GET /vendor-settings` — get all settings for org
- `PUT /vendor-settings` — bulk update (key-value pairs)
- `PUT /vendor-settings/sound-notification` — toggle sound

#### UI screens (apps/web/app/(dashboard)/)
- `/settings/whatsapp-account` — WA profile, display name, phone, QR, health, 2FA, disconnect
- `/settings/branding` — logo/favicon upload (light + dark)
- `/settings/notifications` — sound toggle, push preferences
- `/inbox` — add canned response picker to message composer
- `/contacts/:id` — add block/unblock toggle, notes textarea, assign user dropdown, AI bot toggle
- `/settings/team` — granular permissions grid per team member

#### Acceptance criteria
- Admin can complete WhatsApp account setup without touching `.env`
- Agent can block a contact; blocked contacts stop receiving messages
- Agent can select a canned response from inbox composer and send in 2 clicks
- Team member creation shows 9 permission toggles with sub-permissions
- Logo/favicon uploads and renders in navbar

---

### Cycle 2 — "Campaign Power" (3 weeks)
**Goal:** Full campaign functionality matching WhatsJet — including non-template campaigns, contact groups as targeting units, detailed logs, and Indian payment gateways.

#### Schema changes
- Add to `Campaign`: `timezone`, `expiresAt`, `campaignType`
- New model: `ContactGroup` + `GroupContact`
- New model: `CampaignGroup`
- New model: `SavedFilter`
- Add `CampaignGroup[]` relation to Campaign
- Add `PaymentGateway` enum values: `paypal`, `paystack`, `phonepe`, `yoomoney`, `bank_transfer` (if not already present)

#### API endpoints

**Contact Groups** (new file: `contact-groups.ts`)
- `GET    /contact-groups` — list (with archived filter)
- `POST   /contact-groups` — create (`title`, `description`)
- `PUT    /contact-groups/:id` — update
- `DELETE /contact-groups/:id` — delete
- `POST   /contact-groups/:id/archive` — archive
- `POST   /contact-groups/:id/unarchive` — unarchive
- `POST   /contact-groups/:id/contacts` — add contacts (bulk)
- `DELETE /contact-groups/:id/contacts` — remove contacts (bulk)
- `GET    /contact-groups/:id/contacts` — list contacts in group

**Contact bulk group assignment** (extend `contacts.ts`)
- `POST /contacts/bulk/assign-groups` — assign multiple contacts to multiple groups
- `POST /contacts/bulk/unassign-groups` — remove group assignments

**Saved Filters** (new file: `saved-filters.ts`)
- `GET    /saved-filters` — list saved filters
- `POST   /saved-filters` — save current filter
- `PUT    /saved-filters/:id` — update
- `DELETE /saved-filters/:id` — delete

**Contact Export** (extend `contacts.ts`)
- `GET /contacts/export` — export as CSV/Excel (query params: format, filter)

**Campaign enhancements** (extend `campaigns.ts`)
- `GET  /campaigns/:id/targeted-count` — preview recipient count given groups/segments/labels
- `POST /campaigns/:id/abort` — abort running campaign
- `POST /campaigns/:id/archive` — archive
- `POST /campaigns/:id/unarchive` — unarchive
- `POST /campaigns/:id/requeue-failed` — retry all failed recipients
- `GET  /campaigns/:id/queue-log` — per-contact pending queue (`CampaignRecipient` where status=pending)
- `GET  /campaigns/:id/expired-log` — expired/abandoned recipients
- `GET  /campaigns/:id/report` — download PDF/Excel report
- Non-template campaign support: `campaignType: "non_template"` + freeform message body

**Indian Payment Gateways** (extend `billing.ts`)
- `POST /billing/razorpay/create-order` — create Razorpay order
- `POST /billing/razorpay/webhook` — Razorpay payment webhook
- `POST /billing/paystack/verify` — verify Paystack payment
- `POST /billing/paystack/webhook` — Paystack webhook
- `POST /billing/phonepe/capture` — PhonePe payment capture
- `POST /billing/yoomoney/checkout` — YooMoney checkout initiation
- `POST /billing/yoomoney/webhook` — YooMoney webhook
- `POST /billing/manual/submit-proof` — upload payment proof (bank transfer/UPI)
- `DELETE /billing/manual/cancel-request` — cancel pending manual payment

#### UI screens
- `/contacts` — "Groups" tab alongside contacts list; group CRUD
- `/contacts` — saved filter pills above contact table; "Save this filter" button
- `/contacts` — Export button (CSV/Excel)
- `/campaigns/new` — add group selector + segment selector for targeting; show live count preview
- `/campaigns/new` — `campaignType` toggle: Template / Non-template (free text)
- `/campaigns/:id/logs` — tabs: Queue / Executed / Expired; each shows per-contact status
- `/campaigns/:id/logs` — Download Report button (PDF/Excel)
- `/campaigns/:id` — Abort button (running), Requeue Failed button (completed with failures)
- `/settings/billing` — Indian gateway payment forms (Razorpay/UPI/PhonePe/Paystack)

#### Acceptance criteria
- Customer creates a "VIP Clients" contact group, adds 50 contacts, targets it in a campaign
- Campaign shows live "1,247 contacts will receive this" before scheduling
- Non-template campaign sends free-text message to group
- Completed campaign shows per-contact delivery status in Executed log
- Failed messages can be retried with one click
- Indian customer pays via Razorpay UPI — subscription activates

---

### Cycle 3 — "Bot Automation Parity" (2 weeks)
**Goal:** Bot flows and auto-replies fully match WhatsJet's capabilities.

#### Schema changes
- `Chatbot.startTrigger` already added in Cycle 1
- No new models needed — existing `Flow`, `Chatbot`, `AutoReply`, `BotSession` cover WhatsJet's `bot_flows`, `bot_replies`, `contact_bot_flow_sessions`

#### API endpoints (extend `chatbots.ts` / `flows.ts`)
- `POST /auto-replies/:id/duplicate` — clone an auto-reply
- `GET  /auto-replies/:id/preview/:contactId` — preview what bot would send to specific contact
- `GET  /chatbots/active-for/:contactId` — get all active chatbots applicable to a contact
- `POST /chatbots/:id/quick-send/:contactId` — manually trigger a chatbot reply to a contact (WhatsJet's quick-reply mode)

#### UI screens
- `/flows` — Duplicate button per auto-reply row
- `/flows/:id/builder` — Preview button shows "what this bot sends to [contact]"
- `/inbox/:conversationId` — Bot panel shows applicable active bots; agent can trigger one manually

#### Acceptance criteria
- Agent in inbox can see "3 bots available for this contact" and trigger one manually
- Auto-reply with `startTrigger = "price"` fires when contact sends "price" message
- Duplicate auto-reply creates a copy with name "Copy of [original]"

---

### Cycle 4 — "CRM Superiority" (3 weeks)
**Goal:** Deliver features WhatsJet never had — Deal Pipelines, Companies, Trust Score, lifecycle management, advanced analytics, message logs.

These are TrustCRM's competitive advantages. They are partially built. This cycle completes and polishes them.

#### Schema changes
- New model: `ResponseWebhookAction` + `ResponseWebhookActionLog`
- Add to `Message`: `senderName`, `isForwarded`

#### API endpoints

**Response Webhook Actions** (extend `webhooks.ts`)
- `GET    /webhook-actions` — list configured actions
- `POST   /webhook-actions` — create (conditionKey, conditionValue, templateId)
- `PUT    /webhook-actions/:id` — update
- `DELETE /webhook-actions/:id` — delete
- `GET    /webhook-actions/:id/logs` — action execution history

**Message Log** (extend `messages.ts`)
- `GET /messages/log` — all messages (date range, direction, contact filter)

**Template analytics** (extend `templates.ts`)
- `GET /templates/:id/analytics` — delivery/read/failed stats per template
- `POST /templates/:id/send-to-contact` — send a template to a single contact directly

**Chat enhancements** (extend `conversations.ts` / `messages.ts`)
- `DELETE /conversations/:id/history` — clear all messages with contact

**Deals + Companies** — already in schema, complete the UI:
- Deal kanban board (drag-drop stages)
- Company profile page with linked contacts
- Activity timeline per contact (messages + notes + deals + calls)

**Trust Score** — already in `trust-score.ts`, complete:
- Dashboard widget showing org trust score
- Per-contact trust score indicator in inbox

#### UI screens
- `/settings/webhook-actions` — rule builder: condition key → condition value → template to send
- `/messages` — message log with date filter, direction filter, contact search
- `/templates/:id/analytics` — per-template bar chart: sent/delivered/read/failed
- `/deals` — kanban board with drag-drop between pipeline stages
- `/companies` — company list + company profile
- `/contacts/:id` — full activity timeline
- `/inbox/:conversationId` — "Send Template" button in composer

#### Acceptance criteria
- When inbound webhook contains `{ "event": "payment_received" }`, TrustCRM auto-sends "payment_confirmation" template to the contact
- Template analytics shows bar chart of last 30 days delivery stats
- Drag-drop deal from "Negotiation" to "Won" stage
- Contact activity timeline shows all messages, notes, calls, deal changes in chronological order

---

### Cycle 5 — "AI & Intelligence" (3 weeks)
**Goal:** Features that don't exist in WhatsJet — AI smart replies, intent detection, voice transcription, predictive analytics, Trust Score dashboard.

All of these are already in TrustCRM's schema and route files. This cycle completes the UI and ensures production-readiness.

#### What to complete
- AI smart reply suggestions in inbox (already in `ai.ts` route, needs inbox UI integration)
- Intent detection on inbound messages (already in `ai.ts`, needs tagging display in inbox)
- Voice message transcription player in inbox (already in `transcriptions.ts`)
- Predictive analytics dashboard (next best action, churn risk, reorder likelihood)
- Trust Score dashboard — org-level + per-contact score explanation

#### Flowise AI bot integration (from vendor settings scan)
WhatsJet has a full Flowise integration (`flowise_url`, `flowise_access_token`). TrustCRM uses Anthropic. Add setting for customers who want to connect their own Flowise instance as the AI backend.

#### UI screens
- `/inbox/:conversationId` — "Suggested Replies" panel (3 AI suggestions, click to insert)
- `/inbox/:conversationId` — Intent badge on inbound messages ("Purchase Intent", "Support Request")
- `/inbox/:conversationId` — Voice message: play button + transcript toggle
- `/analytics` — Predictive tab: churn risk list, high-value contacts, reorder candidates
- `/trust-score` — Org score gauge + breakdown by category + improvement recommendations
- `/settings/ai` — AI backend config (Anthropic vs Flowise vs OpenAI)

---

### Cycle 6 — "Mobile + Scale" (3 weeks)
**Goal:** Expo mobile app, performance, white-label, SuperAdmin capabilities, operational hardening.

#### Schema changes
- New model: `PlatformConfig` (SuperAdmin DB-backed config)

#### Features
**Mobile app (apps/mobile)**
- Push notifications for new messages (UserDevice.fcmToken already in schema)
- Campaign management from mobile
- Contact search and quick messaging
- Inbox with full chat functionality

**SuperAdmin capabilities**
- `POST /admin/organizations/:id/login-as` — impersonate org (shadow login)
- `POST /admin/organizations/:id/ban` — ban with reason
- `POST /admin/organizations/:id/unban` — unban
- `GET  /admin/platform-config` — list all platform config keys
- `PUT  /admin/platform-config` — update config values (SMTP, payment gateways, branding)
- `GET  /admin/organizations` — all orgs with subscription status
- `POST /admin/manual-subscriptions` — assign plan to org manually

**White-label**
- Per-org custom domain routing (`Organization.domain`)
- Per-org branding (already built in Cycle 1) served on custom domain
- Custom CSS per org (`Organization.settings.customCss`)

**UPI payment QR**
- `GET /billing/upi-qr` — generate UPI QR image for subscription payment

**Operational**
- Automatic message deletion after N days (WhatsJet: `enable_automatic_message_deletion`, `delete_whatsapp_message_days`) → BullMQ cron job
- Message queue health monitoring dashboard (SuperAdmin)
- Failed webhook retry UI
- Bot timing restrictions UI (`bot_start_timing`, `bot_end_timing` settings from vendor settings scan)

---

## 5. WhatsJet → TrustCRM Field Mapping Reference

This section is the canonical reference for what stores what.

### Tenancy
| WhatsJet | TrustCRM |
|---------|---------|
| `vendors._id` | `Organization.id` |
| `vendors._uid` | `Organization.id` (UUID) |
| `vendors.title` | `Organization.name` |
| `vendors.slug` | `Organization.slug` *(add)* |
| `vendors.domain` | `Organization.domain` *(add)* |
| `vendors.logo_image` | `Organization.logoImage` *(add)* |
| `vendors.favicon` | `Organization.favicon` *(add)* |
| `vendors.status` | `Organization.status` *(add)* |
| `vendors.ban_reason` | `Organization.banReason` *(add)* |
| `vendors.stripe_id` | `Organization.stripeId` *(add)* |
| `vendors.trial_ends_at` | `Organization.trialEndsAt` *(add)* |
| `vendor_settings.{key}` | `VendorSetting.{key}` *(new model)* |
| `configurations.{key}` | `PlatformConfig.{key}` *(new model)* |

### Users & Roles
| WhatsJet | TrustCRM |
|---------|---------|
| `users._id` | `User.id` (Clerk ID) |
| `users.email` | `User.email` |
| `users.first_name + last_name` | `User.fullName` |
| `users.username` | `User.username` *(add)* |
| `users.mobile_number` | `User.mobileNumber` *(add)* |
| `users.timezone` | `User.settings.timezone` |
| `users.user_roles__id = 1` | `User.role = admin` (platform admin) |
| `users.user_roles__id = 2` | `OrganizationMember.role = admin` |
| `users.user_roles__id = 3` | `OrganizationMember.role = agent/manager` |
| `vendor_users.__data.permissions` | `OrganizationMember.permissions` *(add)* |
| `user_devices.*` | `UserDevice.*` ✅ |
| `user_settings.{key}` | `User.settings.{key}` (JSON) |

### Contacts
| WhatsJet | TrustCRM |
|---------|---------|
| `contacts.first_name` | `Contact.firstName` ✅ |
| `contacts.last_name` | `Contact.lastName` ✅ |
| `contacts.wa_id` | `Contact.waId` *(add)* |
| `contacts.email` | `Contact.email` ✅ |
| `contacts.language_code` | `Contact.languageCode` ✅ |
| `contacts.whatsapp_opt_out` | `Contact.whatsappOptOut` ✅ |
| `contacts.wa_blocked_at` | `Contact.waBlockedAt` ✅ |
| `contacts.disable_ai_bot` | `Contact.disableBot` ✅ |
| `contacts.disable_reply_bot` | `Contact.disableBot` ✅ (combined) |
| `contacts.assigned_users__id` | `Contact.assignedUserId` *(add)* |
| `contacts.__data.contact_notes` | `Contact.notes` *(add)* |
| `contacts.username` | `Contact.username` *(add)* |
| `contacts.bsuid` | `Contact.externalId` ✅ |
| `contacts.countries__id` | `Contact.countryCode` *(add — iso2)* |
| `contact_groups.*` | `ContactGroup.*` *(new model)* |
| `group_contacts.*` | `GroupContact.*` *(new model)* |
| `contact_labels.*` | `ContactLabel.*` ✅ |
| `labels.*` | `Label.*` ✅ |
| `contact_custom_fields.*` | `ContactCustomField.*` ✅ |
| `contact_custom_field_values.*` | `ContactCustomFieldValue.*` ✅ |

### Messaging
| WhatsJet | TrustCRM |
|---------|---------|
| `whatsapp_message_logs._uid` | `Message.id` ✅ |
| `whatsapp_message_logs.message` | `Message.body` ✅ |
| `whatsapp_message_logs.wamid` | `Message.whatsappMessageId` ✅ |
| `whatsapp_message_logs.is_incoming_message` | `Message.direction` ✅ |
| `whatsapp_message_logs.status` | `Message.status` ✅ |
| `whatsapp_message_logs.campaigns__id` | `CampaignRecipient.campaignId` ✅ |
| `whatsapp_message_logs.wab_phone_number_id` | `Message.wabPhoneNumberId` ✅ |
| `whatsapp_message_logs.full_name` | `Message.senderName` *(add)* |
| `whatsapp_message_logs.is_forwarded` | `Message.isForwarded` *(add)* |
| `whatsapp_message_logs.is_system_message` | `Message.isSystemMessage` ✅ |
| `whatsapp_message_logs.__data` | `Message` fields + `MediaAsset` |
| `message_labels.*` | `MessageLabel.*` ✅ |
| `whatsapp_calls.*` | `WhatsappCall.*` ✅ |

### Campaigns
| WhatsJet | TrustCRM |
|---------|---------|
| `campaigns.title` | `Campaign.name` ✅ |
| `campaigns.status` | `Campaign.status` ✅ |
| `campaigns.scheduled_at` | `Campaign.scheduledAt` ✅ |
| `campaigns.timezone` | `Campaign.timezone` *(add)* |
| `campaigns.__data.expiry_at` | `Campaign.expiresAt` *(add)* |
| `campaigns.__data.campaign_type` | `Campaign.campaignType` *(add)* |
| `campaigns.whatsapp_templates__id` | `Campaign.templateId` ✅ |
| `campaign_groups.*` | `CampaignGroup.*` *(new model)* |
| `whatsapp_message_queue.*` | `CampaignRecipient.*` ✅ |

### Automation
| WhatsJet | TrustCRM |
|---------|---------|
| `bot_replies.name` | `AutoReply.name` ✅ |
| `bot_replies.trigger_type` | `AutoReply.triggerType` ✅ |
| `bot_replies.reply_trigger` | `AutoReply.triggerKeyword` ✅ |
| `bot_replies.reply_text` | `AutoReply.replyText` ✅ |
| `bot_replies.priority_index` | `AutoReply.priorityIndex` ✅ |
| `bot_replies.__data` | `AutoReply.replyData` ✅ |
| `bot_replies.bot_flows__id` | `AutoReply.flowId` ✅ |
| `bot_flows.title` | `Flow.name` ✅ |
| `bot_flows.start_trigger` | `Chatbot.startTrigger` *(add)* |
| `bot_flows.__data.flow_builder_data` | `Flow.flowDefinition` ✅ |
| `bot_flows.is_strict_flow` | `Chatbot.isStrictFlow` ✅ |
| `bot_flows.session_timeout_minutes` | `Chatbot.sessionTimeoutMinutes` ✅ |
| `contact_bot_flow_sessions.*` | `BotSession.*` ✅ |

### Templates
| WhatsJet | TrustCRM |
|---------|---------|
| `whatsapp_templates.template_name` | `Template.name` ✅ |
| `whatsapp_templates.template_id` | `Template.metaTemplateId` ✅ |
| `whatsapp_templates.category` | `Template.category` ✅ |
| `whatsapp_templates.language` | `Template.language` ✅ |
| `whatsapp_templates.status` | `Template.status` ✅ |
| `whatsapp_templates.__data.template` | `Template.components` ✅ |

### Billing
| WhatsJet | TrustCRM |
|---------|---------|
| `subscriptions.*` | Stripe via `Organization.stripeId` ✅ |
| `manual_subscriptions.*` | `ManualSubscription.*` ✅ |
| `transactions.*` | `Transaction.*` ✅ |
| `credit_transactions.*` | `CreditLedger.*` ✅ |

### Subscription Plan Features (WhatsJet `lw-plans.php` → TrustCRM `PlanTier`)
| WhatsJet Limit | TrustCRM enforcement |
|----------------|----------------------|
| `contacts` | Check `SELECT COUNT(*) FROM contacts WHERE org_id = ?` vs plan limit |
| `campaigns` (monthly) | Check campaigns created this billing cycle vs limit |
| `bot_replies` | Check auto_replies count |
| `bot_flows` | Check flows count |
| `contact_custom_fields` | Check custom fields count |
| `system_users` | Check organization_members count |
| `ai_chat_bot` (switch) | Feature flag per plan tier |
| `api_access` (switch) | Feature flag per plan tier |

---

## 6. Out of Scope (Deliberately Excluded)

| WhatsJet Feature | Reason excluded |
|-----------------|-----------------|
| Addons system (installable zip plugins) | TrustCRM is pure SaaS — no plugin architecture needed |
| Translation/i18n admin panel | India market, English-first. Internationalisation is Phase 3 |
| Laravel Queue UI (`failed_jobs`, `jobs` tables) | TrustCRM uses BullMQ — no equivalent needed |
| License/product registration | TrustCRM is cloud SaaS, no self-hosted license |
| Social login (Facebook/Google admin config) | Handled by Clerk |
| Pusher config admin panel | TrustCRM uses Socket.io — config in infra, not DB |
| App color customization (50+ CSS variables) | TrustCRM uses Tailwind design system |
| WhatsJet upgrade guide files | Not applicable |
| Demo number registration | Not applicable for TrustCRM launch |
| Countries lookup table | Use `country_code` (ISO2) string field — no table needed |

---

## 7. Success Criteria

A WhatsJet customer is ready to switch when:
1. Can connect their WhatsApp Business account via embedded signup or manual token
2. Can create contact groups and add contacts to them
3. Can create and schedule a campaign targeting a group
4. Can view per-contact delivery status for that campaign
5. Can create an auto-reply bot and a visual flow
6. Can add team members with granular permissions (hide phone numbers, assigned chats only, etc.)
7. Can pay via Razorpay or UPI (India market)
8. All their existing WhatsApp conversations appear in inbox as new conversations come in
9. They experience zero features missing compared to WhatsJet — and several they never had

---

*Spec generated by Chief Engineer from full code scan of WhatsJet v7.2.0 source + TrustCRM Prisma schema. No features invented — every item traceable to a WhatsJet route, table, or model.*
