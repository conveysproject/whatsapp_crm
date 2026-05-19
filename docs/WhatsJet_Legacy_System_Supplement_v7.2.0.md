# WhatsJet SaaS v7.2.0 — Legacy System Supplement Documentation

> **Classification:** Enterprise Migration Source of Truth — Part 2 Supplement  
> **Parent Document:** `WhatsJet_Legacy_System_Master_Documentation_v7.2.0.md`  
> **Compiled From:** 6 exhaustive reverse-engineering scan agents  
> **Reverse-Engineered:** 2026-05-17  
> **Coverage:** Zero-loss complete scan of all PHP components, configs, jobs, events, services, middleware, helpers, and infrastructure

---

## Table of Contents

1. [Corrections to Master Document](#1-corrections-to-master-document)
2. [Dashboard Component — Complete Reference](#2-dashboard-component)
3. [Authentication System — Complete Reference](#3-authentication-system)
4. [User & Team Management — Complete Reference](#4-user--team-management)
5. [Media Upload System — Complete Reference](#5-media-upload-system)
6. [Home Controller & CMS Pages](#6-home-controller--cms-pages)
7. [Middleware & Security Layer](#7-middleware--security-layer)
8. [Background Jobs & Queue Processing](#8-background-jobs--queue-processing)
9. [Events & Real-Time Broadcasting](#9-events--real-time-broadcasting)
10. [WhatsApp API Service — Complete Reference](#10-whatsapp-api-service)
11. [WhatsApp Embedded Signup Service](#11-whatsapp-embedded-signup-service)
12. [OpenAI Service — RAG Architecture](#12-openai-service--rag-architecture)
13. [Base Architecture — Engine, Model, Repository](#13-base-architecture)
14. [Configuration Files — Complete Reference](#14-configuration-files)
15. [Composer Dependencies](#15-composer-dependencies)
16. [Infrastructure & Docker](#16-infrastructure--docker)
17. [Addon System](#17-addon-system)
18. [Helper Functions — Complete Reference](#18-helper-functions)
19. [Token Authentication System](#19-token-authentication-system)
20. [QA Supplement — Regression Cases from Deep Scan](#20-qa-supplement)

---

## 1. Corrections to Master Document

The following corrections apply to the Master Documentation based on exhaustive code scan findings:

### 1.1 Message Queue Status Codes

**CORRECTED — 7 states, not 4:**

| Code | Meaning |
|------|---------|
| 1 | In Queue (awaiting processing) |
| 2 | Failed (final failure) |
| 3 | Processing (actively being sent) |
| 4 | Processed (successfully sent) |
| 5 | Expired (passed expiry_at without processing) |
| 6 | Processed but Response Awaited (sent, waiting webhook confirmation) |
| 7 | Aborted (manual abort) |

### 1.2 System Status Codes (Global)

**File:** `config/__tech.php` — applies across all tables using `status` column:

| Code | Meaning |
|------|---------|
| 0 | Inactive |
| 1 | Active |
| 2 | Inactive (alternate) |
| 3 | Blocked |
| 4 | Never Activated (account pending email confirmation) |
| 5 | Soft Deleted / Archived |
| 6 | Suspended / Aborted |
| 7 | On Hold |
| 8 | Completed |
| 9 | Invite |

### 1.3 PhonePe Security Gap

**CONFIRMED:** `PhonePeEngine.php` has **no webhook signature verification**, unlike Razorpay (HMAC SHA256 via `HTTP_X_RAZORPAY_SIGNATURE`) and Paystack (HMAC SHA512 via `HTTP_X_PAYSTACK_SIGNATURE`). This is a known security gap — any party can trigger PhonePe webhook callbacks. QA must flag this for the new system.

### 1.4 Permission Flags — Exact JSON Keys

**File:** `app/Yantrana/Components/User/UserEngine.php::processUserCreate()`

Stored as JSON in `users.__data` column. Exact keys:

```
manage_contacts
delete_contacts
add_edit_contacts
add_edit_delete_archive_group
add_edit_delete_custom_contact_fields
export_contacts
import_contacts
messaging
assigned_chats_only
manage_campaigns
add_edit_templates
delete_templates
hide_contact_emails
```

Permission values are either `'allow'` or `'deny'`. Sub-permissions use format: `permission_key@sub_permission`.

### 1.5 Campaign Message Processing Architecture

**CORRECTED:** Campaign messages are NOT sent directly from CampaignEngine. The pipeline is:

```
ProcessCampaignMessagesJob::handle()
└── WhatsAppServiceEngine::processCampaignSchedule()
    └── Http::pool() (50 concurrent requests)
        └── WhatsAppApiService::sendTemplateMessageViaPool() / sendMediaMessage() / sendInteractiveMessage() / sendMessage()
```

Processes in batches of 50, with 200ms throttle between batches.

### 1.6 Meta Graph API Version

All Meta API calls use **v25.0** (not v20 or v19 as commonly assumed).

Base endpoint: `https://graph.facebook.com/v25.0/`

### 1.7 Framework Version

**CORRECTED:** Laravel **12.0** (not 10.x). PHP requirement `^8.2`. Custom vendor package: `livelyworks/laraware` (private).

---

## 2. Dashboard Component

**Location:** `app/Yantrana/Components/Dashboard/`

### 2.1 Central Admin Dashboard (`prepareDashboardData()`)

Calculates platform-wide statistics for SuperAdmin view at `/central-console`:

| Metric | Source |
|--------|--------|
| Vendor Registrations | `vendorRepository->vendorRegistrationsStats()` |
| New Vendors | `vendorRepository->newVendors()` |
| Total Vendors | `vendorRepository->countIt()` |
| Active Vendors | `vendorRepository->countIt(['status' => 1])` |
| Total Contacts | `contactRepository->countIt()` (all system contacts) |
| Total Campaigns | `campaignRepository->countIt()` (all campaigns across vendors) |
| Messages in Queue | `whatsAppMessageQueueRepository->countIt(['status' => 1])` |
| Total Messages Processed | `whatsAppMessageLogRepository->countIt()` |

### 2.2 Vendor Dashboard (`prepareVendorDashboardData($vendorId)`)

Time period context: Carbon::now()->firstOfMonth() to Carbon::now()->lastOfMonth().

| Metric | Source |
|--------|--------|
| Active Team Members | `userRepository->countVendorsActiveUsers()` with status=1 |
| Total Contacts | `contactRepository->totalContactsCountForVendor($vendorId)` |
| Total Groups | `contactGroupRepository->countIt(['vendors__id' => $vendorId])` |
| Total Campaigns | `campaignRepository->countIt(['vendors__id' => $vendorId])` |
| Total Templates | `whatsAppTemplateRepository->countIt(['vendors__id' => $vendorId])` |
| Total Bot Replies | `botReplyRepository->fetchBotReplyCountForDashboard($vendorId)` |
| Messages in Queue | `whatsAppMessageQueueRepository->countIt(['status' => 1, 'vendors__id' => $vendorId])` |
| Total Messages Processed | `whatsAppMessageLogRepository->countIt(['vendors__id' => $vendorId, 'is_system_message' => null])` — excludes system messages |
| Vendor Config | `vendorEngine->getBasicSettings($vendorId)` |
| WhatsApp Setup Status | Checks `whatsapp_access_token_expired` + `isWhatsAppBusinessAccountReady()` |

### 2.3 Plan Usage Validation (`checkPlanUsages($planDetails, $vendorId)`)

All plan feature limits checked here. Billing cycle dates sourced from `WhatsAppServiceEngine->getCurrentBillingCycleDates()`.

| Feature | Check Method |
|---------|-------------|
| contacts | `contactRepository->countIt()` |
| campaigns | Filtered by billing_cycle start/end `created_at` |
| bot_replies | `botReplyRepository->fetchBotReplyCount()` |
| bot_flows | `botFlowRepository->countIt()` |
| contact_custom_fields | `contactCustomFieldRepository->countIt()` |
| system_users | `userRepository->countIt()` |
| ai_chat_bot | `isAiBotAvailable()` |
| api_access | `getVendorSettings('enable_vendor_webhook')` |

**Plan limit types:**
- `0` = Feature disabled
- `-1` = Unlimited
- `>0` = Specific limit (enforced at creation time)

---

## 3. Authentication System

**Location:** `app/Yantrana/Components/Auth/`

### 3.1 Login Flow

```
POST /auth/login (LoginRequest)
├── Rate limit: 5 attempts per IP (throttle key = email|ip)
├── Email detection: if '@' not in value → try username OR mobile_number lookup
├── Auth::attempt() → Laravel authentication
├── Status check:
│   ├── status=0: logout + redirect (inactive)
│   └── status=4: logout + redirect (not activated)
├── 2FA check:
│   ├── IF two_factor_secret EXISTS AND two_factor_confirmed_at NOT NULL
│   ├── Temporarily logout
│   └── Redirect to auth.two_factor_challenge.view
└── Success redirect: central.console OR vendor.console OR home
```

### 3.2 Registration Flow

```
POST /auth/register (RegisterRequest)
├── Guard: getAppSettings('enable_vendor_registration')
├── Normal mode:
│   ├── Create vendor: title, slug, status=1, type=1
│   ├── Create user: status=1, user_roles__id=2 (vendor admin)
│   └── Send welcome email if 'send_welcome_email' enabled
└── Activation-required mode:
    ├── Create vendor + user with status=4
    ├── Generate signed activation URL (expiry: configItem('account.expiry') hours = 48h)
    └── Send activation email
```

**RegisterRequest validation rules:**

| Field | Rules |
|-------|-------|
| email | required, unique, email, optional indisposable check |
| password | required, confirmed, min:8 |
| username | required, unique, alpha_dash, min:2, max:45 |
| mobile_number | required, min:9, max:15, cannot start with '0' or '+', unique per country code |
| vendor_title | required, min:2, max:100 |
| first_name | required, min:1, max:45 |
| last_name | required, min:1, max:45 |
| terms_and_conditions | accepted (if any terms page enabled) |

### 3.3 Account Activation

```
GET /activate/{userUid} (signed URL, expiry 48h)
├── Verify signed URL
├── Fetch user with status=4 ONLY
├── Set status=1, email_verified_at=now()
└── Send welcome email if enabled
```

### 3.4 Social Login (Google + Facebook)

```
GET /auth/via-{provider}
├── Load OAuth credentials from getAppSettings()
│   ├── google_client_id, google_client_secret
│   └── facebook_client_id, facebook_client_secret
├── Redirect to provider
└── Callback: /auth/via-{provider}/callback
    ├── Check for error='access_denied'
    ├── Get user via Socialite
    ├── IF user exists: Auth::loginUsingId()
    └── IF new user:
        ├── Guard: enable_vendor_registration
        ├── Split full_name: first word=first_name, second=last_name
        ├── Username: uniqid(first_name . '_')
        └── Create vendor + user (status=1)
```

### 3.5 Two-Factor Authentication

**Setup flow:**
1. `prepare2FAQrCode()` — generates SVG QR code (500px, ImageRenderer + SvgImageBackEnd)
2. User scans QR with authenticator app
3. `confirm2FAuthentication()` — verifies code via `user->verifyTwoFactorAuth($code)`, sets `two_factor_confirmed_at=now()`

**Login challenge flow:**
```
POST /auth/two-factor-challenge
├── verify_via: 'code' → user->verifyTwoFactorAuth($code) (min:6)
└── verify_via: 'recovery_code' → user->verifyRecoveryCode($recovery_code)
    └── Success → YesTokenAuth::issueToken() for mobile, session login for web
```

**Recovery codes:** Supported via separate view `/auth/two-factor-recovery`

### 3.6 Password Reset

```
POST /auth/forgot-password
├── Rules: email (required, email)
├── Uses Laravel Password::sendResetLink()
└── Sends ResetPasswordMail notification

POST /auth/reset-password
├── Rules: token (required), email (required, email), password (required, confirmed, min:8)
└── Uses Laravel Password::reset() → Hash::make()
```

**Expiry:** `configItem('account.password_reminder_expiry')` = 48 hours

### 3.7 Password Update (Logged-in)

```
POST /auth/password/update
├── old_password: required, min:6, CurrentPasswordCheckRule
├── password: required, min:6, confirmed, different from old_password
└── password_confirmation: required, min:6
```

### 3.8 Mobile App Authentication

For mobile app requests, `AuthEngine::processLogin()`:
- 2FA disabled: issues token via `YesTokenAuth::issueToken()`
- 2FA enabled: returns `reaction=1` with `two_factor_auth_enabled=true` (app must challenge separately)

---

## 4. User & Team Management

**Location:** `app/Yantrana/Components/User/`

### 4.1 Profile Update Validation

| Field | Rules |
|-------|-------|
| first_name | required, min:3 |
| last_name | required, min:3 |
| mobile_number | required, min:9, max:15, unique per country code and different vendor, cannot start with '0' or '+' |
| email | required, email, unique ignoring current user, optional indisposable check |

Email change → sets `email_verified_at = null`.

### 4.2 Team Member Create Validation

| Field | Rules |
|-------|-------|
| email | required, unique, optional indisposable |
| password | required, min:8 |
| username | required, unique, alpha_dash, min:2, max:45 |
| first_name | required, min:1, max:45 |
| last_name | required, min:1, max:45 |
| mobile_number | required, min_digits:9, max_digits:15, numeric, unique, cannot start with '0' or '+' |

On create:
- `status = 1` (active)
- `user_roles__id = 3` (vendor agent)
- `vendors__id` = current vendor
- All permissions assigned from `getListOfPermissions()` (allow/deny per key)
- **Plan limit check:** validates `system_users` feature limit before creation

### 4.3 Login-As (Masquerade)

```
POST /vendor/user/{userIdOrUid}/login-as
├── Verify user belongs to current vendor
├── Prevent self-login
├── Demo mode check
├── Store session: loggedByVendor = { id: adminId, name: adminName }
├── Auth::loginUsingId(teamMemberId)
└── Redirect to vendor.console or home

GET /vendor/user/logout-as
├── Auth::logout()
├── Restore from session: loggedByVendor
├── Also check loggedBySuperAdmin for nested masquerade
└── Redirect
```

### 4.4 User DataTable Response

Columns returned (masked for non-admin):
- `_id`, `_uid`, `first_name`, `last_name`, `username`
- `email` (masked via `maskString()`), `mobile_number` (masked)
- `status` (code-based display), `user_role`, `created_at` (formatted)

### 4.5 Device Token Storage

Mobile app device tokens stored via `processStoreUserDeviceToken()`:
- Checks for duplicate tokens before insert
- Sets both `users__id` and `vendors__id`

---

## 5. Media Upload System

**Location:** `app/Yantrana/Components/Media/`

### 5.1 Upload Endpoints

| Endpoint | Path Key | Config Update |
|----------|----------|---------------|
| uploadLogo | `logo` | `general.logo_name` |
| uploadDarkThemeLogo | `dark_theme_logo` | `general.dark_theme_logo_name` |
| uploadFavicon | `favicon` | `general.favicon_name` |
| uploadDarkThemeFavicon | `dark_theme_favicon` | `general.dark_theme_favicon_name` |
| uploadSmallLogo | `small_logo` | `general.small_logo_name` |
| uploadDarkThemeSmallLogo | `dark_theme_small_logo` | `general.dark_theme_small_logo_name` |

**Vendor logo upload (`vendorUpload`):**

| Item key | Setting key |
|----------|------------|
| vendor_logo | logo_name |
| vendor_small_logo | small_logo_name |
| vendor_favicon | favicon_name |

Updated via `vendorSettingsEngine->updateBasicSettingsProcess()`.

### 5.2 Media Processing Methods

| Method | Target Path | Resize |
|--------|-------------|--------|
| processUploadProfile | `profile_photo/{_uid}` | 360×360 |
| processUploadCoverPhoto | `cover_photo/{_uid}` | 312×820 |
| whatsappMediaUploadProcess | Per `$requestFor` key under `{_uid}` | No resize |

### 5.3 WhatsApp Media Download & Store (`downloadAndStoreMediaFile`)

**MIME type mapping:**

| Category | Extensions |
|----------|-----------|
| Audio | aac, mp4 (m4a), mpeg (mp3), amr, ogg |
| Video | mp4, 3gp, mpeg |
| Images | jpeg (jpg), png, gif, webp |
| Documents | txt, pdf, ppt, doc, xls, docx, pptx, xlsx |
| Archive | zip |

Downloads from `media_url` or uses body content → stores to temp → moves to permanent storage → sets visibility: public.

### 5.4 Vendor Media Deletion Safety Checks

`deleteVendorMediaFiles($vendorUid)` requires:
1. Vendor folder ≠ base path
2. Valid UUID format: `/^[0-9a-fA-F-]{36}$/`
3. Temp folder ≠ base path

### 5.5 Temp File Cleanup

`deleteAllVendorTempMedia()`:
- Deletes temp files older than 1 day
- Chunk size: 200 files per batch

### 5.6 Media File Listing

`prepareListOfMediaAndFiles($vendorUID, $mediaType)`:
- DataTables pagination with search
- Recursive directory scan (filters hidden files starting with `.`)
- Returns: vendor_uid, vendor_title, media_type, file_name, size_kb, created_at
- Media types extracted from `whatsapp_media/` sub-folders

### 5.7 Storage Configuration

- Default disk: `config('filesystems.default', 'public-media-storage')`
- Abstraction: `YesFileStorage` class
- S3 support: `league/flysystem-aws-s3-v3 ^3.29.0`
- All uploads set visibility to `'public'`

---

## 6. Home Controller & CMS Pages

**Location:** `app/Yantrana/Components/Home/` and `app/Yantrana/Components/Page/`

### 6.1 HomeController Endpoints

| Method | Purpose |
|--------|---------|
| homePageView() | Checks `other_home_page_url` for redirect; loads `current_home_page_view` |
| contactProcess() | Contact form email (reCAPTCHA optional via `verifyRecaptcha()`) |
| generateWhatsAppQR($vendorUid, $phoneNumber) | QR for `https://wa.me/{phoneNumber}` |
| generateUrlQR($upiAddress, $logo) | QR code: 300px, UTF-8, low error correction, 10px margin, black/white |
| generateUpiPaymentUrl($request) | Decodes base64 URL → generates QR |
| customStyles() | Returns CSS file response |
| viewTermsAndPolicies($contentName) | Valid: user_terms, vendor_terms, privacy_policy — 404 otherwise |
| noActivePlan() | Error view for no active subscription |
| pingPong() | Returns reaction code 1 (health check) |
| serverCompiledJs() | Returns JavaScript with translated strings |
| previewPage($pageUid, $title) | CMS page preview (status=1 required) |

### 6.2 Demo Registration (`registerNumberForDemo`)

Validation:
- `demo_phone_numbers`: required, numeric, min 9 digits, comma-separated
- Normalized via `cleanDisplayPhoneNumber()`

Process:
1. Creates/fetches contacts from provided phone numbers
2. Sends demo template message via `whatsAppServiceEngine->sendTemplateMessageProcess()`
3. Stores in session: `__demoAccountTestPhoneNumbers`

### 6.3 Contact Form Validation

| Field | Rules |
|-------|-------|
| email | required, valid email, optional indisposable check |
| full_name | required, min:2, max:100 |
| subject | required, min:2, max:100 |
| message | required, min:5 |

reCAPTCHA verification posts to `https://www.google.com/recaptcha/api/siteverify` with secret key, response token, and remote IP.

### 6.4 PageEngine (CMS)

Page database fields: `_id`, `_uid`, `title`, `slug`, `content` (HTML), `show_in_menu` (bool), `status` (1=active, 0=inactive), `type` (1=static), `created_at`, `updated_at`.

`processPageUpdate()` — field mapping:
- `description` input → `content` DB field
- `show_in_menu`: 1 if 'on', else 0
- `status`: 1 if 'on', else 0
- `type`: always 1 (static)

DataTable search columns: `first_name`, `last_name`, `username`, `email`.

---

## 7. Middleware & Security Layer

**Location:** `app/Http/Middleware/`

### 7.1 Authenticate.php

Applied to all authenticated routes.

**Checks (in order):**
1. User authentication via `Auth::check()`
2. User status check: if `status != 1` → logout + redirect to login (unless `loggedBySuperAdmin` session exists)
3. Demo mode check on POST requests:
   - Routes affected: `auth.password.confirm.process`, `auth.password.update.process`, `user.profile.update`
   - Aborts with message if demo AND (`hasCentralAccess()` OR `isDemoVendorAccount()`)
4. AJAX requests: return JSON response instead of redirect
5. Unauthenticated: return API response with code `21`

### 7.2 VendorAccessCheckpost.php

Applied to all vendor console routes.

**Checks (in order):**
1. Both `vendor.status == 1` AND `user.status == 1` required (unless `loggedBySuperAdmin`)
2. On failure: `Auth::logout()`, session invalidate, redirect to home
3. Permission check: must satisfy `hasVendorAccess()` OR `hasVendorUserAccess()` OR `role_id=1`
4. AJAX: return JSON; else redirect

### 7.3 CentralAccessCheckpost.php

Applied to all central console routes.

**Checks:**
1. `hasCentralAccess()` must return true
2. Demo mode: POST requests disabled for non-admin demo users (return JSON code `22`)
3. Failure: redirect to home

### 7.4 ApiVendorAccessCheckpost.php

Applied to external REST API routes (`/{vendorUid}/`).

**Checks (in order):**
1. Sets `x-requested-with: XMLHttpRequest` header
2. Extracts token from: Bearer header OR `token` request parameter
3. Validates token against `getVendorSettings('vendor_api_access_token', $vendorUid)`
4. Validates vendor exists with `status=1`
5. Fetches vendor admin (first user in vendor with admin role)
6. Validates admin `status=1`
7. Logs in as vendor admin via `Auth::loginUsingId()`
8. Uses `processExternalApiResponse()` for response format

### 7.5 AppApiAuthenticateMiddleware.php

Applied to mobile app API routes (`/api/vendor/`).

**Checks (in order):**
1. Validates addon licensing:
   - Checks `lwAddonWhatsJetChatMobileApp` registration
   - Signature: `sha1(hostname + registration_id + '1.0+')`
2. Verifies JWT token via `YesTokenAuth::verifyToken()`
3. Handles token refresh (auto-reissue near expiry)
4. User status validation:
   - Statuses 2, 3, 4, 5, 6 = inactive/deleted/not activated → reject
5. Only applies to routes other than `'base_data'`

### 7.6 Rate Limiting (LoginRequest)

- 5 login attempts per IP
- Throttle key: `email|ip`
- Lock: throws `ValidationException` with throttle message
- Alternative login: username or mobile_number if no '@' in value

---

## 8. Background Jobs & Queue Processing

**Location:** `app/Jobs/`

### 8.1 ProcessCampaignMessagesJob

```php
class ProcessCampaignMessagesJob implements ShouldQueue {
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function handle() {
        WhatsAppServiceEngine::processCampaignSchedule();
    }
}
```

### 8.2 ProcessMessageWebhookJob

```php
class ProcessMessageWebhookJob implements ShouldQueue {
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function handle() {
        Artisan::call('whatsapp:webhooks:process', ['webhooksCount' => 10]);
    }
}
```

Processes **10 webhooks per job execution**.

### 8.3 Complete Campaign Processing Pipeline (`processCampaignSchedule()`)

**Step 1 — Server Health:**
- `ServerPerformanceMonitorService` checks server health
- Terminates if server in critical state
- Logs cron/queue status in database

**Step 2 — Queue Retrieval:**
- `getQueueItemsForProcess()` fetches pending messages
- Conditional re-fetch if message updated >5 seconds ago (stale-data guard)
- Skips messages already in status=3 (processing)

**Step 3 — Pool Data Assembly:**

For each queued message, assembles:
```
queueUid, retries (default 1), campaignId, campaignData, contactsData,
whatsAppTemplateName, whatsAppTemplateLanguage, phoneNumber,
messageComponents, vendorId, currentPhoneNumberId
```

**Step 4 — HTTP Pool Execution:**
- `Http::pool()` with 50 concurrent requests
- Rate limiting: 200ms sleep after every 50 requests
- Message status → 3 (processing) before sending

**Step 5 — Message Type Dispatch (priority order):**

| Priority | Type | Handler |
|----------|------|---------|
| 1 | Media (image, video, document, audio, sticker) | `sendMediaMessage()` — URL or ID based |
| 2 | Interactive (buttons, lists, CTA URL) | `sendInteractiveMessage()` |
| 3 | Text (plain) | `sendMessage()` — preview URLs enabled |
| 4 | Template (pre-approved) | `sendTemplateMessageViaPool()` |

**Step 6 — Business Scope User IDs:**
- Extracts `business_scope_user_id` from contact data
- Falls back to phone number

**Step 7 — Demo Mode:**
- Prepends `"{ServiceName} DEMO - "` to all outgoing messages

**Step 8 — Error Handling & Retry Logic:**

| Condition | Action | New Status |
|-----------|--------|-----------|
| ConnectException / ConnectionException | Requeue in 1 minute, increment retries | 1 |
| Error code 130429 (rate limit) | Requeue in (retry_count + 5) minutes | 1 |
| Error code 613 (rate limit) | Requeue in (retry_count + 5) minutes | 1 |
| retries > 5 (max exceeded) | Final failure, log error | 2 |
| Other error | Final failure, log error | 2 |

**Step 9 — Success:**
- Extracts `message_id` from response
- Updates `WhatsAppMessageQueueModel` → status 4 (processed)
- Creates record in `WhatsAppMessageLogModel`

### 8.4 Webhook Processing Pipeline

```
Meta WhatsApp Cloud API
└─► POST /vendor/{vendorUid}/whatsapp-webhook
    └─► WhatsappWebhookReceived event dispatched
        └─► ProcessMessageWebhookJob queued
            └─► Artisan::call('whatsapp:webhooks:process', ['webhooksCount' => 10])
                └─► 10 webhook messages processed per invocation
```

---

## 9. Events & Real-Time Broadcasting

**Location:** `app/Events/`

### 9.1 VendorChannelBroadcast

**Implements:** `ShouldBroadcastNow` (synchronous real-time)

**Payload:**
```php
[
    'message' => 'vendor-broadcast',
    'vendorUid' => $vendor_uid,
    'data' => $custom_data_array
]
```

**Broadcast channel:** `private:vendor-channel.{vendorUid}`

**Broadcast event name:** `VendorChannelBroadcast`

**Use cases:** Live dashboard updates, campaign status changes, incoming message notifications.

### 9.2 WhatsappWebhookReceived

**Type:** Dispatchable (async via queue)

**Payload:**
```php
[
    'webhookData' => $webhook_payload_array,
    'vendorUid' => $vendor_uid
]
```

**Listener:** `ProcessMessageWebhookJob` (queued)

**Broadcasting driver:** Pusher (configured via `pusher/pusher-php-server ^7.2`)

---

## 10. WhatsApp API Service

**Location:** `app/Yantrana/Components/WhatsAppService/Services/WhatsAppApiService.php`

**Base URL:** `https://graph.facebook.com/v25.0/`

**Authentication:** Bearer token from `getServiceConfiguration('whatsapp_access_token')`

### 10.1 Template Management

| Method | Meta Endpoint | Notes |
|--------|--------------|-------|
| `getTemplates()` | `{waba_id}/message_templates` | Limit: 500 |
| `getTemplate($id)` | `{waba_id}/message_templates/{id}` | All fields |
| `getTemplateRejectionReason($id)` | — | Fields: rejected_reason, status |
| `deleteTemplate($name, $id)` | `{waba_id}/message_templates` | Method: DELETE |
| `createTemplate()` | `{waba_id}/message_templates` | Categories: MARKETING, TRANSACTIONAL, OTP |
| `updateTemplate()` | `{waba_id}/message_templates/{id}` | Component changes only |
| `getTemplateAnalytics()` | — | Params: start_date, end_date, template_id, product_type, granularity, cursor-paginated |

### 10.2 Message Sending

| Method | Notes |
|--------|-------|
| `sendTemplateMessage()` | Regular + marketing message API; supports business scope user IDs; cleans media links (removes link if ID present) |
| `sendTemplateMessageViaPool()` | Batch processing via HTTP pool |
| `sendMessage()` | Plain text; preview URLs enabled by default; supports reply context (message ID) |
| `sendInteractiveMessage()` | Types: button, list, cta_url; supports header (text/image/video), body, footer; max 3 buttons |
| `sendMediaMessage()` | Types: image, video, audio, document, sticker; URL-based or media ID-based; fields: caption, filename |
| `markAsRead()` | Marks message as read |

**Auto-included in all POST messages:**
```php
'messaging_product' => 'whatsapp'
'recipient_type' => 'individual'
```

### 10.3 Media Management

| Method | Notes |
|--------|-------|
| `uploadMedia()` | cURL multipart upload; returns media ID; error on missing MIME type for URLs |
| `uploadResumableMedia()` | Step 1: create upload session; Step 2: upload with offset; supports binary or multipart |
| `downloadMedia($mediaId)` | Returns metadata + body content |

**Media link cleaning:**
- `cleanMediaLinks()`: removes link if media ID provided; recursive for nested structures; carousel support
- `cleanCarouselMediaLink()`: specialized for carousel template items

### 10.4 Account Management

| Method | Fields Returned |
|--------|----------------|
| `healthStatus()` | health_status |
| `phoneNumbers()` | all phone numbers; clears phone-level webhook configs |
| `businessProfile()` | about, address, description, email, profile_picture_url, websites, vertical |
| `updateBusinessProfile()` | — |
| `displayName()` | verified_name, name_status |
| `newDisplayName()` | new_display_name, name_status |
| `updateDisplayName()` | — |
| `phoneInfo()` | messaging_limit_tier, status, is_on_biz_app, is_pin_enabled, last_onboarded_time |
| `registerPhoneNumber()` | — |
| `requestTwoStepVerificationSet()` | — |
| `getMarketingMessageOnboardingStatus()` | marketing_messages_onboarding_status |
| `processEnableTemplateAnalytics()` | is_enabled_for_insights=true |

### 10.5 Error Handling

Error extraction priority chain from Meta response:
1. `error.error_user_title`
2. `error.message`
3. `error.error_user_msg`
4. `error.error_data.details`

Session expiry detection: "Session has expired" string → sets `whatsapp_access_token_expired` flag in vendor settings.

`ignoreFacebookApiError()` setting: allows partial failures on non-critical sends.

---

## 11. WhatsApp Embedded Signup Service

**Location:** `app/Yantrana/Components/WhatsAppService/Services/WhatsAppConnectApiService.php`

### 11.1 Embedded Signup Flow (`processEmbeddedSignUp()`)

**Step 1 — Token Exchange:**
- Endpoint: `oauth/access_token`
- Parameters: client_id, client_secret, code (from signup request)
- Returns: OAuth access token

**Step 2 — Phone Number Verification:**
- Fetch phone numbers via `getPhoneNumbers($wabaId)`
- Check `platform_type == 'CLOUD_API'`
- Check `is_on_biz_app == true`
- If missing: trigger phone number registration

**Step 3 — Phone Registration (if needed):**
- Endpoint: `{phone_number_id}/register`
- Parameters: `messaging_product: 'whatsapp'`, `pin: '123456'`
- Validates success response

**Step 4 — Webhook Configuration:**
- Endpoint: `{waba_id}/subscribed_apps`
- Parameters: `override_callback_uri`, `verify_token = SHA1(vendor_uid)`
- Webhook URL: `route('vendor.whatsapp_webhook', ['vendorUid' => $vendorUid])`

**Step 5 — Business App Onboarding (alternative path):**
- Fetches phone numbers, uses first
- Requests contact sync: `{phone_number_id}/smb_app_data` with `sync_type: 'smb_app_state_sync'`

**Step 6 — Database Update:**

Saved to vendor settings:
```
embedded_setup_done_at, facebook_app_id, whatsapp_access_token,
whatsapp_business_account_id, current_phone_number_number,
current_phone_number_id, webhook_messages_field_verified_at,
whatsapp_phone_numbers_data, whatsapp_onboarding_raw_data
```

**Step 7 — Client Update:**
- `isSetupInProcess: false`
- Progress message: "completing setup..."

---

## 12. OpenAI Service — RAG Architecture

**Location:** `app/Yantrana/Components/WhatsAppService/Services/OpenAiService.php`

### 12.1 Configuration

| Setting | Source |
|---------|--------|
| Model | `open_ai_model_key` vendor setting |
| API Key | `open_ai_access_key` vendor setting |
| Organization ID | `open_ai_organization_id` vendor setting (optional) |
| Max Tokens | `open_ai_max_token` vendor setting |
| Failure Message | `open_ai_failed_message` vendor setting (default: "Request failed, please try again") |

Temperature: fixed at **0.7**.

### 12.2 Knowledge Base Embedding

`embedLargeData()`:
1. Split data into chunks (max 500 chars)
2. Generate embedding per chunk via model `text-embedding-3-small`
3. Return: chunks array + embeddings array
4. Stored in vendor settings: `open_ai_embedded_training_data`

### 12.3 Answer Generation Methods

**Method A — Single Section:**
1. Find most relevant section via cosine similarity
2. Generate answer via OpenAI completions API

**Method B — Multiple Sections (Text-Based RAG):**
1. Embed user question
2. Find top 3 relevant sections via cosine similarity
3. Combine sections with chat history
4. Generate via `chat.completions()`

**Method C — Multiple Sections (OpenAI Assistants API):**
1. Create thread with messages
2. Run assistant
3. Poll for completion
4. Return assistant response

### 12.4 Cosine Similarity

Formula: `dot_product / (magnitude_A × magnitude_B)`

Used for selecting most relevant knowledge base sections.

### 12.5 Chat History Management

`getExistingChatHistory()`:
- Fetches last **6 messages** (or 30 if no summary exists)
- Generates condensed summary via OpenAI
- Stores summary in `contact.__data.past_ai_summary`
- Returns: [past_summary] + [recent_messages array]

### 12.6 System Prompt Template

```
"You are a helpful assistant [your name is {bot_name}].
Based on the following content:
{combined_sections}
You are talking with {contact.full_name}"
```

**User message format:**
```
"Based on the following content, answer the question in a well-formatted way:
Content: {relevant_sections}
Question: {user_question}"
```

---

## 13. Base Architecture

### 13.1 BaseEngine

**Location:** `app/Yantrana/Base/BaseEngine.php`

**Extends:** `CoreEngine` (from `livelyworks/laraware`)

**`customTableResponse()` response structure:**
```php
[
    'response_token' => request_token,
    'data' => formatted_items[],
    'paginationLinks' => html_links,
    'paginationData' => [
        'currentPage', 'lastPage', 'nextPageURL',
        'hasMorePages', 'remainingItems', 'lastItem',
        'perPage', 'count', 'total'
    ],
    'pageInfo' => ['from', 'to', 'total'],
    '_options' => custom_options
]
```

Supports: custom field formatting, field aliases for sorting.

### 13.2 BaseModel

**Location:** `app/Yantrana/Base/BaseModel.php`

**Extends:** `CoreModel` (from `livelyworks/laraware`)

**Key features:**
- Custom primary key: `_id` (not `id`)
- UUID auto-generation: `isGenerateUID = true` → stored in `_uid`
- Search: `shodh()` (single field), `shodhArray()` (multi-field)
- Default sort: primary key, descending
- Default pagination: 12 items per page (`paginate_count`)

**`customTableOptions()` query scope parameters:**

| Parameter | Purpose |
|-----------|---------|
| `searchQuery` | String or array for multi-field search |
| `sortBy` | Field to sort by |
| `sortOrder` | asc or desc |
| `pageSize` | Items per page |
| `fieldAlias` | Map display field names to DB field names |

### 13.3 Role Hierarchy

| `user_roles__id` | Role |
|-----------------|------|
| 1 | Super Admin (Central Console) |
| 2 | Vendor Admin |
| 3 | Vendor Agent (Team Member) |

---

## 14. Configuration Files

### 14.1 `config/__tech.php` — Complete Reference

**Account expiry settings:**

| Setting | Value |
|---------|-------|
| account.expiry | 48 hours (account activation link) |
| account.password_reminder_expiry | 48 hours (password reset link) |
| account.app_password_reminder_expiry | 2 minutes |
| account.change_email_expiry | 48 hours |
| otp_expiry | 120 minutes |

**Token expiry (`config/yes-token-auth.php`):**

| Setting | Value |
|---------|-------|
| refresh_after | 3000 seconds (50 minutes) |
| expiration | 540000 seconds (~150 hours) |
| refresh_after_for_mobile_app | 604800 seconds (7 days) |
| expiration_for_mobile_app | 864000 seconds (10 days) |
| verify_user_agent | true |
| verify_ip_address | false |

**Social login drivers:**
- `via-facebook` → `facebook`
- `via-google` → `google`

**Bot trigger types with priority:**

| Trigger | Priority |
|---------|---------|
| welcome | 1 (first message from contact) |
| is | 2 (exact match) |
| starts_with | 3 |
| ends_with | 4 |
| contains_word | 5 |
| contains | 6 |

**Contact dynamic field mappings:**
```
dynamic_contact_full_name
dynamic_contact_first_name
dynamic_contact_last_name
dynamic_contact_wa_id
dynamic_contact_language_code
dynamic_contact_country
dynamic_contact_email
```

**Contact custom field input types:** `text`, `number`, `email`, `url`, `date`, `time`, `datetime-local`

**Default logos:**
```
logo_name: logo.svg
small_logo_name: logo-short.svg
favicon_name: favicon.png
dark_theme_logo_name: logo.svg
dark_theme_small_logo_name: logo-short.svg
dark_theme_favicon_name: favicon.png
```

**Pagination:** `paginate_count = 12`

**Subscription methods:** `auto` (Stripe), `manual` (prepaid)

**Payment methods:** `paypal`, `stripe`, `razorpay`

**Theme options:** `system_default`, `dark`, `light`

**Mail drivers:** SMTP, Sparkpost, Mailgun

**Mail encryption:** `ssl`, `tls`, `starttls`

### 14.2 `config/lwSystem.php`

```php
'product_name' => 'lw-whatsjet'
'product_uid'  => 'wa0e2ee6-e08b-491f-b9c0-fff206b774da'
'name'         => 'WhatsJet'
'version'      => '7.2.0'
'app_update_url' => env('APP_UPDATE_URL', 'https://product-central.livelyworks.net')
```

**License key** (from previous scan): `dee257a8c3a2656b7d7fbe9a91dd8c7c41d90dc9`
- Gates: Stripe live keys, embedded signup addon

### 14.3 `config/__currencies.php`

**Zero-decimal currencies (27):**
```
BIF, CLP, DJF, GNF, JPY, KMF, KRW, MGA, PYG, RWF, VND, VUV,
XAF, XOF, XPF, HUF, TWD
```

**Fiat currencies supported (57 total including):**
```
AUD, CAD, EUR, GBP, USD, NZD, CHF, HKD, SGD, SEK, DKK, PLN,
NOK, HUF, CZK, ILS, MXN, BRL, MYR, PHP, TWD, THB, TRY, INR,
NGN (+ 32 more)
```

### 14.4 `config/services.php`

**Translation:** Microsoft Translator API via `MICROSOFT_TRANSLATE_API_KEY` env var

**Slack:** Bot OAuth token + default channel (notifications)

**Email services:** Mailgun, Postmark, AWS SES, Resend

### 14.5 `config/queue.php` — Queue Configuration

**Default connection:** `env('QUEUE_CONNECTION', 'sync')`

**Available drivers:** sync, database, redis, beanstalkd, sqs

**Database queue:**
```php
retry_after: env('DB_QUEUE_RETRY_AFTER', 90)  // 90 seconds
```

**Redis queue:**
```php
retry_after: env('REDIS_QUEUE_RETRY_AFTER', 90)  // 90 seconds
block_for: null
```

**Failed jobs:** `database-uuids` driver, stored in `failed_jobs` table

**Job batching:** `job_batches` table

### 14.6 `config/cashier.php`

- Stripe Cashier v15.7.0
- Cashier model: `VendorModel`
- Webhook tolerance: 300 seconds

### 14.7 `config/lw-plans.php` — Plan Structure

**Free plan limits:**
- Contacts: 2
- Campaigns: 10
- Bot Replies: 10
- Bot Flows: 5
- Custom Fields: 2
- Team Users: 0
- AI Bot: disabled (0)
- API Access: disabled (0)

**Plan limit type encoding:**
- `0` = Feature disabled
- `-1` = Unlimited
- `>0` = Specific limit

### 14.8 `config/__vendor-settings.php` — All Vendor Settings Keys

**Groups:**
- `general` — basic vendor info, logo, timezone
- `bot_timing_settings` — bot response delay
- `ai_bot_settings` — AI bot configuration
- `flowise_ai_bot_setup` — Flowise endpoint, auth
- `open_ai_bot_setup` — model, API key, org ID, max tokens, training data
- `whatsapp_cloud_api_setup` — access token, business account ID, phone numbers
- `language-settings` — translation preferences
- `vendor_webhook` — external webhook URL, API token
- `internals` — embedded_setup_done_at, token expiry flags

### 14.9 `config/__settings.php` — SuperAdmin System Settings

**15 global configuration categories:**
1. General (site name, URL, logos)
2. Payment gateways (Stripe, PayPal, Razorpay, Paystack, YooMoney, PhonePe, UPI/Bank)
3. Pusher real-time (app_id, key, secret, cluster)
4. Social login (Google, Facebook OAuth)
5. Email (driver, SMTP, Mailgun, Sparkpost)
6. reCAPTCHA (site key, secret key)
7. Colors (12 Bootstrap CSS variables for light + dark themes)
8. Misc (demo mode, home page, terms)
9. Translation (Microsoft Translator API)
10. Storage (S3/R2 keys and buckets)
11. AI bot (global enable/disable)
12. License (keys for Stripe live mode)
13. Registration (enable/disable, activation mode)
14. Security (disposable email check)
15. Media (upload limits per file type)

---

## 15. Composer Dependencies

### 15.1 Core Framework

| Package | Version | Purpose |
|---------|---------|---------|
| laravel/framework | ^12.0 | Core Laravel |
| laravel/fortify | ^1.30 | Authentication scaffolding |
| laravel/cashier | ^15.7.0 | Stripe subscriptions |
| laravel/socialite | ^5.21.0 | OAuth (Google, Facebook) |
| laravel/helpers | ^1.7.2 | Collection helpers |
| laravel/tinker | ^2.10.1 | REPL |
| laravel/sail | ^1.43.1 | Docker development |
| livelyworks/laraware | * | Custom Yantrana framework |

### 15.2 AI & Language

| Package | Version | Purpose |
|---------|---------|---------|
| openai-php/laravel | ^0.14.0 | OpenAI API |
| gettext/gettext | ^5.7.3 | Translation framework |
| gettext/php-scanner | ^2.0.1 | Translation scanning |
| unn/gettext-blade | dev-main | Blade `@tr()` directives |
| google/apiclient | ^2.18 | Google APIs |

### 15.3 Data Processing

| Package | Version | Purpose |
|---------|---------|---------|
| box/spout | 3.3.0 | Excel read/write |
| dompdf/dompdf | 3.1.0 | PDF generation |
| endroid/qr-code | ^5.0 | QR code generation |
| intervention/image | ^3.11.3 | Image manipulation (resize) |
| mk-j/php_xlsxwriter | ^0.39.0 | XLSX generation |

### 15.4 Communication & Storage

| Package | Version | Purpose |
|---------|---------|---------|
| guzzlehttp/guzzle | ^7.9 | HTTP client |
| predis/predis | ^3.0 | Redis client |
| pusher/pusher-php-server | ^7.2 | Real-time broadcasting |
| league/flysystem-aws-s3-v3 | ^3.29.0 | AWS S3/Cloudflare R2 |

### 15.5 Payment Gateways

| Package | Version | Purpose |
|---------|---------|---------|
| razorpay/razorpay | ^2.9 | Razorpay payments |
| yoomoney/yookassa-sdk-php | ^3.9 | YooMoney payments |

### 15.6 Validation & Phone

| Package | Version | Purpose |
|---------|---------|---------|
| giggsey/libphonenumber-for-php | ^9.0.8 | Phone number validation/formatting |
| propaganistas/laravel-disposable-email | ^2.4.15 | Disposable email checking |

---

## 16. Infrastructure & Docker

### 16.1 docker-compose.yml Services

| Service | Image | Port | Volume |
|---------|-------|------|--------|
| laravel.test | sail-8.0/app (PHP 8.0) | 80 (APP_PORT) | . → /var/www/html |
| mysql | mysql:8.0 | 3306 (FORWARD_DB_PORT) | sailmysql |
| redis | redis:alpine | 6379 (FORWARD_REDIS_PORT) | sailredis |
| mailhog | mailhog/mailhog:latest | 1025 (SMTP), 8025 (Web UI) | none |

**Network:** All services on `sail` bridge network.

**Note:** This is the legacy system's Docker. The new WBMSG system uses a different compose file with Postgres 16, Redis 7, Meilisearch v1.8, ml-service, and optional Datadog.

### 16.2 App Boot Helper (`app-boot-helper.php`)

`changeAppLocale()` function:
1. Sets `LC_ALL` environment locale
2. Stores chosen locale in `$_SESSION['CURRENT_LOCALE']`
3. Browser detection via `Accept-Language` header
4. RTL detection for right-to-left languages
5. Gettext binding for translations
6. Shares locale direction with all Blade views
7. Sets Carbon locale for date formatting
8. Sets Laravel app locale

After locale change, re-loads configs: `__tech.php`, `__settings.php`, `__vendor-settings.php`, `lw-plans.php`.

### 16.3 Database Seeder

`DatabaseSeeder.php`:
- Creates test user: email `test@example.com`, name `Test User`

### 16.4 Session Initialization

Sessions started in `app-boot-helper.php`.
Current locale stored in `$_SESSION['CURRENT_LOCALE']`.

---

## 17. Addon System

**Location:** `addons/`

**Current state:** Empty directory (addons excluded from version control via `.gitignore`).

### 17.1 Addon Architecture

Each addon is a self-contained package under `addons/{AddonNamespace}/`:
- Config: `addons/{AddonNamespace}/config/metadata.php`
- Assets: `addons/{AddonNamespace}/assets/`
- Views: `addons/{AddonNamespace}/views/`

**Auto-loading:** `AppServiceProvider` scans `addons/` directory at boot and registers each addon's `ServiceProvider`.

### 17.2 AddonBaseController

Provides:
- Asset serving with MIME type detection
- Settings view rendering
- Addon metadata loading
- License activation/deactivation
- License info via `getAddonLicInfo()`
- Signature validation: `sha1(hostname + registration_id + '1.0+')`

### 17.3 Known Add-ons (from middleware)

- `lwAddonWhatsJetChatMobileApp` — Mobile app addon; must be licensed for `/api/vendor/` routes to function

---

## 18. Helper Functions — Complete Reference

**Location:** `app/Yantrana/Support/app-helpers.php`

### 18.1 Authentication Helpers

| Function | Returns |
|----------|---------|
| `getUserAuthInfo($flag)` | Authenticated user + vendor info (47+ data points); reaction codes: 9 (not auth), 10 (auth) |
| `isLoggedIn()` | Boolean |
| `getUserID()` | Logged-in user's `_id` |
| `getUserUID()` | Logged-in user's `_uid` |
| `authUID()` | Authenticated user UID |
| `isMobileAppRequest()` | Detects mobile app JWT auth |

### 18.2 Vendor Helpers

| Function | Returns |
|----------|---------|
| `getVendorId()` | Current vendor `_id` |
| `getVendorUid()` | Current vendor `_uid` |
| `getPublicVendorId()` | Public vendor `_id` |
| `getPublicVendorUid()` | Public vendor `_uid` |
| `getVendorCurrentActiveSubscription($vendorId)` | Active subscription object |

### 18.3 Permission Helpers

| Function | Returns |
|----------|---------|
| `hasVendorAccess($permission)` | Boolean — vendor admin access check |
| `hasVendorUserAccess()` | Boolean — vendor agent access check |
| `hasCentralAccess()` | Boolean — central admin access check |
| `isAiBotAvailable($vendorId)` | Boolean — plan feature check |
| `isWhatsAppBusinessAccountReady($vendorUid)` | Boolean — WhatsApp config check |
| `getListOfPermissions()` | Array of all permission keys |

### 18.4 Settings Helpers

| Function | Notes |
|----------|-------|
| `getVendorSettings($key, $vendorUid)` | Fetches vendor-specific settings |
| `getAppSettings($key)` | Fetches global/system settings |
| `setAppSettings($key, $value)` | Stores global settings |
| `setVendorSettings($key, $value)` | Stores vendor settings |
| `configItem($path, $key)` | Fetches from config arrays |

### 18.5 Utility Helpers

| Function | Notes |
|----------|-------|
| `__isEmpty($value)` | Null/empty check |
| `__tr($string, $replace)` | Translation helper (Gettext-backed) |
| `maskString($value, $type)` | Masks email or phone (for demo/display) |
| `formatDate($date)` | Formats date per tenant timezone |
| `formatDateTime($timestamp)` | Formats datetime |
| `cleanDisplayPhoneNumber($number)` | Strips formatting from phone number |
| `slugIt($slug)` | Creates URL-safe slug |
| `vendorPlanDetails($feature, $usage, $vendorId)` | Checks plan feature limits |
| `getPathByKey($pathKey, $replace)` | Resolves configured storage paths |
| `getMediaUrl($path, $filename)` | Builds media URL |
| `updateClientModels($data)` | Updates client-side Alpine.js `x-data` |

### 18.6 Response Helpers

| Function | Notes |
|----------|-------|
| `__apiResponse($data, $code)` | Standard JSON API response |
| `processExternalApiResponse($data)` | External REST API response format |

### 18.7 WhatsApp Helpers

| Function | Notes |
|----------|-------|
| `isWhatsAppBusinessAccountReady($vendorUid)` | Validates token + WABA setup |
| `maskForDemo($value)` | Masks data for demo mode |
| `maskString($value, $type)` | Masks for display |

---

## 19. Token Authentication System

**Config:** `config/yes-token-auth.php`

**Library:** Custom `YesTokenAuth` (from `livelyworks/laraware`)

### 19.1 Token Lifecycle

| Phase | Duration |
|-------|---------|
| Web token refresh window | 50 minutes (3000s) |
| Web token total expiry | ~150 hours (540000s) |
| Mobile app refresh window | 7 days (604800s) |
| Mobile app total expiry | 10 days (864000s) |

### 19.2 Security Settings

| Setting | Value |
|---------|-------|
| verify_user_agent | true |
| verify_ip_address | false |
| token_registry.enabled | false |

### 19.3 Token Operations

| Function | Notes |
|----------|-------|
| `YesTokenAuth::issueToken($claims)` | Issues JWT with user claims |
| `YesTokenAuth::verifyToken()` | Verifies JWT; handles refresh near expiry |
| `setAccessToken($token)` | Sets token in session/response header |

### 19.4 Mobile App Auth Flow

1. POST to login endpoint
2. If 2FA disabled: `YesTokenAuth::issueToken()` returns JWT immediately
3. If 2FA enabled: response with `two_factor_auth_enabled=true`, app must POST 2FA challenge
4. After 2FA: `YesTokenAuth::issueToken()` with `two_factor_auth_enabled=false`
5. All subsequent requests: `Authorization: Bearer {token}` header
6. Auto-refresh if within `refresh_after` window

---

## 20. QA Supplement — Regression Cases from Deep Scan

### 20.1 Security Test Cases (Critical)

| Test Case | Risk | Notes |
|-----------|------|-------|
| PhonePe webhook accepts any payload | HIGH | No signature verification — must add HMAC check in new system |
| API vendor token in query param | MEDIUM | `?token=xxx` exposes token in server logs; prefer header-only |
| Mobile app addon signature | MEDIUM | `sha1(hostname + reg_id + '1.0+')` — weak, attacker who knows hostname can forge |
| Password confirmed custom rule bypass | LOW | `CurrentPasswordCheckRule` must be tested with empty/null inputs |

### 20.2 Business Logic Test Cases (High Coverage)

| Scenario | Expected Behavior |
|----------|------------------|
| Login with username (no @) | Falls back to username OR mobile_number lookup |
| Login with inactive vendor (status≠1) | Logout + redirect even if user status=1 |
| Campaign send when token expired | Sets `whatsapp_access_token_expired=1`; campaign remains in queue (status 1) |
| Rate limit hit (code 130429) | Requeue in retry_count+5 minutes; increment retry counter |
| 6th retry on campaign message | Mark as failed (status 2); no more requeue |
| Plan contact limit at exact boundary | `vendorPlanDetails()` allows when count < limit; blocks when count >= limit |
| Delete user while logged-as | Must invalidate masquerade session |
| Embedded signup with biz app user | Takes alternate onboarding path (smb_app_state_sync) |
| Campaign create with no WhatsApp setup | Must return error before queuing |
| QR code generation with logo | Logo width capped at 50px; punchout background enabled |
| Media temp cleanup | Only deletes files older than 1 day; chunk=200 |
| Social login email collision | Logs in existing account (not create duplicate) |
| 2FA with recovery code | Valid recovery code clears 2FA and issues token |
| Masquerade nested logout | Restores both loggedByVendor AND loggedBySuperAdmin sessions |
| Bot flow without active reply bot | Flow engine must check bot-enabled flag before triggering |
| Contact import at plan limit | 500-row chunks; stops and errors when contact limit hit |
| Campaign re-campaign from read contacts | Creates group from `type=read` delivery results |

### 20.3 Data Integrity Test Cases

| Scenario | Expected Behavior |
|----------|------------------|
| Vendor folder delete safety | Validates UUID regex before deleting; rejects if path = base path |
| Zero-decimal currency billing | PayPal/Stripe receive amount ×100 ONLY for non-zero-decimal currencies |
| PhonePe amount conversion | Always ×100 (paisa) regardless of currency type |
| Message log excludes system messages | `is_system_message = null` filter; system messages don't count toward stats |
| Campaign message processed count | Uses `whatsapp_message_logs` count (not queue); excludes system messages |
| Bot reply duplicate check | On duplicate bot reply creation, must validate trigger uniqueness |

### 20.4 API Contract Test Cases (External REST API)

| Endpoint | Test |
|----------|------|
| GET /{vendorUid}/* | Token in Bearer header OR `?token=` param |
| All routes | Response format: `processExternalApiResponse()` (different from internal) |
| Contact endpoints | Returns masked email/phone if `hide_contact_emails` permission set |
| Rate limit response | HTTP 429 with retry-after header |

### 20.5 Parity Checklist Additions

The following behaviors from deep scan are additions to the Master Document's Functional Parity Checklist:

- [ ] Login with username or mobile number (no email)
- [ ] 2FA with recovery codes
- [ ] Social login (Google + Facebook) with collision handling
- [ ] Signed URL account activation (48-hour expiry)
- [ ] Demo mode message prefix on all outgoing message types
- [ ] Business scope user ID on template sends
- [ ] HTTP pooling for campaign sends (50 concurrent)
- [ ] 200ms throttle between pool batches
- [ ] Campaign retry: connection error → 1min, rate limit → (n+5)min, >5 → fail
- [ ] OpenAI RAG: embedding, cosine similarity, top-3 section selection
- [ ] Chat history summarization (last 6 or 30 messages → condensed summary)
- [ ] Vendor media UUID format validation before deletion
- [ ] Temp media cleanup (1 day threshold, 200-file chunk)
- [ ] QR code generation for WhatsApp links and UPI addresses
- [ ] Embedded signup via Meta OAuth (7-step flow)
- [ ] Phone-level webhook subscription (override_callback_uri)
- [ ] Webhook verify token = SHA1(vendor_uid)
- [ ] Token registry disabled (stateless JWT)
- [ ] Mobile app token expiry 10 days; web token ~150 hours
- [ ] Addon licensing via sha1 signature
- [ ] Locale RTL detection (Hebrew, Arabic, etc.)
- [ ] Config re-load after locale change
- [ ] PageEngine slug-based CMS with show_in_menu flag
- [ ] `formatDateTime()` respects vendor timezone setting
- [ ] Central dashboard excludes system messages from message count

---

*End of Part 2 Supplement. For complete system documentation, read alongside `WhatsJet_Legacy_System_Master_Documentation_v7.2.0.md`.*
