# WhatsJet SaaS v7.2.0 — Legacy System Master Documentation

> **Classification:** Enterprise Migration Source of Truth  
> **System:** WhatsJet SaaS v7.2.0 (by livelyworks)  
> **Stack:** Laravel PHP + MySQL + Redis  
> **Reverse-Engineered:** 2026-05-17  
> **Purpose:** Migration, QA regression coverage, functional parity, redevelopment  

---

## Table of Contents

1. [Product Requirements Document (PRD)](#1-product-requirements-document)
2. [Functional Requirements Document (FRD)](#2-functional-requirements-document)
3. [Software Requirements Specification (SRS)](#3-software-requirements-specification)
4. [API Specification](#4-api-specification)
5. [Database Specification](#5-database-specification)
6. [Workflow Documentation](#6-workflow-documentation)
7. [Permission Matrix](#7-permission-matrix)
8. [UI/UX Specification](#8-uiux-specification)
9. [Business Rules Document](#9-business-rules-document)
10. [Edge Case Catalog](#10-edge-case-catalog)
11. [Integration Specification](#11-integration-specification)
12. [Migration Readiness Report](#12-migration-readiness-report)
13. [Functional Parity Checklist](#13-functional-parity-checklist)
14. [QA Regression Checklist](#14-qa-regression-checklist)

---

## 1. Product Requirements Document

### 1.1 Product Overview

WhatsJet SaaS is a **multi-tenant WhatsApp marketing and CRM platform** that enables businesses (tenants, called "Vendors") to:

- Send bulk WhatsApp campaigns using approved Meta templates
- Conduct 1:1 live chat with contacts
- Automate replies via keyword bots, visual flow bots, and AI bots
- Manage contacts with groups, labels, and custom fields
- Access the platform via web interface and REST API

The platform operates as a **two-tier SaaS**:
- **SuperAdmin (Central Console)** — platform operator, manages vendors/tenants, plans, subscriptions
- **Vendor (Vendor Console)** — business operator, manages their own contacts/campaigns/bots

### 1.2 User Personas

| Persona | Role | Access |
|---------|------|--------|
| SuperAdmin | Platform operator | Central Console at `/central-console` |
| Vendor Admin | Business owner | Vendor Console at `/vendor-console` |
| Vendor Team Member | Staff member | Vendor Console (scoped permissions) |
| Mobile App User | Vendor on mobile | REST API (`app_api.*` routes) |
| API Developer | Integration builder | External REST API (`api.vendor.*` routes) |

### 1.3 Core Modules

| Module | Description |
|--------|-------------|
| Authentication | Login, registration, 2FA, password reset |
| User Management | Vendor team members, role-based access |
| Contact Management | Contacts, groups, custom fields, labels/tags |
| WhatsApp Chat | Real-time 1:1 messaging inbox |
| Campaign Engine | Bulk WhatsApp message campaigns with scheduling |
| Bot Reply | Keyword-triggered automated responses |
| Bot Flow | Visual flow builder for multi-step conversations |
| AI Bot | OpenAI GPT and Flowise AI integration |
| Template Management | WhatsApp Business template CRUD + sync |
| Subscription | Stripe plans + manual payment gateways |
| Vendor Settings | Per-tenant configuration (API, AI, webhooks) |
| Configuration | SuperAdmin system-level settings |
| Translation | Multi-language (i18n) management |
| Media | File upload management |
| Dashboard | Analytics and stats |
| Public Pages | CMS pages (terms, privacy, contact) |
| External API | Developer REST API for integration |

### 1.4 Business Objectives

1. Allow SMBs to use WhatsApp Business Cloud API without technical expertise
2. Provide SaaS subscription revenue model for platform operator
3. Support multi-language and multi-timezone deployments
4. Provide mobile app API for iOS/Android companions
5. Allow bot automation to reduce manual agent workload

---

## 2. Functional Requirements Document

### 2.1 Authentication Module

#### 2.1.1 Login
- Email + password login for all user types
- Two-factor authentication (2FA) support — verify via separate challenge step
- "Login as" impersonation: SuperAdmin can log in as any vendor admin; vendor admin can log in as any team member
- "Logout as" returns to original session
- Language change persists in session (`/change-language/{localeID}`)
- Theme change persists in session (`/change-theme/{themeID}`)

#### 2.1.2 Registration
- Vendor self-registration via API (`POST /api/register/vendor`)
- Optional: activation required flow (`POST /api/register/vendor/activation`)
- Mobile app sign-up via (`GET /api/user/prepare-sign-up`, `POST /api/user/process-sign-up`)

#### 2.1.3 Password
- Password update: `POST /api/update-password`
- SuperAdmin change vendor password: `POST /central-console/vendors/change-password-vendor`

#### 2.1.4 Account Activation
- Account activation link: `GET /api/{userUid}/account-activation`

### 2.2 User Management Module

#### 2.2.1 Team Member CRUD (Vendor scope)
- List team members: datatable at `/vendor-console/users/list-data`
- Create team member: `POST /vendor-console/users/add-process`
- Edit team member: `GET /vendor-console/users/{uid}/get-update-data` + `POST /vendor-console/users/update-process`
- Delete team member: `POST /vendor-console/users/{uid}/delete-process`
- Login as team member: `POST /vendor-console/users/{uid}/login-as`
- Logout as team member: `POST /vendor-console/users/logout-as`

#### 2.2.2 Profile Management
- Profile edit form: `GET /user-console/profile-update`
- Profile update: `POST /user-console/profile-update`
- 2FA confirm: `POST /user-console/confirm-2fa`
- Mobile profile update: `POST /api/user/profile-update`

### 2.3 Contact Management Module

#### 2.3.1 Contacts CRUD
- List with optional group filter: `GET /vendor-console/contacts/list/{groupUid?}`
- DataTable source: `GET /vendor-console/contacts/list-data/{groupUid?}`
- Create: `POST /vendor-console/contacts/add-process`
- Edit data: `GET /vendor-console/contacts/{id}/get-update-data`
- Update: `POST /vendor-console/contacts/update-process`
- Delete single: `POST /vendor-console/contacts/{id}/delete-process`
- Delete selected (bulk): `POST /vendor-console/contacts/delete-selected-process`
- Delete all: `POST /vendor-console/contacts/process-delete-all`
- Remove from group: `POST /vendor-console/contacts/{id}/{groupUid}/remove-process`
- Block: `POST /vendor-console/contacts/{id}/block-process`
- Unblock: `POST /vendor-console/contacts/{id}/unblock-process`
- Toggle AI bot per contact: `POST /vendor-console/contacts/{id}/toggle-ai-bot`

#### 2.3.2 Contact Import/Export
- Import via file: `POST /vendor-console/contacts/import`
- Abort import: `POST /vendor-console/contacts/abort-import`
- Export: `GET /vendor-console/contacts/export/{exportType?}/{fileType?}`

#### 2.3.3 Advanced Filter
- Get filter support data: `GET /vendor-console/contacts/filter-support-data`
- Store filter: `POST /vendor-console/contacts/filter-store-process`
- Filter persists in `vendor_settings.contact_advance_filter_data` (JSON)

#### 2.3.4 Contact Groups
- List: `GET /vendor-console/contacts/groups/{status?}/list-data`
- Create: `POST /vendor-console/contacts/groups/add-process`
- Edit: `GET /vendor-console/contacts/groups/{id}/get-update-data`
- Update: `POST /vendor-console/contacts/groups/update-process`
- Delete: `POST /vendor-console/contacts/groups/{id}/delete-process`
- Archive: `POST /vendor-console/contacts/groups/{id}/archive-process`
- Unarchive: `POST /vendor-console/contacts/groups/{id}/unarchive-process`
- Bulk delete selected: `POST /vendor-console/contacts/groups/delete-selected-process`
- Bulk archive selected: `POST /vendor-console/contacts/groups/archive-selected-process`
- Bulk unarchive selected: `POST /vendor-console/contacts/groups/unarchive-selected-process`
- Assign groups to selected contacts: `POST /vendor-console/contacts/assign-groups-selected-process`

#### 2.3.5 Custom Fields
- CRUD at `/vendor-console/contacts/custom-fields/*`
- Field types: string, bool, int, json (datatypes 1-4)
- Custom field values stored in `contact_custom_field_values` table

#### 2.3.6 Labels (Tags)
- Create label: `POST /vendor-console/whatsapp/contact/create-label`
- Edit label: `POST /vendor-console/whatsapp/contact/chat/edit-label`
- Delete label: `POST /vendor-console/whatsapp/contact/chat/delete-label/{labelUid}`
- Get contact labels: `GET /vendor-console/whatsapp/contact/labels/{contactUid}`
- Assign labels to contact: `POST /vendor-console/whatsapp/contact/chat/assign-labels`

### 2.4 WhatsApp Chat Module

#### 2.4.1 Inbox/Chat View
- Main chat view: `GET /vendor-console/whatsapp/contact/chat/{contactUid?}`
- Get contact chat data: `GET /vendor-console/whatsapp/contact/chat-data/{contactUid}/{way?}`
  - `way` parameter: `prepend` / `append` for pagination direction
- Get contacts sidebar data: `GET /vendor-console/whatsapp/contact/contacts-data/{contactUid?}`
- Unread count: `GET /vendor-console/whatsapp/chat/unread-count`
- Clear chat history: `POST /vendor-console/whatsapp/contact/chat/clear-history/{contactUid}`

#### 2.4.2 Sending Messages
- Send text/template message: `POST /vendor-console/whatsapp/contact/chat/send`
- Send media: `POST /vendor-console/whatsapp/contact/chat/send-media`
- Prepare media uploader: `GET /vendor-console/whatsapp/contact/chat/prepare-send-media/{mediaType?}`
- Send template message: `GET/POST /vendor-console/whatsapp/contact/send-template-message/{contactUid}`

#### 2.4.3 Chat Assignment
- Assign user to chat: `POST /vendor-console/whatsapp/contact/chat/assign-user`
- Team member list for assignment: `GET /vendor-console/whatsapp/{contactId}/team-member-list`
- Update notes: `POST /vendor-console/whatsapp/contact/chat/update-notes`

#### 2.4.4 Message Log
- Message log list view: `GET /vendor-console/whatsapp/message-log`
- Message log datatable: `GET /vendor-console/whatsapp/message-log-list/{isIncomingMsg?}/{msgStartDate?}/{msgEndDate?}`
- Get message data: `GET /vendor-console/whatsapp/{messageId}/get-message-data`

### 2.5 Campaign Module

#### 2.5.1 Campaign Creation
- New campaign view: `GET /vendor-console/whatsapp/campaign/new/{campaignType?}`
  - `campaignType`: `template` (default) or non-template
- Schedule campaign: `POST /vendor-console/whatsapp/campaign/schedule`
- Get targeted contact count: `POST /vendor-console/whatsapp/campaign/targeted-contact-count`

#### 2.5.2 Campaign List
- Campaign list view: `GET /vendor-console/whatsapp/campaign/`
- Template campaigns: `GET /vendor-console/whatsapp/campaign/{status}/list-data`
- Non-template campaigns: `GET /vendor-console/whatsapp/campaign/non-template/{status}/list-data`
- Non-template preset messages: `GET /vendor-console/whatsapp/campaign/non-template-message-presets/{status}/list-data`
- Preset messages view: `GET /vendor-console/whatsapp/preset-messages-non-template`

#### 2.5.3 Campaign Status & Monitoring
- Campaign status view: `GET /vendor-console/whatsapp/campaign/status/{campaignUid}/view/{pageType?}/{logStatus?}`
- Campaign status data: `GET /vendor-console/whatsapp/campaign/status/{campaignUid}/data`
- Queue log list: `GET /vendor-console/whatsapp/campaign/queue/{campaignUid}/{logStatus?}`
- Executed log list: `GET /vendor-console/whatsapp/campaign/executed/{campaignUid}/{logStatus?}`
- Expired log list: `GET /vendor-console/whatsapp/campaign/expired/{campaignUid}`

#### 2.5.4 Campaign Actions
- Delete: `POST /vendor-console/whatsapp/campaign/{id}/delete-process`
- Archive: `POST /vendor-console/whatsapp/campaign/{id}/archive-process`
- Unarchive: `POST /vendor-console/whatsapp/campaign/{id}/unarchive-process`
- Abort: `POST /vendor-console/whatsapp/campaign/{id}/abort-process`
- Requeue failed: `POST /vendor-console/whatsapp/campaign/requeue/{campaignUid}`

#### 2.5.5 Campaign Reports (Excel Download)
- Executed log report: `GET /vendor-console/whatsapp/campaign/campaign-report/{campaignUid}`
- Queue log report: `GET /vendor-console/whatsapp/campaign/campaign-queue-log-report/{campaignUid}`
- Expired log report: `GET /vendor-console/whatsapp/campaign/campaign-expired-log-report/{campaignUid}`

### 2.6 Bot Reply Module

#### 2.6.1 Bot Reply CRUD
- List view: `GET /vendor-console/bot-replies/`
- List data: `GET /vendor-console/bot-replies/list-data`
- Create: `POST /vendor-console/bot-replies/add-process`
- Get edit data: `GET /vendor-console/bot-replies/{id}/get-update-data`
- Update: `POST /vendor-console/bot-replies/update-process`
- Delete: `POST /vendor-console/bot-replies/{id}/delete-process`
- Duplicate: `POST /vendor-console/bot-replies/{id}/duplicate-process`

#### 2.6.2 Bot Reply Operations
- Get all active bots for contact: `GET /vendor-console/bot-replies/{contactId}/all-active-bots`
- Get bot preview: `GET /vendor-console/bot-replies/{botId}/{contactId}/bot-preview`
- Quick reply process: `POST /vendor-console/bot-replies/quick-reply-process`

#### 2.6.3 Bot Reply Data Structure (`__data` JSON)
- `interaction_message`: array — interactive message data (buttons, lists)
- `media_message`: array — media attachment data
- `template_message`: array — WhatsApp template data
- `bot_actions`: array — automated actions (assign user, add label, etc.)

### 2.7 Bot Flow Module

#### 2.7.1 Bot Flow CRUD
- List view: `GET /vendor-console/bot-replies/bot-flows/`
- List data: `GET /vendor-console/bot-replies/bot-flows/list-data`
- Create: `POST /vendor-console/bot-replies/bot-flows/add-process`
- Get edit data: `GET /vendor-console/bot-replies/bot-flows/{id}/get-update-data`
- Update: `POST /vendor-console/bot-replies/bot-flows/update-process`
- Delete: `POST /vendor-console/bot-replies/bot-flows/{id}/delete-process`

#### 2.7.2 Bot Flow Builder
- Flow builder view: `GET /vendor-console/bot-replies/bot-flows/builder/flow/{botFlowId}`
- Update flow data: `POST /vendor-console/bot-replies/bot-flows/builder/update-flow-data-process`
- `__data.flow_builder_data`: JSON storing the visual flow graph data

#### 2.7.3 Bot Reply ↔ Bot Flow Relationship
- A `BotReplyModel` has FK `bot_flows__id` pointing to `BotFlowModel`
- Bot flow contains the conversation graph; bot replies are nodes/triggers in the flow

### 2.8 WhatsApp Template Module

#### 2.8.1 Template CRUD
- List view: `GET /vendor-console/whatsapp/templates/`
- List data: `GET /vendor-console/whatsapp/templates/list-data`
- Create template: `GET /vendor-console/whatsapp/templates/create` + `POST /vendor-console/whatsapp/templates/create-process`
- Edit template: `GET /vendor-console/whatsapp/templates/update/{templateUid}` + `POST /vendor-console/whatsapp/templates/update-process`
- Delete template: `POST /vendor-console/whatsapp/templates/delete/{templateUid}`
- Sync templates from Meta: `POST /vendor-console/whatsapp/templates/sync`

#### 2.8.2 Template Analytics
- Analytics view: `GET /vendor-console/whatsapp/templates/analytics/{templateUid}`
- Analytics data: `POST /vendor-console/whatsapp/templates/analytics`
- Enable analytics: `POST /vendor-console/whatsapp/enable-template-analytics`

#### 2.8.3 Template Components
- Templates have components: HEADER (TEXT/IMAGE/VIDEO/DOCUMENT), BODY (text with `{{N}}` variables), FOOTER, BUTTONS
- Button types: URL (with optional dynamic `{{1}}`), QUICK_REPLY, COPY_CODE, CALL_TO_ACTION, CAROUSEL
- Body and header parameters are extracted via regex `/{{\d+}}/`
- Variable placeholders rendered as `field_N` (body) and `header_field_N` (header)
- Carousel template type = `CAROUSEL` (special handling in `prepareTemplate()`)

### 2.9 WhatsApp Account/Setup Module

#### 2.9.1 Account Management
- Health status check: `POST /vendor-console/whatsapp/health-status`
- Sync phone numbers from Meta: `POST /vendor-console/whatsapp/sync-phone-numbers`
- Process template change: `POST /vendor-console/whatsapp/process-template-change`
- Get business profile: `GET /vendor-console/whatsapp/business-profile/{phoneNumberId}`
- Update business profile: `POST /vendor-console/whatsapp/business-profile/update`
- Get display name: `GET /vendor-console/whatsapp/display-name/{phoneNumberId}`
- Update display name: `POST /vendor-console/whatsapp/display-name/update`
- Register phone number: `POST /vendor-console/whatsapp/register-phone-number`
- Update 2-step verification: `POST /vendor-console/whatsapp/two-step-verification/update`
- Embedded signup: `POST /vendor-console/whatsapp/embedded-signup-process`

#### 2.9.2 Webhook Management
- Connect webhook: `POST /vendor-console/whatsapp/connect-webhook`
- Disconnect webhook: `POST /vendor-console/whatsapp/disconnect-webhook`
- Disconnect account: `POST /vendor-console/whatsapp/disconnect-account`
- WhatsApp webhook receiver: `ANY /whatsapp-webhook/{vendorUid}` (public, no auth, CSRF exempt)

### 2.10 Vendor Settings Module

#### 2.10.1 Settings Pages
- Settings view: `GET /vendor-console/settings/{pageType?}`
- Settings update: `POST /vendor-console/settings`
- Basic settings update: `POST /vendor-console/settings-basic`

#### 2.10.2 Setting Groups (`pageType` values)
| pageType | Description |
|----------|-------------|
| `general` | Business name, slug, email, phone, address, timezone |
| `bot_timing_settings` | Bot operating hours (start/end time, timezone) |
| `ai_bot_settings` | Default AI bot toggle, failure message |
| `flowise_ai_bot_setup` | Flowise URL + access token |
| `open_ai_bot_setup` | OpenAI API key, model, training data, assistant ID |
| `whatsapp_cloud_api_setup` | Facebook App ID, secret, access token, WABA ID, phone numbers |
| `language-settings` | Translation languages |
| `vendor_webhook` | Outbound webhook endpoint toggle + URL |
| `internals` | Internal/system settings (token, filter data, display name) |

#### 2.10.3 Sound Notification
- Disable sound notification: `GET /vendor-console/disable-sound-notifications-for-message`
- Stored in `vendor_settings.is_disabled_message_sound_notification` (boolean)

### 2.11 Subscription Module

#### 2.11.1 Stripe Subscription Flow
- View subscription page: `GET /vendor-console/subscription/`
- Subscribe to plan: `POST /vendor-console/subscription/create`
- Change plan: `POST /vendor-console/subscription/change-plan`
- Cancel subscription: `GET /vendor-console/subscription/cancel`
- Resume subscription: `GET /vendor-console/subscription/resume`
- Billing portal (Stripe hosted): `GET /vendor-console/subscription/billing-portal`
- Download invoice: `GET /vendor-console/subscription/download-invoice/{invoice}`
- Stripe webhook: `POST /stripe/webhook` (public, no auth)

#### 2.11.2 Manual Subscription Gateways
- Proceed to pay (manual): `POST /vendor-console/subscription/proceed-to-pay`
- Delete pay request: `POST /vendor-console/subscription/manual-pay/delete-request`
- Enter payment details: `POST /vendor-console/subscription/manual-pay/enter-payment-details`
- UPI QR code: `GET /vendor-console/subscription/manual-pay/upi-payment-request-qr`
- PayPal capture: `POST /vendor-console/paypal/capture-paypal-order`
- Razorpay checkout: `POST /vendor-console/razorpay/checkout`
- Paystack verify: `POST /vendor-console/paystack-verify/{reference}`
- YooMoney checkout: `GET /vendor-console/yoomoney/checkout/{manualSubscriptionUid}`
- YooMoney capture: `GET /vendor-console/yoomoney/capture-payment/{manualSubscriptionUid}`
- PhonePe capture: `POST /vendor-console/phone-pe/capture-payment`
- Payment success page: `GET /vendor-console/{txnId}/payment-success`

#### 2.11.3 Payment Webhooks (Public)
- Razorpay: `POST /razorpay/order-payment-razorpay-webhook`
- Paystack: `POST paystack/paystack-webhook-order-payment`
- YooMoney: `POST yoomoney/yoomoney-webhook-order-payment`

### 2.12 SuperAdmin (Central Console) Module

#### 2.12.1 Dashboard
- Dashboard: `GET /central-console/`
- Stats filter: `POST /central-console/dashboard-stats-filter-data/{vendorUid}`

#### 2.12.2 Vendor Management
- Vendor list: `GET /central-console/vendors`
- Vendor details: `GET /central-console/{vendorId}/details`
- Add vendor: `POST /central-console/add`
- Fetch vendor list (datatable): `GET /central-console/fetch-list`
- Vendor update data: `GET /central-console/vendors/get-update-data/{id}`
- Update vendor: `POST /central-console/vendors/update-vendor-data`
- Delete vendor: `POST /central-console/vendors/list-data/{id}`
- Permanent delete: `POST /central-console/vendors/vendor-delete/{id}`
- Change vendor password: `GET/POST /central-console/vendors/{id}/get-change-password-vendor`
- Vendor dashboard: `GET /central-console/vendors/{id}/dashboard`
- Vendor quick view: `GET /central-console/vendors/{id}/details`
- Login as vendor admin: `POST /central-console/{vendorUid}/login-as-vendor-admin`
- Logout as vendor admin: `POST /vendor-console/users/logout-as-vendor-admin`

#### 2.12.3 Subscription Management (SuperAdmin)
- Subscription list: `GET /central-console/subscription-list/`
- Delete subscription entries: `POST /central-console/subscription-list/delete-subscription-entries`
- Manual subscription list view: `GET /central-console/manual-subscriptions/`
- Selected plan details: `POST /central-console/manual-subscriptions/selected-plan-details`
- Manual sub datatable: `GET /central-console/manual-subscriptions/list-data/{vendorUid?}/{isAutoRecurring?}`
- Delete manual sub: `POST /central-console/manual-subscriptions/{id}/delete-process`
- Create manual sub: `POST /central-console/manual-subscriptions/add-process`
- Update manual sub: `POST /central-console/manual-subscriptions/update-process`
- Cancel vendor subscription: `POST /central-console/manual-subscriptions/cancel-and-discard/{vendorUid}`

#### 2.12.4 Configuration
- Subscription plans: `GET/POST /central-console/subscription-plans`
- Create Stripe webhook: `POST /central-console/create-stripe-webhook`
- Configuration pages: `GET /central-console/configuration/{pageType}` + `POST /central-console/configuration/{pageType}/process-configuration-store`
- App optimize: `POST /central-console/configuration/operations/optimize`
- Clear optimize: `POST /central-console/configuration/operations/optimize-clear`
- Optimize table: `POST /central-console/configuration/operations/optimize-table`
- License information: `GET /central-console/configuration/licence-information`
- Addons list: `GET /central-console/addons/`
- Upload addon: `POST /central-console/addons/upload-addon`
- Install addon: `POST /central-console/addons/install`
- Mobile app config: `GET /central-console/mobile-app/`

#### 2.12.5 Media Management (SuperAdmin)
- Files/media view: `GET /central-console/files-media`
- Media datatable: `GET /central-console/{vendorUid}/{mediaType}/files-media-datatable`
- Delete media: `POST /central-console/delete-files-media`
- Bulk delete media: `POST /central-console/delete-bulk-files-media`
- Upload logos: `POST /central-console/upload-logo`, `upload-dark-theme-logo`, `upload-small-logo`, etc.
- Upload favicon: `POST /central-console/upload-favicon`, `upload-dark-theme-favicon`

#### 2.12.6 Translations
- Languages list: `GET /central-console/translations/`
- Create language: `POST /central-console/translations/process-language-store`
- Update language: `POST /central-console/translations/process-language-update`
- Delete language: `POST /central-console/translations/{id}/process-language-delete`
- Translation list: `GET /central-console/translations/language/{languageId}/{languageType?}`
- Scan translations: `GET /central-console/translations/scan/{languageId}/{preventReload?}`
- Update translation: `POST /central-console/translations/update/{languageType?}`
- Export translation: `GET /central-console/translations/export/{languageId}`
- Import translation: `POST /central-console/translations/import/{languageId}`
- Auto-translate: `POST /central-console/translations/auto-translate/{serviceId}/{languageId}`
- Auto-translate all: `POST /central-console/translations/auto-translate-all/{serviceId}`

#### 2.12.7 CMS Pages
- Page list: `GET /central-console/pages/`
- Page datatable: `GET /central-console/pages/list-data`
- Create page: `POST /central-console/pages/add-process`
- Edit page: `GET /central-console/pages/{id}/get-update-data`
- Update page: `POST /central-console/pages/update-process`
- Delete page: `POST /central-console/pages/{id}/delete-process`
- Public page preview: `GET /page/{pageUid}/{slug}`

### 2.13 Public/Landing Pages
- Home/landing: `GET /`
- Console redirect: `GET /console` → routes to central or vendor console based on `hasCentralAccess()`
- Contact form: `GET /contact` + `POST /contact-process`
- Terms & policies: `GET /terms-and-policies/{contentName?}`
- WhatsApp QR code: `GET /whatsapp-qr/{vendorUid}/{phoneNumber}`
- Custom styles CSS: `GET /custom-styles.css`
- Server-compiled JS: `GET /server-compiled.js`
- Cron schedule: `GET /run-cron-schedule/{token?}`

---

## 3. Software Requirements Specification

### 3.1 Technical Stack

| Layer | Technology |
|-------|-----------|
| Framework | Laravel (PHP 8.x) |
| Architecture | Yantrana (Controller → Engine → Repository → Model) |
| Database | MySQL |
| Cache/Queue | Redis + Laravel Queue |
| Jobs | `ProcessCampaignMessagesJob`, `ProcessMessageWebhookJob` |
| Events | `VendorChannelBroadcast`, `WhatsappWebhookReceived` |
| Real-time | Laravel Broadcasting (Pusher/Socket.io) |
| Storage | AWS S3 / local filesystem (configurable via `yes-file-storage.php`) |
| Payments | Stripe (Laravel Cashier), PayPal, Razorpay, Paystack, YooMoney, PhonePe |
| AI | OpenAI API, Flowise |
| WhatsApp | Meta WhatsApp Cloud API v17+ |
| Frontend | Blade templates + Alpine.js + Tailwind CSS |
| Mobile | Separate companion app (API consumer) |

### 3.2 Middleware Stack

| Middleware | Purpose |
|-----------|---------|
| `Authenticate` | Requires authenticated session |
| `CentralAccessCheckpost` | Requires SuperAdmin (central) access |
| `VendorAccessCheckpost` | Requires vendor (tenant) access |
| `ApiVendorAccessCheckpost` | Validates external API token for public API |
| `AppApiAuthenticateMiddleware` | Validates mobile app API token |
| `CommonEntranceMiddleware` | Applied to all routes |
| `VendorFrontend` | Vendor-specific frontend middleware |
| `VerifyCsrfToken` | CSRF protection (WhatsApp webhook path excluded) |
| `EncryptCookies` | Cookie encryption |
| `TrustProxies` | Proxy trust configuration |

### 3.3 Authentication Guards

| Guard | Usage |
|-------|-------|
| `web` | Session-based for web dashboard |
| `api` | Token-based for mobile companion API |
| `api.vendor.authenticate` | Vendor API token for external REST API |
| `app_api.vendor.authenticate` | Mobile app API authentication |

### 3.4 System Configuration (`config/__settings.php`)

#### Global Settings Categories
- `general`: logo, favicon, app name, site URL, SMTP, registration settings, colors, Recaptcha, demo mode
- `subscription`: Stripe keys, subscription type (free/paid), plan enforcement
- `payment`: PayPal, Razorpay, Paystack, YooMoney, PhonePe configuration
- `email`: SMTP/Mailgun/SES settings
- `storage`: S3 credentials, storage driver selection
- `whatsapp`: Global WhatsApp API settings

### 3.5 Vendor Settings (`config/__vendor-settings.php`)

All settings stored as key-value pairs in `vendor_settings` table (per tenant).

Data types: `1=string`, `2=bool`, `3=int`, `4=json`

Settings groups:
- `general`: Business profile (name, slug, email, phone, address, city, state, country, postal_code, timezone, default_language)
- `bot_timing_settings`: Bot operating hours
- `ai_bot_settings`: AI bot global defaults
- `flowise_ai_bot_setup`: Flowise connection
- `open_ai_bot_setup`: OpenAI connection + training data
- `whatsapp_cloud_api_setup`: WABA credentials + phone numbers
- `language-settings`: Supported languages
- `vendor_webhook`: Outbound webhook settings
- `internals`: System-managed settings

---

## 4. API Specification

### 4.1 External REST API (for Developers)

**Base URL:** `/{vendorUid}/`  
**Authentication:** Bearer token (`vendor_api_access_token` from vendor settings)  
**Middleware:** `api.vendor.authenticate`

#### 4.1.1 Messaging Endpoints

| Method | Path | Action | Name |
|--------|------|--------|------|
| POST | `/{vendorUid}/contact/send-message` | Send text/interactive message | `api.vendor.chat_message.send.process` |
| GET | `/{vendorUid}/contact/message-status` | Get message delivery status | `api.vendor.chat_message.read.status` |
| POST | `/{vendorUid}/contact/send-media-message` | Send media message | `api.vendor.chat_message_media.send.process` |
| GET | `/{vendorUid}/contact/template-list` | Get approved template list | `api.vendor.template_list.read.list` |
| POST | `/{vendorUid}/contact/send-template-message` | Send template message | `api.vendor.chat_template_message.send.process` |
| POST | `/{vendorUid}/contact/send-carousel-template-message` | Send carousel template | `api.vendor.chat_carousel_template_message.send.process` |
| POST | `/{vendorUid}/contact/send-interactive-message` | Send interactive message (buttons/list) | `api.vendor.chat_message_interactive.send.process` |

#### 4.1.2 Contact Endpoints

| Method | Path | Action | Name |
|--------|------|--------|------|
| POST | `/{vendorUid}/contact/create` | Create new contact | `api.vendor.contact.create.process` |
| POST | `/{vendorUid}/contact/update/{phoneNumber}` | Update contact by phone | `api.vendor.contact.update.process` |
| POST | `/{vendorUid}/contact/assign-team-member` | Assign team member | `api.vendor.contact.assign_member.update.process` |
| GET | `/{vendorUid}/contacts` | Paginated contact list | `api.vendor.contact.read.list` |
| GET | `/{vendorUid}/contact` | Get contact by phone/email | `api.vendor.contact.read.single_contact` |
| GET | `/{vendorUid}/contact/groups` | Get contact groups | `api.vendor.contact.read.group_list` |
| GET | `/{vendorUid}/contact/labels-tags` | Get labels and tags | `api.vendor.contact.read.labels_and_tags_list` |
| POST | `/{vendorUid}/contact/assign-groups` | Assign groups to contact | `api.vendor.contact.assign_groups.update.process` |
| POST | `/{vendorUid}/contact/unassign-groups` | Unassign groups from contact | `api.vendor.contact.unassign_groups.update.process` |
| POST | `/{vendorUid}/contact/assign-labels` | Assign labels to contact | `api.vendor.contact.assign_labels.update.process` |
| POST | `/{vendorUid}/contact/unassign-labels` | Unassign labels from contact | `api.vendor.contact.unassign_labels.update.process` |

#### 4.1.3 Campaign Endpoints

| Method | Path | Action | Name |
|--------|------|--------|------|
| POST | `/{vendorUid}/campaign/schedule` | Schedule new campaign | `api.vendor.campaign.write.schedule` |
| GET | `/{vendorUid}/campaign` | Paginated campaign list | `api.vendor.campaign.read.list` |
| GET | `/{vendorUid}/campaign-status/{campaignUid}` | Campaign status details | `api.vendor.campaign.read.status_details` |

### 4.2 Mobile App API (Authenticated)

**Middleware:** `app_api.vendor.authenticate`  
**Base Path:** `/api/vendor/`

#### 4.2.1 Unread Count
- `GET /api/vendor/whatsapp/chat/unread-count`

#### 4.2.2 Chat
- `GET /api/vendor/whatsapp/contact/chat/{contactUid?}` — load chat
- `GET /api/vendor/whatsapp/contact/chat-data/{contactUid}/{way?}` — paginate messages
- `POST /api/vendor/whatsapp/contact/chat/send` — send message
- `POST /api/vendor/whatsapp/contact/chat/send-media` — send media
- `GET /api/vendor/whatsapp/contact/chat/prepare-send-media/{mediaType?}` — media uploader info
- `POST /api/vendor/whatsapp/contact/chat/clear-history/{contactUid}` — clear history
- `GET /api/vendor/whatsapp/contact/chat-box-data/{contactUid}` — labels + team members

#### 4.2.3 Contacts (Mobile)
- `GET /api/vendor/contacts/list-data` — datatable list
- `GET /api/vendor/contacts/add-support-data` — create form data
- `POST /api/vendor/contacts/add-process` — create contact
- `GET /api/vendor/contacts/{id}/get-edit-support-data` — edit form data
- `POST /api/vendor/contacts/update-process` — update contact
- `POST /api/vendor/contacts/{id}/delete-process` — delete contact
- `POST /api/vendor/contacts/delete-selected-process` — bulk delete
- `POST /api/vendor/contacts/assign-groups-selected-process` — bulk assign groups
- `GET /api/vendor/contacts/filter-support-data` — filter options
- `POST /api/vendor/contacts/filter-store-process` — save filter

#### 4.2.4 Bot (Mobile)
- `GET /api/vendor/bot-replies/{contactUid}/all-active-bots` — list active bots
- `GET /api/vendor/bot-replies/{botUid}/{contactId}/bot-preview` — bot preview
- `POST /api/vendor/bot-replies/quick-reply-process` — trigger bot quick reply

#### 4.2.5 Campaigns (Mobile)
- `GET /api/vendor/whatsapp/campaign/{status}/list-data` — campaign list
- `GET /api/vendor/whatsapp/campaign/non-template-message-presets/{status}/list-data` — presets
- `GET /api/vendor/whatsapp/campaign/dashboard/{campaignUid}/status` — campaign status

#### 4.2.6 Auth (Mobile)
- `POST /api/user/login-process` — login
- `GET /api/user/prepare-sign-up` — registration data
- `POST /api/user/process-sign-up` — register
- `POST /api/user/two-factor-challenge` — 2FA verify
- `POST /api/user/logout` — logout
- `POST /api/media/upload-temp-media/{uploadItem?}` — upload temp media
- `POST /api/user-device/token` — store push notification token

### 4.3 Standard API Response Format

All API responses follow an engine response envelope:
```json
{
  "responseCode": 1,
  "data": {},
  "message": "Success message"
}
```

**Response Codes:**
- `1` — Success
- `2` — Failed
- `18` — Not Found
- `22` — Plan limit reached

---

## 5. Database Specification

### 5.1 Core Tables

#### 5.1.1 `users` (Auth Model)
| Column | Type | Description |
|--------|------|-------------|
| `_id` | bigint PK | Internal ID |
| `_uid` | varchar | UUID for external reference |
| `email` | varchar | Unique email address |
| `password` | varchar | Bcrypt hashed |
| `first_name` | varchar | First name |
| `last_name` | varchar | Last name |
| `username` | varchar | Username |
| `status` | tinyint | 1=active, others=inactive |
| `vendors__id` | bigint FK | Associated vendor |
| `role` | varchar | User role |
| `permissions` | json | Custom permissions JSON |
| `two_factor_secret` | varchar | 2FA secret |
| `two_factor_recovery_codes` | text | Recovery codes |
| `remember_token` | varchar | Session token |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

#### 5.1.2 `vendors`
| Column | Type | Description |
|--------|------|-------------|
| `_id` | bigint PK | |
| `_uid` | varchar | UUID |
| `title` | varchar | Vendor/business name |
| `email` | varchar | Vendor email |
| `status` | tinyint | Active/inactive |
| `__data` | json | Extended data blob |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

#### 5.1.3 `vendor_settings`
| Column | Type | Description |
|--------|------|-------------|
| `_id` | bigint PK | |
| `vendors__id` | bigint FK | Vendor owner |
| `key_name` | varchar | Setting key |
| `value` | text | Setting value |
| `data_type` | tinyint | 1=string, 2=bool, 3=int, 4=json |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

#### 5.1.4 `contacts`
| Column | Type | Description |
|--------|------|-------------|
| `_id` | bigint PK | |
| `_uid` | varchar | UUID |
| `vendors__id` | bigint FK | Vendor owner |
| `wa_id` | varchar | WhatsApp phone number (with country code) |
| `first_name` | varchar | |
| `last_name` | varchar | |
| `email` | varchar | |
| `countries__id` | bigint FK | Country |
| `messaged_at` | datetime | Last message time |
| `unread_messages_count` | int | Unread message counter |
| `disable_ai_bot` | tinyint | 0=bot enabled, 1=bot disabled per contact |
| `assigned_users__id` | bigint FK | Assigned team member |
| `__data` | json | Extended data blob |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

**`contacts.__data` sub-fields:**
- `contact_notes`: string — free-form notes
- `contact_metadata`: array — custom metadata
- `is_blocked`: boolean — blocked status
- `past_ai_summary`: string — AI conversation summary

**Computed/Appended Attributes:**
- `full_name`: `first_name + ' ' + last_name`
- `name_initials`: first letter of first + last name
- `gravatar`: Gravatar URL based on email MD5
- `whatsapp_number`: alias for `wa_id`

#### 5.1.5 `contact_groups`
| Column | Type | Description |
|--------|------|-------------|
| `_id` | bigint PK | |
| `_uid` | varchar | UUID |
| `vendors__id` | bigint FK | Vendor owner |
| `title` | varchar | Group name |
| `description` | text | |
| `status` | tinyint | 1=active, 5=archived |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

#### 5.1.6 `group_contacts`
| Column | Type | Description |
|--------|------|-------------|
| `_id` | bigint PK | |
| `contacts__id` | bigint FK | Contact |
| `contact_groups__id` | bigint FK | Group |
| `vendors__id` | bigint FK | Vendor |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

#### 5.1.7 `labels`
| Column | Type | Description |
|--------|------|-------------|
| `_id` | bigint PK | |
| `_uid` | varchar | UUID |
| `vendors__id` | bigint FK | Vendor owner |
| `title` | varchar | Label name |
| `color` | varchar | Hex color code |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

#### 5.1.8 `contact_labels`
| Column | Type | Description |
|--------|------|-------------|
| `_id` | bigint PK | |
| `contacts__id` | bigint FK | Contact |
| `labels__id` | bigint FK | Label |
| `vendors__id` | bigint FK | Vendor |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

#### 5.1.9 `contact_custom_fields`
| Column | Type | Description |
|--------|------|-------------|
| `_id` | bigint PK | |
| `_uid` | varchar | UUID |
| `vendors__id` | bigint FK | Vendor owner |
| `input_name` | varchar | Field identifier |
| `title` | varchar | Display label |
| `type` | varchar | Input type (text, number, date, etc.) |
| `status` | tinyint | 1=active |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

#### 5.1.10 `contact_custom_field_values`
| Column | Type | Description |
|--------|------|-------------|
| `_id` | bigint PK | |
| `contacts__id` | bigint FK | Contact |
| `contact_custom_fields__id` | bigint FK | Field definition |
| `field_value` | text | Stored value |
| `vendors__id` | bigint FK | Vendor |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

#### 5.1.11 `whatsapp_message_logs`
| Column | Type | Description |
|--------|------|-------------|
| `_id` | bigint PK | |
| `_uid` | varchar | UUID |
| `vendors__id` | bigint FK | Vendor |
| `contacts__id` | bigint FK | Contact |
| `wab_phone_number_id` | varchar | WhatsApp phone number ID |
| `whatsapp_message_id` | varchar | Meta WA message ID |
| `campaigns__id` | bigint FK | Campaign (nullable) |
| `contact_wa_id` | varchar | Contact WhatsApp number |
| `status` | varchar | Message status |
| `is_incoming_message` | tinyint | 0=outgoing, 1=incoming |
| `messaged_at` | datetime | Message timestamp |
| `timestamp` | datetime | Webhook timestamp |
| `__data` | json | Extended data blob |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

**`whatsapp_message_logs.__data` sub-fields:**
- `contact_data`: array — snapshot of contact at message time
- `initial_response`: array — Meta API response
- `media_values`: array — media file info
- `template_proforma`: array — template used
- `template_components`: array — template component structure
- `template_component_values`: array — filled template values
- `webhook_responses`: array — all webhook callbacks received, organized by status key
  - `webhook_responses.failed.0.changes.0.value.statuses.0.errors.0.error_data.details` — error message
- `options`: array — send options
- `interaction_message_data`: array — interactive message data
- `other_message_data`: array — other message types
- `system_message_data`: array — system events
- `campaign_type`: string — campaign type identifier
- `preset_message_id`: string — bot reply ID for preset messages
- `send_message_via_marketing_message_api`: boolean — whether sent as marketing API

**Message Statuses:**
- `accepted` — Meta accepted the message
- `sent` — delivered to Meta
- `delivered` — delivered to recipient device
- `read` — recipient opened
- `played` — audio/video played
- `failed` — delivery failed
- `received` — incoming message received

**Appended Attributes:**
- `formatted_message_time`: formatted `messaged_at`
- `formatted_message_ago_time`: human-readable ago (6-level diff)
- `formatted_updated_time`: formatted `updated_at`
- `whatsapp_message_error`: extracted error detail from `webhook_responses`

**Error Extraction Logic:**
1. Try `webhook_responses.failed.0.changes.0.value.statuses.0.errors.0.error_data.details`
2. Try `webhook_responses.incoming.0.changes.0.value.messages.0.errors.0.error_data.details`
3. If status is `delivered/read/played` AND message type is NOT `unsupported` → return empty (not an error)
4. If message type is `unsupported` → append `unsupported.type` to error message

#### 5.1.12 `whatsapp_message_queue`
| Column | Type | Description |
|--------|------|-------------|
| `_id` | bigint PK | |
| `_uid` | varchar | UUID |
| `vendors__id` | bigint FK | Vendor |
| `campaigns__id` | bigint FK | Campaign |
| `contacts__id` | bigint FK | Contact |
| `phone_with_country_code` | varchar | Phone number |
| `status` | int | Queue status code |
| `retries` | int | Retry count |
| `scheduled_at` | datetime | When to send |
| `__data` | json | Extended data blob |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

**Queue Status Codes:**
- `1` — In Queue (Pending)
- `2` — Failed
- `5` — Expired

**`whatsapp_message_queue.__data` sub-fields:**
- `process_response`: array — API response + error message (`process_response.error_message`)
- `contact_data`: array — contact snapshot
- `campaign_data`: array — campaign snapshot
- `expiry_at`: datetime string — when this queue entry expires
- `campaign_type`: string
- `preset_message_id`: string

**Error Display:** `process_response.error_message` with replacement of `"Recipient phone number not in allowed list  Recipient"` → `"Recipient"` for cleaner display

#### 5.1.13 `whatsapp_templates`
| Column | Type | Description |
|--------|------|-------------|
| `_id` | bigint PK | |
| `_uid` | varchar | UUID |
| `vendors__id` | bigint FK | Vendor |
| `name` | varchar | Template name |
| `language` | varchar | Template language code |
| `status` | varchar | `APPROVED`, `PENDING`, `REJECTED`, etc. |
| `category` | varchar | `MARKETING`, `UTILITY`, `AUTHENTICATION` |
| `__data` | json | Full template structure from Meta |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

**`whatsapp_templates.__data` sub-fields:**
- `template.components`: array — full component structure from Meta API

#### 5.1.14 `whatsapp_webhooks`
| Column | Type | Description |
|--------|------|-------------|
| `_id` | bigint PK | |
| `vendors__id` | bigint FK | Vendor |
| `payload` | json | Raw webhook payload from Meta |
| `processed` | tinyint | 0=pending, 1=processed |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

#### 5.1.15 `campaigns`
| Column | Type | Description |
|--------|------|-------------|
| `_id` | bigint PK | |
| `_uid` | varchar | UUID |
| `vendors__id` | bigint FK | Vendor |
| `title` | varchar | Campaign title |
| `template_name` | varchar | WhatsApp template name (nullable for non-template) |
| `template_language` | varchar | Template language |
| `scheduled_at` | datetime | Schedule time (UTC) |
| `timezone` | varchar | User's timezone for display |
| `status` | tinyint | Campaign status code |
| `__data` | json | Extended data blob |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

**Campaign Status Codes:**
- `1` — Active/Scheduled
- `5` — Archived
- `6` — Aborted

**Campaign Execution States (computed, not stored):**

| State | Condition |
|-------|-----------|
| Upcoming | `scheduled_at > now()` |
| Awaiting Execution | `scheduled_at < now()` AND (queue_pending OR queue_processing exist) AND no message_log yet |
| Processing | queue_pending OR queue_processing exist AND (message_log OR queue_failed exist) |
| Executed | No queue_pending AND no queue_processing |
| Aborted | `status == 6` (checked first, overrides all others) |
| NA | No queue_pending AND no message_log |

**`campaigns.__data` sub-fields:**
- `total_contacts`: int — target contact count
- `preset_message_name`: string — for non-template campaigns

**Campaign Delete Rule:** Cannot delete a campaign that has `messageLog` entries (executed campaigns are permanent records)

#### 5.1.16 `bot_replies`
| Column | Type | Description |
|--------|------|-------------|
| `_id` | bigint PK | |
| `_uid` | varchar | UUID |
| `vendors__id` | bigint FK | Vendor |
| `bot_flows__id` | bigint FK | Associated bot flow (nullable) |
| `title` | varchar | Bot reply name |
| `trigger` | varchar | Keyword trigger |
| `reply_type` | varchar | Message type |
| `status` | tinyint | 1=active, others=inactive |
| `__data` | json | Extended data blob |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

**`bot_replies.__data` sub-fields:**
- `interaction_message`: array — interactive buttons/list message
- `media_message`: array — media attachment (image, video, document, audio)
- `template_message`: array — WhatsApp template
- `bot_actions`: array — post-reply automated actions

#### 5.1.17 `bot_flows`
| Column | Type | Description |
|--------|------|-------------|
| `_id` | bigint PK | |
| `_uid` | varchar | UUID |
| `vendors__id` | bigint FK | Vendor |
| `title` | varchar | Flow name |
| `start_trigger` | varchar | Entry point trigger |
| `status` | tinyint | 1=active |
| `__data` | json | Flow builder data |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

**`bot_flows.__data` sub-fields:**
- `flow_builder_data`: array — visual flow graph (nodes + connections)

### 5.2 Subscription Tables

#### 5.2.1 `subscriptions` (Laravel Cashier managed)
Standard Laravel Cashier columns for Stripe subscriptions.

#### 5.2.2 `manual_subscriptions`
| Column | Type | Description |
|--------|------|-------------|
| `_id` | bigint PK | |
| `_uid` | varchar | UUID |
| `vendors__id` | bigint FK | Vendor |
| `plan_id` | varchar | Plan identifier |
| `amount` | decimal | Payment amount |
| `currency` | varchar | Currency code |
| `payment_gateway` | varchar | Gateway name |
| `status` | tinyint | Payment status |
| `is_auto_recurring` | tinyint | Auto-recurring flag |
| `__data` | json | Payment data, gateway response |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

### 5.3 Key Relationships

```
vendors
  ├── users (has many, via vendors__id)
  ├── vendor_settings (has many, via vendors__id)
  ├── contacts (has many)
  │   ├── contact_groups (has many through group_contacts)
  │   ├── labels (has many through contact_labels)
  │   ├── contact_custom_field_values (has many)
  │   ├── whatsapp_message_logs (has many)
  │   ├── last_message (has one → whatsapp_message_logs, latest by messaged_at)
  │   ├── last_incoming_message (has one → whatsapp_message_logs, is_incoming=1)
  │   ├── last_unread_message (has one → whatsapp_message_logs, status='received', is_incoming=1)
  │   └── assigned_user (belongs to → users)
  ├── contact_groups (has many)
  ├── labels (has many)
  ├── contact_custom_fields (has many)
  ├── whatsapp_templates (has many)
  ├── campaigns (has many)
  │   ├── whatsapp_message_logs (has many)
  │   └── whatsapp_message_queue (has many)
  ├── bot_replies (has many)
  │   └── bot_flow (belongs to → bot_flows)
  └── bot_flows (has many)
```

### 5.4 Naming Conventions

- All tables use `_id` as primary key (not standard `id`)
- Foreign keys use `{table}__id` pattern (double underscore)
- UUID stored in `_uid` column
- JSON blob stored in `__data` column (double underscore prefix)
- `__data` sub-fields accessed via `configItem()` and Laravel JSON casting
- Timestamps: `created_at`, `updated_at` (standard Laravel)

---

## 6. Workflow Documentation

### 6.1 WhatsApp Webhook Inbound Flow

```
Meta WhatsApp → POST /whatsapp-webhook/{vendorUid}
  ↓
WhatsAppServiceController::webhook()
  ↓
Webhook verification (GET) OR payload processing (POST)
  ↓ (POST)
Fire Event: WhatsappWebhookReceived
  ↓
Dispatch Job: ProcessMessageWebhookJob
  ↓ (async)
WhatsAppServiceEngine processes:
  1. Find vendor by vendorUid
  2. Store webhook payload in whatsapp_webhooks
  3. Extract message from payload
  4. Identify contact by wa_id
     - If new contact: auto-create contact record
  5. Log message in whatsapp_message_logs
  6. Update contact.messaged_at
  7. Update contact.unread_messages_count
  8. Check if outgoing status update OR incoming message
  9. If incoming: trigger bot reply engine
  10. Broadcast real-time update: VendorChannelBroadcast
```

### 6.2 Campaign Execution Flow

```
Vendor creates campaign → POST /vendor-console/whatsapp/campaign/schedule
  ↓
WhatsAppServiceEngine::scheduleCampaign()
  ↓
Validate: template + groups/labels + scheduled_at + timezone
  ↓
Count target contacts
  ↓
Create campaign record (status=1)
  ↓
Populate whatsapp_message_queue (one entry per target contact)
  ↓
Return success with campaign_uid

CRON runs → GET /run-cron-schedule/{token}
  OR
Dispatch Job: ProcessCampaignMessagesJob
  ↓
For each queued message (status=1, scheduled_at <= now):
  1. Check campaign status != 6 (not aborted)
  2. Check expiry_at not passed → mark expired (status=5) if so
  3. Call Meta WhatsApp Cloud API to send template message
  4. On success: create whatsapp_message_logs entry (status='accepted')
                 update queue entry (status processed/removed)
  5. On failure: update queue entry (status=2, increment retries, store error)
```

### 6.3 Bot Reply Trigger Flow

```
Incoming WhatsApp message received
  ↓
ProcessMessageWebhookJob runs
  ↓
Contact identified
  ↓
Check: contact.disable_ai_bot == 0 (bot enabled)
Check: vendor bot timing restrictions (if enabled)
  ↓
BotReplyEngine / BotFlowEngine:
  1. Check active bot flows (status=1) matching trigger
  2. Check active bot replies (status=1) matching keyword
  3. Execute matching bot:
     - Send configured message (text/media/interactive/template)
     - Execute bot_actions (assign user, add label, etc.)
  4. If AI bot enabled (Flowise or OpenAI):
     - Send message to AI service
     - Relay AI response back to contact
```

### 6.4 Bot Timing Restriction Flow

```
Incoming message → bot trigger check
  ↓
If vendor_settings.enable_bot_timing_restrictions == true:
  ↓
  Get current time in bot_timing_timezone
  Compare to bot_start_timing and bot_end_timing
  ↓
  If outside hours: skip all non-AI bots
  If inside hours: proceed normally
  ↓
If vendor_settings.enable_ai_bot_timing_restrictions == true:
  Apply same time check for AI bot
```

### 6.5 Contact Import Flow

```
Vendor uploads CSV/Excel → POST /vendor-console/contacts/import
  ↓
ContactEngine::importContacts()
  ↓
Parse file, validate columns
  ↓
Store import progress in vendor_settings.contacts_import_process_data (JSON)
  ↓
For each row:
  1. Validate phone number format
  2. Check if contact exists (by wa_id + vendors__id)
  3. Create or update contact
  4. Assign to groups if specified
  5. Set custom field values
  ↓
Update progress data
  ↓
Abort available: POST /vendor-console/contacts/abort-import
  Sets abort flag in contacts_import_process_data
```

### 6.6 Campaign Status Computation

```
CampaignEngine::prepareCampaignData($campaignUid)
  ↓
Fetch campaign with relations: queueMessages, messageLog
  ↓
Compute analytics:
  totalDelivered = messageLog.where(status='delivered').count + totalRead
  totalRead = messageLog.where(status='read').count
  totalFailed = queueFailedCount + messageLog.where(status='failed').count
  totalSent = messageLog.where(status='sent').count
  inQueueCount = queueMessages.where(status=1).count
  acceptedCount = messageLog.where(status='accepted').count
  expiredCount = queueMessages.where(status=5).count
  
  timeTookFromScheduledAt:
    lastMessageCreatedAt = max(messageLog.last().created_at, queueMessages.last().updated_at)
    if lastMessageCreatedAt: campaign.scheduled_at.diffForHumans(lastMessageCreatedAt)
    else: '0 seconds'
  
  Percentages: (count / total_contacts * 100).round(2) + '%'
```

### 6.7 Manual Subscription Payment Flow (PayPal example)

```
Vendor views plans → GET /vendor-console/subscription/
  ↓
Vendor selects plan + gateway
  ↓
POST /vendor-console/subscription/proceed-to-pay
  ↓
ManualSubscriptionEngine creates manual_subscriptions record (status=pending)
  ↓
Redirect to gateway or show payment form
  ↓
For PayPal:
  - Create PayPal order
  - Redirect to PayPal
  - Return: POST /vendor-console/paypal/capture-paypal-order
  - Verify payment
  - Update manual_subscriptions status
  - Activate vendor subscription
  ↓
Redirect to: GET /vendor-console/{txnId}/payment-success
```

### 6.8 SuperAdmin Login-As-Vendor Flow

```
SuperAdmin at /central-console
  ↓
POST /central-console/{vendorUid}/login-as-vendor-admin
  ↓
VendorController::loginAsVendorAdmin()
  ↓
Store original SuperAdmin session
Login as vendor admin user
  ↓
Redirect to /vendor-console
  ↓
Vendor admin can now operate as that vendor
  ↓
POST /vendor-console/users/logout-as-vendor-admin
  ↓
Restore original SuperAdmin session
Redirect to /central-console
```

### 6.9 WhatsApp Embedded Signup Flow

```
Vendor visits settings → WhatsApp Cloud API Setup tab
  ↓
Facebook embedded signup widget displayed
  ↓
Vendor completes OAuth flow on Facebook
  ↓
JavaScript callback fires with WABA + access token
  ↓
POST /vendor-console/embedded-signup-process
  ↓
WhatsAppServiceEngine::embeddedSignUpProcess()
  ↓
Store in vendor_settings:
  - facebook_app_id
  - whatsapp_access_token  
  - whatsapp_business_account_id
  - embedded_setup_done_at (timestamp)
  - whatsapp_onboarding_raw_data (full response JSON)
  ↓
Auto-sync phone numbers from Meta API
Store in vendor_settings.whatsapp_phone_numbers
```

---

## 7. Permission Matrix

### 7.1 Role Definitions

| Role | Description |
|------|-------------|
| SuperAdmin | Platform operator; full system access |
| Vendor Admin | Full access to own vendor tenant |
| Vendor Team Member | Scoped access based on `permissions` JSON |
| API Developer | External API access via vendor API token |
| Mobile App User | Companion app access via app API token |
| Guest/Public | Only public routes |

### 7.2 Route-Level Permissions

| Route Group | Middleware | Accessible By |
|------------|-----------|---------------|
| `/` (landing) | none | Everyone |
| `/console` | `Authenticate` | Any authenticated user |
| `/central-console/*` | `Authenticate` + `CentralAccessCheckpost` | SuperAdmin only |
| `/vendor-console/*` | `Authenticate` + `VendorAccessCheckpost` | Vendor Admin + Team Members |
| `/user-console/*` | `Authenticate` | Any authenticated user |
| `/api/{vendorUid}/*` | `api.vendor.authenticate` | API token holders |
| `/api/vendor/*` (app) | `app_api.vendor.authenticate` | Mobile app users |
| `/stripe/webhook` | none (no CSRF) | Stripe only |
| `/razorpay/...webhook` | none | Razorpay only |
| `/paystack/...webhook` | none | Paystack only |
| `/yoomoney/...webhook` | none | YooMoney only |
| `/whatsapp-webhook/{vendorUid}` | none (no CSRF) | Meta WhatsApp only |
| `/run-cron-schedule/{token?}` | none | Cron job / server |

### 7.3 SuperAdmin Exclusive Capabilities

- Manage all vendors (create, read, update, delete, impersonate)
- Configure system-wide settings
- Manage subscription plans (Stripe plan config)
- Manage manual subscriptions for any vendor
- Cancel/override any vendor subscription
- Manage translations (add/edit/delete languages)
- Manage CMS pages
- Manage media files across all vendors
- Configure licence information
- Install addons
- Run app optimize operations

### 7.4 Vendor Admin Capabilities

All operations within own tenant scope:
- Manage team members (create/edit/delete/impersonate)
- All contact operations
- All campaign operations
- All bot operations (reply + flow + AI)
- All template operations
- Chat with any contact
- Manage vendor settings (WhatsApp setup, AI, webhook)
- Manage own subscription
- Export/import contacts
- Generate campaign reports

### 7.5 Team Member Permission Flags

Permissions stored as JSON in `users.permissions`. Specific flags control access to:
- Sending campaigns
- Viewing/editing contacts
- Chat access
- Bot management
- Report access

*(Exact flag names derivable from `PermissionsGrid` component in web app)*

### 7.6 Plan Limits Enforcement

- `vendorPlanDetails('bot_flows', $currentCount, $vendorId)` checks if vendor has capacity
- Bot flows, contacts, campaigns, etc. are all plan-gated
- If limit reached: engine returns code `22` with plan limit message
- Demo mode: `isDemo()` and `isDemoVendorAccount()` — certain operations disabled

---

## 8. UI/UX Specification

### 8.1 Layout Structure

**Central Console (`/central-console`):**
- Sidebar navigation (left)
- Top header with user menu
- Main content area (datatables, forms)
- Notification area

**Vendor Console (`/vendor-console`):**
- Sidebar navigation (WhatsApp/Campaigns/Bots/Contacts/Settings)
- Chat inbox view (left panel: contact list, right panel: messages)
- Campaign management area
- Settings area

**Landing Page (`/`):**
- Public marketing page
- Contact form at `/contact`
- Terms at `/terms-and-policies`

### 8.2 Key Views

#### 8.2.1 Chat Inbox
- **Left panel:** Scrollable contact list with last message preview, unread badge, assigned user indicator
- **Right panel:** Message thread with timestamps, message bubbles (incoming vs outgoing), media previews
- **Bottom:** Message compose area with send, emoji, media attach, template send
- **Chat sidebar:** Contact info, labels, assigned user, notes, custom fields
- Pagination: `way=prepend` (load older), `way=append` (load newer)
- Real-time updates via WebSocket/Broadcasting

#### 8.2.2 Campaign Creation Form
- Campaign title input
- Campaign type selector: Template / Non-Template (Preset)
- If Template: template selector dropdown → renders template preview
- Template variable inputs (body fields + header fields + button URL fields)
- Target audience: Contact groups multi-select + Labels multi-select
- Schedule: datetime picker with timezone selector
- Preview: live template preview panel
- "Get count" button: shows targeted contact count before scheduling

#### 8.2.3 Campaign Status Dashboard
- Status chip: Upcoming / Awaiting Execution / Processing / Executed / Aborted
- Pie/donut chart data: Delivered %, Read %, Failed %, Sent %, In Queue %, Accepted %, Expired %
- Time elapsed from scheduled_at to last message
- Log tabs: Queue Log / Executed Log / Expired Log
- Download Excel report buttons
- Requeue failed button (if any failed)
- Abort button (if still processing)

#### 8.2.4 Bot Reply Builder
- Bot reply list: title, trigger keyword, type, status, actions (edit/delete/duplicate)
- Create/Edit form:
  - Trigger keyword
  - Reply type selector (text/media/interactive/template)
  - Conditional form panels per type
  - Bot actions panel (assign to user, add label, etc.)

#### 8.2.5 Bot Flow Builder
- Visual node-based editor (`/bot-replies/bot-flows/builder/flow/{id}`)
- Nodes represent steps; connections represent paths
- Flow data saved as JSON: `bot_flows.__data.flow_builder_data`
- Start trigger defines entry condition

### 8.3 Datatable Behavior

All list views use server-side datatables:
- AJAX-loaded from dedicated `-list-data` endpoints
- Search, sort, paginate server-side
- Max results: 500 rows per request (`$maxDataTableResultCount`)
- Bulk selection with checkboxes
- Action columns per row

### 8.4 Demo Mode Behavior

When `isDemo()` returns true AND `isDemoVendorAccount()` returns true:
- Phone numbers masked: `maskForDemo($phone, 'phone', true)`
- Full names masked: `maskForDemo($name, 'fullName', true)`
- Campaign report downloads blocked with 403
- Campaign queue/expired report downloads blocked with 403
- Certain destructive actions disabled

In non-demo mode: `maskString($value)` partially masks sensitive data (phone, email)

### 8.5 Theming

- Light and dark theme support
- Theme change: `GET /change-theme/{themeID}` (no auth required)
- Dark theme assets: separate dark logo, dark favicon stored separately
- Custom CSS per vendor: `GET /custom-styles.css`
- Vendor-specific brand colors injected via CSS variables

### 8.6 Localization

- Language change: `GET /change-language/{localeID}`
- All UI strings via `__tr()` translation function
- Translation management in Central Console
- Per-vendor default language setting
- Server-side JS translations via: `GET /server-compiled.js`

---

## 9. Business Rules Document

### 9.1 Campaign Rules

| Rule | Description |
|------|-------------|
| BR-C01 | Campaigns with executed messages (`messageLog` entries) cannot be deleted |
| BR-C02 | Campaigns can only be archived if they exist |
| BR-C03 | Archive sets `status=5`; unarchive sets `status=1` |
| BR-C04 | Abort sets `status=6` and marks all queued messages as aborted |
| BR-C05 | Campaign execution is one-way; once aborted it cannot resume |
| BR-C06 | Target contacts are counted at scheduling time and stored in `__data.total_contacts` |
| BR-C07 | Campaigns can target by group AND/OR label combination |
| BR-C08 | Scheduled time stored in UTC; display converted per vendor timezone |
| BR-C09 | "Instant" campaign = `scheduled_at == created_at` |
| BR-C10 | Non-template campaigns use preset messages from bot_replies |
| BR-C11 | Failed queue entries can be requeued via requeue endpoint |
| BR-C12 | Expired queue entries cannot be requeued (TTL passed) |

### 9.2 Contact Rules

| Rule | Description |
|------|-------------|
| BR-CON01 | Contacts identified by `wa_id` (WhatsApp phone number with country code) |
| BR-CON02 | Contacts auto-created from first inbound WhatsApp message |
| BR-CON03 | Blocked contacts: `__data.is_blocked = true`; cannot receive messages |
| BR-CON04 | Per-contact AI bot disable: `disable_ai_bot = 1` |
| BR-CON05 | Contact unread count incremented on incoming message receipt |
| BR-CON06 | Contact `messaged_at` updated on every message (in/out) |
| BR-CON07 | Delete all contacts: scoped to vendor; does not affect other vendors |
| BR-CON08 | Contact groups: archived groups not selectable for campaigns |
| BR-CON09 | Import: duplicate detected by `wa_id + vendors__id` |
| BR-CON10 | Custom fields: defined per vendor, values per contact |
| BR-CON11 | Max 500 contacts per datatable page |

### 9.3 Bot Rules

| Rule | Description |
|------|-------------|
| BR-B01 | Bot operates only within configured timing window (if restriction enabled) |
| BR-B02 | AI bot timing restrictions are separate from regular bot timing |
| BR-B03 | Bot disabled per-contact via `contacts.disable_ai_bot = 1` |
| BR-B04 | Bot flows count against plan limits (`vendorPlanDetails('bot_flows', ...)`) |
| BR-B05 | Bot reply duplicate creates exact copy of bot reply record |
| BR-B06 | Bot actions execute after sending the reply message |
| BR-B07 | Flowise bot: requires URL + optional access token |
| BR-B08 | OpenAI bot: requires API key + org ID + model; supports text training data or Assistant ID |
| BR-B09 | OpenAI: `use_existing_chat_history` flag sends previous conversation to GPT |
| BR-B10 | Failed AI response: returns `flowise_failed_message` setting |

### 9.4 Template Rules

| Rule | Description |
|------|-------------|
| BR-T01 | Only `APPROVED` templates can be used for campaigns/outgoing messages |
| BR-T02 | Template sync pulls all templates from Meta WABA and updates local DB |
| BR-T03 | Template variables extracted via regex `/{{\d+}}/` |
| BR-T04 | Body variables: `field_1`, `field_2`, etc. |
| BR-T05 | Header variables: `header_field_1`, `header_field_2`, etc. |
| BR-T06 | Button URL dynamic parameter: `button_0`, `button_1`, etc. |
| BR-T07 | COPY_CODE button has single coupon code parameter |
| BR-T08 | CAROUSEL template type = collection of cards with media + buttons |
| BR-T09 | Template category: MARKETING, UTILITY, AUTHENTICATION |

### 9.5 Subscription Rules

| Rule | Description |
|------|-------------|
| BR-S01 | Stripe subscriptions managed via Laravel Cashier |
| BR-S02 | Manual subscriptions tracked separately in `manual_subscriptions` table |
| BR-S03 | Subscription cancellation = request; access continues until period end |
| BR-S04 | SuperAdmin can cancel any vendor subscription |
| BR-S05 | Plan limits enforced at feature creation time (contacts, bot flows, etc.) |
| BR-S06 | Demo mode: specific features disabled for demo vendor accounts |
| BR-S07 | UPI payment: QR code generated via `generateUpiPaymentUrl()` |
| BR-S08 | Manual payment entries can be auto-recurring |

### 9.6 Multi-Tenancy Rules

| Rule | Description |
|------|-------------|
| BR-MT01 | All queries scoped by `vendors__id` |
| BR-MT02 | Vendor slug must be unique across platform |
| BR-MT03 | Each vendor has independent WhatsApp phone numbers |
| BR-MT04 | Each vendor has independent templates, contacts, campaigns, bots |
| BR-MT05 | SuperAdmin can view/edit any vendor's data |
| BR-MT06 | Vendor admin cannot access other vendors' data |
| BR-MT07 | Session impersonation uses Laravel's `loginUsingId()` pattern |

### 9.7 WhatsApp Webhook Rules

| Rule | Description |
|------|-------------|
| BR-W01 | Webhook path: `/whatsapp-webhook/{vendorUid}` — CSRF exempt |
| BR-W02 | GET request = webhook verification challenge (return `hub.challenge`) |
| BR-W03 | POST request = message/status event payload |
| BR-W04 | Webhook immediately dispatches async job `ProcessMessageWebhookJob` |
| BR-W05 | Status updates: delivered/read/played update existing `whatsapp_message_logs` entry |
| BR-W06 | `is_incoming_message=1` for contact-originated messages |
| BR-W07 | Error details extracted from `webhook_responses.failed.0.changes.0.value.statuses.0.errors.0.error_data.details` |
| BR-W08 | Unsupported message types logged with type appended to error |

---

## 10. Edge Case Catalog

### 10.1 Campaign Edge Cases

| ID | Scenario | Behavior |
|----|----------|---------|
| EC-C01 | Campaign abort while messages still sending | Sets status=6; remaining queued messages are abandoned |
| EC-C02 | Campaign with 0 matching contacts | Scheduled but queue is empty; shows as Executed immediately |
| EC-C03 | Campaign message hits API rate limit | Queue entry status=2 (failed), error stored in process_response |
| EC-C04 | Campaign contact blocked | WhatsApp API rejects; recorded as failed in queue |
| EC-C05 | Campaign scheduled in past | System processes immediately on next cron tick |
| EC-C06 | Campaign expiry_at reached | Queue entry marked status=5 (expired), not retried |
| EC-C07 | Total contacts = 0 in __data | Percentage calculations result in 0% (division by zero guarded as 0) |
| EC-C08 | Campaign report in demo mode | Returns 403 |
| EC-C09 | Non-template campaign with deleted preset | Preset message ID becomes invalid; campaign may fail |
| EC-C10 | Campaign with archived groups | Contacts in archived groups still targeted if they were added before archival |

### 10.2 Contact Edge Cases

| ID | Scenario | Behavior |
|----|----------|---------|
| EC-CON01 | New contact auto-created with only wa_id | `first_name` and `last_name` may be null |
| EC-CON02 | Contact `full_name` computed as `" "` when both names null | Empty string effectively |
| EC-CON03 | `name_initials` with single name | First initial + empty (no last name) |
| EC-CON04 | Gravatar for blank email | MD5 of empty string returns generic Gravatar |
| EC-CON05 | Import with phone not in allowed list | Error recorded per contact |
| EC-CON06 | Duplicate `wa_id` across vendors | Allowed — contacts are vendor-scoped |
| EC-CON07 | Abort import mid-process | Sets abort flag; partially imported contacts remain |
| EC-CON08 | Delete all contacts | Hard delete; message logs still reference deleted contacts__id |
| EC-CON09 | Contact in multiple groups | One `group_contacts` row per group membership |

### 10.3 Bot Edge Cases

| ID | Scenario | Behavior |
|----|----------|---------|
| EC-B01 | Bot outside timing window | Bot does not fire; no message sent |
| EC-B02 | AI bot returns empty response | System sends `flowise_failed_message` setting value |
| EC-B03 | Flowise unreachable | Exception caught; fallback message sent |
| EC-B04 | OpenAI API key expired | Exception; fallback message sent |
| EC-B05 | Multiple bots match same keyword | System uses priority order (flow first, then reply) |
| EC-B06 | Bot reply duplicate | Creates new record with same `__data`; different `_uid` |
| EC-B07 | Bot flow with no start_trigger | Flow never auto-triggered; only accessible via flow preview |
| EC-B08 | Contact with bot disabled | Zero bots fire for that contact |

### 10.4 Message Log Edge Cases

| ID | Scenario | Behavior |
|----|----------|---------|
| EC-ML01 | `delivered/read/played` status for unsupported message type | Error field populated with unsupported type info |
| EC-ML02 | `delivered/read/played` for normal message | `whatsapp_message_error` returns empty string |
| EC-ML03 | Error path missing in `__data` | `Arr::get()` returns null; error field is empty |
| EC-ML04 | Message sent via marketing message API | `send_message_via_marketing_message_api=true` in __data |
| EC-ML05 | Clear chat history | Hard deletes message log entries for that contact |
| EC-ML06 | Phone number error message contains SDK noise | `"Recipient phone number not in allowed list  Recipient"` → cleaned to `"Recipient..."` |

### 10.5 Authentication Edge Cases

| ID | Scenario | Behavior |
|----|----------|---------|
| EC-A01 | Vendor admin logout-as after SuperAdmin impersonation | Returns SuperAdmin to central console |
| EC-A02 | Session expired during impersonation | Returns to login screen |
| EC-A03 | 2FA secret not configured | 2FA challenge skipped |
| EC-A04 | Demo account login-as | Restricted features apply to that impersonated session |

### 10.6 Subscription Edge Cases

| ID | Scenario | Behavior |
|----|----------|---------|
| EC-S01 | Plan limit reached | Operation blocked; engine code 22; message shown to user |
| EC-S02 | Stripe webhook received before subscription record exists | Laravel Cashier handles idempotency |
| EC-S03 | Manual payment verified but gateway fails | Status not updated; admin must manually resolve |
| EC-S04 | YooMoney capture URL visited without valid subscription | Returns error state |
| EC-S05 | PhonePe payment capture race condition | Only first capture succeeds; duplicates rejected |

---

## 11. Integration Specification

### 11.1 Meta WhatsApp Cloud API

**Purpose:** Send and receive WhatsApp messages  
**Library:** Laravel HTTP client (Guzzle)  
**Service class:** `WhatsAppApiService`, `WhatsAppConnectApiService`  

**Configuration (per vendor):**
- `facebook_app_id` — Facebook App ID
- `facebook_app_secret` — App secret for webhook verification
- `whatsapp_access_token` — User access token or system token
- `whatsapp_business_account_id` — WABA ID
- `current_phone_number_id` — Active phone number ID

**Key API calls:**
- Send message: `POST https://graph.facebook.com/v{version}/{phone_number_id}/messages`
- Get templates: `GET https://graph.facebook.com/v{version}/{waba_id}/message_templates`
- Create template: `POST https://graph.facebook.com/v{version}/{waba_id}/message_templates`
- Delete template: `DELETE https://graph.facebook.com/v{version}/{waba_id}/message_templates`
- Get business profile: `GET https://graph.facebook.com/v{version}/{phone_number_id}/whatsapp_business_profile`
- Update business profile: `POST https://graph.facebook.com/v{version}/{phone_number_id}/whatsapp_business_profile`
- Register phone: `POST https://graph.facebook.com/v{version}/{phone_number_id}/register`
- Health status: `GET https://graph.facebook.com/v{version}/{waba_id}`
- Sync phone numbers: `GET https://graph.facebook.com/v{version}/{waba_id}/phone_numbers`

**Webhook Events Received:**
- `messages` — incoming message from contact
- `statuses` — delivery status update (sent/delivered/read/failed)
- `errors` — API errors
- `system` — system events

**Token Expiry Detection:** If API returns 190 error code → set `vendor_settings.whatsapp_access_token_expired = true`

### 11.2 Stripe (via Laravel Cashier)

**Purpose:** Subscription billing  
**Package:** `laravel/cashier`  
**Config:** `config/cashier.php`  

**Integration points:**
- Subscription create/change/cancel/resume via Cashier methods
- Billing portal via Stripe Customer Portal
- Invoice download via Cashier
- Webhook: `POST /stripe/webhook` handled by `StripeWebhookController`

**Subscription plan config:** `config/lw-plans.php`

### 11.3 PayPal

**Purpose:** Manual subscription payment  
**Engine:** `PaypalEngine.php`  
**Flow:** Create order → redirect to PayPal → capture order at return URL

### 11.4 Razorpay

**Purpose:** Manual subscription payment (India)  
**Engine:** `RazorpayEngine.php`  
**Webhook:** `POST /razorpay/order-payment-razorpay-webhook`  
**Flow:** Checkout form → Razorpay SDK → webhook confirms payment

### 11.5 Paystack

**Purpose:** Manual subscription payment (Africa)  
**Engine:** `PaystackEngine.php`  
**Config:** `config/paystack.php`  
**Webhook:** `POST paystack/paystack-webhook-order-payment`  
**Verify URL:** `POST /vendor-console/paystack-verify/{reference}`

### 11.6 YooMoney

**Purpose:** Manual subscription payment (Russia)  
**Engine:** `YoomoneyEngine.php`  
**Webhook:** `POST yoomoney/yoomoney-webhook-order-payment`  
**Flow:** Checkout page → YooMoney payment → capture redirect

### 11.7 PhonePe

**Purpose:** Manual subscription payment (India)  
**Engine:** `PhonePeEngine.php`  
**Capture URL:** `POST /vendor-console/phone-pe/capture-payment`

### 11.8 UPI

**Purpose:** Manual payment via UPI QR code  
**Flow:** Generate QR via `HomeController::generateUpiPaymentUrl()` → display QR → manual verification

### 11.9 OpenAI

**Purpose:** AI chatbot responses  
**Package:** OpenAI PHP client  
**Service:** `OpenAiService.php`  
**Config:** `config/openai.php`  

**Modes:**
- `text` — training data as system prompt; model configured (`gpt-4o-mini` default)
- `assistant` — uses OpenAI Assistant API with `open_ai_assistant_id`

**Settings:**
- `open_ai_access_key` — OpenAI API key (hidden)
- `open_ai_organization_id` — Organization ID (hidden)
- `open_ai_model_key` — Model name (default: `gpt-4o-mini`)
- `open_ai_max_token` — Max tokens per response (default: 300)
- `open_ai_input_training_data` — System prompt / training data (text mode)
- `open_ai_embedded_training_data` — JSON embedded training data
- `open_ai_assistant_id` — OpenAI Assistant ID (assistant mode)
- `use_existing_chat_history` — Include previous messages in context

### 11.10 Flowise AI

**Purpose:** Alternative AI chatbot via Flowise  
**Settings:**
- `flowise_url` — Flowise server URL
- `flowise_access_token` — Optional API token

### 11.11 Laravel Broadcasting

**Purpose:** Real-time chat updates  
**Event:** `VendorChannelBroadcast`  
**Config:** `config/broadcasting.php`  
**Driver:** Pusher (or compatible, e.g., Soketi)

### 11.12 File Storage

**Purpose:** Media file storage  
**Config:** `config/yes-file-storage.php`  
**Drivers:** Local filesystem or AWS S3  
**Media types:** Images, videos, documents, audio  
**Temp upload path:** Used for campaign media and chat media before permanent save

### 11.13 Outbound Vendor Webhook

**Purpose:** Notify vendor's own system of WhatsApp events  
**Settings:**
- `enable_vendor_webhook` — toggle on/off
- `vendor_webhook_endpoint` — HTTPS URL

**Trigger:** On incoming message or status change → HTTP POST to endpoint with event payload

---

## 12. Migration Readiness Report

### 12.1 Data Migration Scope

| Table | Complexity | Notes |
|-------|-----------|-------|
| `vendors` | Low | Simple flat data |
| `users` | Low | Passwords need re-hashing if algorithm differs |
| `vendor_settings` | Medium | JSON fields per-vendor; 40+ setting keys |
| `contacts` | Medium | `__data` JSON blob with nested fields |
| `contact_groups` | Low | Simple |
| `group_contacts` | Low | Junction table |
| `labels` | Low | |
| `contact_labels` | Low | Junction table |
| `contact_custom_fields` | Low | |
| `contact_custom_field_values` | Low | |
| `whatsapp_message_logs` | High | Large table; `__data` has deep JSON nesting; webhook_responses are large |
| `whatsapp_message_queue` | Medium | Transient data; may skip historical queue |
| `whatsapp_templates` | Medium | Full Meta template JSON in `__data` |
| `whatsapp_webhooks` | Low | Historical record; may skip |
| `campaigns` | Medium | `__data.total_contacts` critical |
| `bot_replies` | Medium | `__data` with multiple message type configs |
| `bot_flows` | High | `__data.flow_builder_data` is a graph — proprietary format |
| `subscriptions` | High | Laravel Cashier format; Stripe-specific IDs |
| `manual_subscriptions` | Medium | Payment gateway-specific data |

### 12.2 Hidden Business Logic to Preserve

1. **Campaign status computation** — not stored, computed from counts of related records
2. **Contact auto-creation** — inbound message triggers contact creation
3. **Demo mode masking** — `maskForDemo()` and `maskString()` for PHI
4. **Bot timing restrictions** — time-zone-aware operating hours
5. **AI bot `use_existing_chat_history`** — message history sent to GPT
6. **Template variable extraction** — regex on `{{N}}` patterns
7. **WhatsApp error extraction** — nested JSON path traversal
8. **Queue expiry** — `expiry_at` in `__data`
9. **Campaign delete guard** — must check `messageLog` relationship
10. **Vendor slug uniqueness** — enforced at vendor settings level
11. **Impersonation session state** — original user stored in session during impersonation

### 12.3 Critical Integration Dependencies

| Dependency | Risk | Migration Action |
|-----------|------|-----------------|
| Meta WhatsApp API | High | New `phone_number_id` must be re-configured per vendor |
| Stripe subscriptions | High | Customer IDs + subscription IDs must migrate to Stripe; plan IDs must match |
| OpenAI API keys | Medium | Per-vendor keys stored encrypted in `vendor_settings` |
| Flowise URLs | Low | Per-vendor configuration |
| Redis queue | Medium | In-flight queue messages need draining before migration |
| File storage | Medium | All media files must migrate with same relative paths or URLs updated |

### 12.4 Risk Items

| Risk | Severity | Mitigation |
|------|----------|-----------|
| `bot_flows.__data.flow_builder_data` proprietary format | High | Document exact node schema; rebuild visual editor to match |
| Laravel Cashier Stripe data | High | Use Stripe migration tools; sync subscription state |
| Large `whatsapp_message_logs` table | High | Paginated migration; consider start date cutoff |
| Vendor `webhook_responses` nested JSON | Medium | Ensure new system accepts and stores same structure |
| `hasCentralAccess()` / `hasCentralAccess()` logic | Medium | Replicate role detection logic exactly |

---

## 13. Functional Parity Checklist

### 13.1 Core Features

- [ ] Multi-tenant vendor management
- [ ] SuperAdmin central console
- [ ] Vendor admin console
- [ ] Team member management with permissions
- [ ] Session-based "login as" impersonation (admin → vendor → team member)

### 13.2 Contact Management

- [ ] Contact CRUD (create/read/update/delete)
- [ ] Contact block/unblock
- [ ] Contact AI bot toggle
- [ ] Bulk contact delete
- [ ] Delete all contacts
- [ ] Contact groups (CRUD + archive/unarchive)
- [ ] Contact group bulk archive/unarchive
- [ ] Contact labels/tags (CRUD + assign/unassign)
- [ ] Contact custom fields (CRUD)
- [ ] Custom field values per contact
- [ ] Contact import (CSV/Excel) with abort
- [ ] Contact export
- [ ] Advanced contact filter with persistence
- [ ] Contact assignment to team member
- [ ] Auto-create contact from inbound WhatsApp message
- [ ] Contact gravatar display
- [ ] Contact name initials

### 13.3 WhatsApp Chat

- [ ] Inbox list (all contacts with last message)
- [ ] Real-time new message indicator
- [ ] Unread message count badge
- [ ] Message pagination (prepend older / append newer)
- [ ] Send text messages
- [ ] Send media (image, video, document, audio)
- [ ] Send template messages
- [ ] Send interactive messages (buttons, lists)
- [ ] Assign chat to team member
- [ ] Update contact notes
- [ ] Assign labels from chat
- [ ] Clear chat history
- [ ] Message status indicators (sent/delivered/read/failed)
- [ ] Error message display for failed messages
- [ ] Demo mode data masking in chat

### 13.4 Campaigns

- [ ] Create campaign (template type)
- [ ] Create campaign (non-template / preset message type)
- [ ] Target by contact groups
- [ ] Target by labels
- [ ] Schedule in future with timezone
- [ ] Instant campaign (scheduled_at = created_at)
- [ ] Preview targeted contact count
- [ ] Campaign list with status badges
- [ ] Campaign status dashboard with analytics
- [ ] Queue log view (with status filter)
- [ ] Executed log view (with status filter)
- [ ] Expired log view
- [ ] Campaign archive/unarchive
- [ ] Campaign delete (only if no message log)
- [ ] Campaign abort
- [ ] Requeue failed messages
- [ ] Campaign executed report download (XLSX)
- [ ] Campaign queue log report download (XLSX)
- [ ] Campaign expired log report download (XLSX)
- [ ] Campaign status computation (Upcoming/Processing/Executed/Aborted)
- [ ] Demo mode blocks report downloads

### 13.5 Bot Reply

- [ ] Bot reply CRUD
- [ ] Bot reply duplicate
- [ ] Keyword trigger
- [ ] Reply types: text, media, interactive, template
- [ ] Bot actions (assign user, add label)
- [ ] Bot reply quick reply process
- [ ] Active bot list for contact
- [ ] Bot preview
- [ ] Non-template preset messages for campaigns

### 13.6 Bot Flow

- [ ] Bot flow CRUD
- [ ] Visual flow builder (node-based)
- [ ] Flow data persistence (JSON)
- [ ] Start trigger configuration
- [ ] Plan limit enforcement for bot flows

### 13.7 AI Bots

- [ ] OpenAI GPT integration (text training data mode)
- [ ] OpenAI GPT integration (Assistant mode)
- [ ] Flowise AI integration
- [ ] Per-contact AI bot disable
- [ ] AI bot timing restrictions
- [ ] AI failure fallback message
- [ ] Existing chat history context option (OpenAI)

### 13.8 Templates

- [ ] Template CRUD
- [ ] Template sync from Meta
- [ ] Template delete from Meta
- [ ] Template analytics
- [ ] Enable template analytics toggle
- [ ] Carousel template support
- [ ] Template variable extraction and input
- [ ] Template preview rendering

### 13.9 WhatsApp Account Setup

- [ ] Embedded signup (Facebook OAuth)
- [ ] Manual API key entry
- [ ] Phone number sync
- [ ] Health status check
- [ ] Business profile view/edit
- [ ] Display name view/edit
- [ ] Phone number registration
- [ ] Two-step verification setup
- [ ] Webhook connect/disconnect
- [ ] Account disconnect
- [ ] WhatsApp calling enable/disable
- [ ] Test recipient configuration

### 13.10 Subscriptions

- [ ] Stripe subscription create
- [ ] Stripe plan change
- [ ] Stripe cancel/resume
- [ ] Stripe billing portal
- [ ] Stripe invoice download
- [ ] Stripe webhook handling
- [ ] Manual subscription (PayPal)
- [ ] Manual subscription (Razorpay)
- [ ] Manual subscription (Paystack)
- [ ] Manual subscription (YooMoney)
- [ ] Manual subscription (PhonePe)
- [ ] Manual subscription (UPI QR code)
- [ ] Payment success page
- [ ] Plan limit enforcement per feature

### 13.11 SuperAdmin Features

- [ ] Vendor list/details
- [ ] Add vendor
- [ ] Edit vendor
- [ ] Delete / permanent delete vendor
- [ ] Change vendor password
- [ ] Login as vendor admin
- [ ] Vendor subscription management
- [ ] Manual subscription CRUD
- [ ] Cancel vendor subscription
- [ ] System configuration pages
- [ ] Subscription plan configuration
- [ ] Stripe webhook creation
- [ ] Translation management (add/edit/delete language)
- [ ] Auto-translate support
- [ ] CMS page management
- [ ] Media file management
- [ ] Branding (logo, favicon, dark theme variants)
- [ ] App optimize operations
- [ ] Licence management
- [ ] Addon upload/install
- [ ] Mobile app configuration

### 13.12 System/Public

- [ ] Landing/marketing page
- [ ] Public contact form
- [ ] Terms & policies pages
- [ ] WhatsApp QR code generator
- [ ] Custom CSS per vendor
- [ ] Server-compiled JS with translations
- [ ] Dark/light theme switch
- [ ] Language switch
- [ ] Cron schedule endpoint
- [ ] WhatsApp webhook receiver (CSRF exempt)
- [ ] API token-based external REST API
- [ ] Mobile app companion API
- [ ] Demo mode (data masking + feature restrictions)

---

## 14. QA Regression Checklist

### 14.1 Authentication Tests

- [ ] Login with valid credentials → dashboard redirect
- [ ] Login with invalid password → error message
- [ ] Login with unactivated account → appropriate error
- [ ] 2FA: valid code passes, invalid code fails
- [ ] SuperAdmin login-as vendor admin → vendor console session active
- [ ] SuperAdmin logout-as → returns to SuperAdmin session
- [ ] Vendor admin login-as team member → scoped session
- [ ] Vendor admin logout-as → returns to vendor admin session
- [ ] Language change persists after page reload
- [ ] Theme change persists after page reload
- [ ] Password update → old password no longer works

### 14.2 Contact Management Tests

- [ ] Create contact with all fields → appears in list
- [ ] Create contact with minimum fields (wa_id only) → success
- [ ] Edit contact → changes saved
- [ ] Delete single contact → removed from list, removed from groups
- [ ] Bulk delete → all selected removed
- [ ] Delete all → entire contact list empty
- [ ] Block contact → `is_blocked=true` in `__data`
- [ ] Unblock contact → `is_blocked=false`
- [ ] Toggle AI bot → `disable_ai_bot` toggles 0/1
- [ ] Assign contact to group → appears in group filter
- [ ] Remove contact from group → no longer in group
- [ ] Create label → appears in label list
- [ ] Assign label to contact → label badge visible
- [ ] Unassign label → badge removed
- [ ] Delete label → removed from all contacts
- [ ] Create custom field → field appears in contact form
- [ ] Fill custom field value → value saved and displayed
- [ ] Import CSV → contacts created
- [ ] Import with duplicate phone → existing contact updated
- [ ] Import → abort mid-process → partial import persists
- [ ] Export contacts → file downloaded
- [ ] Advanced filter → contacts filtered by criteria
- [ ] Filter persists after page reload (stored in vendor_settings)
- [ ] Contact auto-created on inbound message → visible in inbox

### 14.3 Campaign Tests

- [ ] Create template campaign → appears in list
- [ ] Create non-template campaign → appears in list
- [ ] Schedule in future → status shows "Upcoming"
- [ ] Instant schedule → status shows "Awaiting Execution" then processes
- [ ] Get targeted contact count → correct number returned
- [ ] Campaign processes → messages appear in queue
- [ ] Campaign executes → message log entries created
- [ ] Campaign status: Awaiting → Processing → Executed transitions correctly
- [ ] Campaign archive → status=5, moves to archived list
- [ ] Campaign unarchive → status=1, moves to active list
- [ ] Campaign delete with message log → blocked with error message
- [ ] Campaign delete without message log → deleted
- [ ] Campaign abort → status=6, queue entries abandoned
- [ ] Campaign abort button shows "Aborted" status
- [ ] Requeue failed → failed messages re-enter queue
- [ ] Queue log shows correct status filter
- [ ] Executed log shows all sent/delivered/read/failed
- [ ] Expired log shows only status=5 entries
- [ ] XLSX report download → file contains correct data
- [ ] Report blocked in demo mode → 403 returned
- [ ] Campaign analytics: delivered/read/failed % correct
- [ ] Campaign time elapsed correct
- [ ] Carousel template campaign → sends correctly

### 14.4 Chat/Message Tests

- [ ] Inbox loads with correct contact list sorted by last message
- [ ] Unread count badge shows correct number
- [ ] Selecting contact loads message history
- [ ] Older messages load on scroll up (prepend)
- [ ] Send text message → appears in thread
- [ ] Send media (image) → media displays in thread
- [ ] Send template message → template rendered in thread
- [ ] Message status updates via webhook (sent → delivered → read)
- [ ] Failed message shows error detail
- [ ] Assign chat to team member → indicator shown
- [ ] Update notes → notes visible in sidebar
- [ ] Add label from chat → label badge shown
- [ ] Clear chat history → thread empty
- [ ] Real-time new message arrives without page refresh
- [ ] Inbound message unread count increments
- [ ] Phone numbers masked in demo mode

### 14.5 Bot Tests

- [ ] Create bot reply with text response → fires on keyword match
- [ ] Create bot reply with media → sends correct media type
- [ ] Create bot reply with interactive buttons → sends button message
- [ ] Create bot reply with template → sends template
- [ ] Bot reply duplicate → new identical bot in list
- [ ] Bot timing restriction: message outside hours → no bot fires
- [ ] Bot timing restriction: message inside hours → bot fires
- [ ] Per-contact bot disable → no bot fires for that contact
- [ ] Bot flow created → flow builder accessible
- [ ] Flow builder saves data → `flow_builder_data` updated
- [ ] AI bot (OpenAI) responds to message
- [ ] AI bot (Flowise) responds to message
- [ ] AI bot failure → `flowise_failed_message` sent
- [ ] Bot actions: assign to user after reply
- [ ] Bot actions: add label after reply
- [ ] Quick reply process → bot triggered manually

### 14.6 Template Tests

- [ ] Create template → submitted to Meta, stored locally
- [ ] Sync templates → all APPROVED templates visible
- [ ] Delete template → removed from Meta and local DB
- [ ] Template with HEADER TEXT variable → `header_field_1` input appears
- [ ] Template with BODY variables → `field_1`, `field_2` inputs appear
- [ ] Template with URL button → `button_0` input appears
- [ ] Template with COPY_CODE button → coupon code input appears
- [ ] Carousel template → carousel cards render
- [ ] Template analytics data visible

### 14.7 Subscription Tests

- [ ] View subscription page → current plan displayed
- [ ] Subscribe to plan (Stripe) → subscription active
- [ ] Change plan → new plan active
- [ ] Cancel subscription → status = cancelled, access until period end
- [ ] Resume subscription → re-activates
- [ ] Billing portal opens Stripe portal
- [ ] Invoice download → PDF downloaded
- [ ] Stripe webhook creates subscription entry
- [ ] Manual payment (Razorpay) → payment verified, subscription active
- [ ] Manual payment (PayPal) → order captured, subscription active
- [ ] UPI QR code generated correctly
- [ ] Payment success page shows on completion
- [ ] Plan limit: creating over limit → error message shown (code 22)
- [ ] SuperAdmin manually creates subscription for vendor
- [ ] SuperAdmin cancels vendor subscription

### 14.8 Vendor Settings Tests

- [ ] General settings save → business name updated
- [ ] WhatsApp API setup → credentials stored, webhook connects
- [ ] Embedded signup → WABA linked, phone numbers synced
- [ ] OpenAI bot enabled → AI responds to messages
- [ ] Flowise bot enabled → AI responds via Flowise
- [ ] Bot timing enabled → restriction applies
- [ ] Vendor webhook enabled → events posted to endpoint
- [ ] Sound notification disable → stored in vendor_settings
- [ ] Health status check → Meta API status returned
- [ ] Business profile updated → changes at Meta

### 14.9 SuperAdmin Tests

- [ ] Vendor list loads all vendors
- [ ] Add vendor → appears in list
- [ ] Edit vendor → changes saved
- [ ] Delete vendor (soft) → marked deleted
- [ ] Permanent delete → fully removed
- [ ] Login as vendor → vendor console active
- [ ] Logout as vendor → central console restored
- [ ] Configuration pages all save correctly
- [ ] Translation: add language → new locale available
- [ ] Translation: scan → new keys discovered
- [ ] Translation: export/import → file correct
- [ ] CMS page: create/edit/delete/preview
- [ ] Media files list and delete
- [ ] Logo upload → site logo updated
- [ ] Dark theme logo upload → dark theme logo updated
- [ ] Subscription plans page → plans editable

### 14.10 API Tests

- [ ] External API: invalid token → 401
- [ ] External API: send text message → delivered to contact
- [ ] External API: send template message → correct template used
- [ ] External API: send media message → media delivered
- [ ] External API: send interactive message → buttons rendered
- [ ] External API: create contact → contact created
- [ ] External API: update contact → fields updated
- [ ] External API: list contacts → paginated response
- [ ] External API: get contact by phone → correct contact returned
- [ ] External API: assign groups → contact group updated
- [ ] External API: unassign groups → group removed
- [ ] External API: assign labels → label applied
- [ ] External API: unassign labels → label removed
- [ ] External API: schedule campaign → campaign created + queued
- [ ] External API: get campaign list → paginated list
- [ ] External API: get campaign status → analytics data
- [ ] Mobile API: login → token returned
- [ ] Mobile API: chat load → messages returned
- [ ] Mobile API: send message → message delivered

### 14.11 Webhook Tests

- [ ] GET webhook verification → returns `hub.challenge`
- [ ] POST incoming message → contact auto-created if new
- [ ] POST incoming message → message logged as `received`
- [ ] POST status update (delivered) → existing log entry updated
- [ ] POST status update (read) → log entry status updated
- [ ] POST status update (failed) → error detail extracted
- [ ] Inbound message triggers bot reply
- [ ] Inbound message triggers bot flow
- [ ] Webhook fires vendor outbound webhook if configured

### 14.12 Edge Case / Regression Tests

- [ ] Campaign with 0 contacts → empty queue, shows as Executed
- [ ] Campaign abort mid-send → remaining queue abandoned
- [ ] Message with `unsupported` type → type appended to error field
- [ ] Contact with null first+last name → full_name = " ", initials = ""
- [ ] Gravatar with empty email → generic image URL
- [ ] Demo mode: all masked data verified
- [ ] Demo mode: destructive actions blocked
- [ ] Plan limit reached: operation blocked, code 22 message shown
- [ ] Import abort mid-process → partial data retained
- [ ] Bot outside timing window: zero bot fires
- [ ] AI bot API unreachable: fallback message sent
- [ ] Delete executed campaign → blocked
- [ ] YooMoney checkout with expired subscription UID → error
- [ ] Stripe webhook for non-existent subscription → handled gracefully
- [ ] Real-time message arrives after page load → displayed without refresh

---

*End of WhatsJet SaaS v7.2.0 Legacy System Master Documentation*  
*Generated: 2026-05-17 | Source: Source-7.2.0 codebase analysis*  
*Classification: Enterprise Migration Source of Truth*
