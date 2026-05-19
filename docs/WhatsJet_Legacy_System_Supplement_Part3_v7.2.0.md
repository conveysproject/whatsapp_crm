# WhatsJet SaaS v7.2.0 — Legacy System Supplement Part 3

> **Classification:** Enterprise Migration Source of Truth — Final Zero-Loss Scan  
> **Parent Documents:** `WhatsJet_Legacy_System_Master_Documentation_v7.2.0.md` + `WhatsJet_Legacy_System_Supplement_v7.2.0.md`  
> **Compiled From:** 4 deep-scan agents covering all previously uncovered files  
> **Reverse-Engineered:** 2026-05-17  
> **Coverage:** Engines, Controllers, Models, Commands, Email Templates, Chat UI, Bot Flow Builder, Config Views, Repositories

---

## Table of Contents

1. [Critical Findings — Security & Architecture](#1-critical-findings)
2. [Permission System — Complete & Corrected Reference](#2-permission-system)
3. [Bot Flow Engine — Complete Reference](#3-bot-flow-engine)
4. [Configuration Engine — Complete Reference](#4-configuration-engine)
5. [Contact Custom Field Engine](#5-contact-custom-field-engine)
6. [Translation Engine — Complete Reference](#6-translation-engine)
7. [Vendor Engine — Complete Reference](#7-vendor-engine)
8. [Vendor Settings Engine — Complete Reference](#8-vendor-settings-engine)
9. [WhatsApp Template Engine — Complete Reference](#9-whatsapp-template-engine)
10. [Artisan Commands & Cron Schedule](#10-artisan-commands--cron-schedule)
11. [Controller API Reference — Complete](#11-controller-api-reference)
12. [Database Models — Complete Schema Reference](#12-database-models)
13. [Email Templates — Complete Reference](#13-email-templates)
14. [Chat Inbox UI — Complete Reference](#14-chat-inbox-ui)
15. [Bot Flow Builder UI — Complete Reference](#15-bot-flow-builder-ui)
16. [Configuration & Settings Views](#16-configuration--settings-views)
17. [Repository Methods — Complete Reference](#17-repository-methods)
18. [Routes — Complete Reference](#18-routes)
19. [QA Supplement — Additional Regression Cases](#19-qa-supplement)

---

## 1. Critical Findings

### 1.1 Anti-Piracy Code in ConfigurationController (nulled-version artifact)

**File:** `app/Yantrana/Components/Configuration/Controllers/ConfigurationController.php`

**Method:** `processAvaidhParvandharakAction()` (lines 249–275)

The method name translates from Hindi/Sanskrit: *Avaidh* = "illegal/invalid", *Parvandharaak* = "license holder". This is **original developer anti-piracy enforcement code** that activates when an invalid license is detected. It attempts to overwrite `WhatsAppServiceEngine.php` with an empty stub class, effectively disabling the WhatsApp service for unlicensed installations.

**Trigger mechanism:** Specific host/hash validation — the method validates a hash derived from the server hostname before executing.

**Relevance to WBMSG:** This code does not exist in our codebase. Documented here solely to explain the legacy system's license enforcement pattern.

**Line 229 — Hardcoded BCrypt hash:** Used to validate product registration removal. Hash: `$2y$10$tzPa1D3qB56/MJAoUr9hlO1Uzcxzt8GCrhm83imLUAT7JBiibrtn6`

### 1.2 PhonePe Webhook Has No Signature Verification

**Confirmed from all scan agents.** `PhonePeEngine.php` processes webhook callbacks without verifying any HMAC or signature. Any party knowing the webhook endpoint URL can trigger payment confirmations. Razorpay uses `HTTP_X_RAZORPAY_SIGNATURE` (HMAC SHA256); Paystack uses `HTTP_X_PAYSTACK_SIGNATURE` (HMAC SHA512). PhonePe has neither.

### 1.3 Non-Template Campaign Messages

`BotReplyRepository` reveals a **fourth campaign type** not in the master doc: `trigger_type = 'NT_CAMPAIGN_MESSAGE'` — non-template (plain text/media/interactive) campaign preset messages. These are managed separately from template campaigns. DataTable source uses a separate method `fetchNonTemplateCampaignMessagePresetsDataTableSource()`.

### 1.4 Webhook Queue Table Name

`WhatsAppWebhookModel` uses table `whatsapp_webhook_queue` (not `whatsapp_webhooks`). Primary key is `_id`. Fillable fields: `headers`, `payload`, `status`, `attempted_at`, `vendors__id`. Casts: `headers` → array, `payload` → json, `attempted_at` → datetime.

### 1.5 SubscriptionModel Uses `id` Not `_id`

**CORRECTION:** `SubscriptionModel` (table: `subscriptions`) overrides primary key to `id` — the only model in the system that does NOT use `_id`. All other models use `_id`.

### 1.6 Mobile App Config Exposes RSA Public Key

`configuration/mobile-app.blade.php` renders Dart constants including `YesSecurity::getPublicRsaKey()`. This is expected (public key by design), but the mobile app configuration page is accessible to any SuperAdmin — masked in demo mode.

### 1.7 Translation View Uses Google Translate API Directly from Browser

`translation/list.blade.php` calls `https://translate.googleapis.com/translate_a/single` directly from the browser JavaScript (no server-side proxy), using the `gtx` client token. This is a public, unofficial endpoint — may break without notice.

---

## 2. Permission System

### 2.1 Complete Permission Keys (from `User/Support/permissions.php`)

**CORRECTION to all prior documents.** The permissions file defines these top-level permission groups and sub-permissions:

| Group Key | Title | Sub-Permissions |
|-----------|-------|----------------|
| `administrative` | Administrative | _(none — binary allow/deny)_ |
| `manage_contacts` | Manage Contacts | `import_contacts`, `export_contacts`, `delete_contacts`, `add_edit_contacts`, `add_edit_delete_custom_contact_fields`, `add_edit_delete_archive_group` |
| `manage_campaigns` | Manage Campaigns | _(none)_ |
| `messaging` | Messaging | _(none)_ |
| `manage_templates` | Manage Templates | `add_edit_templates`, `delete_templates` |
| `assigned_chats_only` | Assigned Chat Only | _(none)_ |
| `hide_contact_phone_numbers` | Hide Contact Phone Numbers | _(none)_ |
| `hide_contact_emails` | Hide Contact Emails | _(none)_ |
| `manage_bot_replies` | Manage Bot Replies and Flows | `add_edit_bot_replies`, `delete_bot_replies`, `add_edit_bot_flows`, `delete_bot_flows`, `manage_bot_flow_builder` |

**Total: 9 top-level permissions, 15 sub-permissions.**

Prior documents were missing: `hide_contact_phone_numbers`, `manage_bot_replies` (with its 5 sub-permissions).

### 2.2 Permission Check Pattern in Controllers

```php
// Require top-level permission
validateVendorAccess('manage_contacts');

// Require sub-permission
validateVendorAccess('manage_templates', 'add_edit_templates');

// Require one of two permissions (either)
// Handled via conditional branching in controller before calling validateVendorAccess
```

### 2.3 Context-Dependent Permissions (BotReplyController)

Bot reply operations use dynamic permission based on `page_type` parameter:

| page_type | Permission Required |
|-----------|-------------------|
| `nt_campaign_preset_message` | `manage_templates` + `add_edit_templates` |
| `bot_flow_builder` | `manage_bot_flow_builder` |
| (default) | `manage_bot_replies` + `add_edit_bot_replies` |

Delete/duplicate follow same pattern with `delete_templates` / `delete_bot_replies`.

---

## 3. Bot Flow Engine

**Class:** `BotFlowEngine extends BaseEngine`

**Dependencies:** BotFlowRepository, BotReplyRepository, UserRepository, LabelRepository

### 3.1 Methods

| Method | Purpose | Response Codes |
|--------|---------|---------------|
| `prepareBotFlowDataTableSource()` | DataTable with _id, _uid, title, start_trigger, status | — |
| `processBotFlowDelete($id)` | Delete flow | 18=not found, 1=success, 2=failed |
| `processBotFlowCreate($data)` | Create with plan limit check | 22=limit exceeded, 1=success, 2=failed |
| `prepareBotFlowUpdateData($id)` | Fetch for edit | 18=not found, 1=success |
| `processBotFlowUpdate($id, $request)` | Update title + start_trigger | 1=success, 14=failed, 18=not found |
| `processBotFlowDataUpdate($request)` | Save visual graph data | 21=reload, 1=success, 14=failed |
| `prepareBotFlowBuilderData($id)` | Load builder data | 18=not found, 1=success |

### 3.2 `processBotFlowUpdate` — Trigger Cascade

When `start_trigger` is changed, all child bot replies are updated:
```
UPDATE bot_replies
SET reply_trigger = new_trigger
WHERE bot_flows__id = botFlow._id
  AND reply_trigger = old_trigger
  AND bot_replies__id IS NULL
```

Validation:
- `title`: unique per vendor (ignores current record)
- `start_trigger`: unique per vendor (ignores current record)

### 3.3 `processBotFlowDataUpdate` — Graph Persistence

Processes `flow_chart_data` with links and operators:
1. Fetches all bot replies for the flow
2. For each link, extracts trigger subject from button text or list item data
3. Updates `bot_replies.reply_trigger` (comma-separated) and `bot_replies__id` (parent bot ID)
4. Resets orphaned bot triggers via `resetBotTriggers()`
5. Stores `__data.flow_builder_data` and `status`

### 3.4 `prepareBotFlowBuilderData` — Returns

- `botFlow` — the flow object
- `flowBots` — all bot replies with `bot_flows__id` = this flow
- `vendorMessagingUsers` — via `getVendorMessagingUsers($vendorId)`
- `allLabels` — all labels for this vendor

---

## 4. Configuration Engine

**Class:** `ConfigurationEngine extends BaseEngine`

**Dependencies:** ConfigurationRepository, MediaEngine, WhatsAppConnectApiService

### 4.1 `prepareConfigurations($pageType)`

Reads from `config('__settings.items.'.$pageType)`. Special handling:

| pageType | Extra Data |
|----------|-----------|
| `general` | Timezone list, translation languages |
| `currency` | Currencies config, currency options |
| `premium-plans` | Combined plan duration data |
| `premium-feature` | Combined feature plans data |
| `email` | Mail drivers, encryption types |
| `user` | Admin display mobile number choice |

### 4.2 `processConfigurationsStore($pageType, $inputData)`

**Validation gates:**
- Stripe test keys: must contain `_test_`
- Stripe live keys: must contain `_live_` (only with extended license key)
- Razorpay + Stripe recurring: mutual exclusion enforced
- Embedded Signup: requires addon, validates webhook via API

Fields with `hide_value` flag are encrypted before storage. Logs: `activityLog('Site configuration settings stored / updated.')`.

### 4.3 `processProductRegistration($inputData)`

- Extracts: registration_id, email, licence_type, supported_until, sold_at
- Signature: `sha1(HTTP_HOST + registration_id + '4.5+')`
- Sets: registered_at = now()

### 4.4 `processProductRegistrationRemoval()`

- cURL POST to: `config('lwSystem.app_update_url') . "/api/app-update/deactivate-license"`
- Sends: registration_id from settings
- Headers: Origin header from `$_SERVER`

### 4.5 `processInstallAddon($request)`

1. Get file from: `storage_path('app/' . getPathByKey('internal_temp') . '/' . $request->get('document_name'))`
2. Open ZIP via `ZipArchive`
3. Validate: `config/metadata.php` present with path depth ≤ 1
4. Include metadata PHP file to get addon array
5. Extract to: `addons/{metadata['identifier']}/`
6. Run: `Artisan::call('optimize:clear')`
7. Delete: `__MACOSX` folder and temp file

Response codes: 2=invalid addon, 21=reload page, 14=failed to install

### 4.6 `processSubscriptionPlans($inputData)`

- Gets `config_plan_id` from input
- Reads existing `getAppSettings('subscription_plans')`
- Gets `getPlans()`, `getConfigPaidPlans()`, `getConfigFreePlan()`
- Uses `arraySetAndGet()` to merge input data
- Stores back as JSON (data_type=4)

---

## 5. Contact Custom Field Engine

**Class:** `ContactCustomFieldEngine extends BaseEngine`

**Dependency:** ContactCustomFieldRepository

| Method | Validation | Plan Check | Response Codes |
|--------|-----------|-----------|---------------|
| `prepareCustomFieldDataTableSource()` | — | — | — |
| `processCustomFieldCreate($data)` | — | `contact_custom_fields` limit | 22=limit, 1=success, 2=failed |
| `processCustomFieldDelete($id)` | — | — | 18=not found, 1=success, 2=failed |
| `prepareCustomFieldUpdateData($id)` | — | — | 18=not found, 1=success |
| `processCustomFieldUpdate($id, $data)` | — | — | 1=success, 14=failed, 18=not found |

Create stores: `input_name`, `input_type`. Update stores same fields.

**Controller validation (ContactCustomFieldController):**
- `input_name`: required, `alpha_dash`, unique per vendor (ignore self on update)
- `input_type`: required

---

## 6. Translation Engine

**Class:** `TranslationEngine extends BaseEngine`

**Dependencies:** ConfigurationRepository, MediaEngine

### 6.1 `scan($languageId)`

Source folders scanned: `app/`, `resources/`, `config/`, + config custom translation folders.

File filter: `/.*php/` regex.

`BladeScanner` functions mapped:
- `__trn` → `ngettext` (plural)
- `__tr` → `gettext`
- `__` → `gettext`

PO file headers set: `Project-Id-Version`, `PO-Revision-Date`, `Last-Translator`, `Language`, `X-Poedit-KeywordsList`

Output: `locale/{languageId}/LC_MESSAGES/messages.{po,mo}`

### 6.2 `microsoftTranslate($languageId, $data)`

- Endpoint: `https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&from=en&to={languageId}`
- Headers: `Ocp-Apim-Subscription-Key`, `Ocp-Apim-Subscription-Region`
- Chunk size: **500 items** (API allows 1000 but system uses 500)
- Sleep between chunks: **15 seconds**
- Returns: `['error_message' => ..., 'translations' => [...]]`

### 6.3 `exportToExcel($languageId)`

Generates XLSX with Google Sheets GOOGLETRANSLATE formula per row:
```
=GOOGLETRANSLATE(A{row}, "en", "{lang_code}")
```

### 6.4 Translation View — Google Translate Integration

The `translation/list.blade.php` view calls Google Translate directly from browser:
```
GET https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl={languageId}&dt=t
```
Response parsed by concatenating multi-dimensional array results.

### 6.5 Language Management

`processStoreLanguage($inputData)`:
- Inputs: `language_id`, `language_name`, `is_rtl` (true/false string)
- Calls `scan()` after store to generate PO files
- Optional: auto-translate via Microsoft if requested

`processDeleteLanguage($languageId)`:
- Removes from config array
- Deletes directory: `base_path('locale/' . $languageId)`

---

## 7. Vendor Engine

**Class:** `VendorEngine extends BaseEngine`

**Dependencies:** AuthRepository, VendorRepository, UserRepository, MediaEngine

### 7.1 Methods

| Method | Key Behavior |
|--------|-------------|
| `prepareVendorDataTableList()` | Joins vendors + users; masks in demo mode |
| `getBasicSettings($vendorUid)` | Returns title, id, uid, slug, status, logo_image, logo_url |
| `pageInfo($pageSlug)` | Allowed slugs: `info_terms_and_conditions`, `info_refund_policy` only |
| `prepareVendorDelete($id)` | Soft delete → status=5 via transaction |
| `processVendorUpdate($data)` | Updates vendor title+status, user first/last/username/email/phone/status |
| `processChangePasswordBySuperAdmin($data)` | Direct hash update (no old password required) |
| `processLoginAsVendorAdmin($vendorUid)` | Sets `loggedBySuperAdmin` session, `Auth::loginUsingId()` |
| `processVendorAdminLogoutAs()` | Logs out, re-logins as saved super admin |
| `prepareVendorPermanentDelete($id)` | Calls `processDisconnectAccount()` first, then delete, then `deleteVendorMediaFiles()` |

### 7.2 Vendor DataTable Columns

Joined `vendors` + `users` (LEFT JOIN via `vendors._uid = users.vendors__id`):

Selected: `vendors._id`, `_uid`, `title`, `created_at`, `status`, `slug`, `users._id` (as userId), `username`, `email`, `status` (as user_status), `mobile_number`, `CONCAT(first_name, last_name)` (as fullName)

Searchable: title, fullName, email, username, slug, mobile_number

---

## 8. Vendor Settings Engine

**Class:** `VendorSettingsEngine extends BaseEngine`

**Dependencies:** VendorSettingsRepository, CountryRepository, VendorRepository, ContactRepository, WhatsAppConnectApiService

### 8.1 `prepareConfigurations($pageType)`

Reads from `config('__vendor-settings.items.' . $pageType)`. Special page handling:

| pageType | Extra Data |
|----------|-----------|
| `general` | Timezone list, countries list, language list |
| `currency` | Currencies config |
| `email` | Mail drivers, encryption types |
| `whatsapp_cloud_api_setup` | Test contact fetched (uid, wa_id columns only) |

### 8.2 `updateProcess($pageType, $inputData)` — Special Field Logic

| Field | Action |
|-------|--------|
| `test_recipient_contact` | Look up or create contact by phone |
| `facebook_app_secret` | Connect webhook via `WhatsAppConnectApiService` |
| `whatsapp_access_token` | Debug token; check required permissions: `whatsapp_business_management`, `whatsapp_business_messaging`, `public_profile`; store in `whatsapp_token_info_data` |
| `whatsapp_business_account_id` | Remove existing webhooks; reconnect; get phone numbers; update `current_phone_number_number`, `current_phone_number_id`, `whatsapp_phone_numbers` |
| `current_phone_number_id` | Look up in stored phone list, update display number |
| `open_ai_input_training_data` | If changed, create OpenAI embeddings via `OpenAiService` |

**Post-update actions:**
- Delete `whatsapp_access_token_expired` if token was set
- Sync templates if business account ID changed
- Refresh health status

### 8.3 `updateBasicSettingsProcess($inputData)`

Field mapping:
- `store_name` → `vendors.title`
- `logo_name` → `vendors.logo_image`
- `favicon_name` → `vendors.favicon`

---

## 9. WhatsApp Template Engine

**Class:** `WhatsAppTemplateEngine extends BaseEngine`

**Dependencies:** WhatsAppTemplateRepository, WhatsAppApiService, WhatsAppServiceEngine

### 9.1 Template Button Types

**Header template buttons:**

| Type | Fields |
|------|--------|
| QUICK_REPLY | text (max 25) |
| PHONE_NUMBER | text (max 25), phone_number (numeric) |
| URL_BUTTON | text (max 25), url (max 2000, url) |
| DYNAMIC_URL_BUTTON | text (max 25), url (max 2000), example (alpha_dash) — appends `{{1}}` to URL |
| VOICE_CALL | text (max 25) |
| COPY_CODE | example (alpha_dash) |

**Carousel card buttons (max 2 per card):**

| Type | Notes |
|------|-------|
| QUICK_REPLY | Max 1 per card |
| URL | example required; appends `{{1}}` |
| PHONE_NUMBER | phone_number required |

### 9.2 Template Categories

`MARKETING`, `UTILITY`, `AUTHENTICATION` (not `TRANSACTIONAL` as in some prior docs — corrected from WhatsAppTemplateController validation).

### 9.3 Template Validation

| Field | Rule |
|-------|------|
| `template_name` | required, max:512, alpha_dash (lowercase a-z, 0-9, underscore only) |
| `language_code` | required, max:15, alpha_dash |
| `category` | required, in:MARKETING,UTILITY,AUTHENTICATION |
| `template_body` | required, max:1024 |
| `template_footer` | nullable, max:60 |
| Header text | max:60 |
| `carousel_templates` | required, array, min:2 (minimum 2 cards) |
| Cards per carousel | max:10 |
| Buttons per card | max:2 |

### 9.4 Template Analytics Preset Durations

| ID | Label | Date Range |
|----|-------|-----------|
| 1 | Current Month | firstOfMonth → today or lastOfMonth |
| 2 | Last Month | previous month |
| 3 | Current Week | start of week → today |
| 4 | Last Week | previous week |
| 5 | Today | today |
| 6 | Yesterday | yesterday |
| 7 | Custom | today (user-overridable) |

Analytics API parameters: `start_date`, `end_date`, `template_id`, `product_type` (CLOUD_API or MARKETING_MESSAGES_LITE_API), `granularity`, cursor-paginated via `after`.

Calculated metrics: sent, delivered, read, replied, clicked, readPercentage, total counts.

### 9.5 `processSyncTemplates()`

1. `getTemplates()` → limit 500
2. For each: build template_name, language, template_id, category, status, `__data.template`
3. `syncTemplates(templatesToAdd)` — deletes templates not in API response, batch-inserts/updates the rest

### 9.6 `processDeleteTemplate($uid)`

1. Fetch template from DB
2. Call `deleteTemplate(template_name, template_id)` on Meta API
3. Call `processSyncTemplates()` to sync

---

## 10. Artisan Commands & Cron Schedule

### 10.1 Commands

#### `whatsapp:webhooks:process {--webhooksCount=100}`

**Class:** `ProcessWhatsAppWebhooks`

Query: `WhatsAppWebhookModel` where `status='pending'` AND (`attempted_at IS NULL` OR `attempted_at < now()-5min`), ordered latest first, limited to `webhooksCount`.

Per webhook logic:
```
IF attempted_at > created_at + 25 minutes:
    DELETE (max age exceeded — ~5 attempts)
ELSE:
    Build Request from webhook payload
    Call WhatsAppServiceEngine->processWebhookRequest($request, $vendors__id)
    DELETE on success
    ON ERROR:
        IF error starts with 'Unsupported': DELETE
        ELSE: UPDATE status='pending', attempted_at=now()
```

#### `whatsapp:campaign:process {--slot=0}`

**Class:** `ProcessWhatsappCampaign`

1. `emptyFlashCache()` — clears flash cache
2. `WhatsAppServiceEngine->processCampaignSchedule()`
3. Return `self::SUCCESS`

#### `vendor-temp-media:delete:process`

**Class:** `ProcessDeleteVendorTempMedia`

1. Check `enable_automatic_delete_vendor_temp_media` setting
2. If disabled: exit
3. `MediaEngine->deleteAllVendorTempMedia()`
4. Log exceptions via `__logDebug()`

#### `whatsapp-message:delete:process`

**Class:** `ProcessDeleteWhatsappMessages`

1. Check `enable_automatic_message_deletion` setting
2. Get `delete_whatsapp_message_days`
3. Calculate `deleteBeforeDate = now() - days`
4. **Loop while affected > 0:**
   - UPDATE `whatsapp_message_logs` SET `__data=null, message=null` WHERE `created_at < deleteBeforeDate AND is_system_message IS NULL AND __data IS NOT NULL` LIMIT 1000
   - `usleep(200000)` — 200ms throttle per batch

### 10.2 Kernel.php Cron Schedule

**Condition:** Only if `enable_queue_jobs_for_campaigns` setting is **disabled** (system uses cron instead of queue workers).

```
IF enable_wa_webhook_process_using_db = true:
    whatsapp:webhooks:process
        frequency: every second (everySecond())
        name: 'process_webhooks_via_cron'
        withoutOverlapping(2)  ← 2-second overlap protection

whatsapp:campaign:process
    frequency: every 5 seconds (everyFiveSeconds())
    name: 'process_messages_via_cron'
    withoutOverlapping(2)  ← 2-second overlap protection
```

**Two scheduling modes:**
- `enable_queue_jobs_for_campaigns = true` → Use Redis/database queue workers (ProcessCampaignMessagesJob + ProcessMessageWebhookJob)
- `enable_queue_jobs_for_campaigns = false` → Use Kernel.php cron (above)

---

## 11. Controller API Reference

### 11.1 BotReplyController — Key Validation

**Interactive button validation (type='button'):**
- `buttons.1`: required, min:1, max:20
- `buttons.2`, `buttons.3`: nullable, min:1, max:20
- All buttons must be unique

**CTA URL validation:**
- `button_display_text`: required, min:1, max:20
- `button_url`: required

**List validation:**
- `list_button_text`: required, min:1, max:20
- `sections`: required, array, min:1, **max:10**
- `sections.*.rows`: required, array, min:1, **max:10**
- `rows.*.row_id`: required, min:1, max:200, alpha_dash, **unique within section**
- `rows.*.title`: required, min:1, max:24
- `rows.*.description`: nullable, max:72

**Bot reply name:** required, unique per vendor, max:200
**reply_trigger:** max:250 (unless trigger_type='welcome')

### 11.2 ContactController — Contact Create/Update

**Phone number rules:**
- required, numeric, min_digits:9, max_digits:20 (create) / not specified on update
- Cannot start with '0' or '+'
- Unique per vendor

**Other fields:**
- `email`: nullable, email
- `language_code`: nullable, alpha_dash

### 11.3 ContactController — Label Management

**Create label:**
- `title`: required, max:45, unique per vendor
- `text_color`: nullable, string, max:10
- `bg_color`: nullable, string, max:10

**Assign contact labels:**
- `contactUid`: required, uuid
- `contact_labels`: nullable, array

### 11.4 WhatsAppServiceController — Business Profile Validation

- `address`: nullable, max:256
- `description`: nullable, max:256
- `about`: nullable, max:139
- `email`: nullable, email, max:128

### 11.5 WhatsAppServiceController — Webhook Verification

```php
// GET request (Meta hub challenge)
IF sha1(vendorUid) === $request->get('hub_verify_token'):
    return $request->get('hub_challenge')
ELSE:
    return 403

// Special case:
IF vendorUid === 'service-whatsapp':
    // Alternative handling path
```

### 11.6 WhatsAppServiceController — API Access Guard

```php
protected function apiAccessAllowedOrAbort($vendorId = null) {
    $planDetails = vendorPlanDetails('api_access', 0, $vendorId);
    abortIf(!$planDetails['is_limit_available'], 401,
        'API access is not available in your plan');
}
```

### 11.7 WhatsAppTemplateController — Template Validation

See Section 9.3 for full validation rules. Key notes:
- Categories: `MARKETING`, `UTILITY`, `AUTHENTICATION` (not TRANSACTIONAL)
- `template_name`: only `a-z`, `0-9`, underscore (enforced via Alpine.js + server)
- Carousel minimum: 2 cards

### 11.8 VendorFrontend Middleware

Applied to vendor-facing frontend routes:

```php
IF vendorPlanDetails(null, null, getPublicVendorId())->hasActivePlan() === false:
    IF ajax: return JSON code 11, message 'No Active Plan'
    ELSE: return view('errors.no-active-plan')
```

### 11.9 VendorController — Manual Vendor Create Validation

- `vendor_title`: required, min:2, max:100
- `username`: required, alpha_dash, min:2, max:45, unique
- `first_name`, `last_name`: required, min:1, max:45
- `mobile_number`: required, min:9, max:15, unique (with country code)
- `email`: required, unique, indisposable (if enabled)
- `password`: required, confirmed, min:8

### 11.10 ConfigurationController — optimizeTable()

```php
DB::statement('OPTIMIZE TABLE whatsapp_message_logs');
```

This is a MySQL-specific maintenance operation that defragments the message log table. WBMSG uses PostgreSQL — this operation does not apply and has no equivalent needed.

### 11.11 StripeWebhookController — Subscribed Events

```
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
customer.updated
customer.deleted
payment_method.automatically_updated
invoice.payment_action_required
invoice.payment_succeeded
```

Both `handleInvoicePaymentSucceeded()` and `customerSubscriptionDeleted()` are empty handlers — all subscription state is managed by Cashier automatically.

---

## 12. Database Models

### 12.1 Primary Key Convention

| Model | Table | PK |
|-------|-------|-----|
| All models except SubscriptionModel | Various | `_id` |
| SubscriptionModel | `subscriptions` | `id` (override) |
| LoginLogModel | `login_logs` | `_id`, `isGenerateUID=false` |
| ConfigurationModel | `configurations` | `_id`, `isGenerateUID=false` |
| ActivityLogModel | `activity_logs` | `_id`, `isGenerateUID=false` |

### 12.2 AuthModel (`users` table)

**Traits:** Authenticatable, Authorizable, CanResetPassword, MustVerifyEmail, HasFactory, Notifiable, TwoFactorAuthenticatable (Fortify)

**Relationships:**
- `role()` → belongsTo(AuthRoleModel) via `user_roles__id`
- `vendor()` → belongsTo(VendorModel) via `vendors__id`
- `vendorUserDetails()` → hasOne(VendorUserModel) via `users__id` (filtered by current vendor)

**Appends:** `full_name` = `first_name . ' ' . last_name`

**Hidden:** `password`, `remember_token`, `two_factor_secret`, `two_factor_recovery_codes`

**2FA methods:**
- `verifyTwoFactorAuth($code)` — Google2FA against encrypted `two_factor_secret`
- `verifyRecoveryCode($code)` — validates and removes from encrypted JSON `two_factor_recovery_codes`

### 12.3 CampaignModel (`campaigns` table)

**Casts:** `scheduled_at` → datetime, `__data` → array

**`__data` JSON fields:**

| Field | Type | Description |
|-------|------|-------------|
| `total_contacts` | integer | Total recipients |
| `is_all_contacts` | boolean | Send to all contacts |
| `is_for_template_language_only` | boolean | Filter by language |
| `selected_groups` | array | Group IDs |
| `expiry_at` | string | Campaign expiry |
| `campaign_type` | string | Type identifier |
| `preset_message_id` | string | Bot reply ID for non-template campaigns |
| `preset_message_name` | string | Bot reply name |
| `send_message_via_marketing_message_api` | boolean | Use marketing API |

**Relationships:**
- `messageLog()` → hasMany(WhatsAppMessageLogModel) via `campaigns__id`
- `queueMessages()` → hasMany(WhatsAppMessageQueueModel) via `campaigns__id`
- `queuePendingMessages()` → filtered hasMany, status=1
- `queueProcessingMessages()` → filtered hasMany, status=3
- `queueFailedMessages()` → filtered hasMany, status=2

### 12.4 ManualSubscriptionModel (`manual_subscriptions` table)

**Casts:** `ends_at` → datetime, `__data` → array

**`__data` JSON fields:** `prepared_plan_details`, `manual_txn_details`, `txn_data`, `auto_recurring_data`, `authenticated`, `activated`, `charged`, `completed`, `cancelled`, `updated`

**Relationship:** `vendor()` → belongsTo(VendorModel)

### 12.5 VendorModel (`vendors` table)

**Casts:** `trial_ends_at` → datetime, `ends_at` → datetime

**Traits:** `Billable` (Laravel Cashier) — VendorModel is the Cashier billable model

### 12.6 VendorUserModel (`vendor_users` table)

**Casts:** `__data` → array

**`__data.permissions`:** JSON object with all permission keys → allow/deny values (this is the actual permission storage, separate from the `users` table)

### 12.7 WhatsAppWebhookModel (`whatsapp_webhook_queue` table)

**Fillable:** `headers`, `payload`, `status`, `attempted_at`, `vendors__id`

**Casts:** `headers` → array, `payload` → json, `attempted_at` → datetime

**Status values:** `'pending'` (not yet processed)

### 12.8 ActivityLogModel (`activity_logs` table)

**Cast:** `activity` → `AsArrayObject`

**JSON fields:** `activity.message` (string), `activity.data` (array)

**Custom behavior:** `setUpdatedAt()` is disabled — activity logs do not track update timestamps.

### 12.9 Complete Table-to-Model Map

| Table | Model |
|-------|-------|
| `users` | AuthModel |
| `user_roles` | AuthRoleModel |
| `login_logs` | LoginLogModel |
| `campaigns` | CampaignModel |
| `campaign_groups` | CampaignGroupModel |
| `configurations` | ConfigurationModel |
| `contact_custom_fields` | ContactCustomFieldModel |
| `contact_custom_field_values` | ContactCustomFieldValueModel |
| `contact_groups` | ContactGroupModel |
| `contact_labels` | ContactLabelModel |
| `contacts` | ContactModel |
| `group_contacts` | GroupContactModel |
| `labels` | LabelModel |
| `pages` | PageModel |
| `manual_subscriptions` | ManualSubscriptionModel |
| `subscriptions` | SubscriptionModel |
| `activity_logs` | ActivityLogModel |
| `user_devices` | UserDeviceModel |
| `vendors` | VendorModel |
| `vendor_settings` | VendorSettingsModel |
| `vendor_users` | VendorUserModel |
| `bot_replies` | BotReplyModel |
| `bot_flows` | BotFlowModel |
| `whatsapp_message_logs` | WhatsAppMessageLogModel |
| `whatsapp_message_queue` | WhatsAppMessageQueueModel |
| `whatsapp_templates` | WhatsAppTemplateModel |
| `whatsapp_webhook_queue` | WhatsAppWebhookModel |

---

## 13. Email Templates

All emails use `emails/index.blade.php` as the master layout (header + content + footer). Button color throughout: `#2BAC32` (green).

### 13.1 Email Template Reference

| Template | Trigger | Key Variables | Has Button |
|----------|---------|--------------|-----------|
| `contact.blade.php` | Contact form submission | `$userName`, `$messageText` | No |
| `manual-subscription-request.blade.php` | Manual subscription request | `$userName`, `$adminName`, `$senderEmail`, `$requested_at`, `$planTitle`, `$planFrequency`, `$planCharges`, `$txnReference`, `$txnDate`, `$subscriptionPageUrl` | Yes — "Manage Request" |
| `activation.blade.php` | Account registration (activation mode) | `$expirationTime` (hours), `$activation_url`, `$fullName`, `$email` | Yes — "Activate Account" |
| `forgot-password-for-app.blade.php` | App OTP password reset | `$expirationTime` (minutes), `$otp` | No — OTP displayed in large green text |
| `new-email-activation.blade.php` | Email change | `$expirationTime` (hours), `$activation_url`, `$newEmail` | Yes — "Activate New Email" |
| `password-reminder.blade.php` | Web password reset | `$expirationTime` (hours, default 48), `$tokenUrl`, `$email` | Yes — "Reset Password" |
| `welcome.blade.php` | Registration complete | `$welcomeEmailContent` (optional), `$fullName`, `$webSiteName` | No |
| `index.blade.php` | Master layout | `getAppSettings('name')` | — |

### 13.2 OTP Password Reset (Mobile App)

`forgot-password-for-app.blade.php` is used for the mobile app flow — sends OTP code instead of a URL link. OTP rendered in 25px green text, expiry via `$expirationTime` minutes (= `configItem('account.app_password_reminder_expiry')` = 2 minutes).

### 13.3 Welcome Email Custom Content

`welcome.blade.php` checks `$welcomeEmailContent` — if set, renders raw custom HTML. If not set, uses default text with `__fullName__` placeholder replaced at send time.

---

## 14. Chat Inbox UI

**File:** `resources/views/whatsapp/chat.blade.php`

### 14.1 Alpine.js State Variables

**`initialMessageData` object:**
- `whatsappMessageLogs` — `[]` messages array
- `messagePaginatePage` — `0` (pagination cursor)
- `contactsPaginatePage` — `0`
- `isDirectMessageDeliveryWindowOpened` — bool (24-hour window check)
- `directMessageDeliveryWindowOpenedTillMessage` — string
- `contact` — `@json($contact)` (current contact object)
- `isContactDetailsUpdated` — bool
- `currentlyAssignedUserUid` — string
- `isAiChatBotEnabled` — string
- `isReplyBotEnable` — string
- `search` — string (search query)
- `search_labels` — string
- `contacts` — `{}` (contacts list object)
- `assignedLabelIds` — `[]`
- `allLabels` — `@json($allLabels)`

**Computed properties:**
- `filteredContacts()` — returns sorted/reversed contacts
- `labelsElement()` — initializes Selectize.js for labels

**Other state:**
- `myAssignedUnreadMessagesCount` / `myUnassignedUnreadMessagesCount`
- `showUnreadContactsOnly` — bool
- `usersUnreadMessagesCounts` — object
- `isContactListOpened` / `isContactCrmBlockOpened` — mobile layout

### 14.2 Form Fields

| Field | Name Attribute | Type | Action |
|-------|---------------|------|--------|
| Contact search | `search` | Text, debounce 500ms | `searchContacts()` |
| Unread filter | `unread_only_contacts` | Switchery checkbox | model: `showUnreadContactsOnly` |
| Label filter | _(radio buttons)_ | Radio, value=label `_id` or empty | Filter contacts |
| Message input | `message_body` | Textarea + EmojiOneArea | POST to `vendor.chat_message.send.process` |
| Contact assign | `assigned_users_uid` | Selectize dropdown | POST to `vendor.chat.assign_user.process` |
| Contact labels | `contact_labels[]` | Multiple Selectize | POST to `vendor.chat.assign_labels.process` |
| Contact notes | `contact_notes` | Textarea | POST to `vendor.chat.update_notes.process` |
| AI bot toggle | `enable_ai_bot` | Hidden ('1' or '') | Toggle AI bot |
| Reply bot toggle | `enable_reply_bot` | Hidden ('1' or '') | Toggle reply bot |
| Media upload | `uploaded_media_file_name`, `media_type`, `contact_uid`, `caption` | File input | POST to `vendor.chat_message_media.send.process` |

**Message submit behavior:**
- `Enter` (without Shift) = submit
- `Shift+Enter` = new line
- Uses EmojiOneArea plugin (`lw-input-emoji` class)

### 14.3 Message Display Logic

| Status | Display |
|--------|---------|
| `read` / `played` | SVG icon (double-tick) |
| `delivered` | SVG icon |
| `sent` | SVG icon |
| `failed` | FontAwesome icon |
| `accepted` | FontAwesome icon |
| System messages | Center-aligned gray box |
| Bot replies | "Bot Reply" badge |
| AI bot replies | "AI Bot Reply" badge |
| Campaign messages | Bullhorn icon |

### 14.4 Pagination Functions

```javascript
window.messagePaginatePage = 1
window.loadEarlierMessages()     // GET with page param
window.loadMoreContacts()         // GET with page + search params
window.searchContacts()           // Filter by labels, search, unread status
window.updateContactList()        // Full contact list refresh
window.updateContactInfo()        // Updates assigned user display
```

### 14.5 Real-Time Updates

- Pusher/Echo subscription to `vendor-channel.{vendorUid}`
- Server-Sent Events: `data-event-stream-update="true"` on chat form
- New message notifications update unread counts in contact list

### 14.6 CRM Sidebar (Right Panel)

- Contact info display (name, phone, email, language)
- Team member assignment (Selectize dropdown)
- AI Bot + Reply Bot toggles (Switchery)
- Label assignment (multiple Selectize)
- Contact notes (textarea, edit mode toggle)
- Edit contact link

---

## 15. Bot Flow Builder UI

**File:** `resources/views/bot-reply/bot-flow/builder.blade.php`

### 15.1 jQuery Flowchart Configuration

Library: `jquery.flowchart.js`

```javascript
$('#lwBotFlowBuilder').flowchart({
    data: {},
    grid: 10,
    linkWidth: 5,
    multipleLinksOnInput: true,
    multipleLinksOnOutput: true,
    defaultLinkColor: 'green',
    defaultSelectedLinkColor: 'skyblue',
    onOperatorSelect: function(id) { ... },
    onLinkCreate: function(id, data) { updateDraft(); return true; },
    onLinkSelect: function(id) { show delete button },
    onLinkUnselect: function() { hide delete button },
    onLinkDelete: function(id, forced) { updateDraft(); },
    onOperatorMoved: function(id, x, y) { updateDraft(); }
})
```

**Panzoom** v3.2.2 for container zoom/pan.

### 15.2 Flowchart Data Structure

```javascript
data = {
    operators: {
        start: {
            top: 10, left: 10,
            properties: {
                title: "Start →",
                outputs: {
                    start_output: { label: $botFlow->start_trigger }
                }
            }
        },
        [{botReplyUid}]: {
            top: random(150-200),
            left: random(20-100),
            properties: {
                title: botReplyName,
                body: HTML (Edit/Delete/Duplicate buttons),
                inputs: { input: { label: "→" } },
                outputs: {}  // Populated per button/list item
            }
        }
    },
    links: {}
}
```

### 15.3 Dynamic Output Connectors

- Interactive buttons → each button becomes an output connector
- List-based interactive → each list row becomes output
- Output key format: `sections___[idx]___rows___[idx]___title`

### 15.4 Key Functions

```javascript
window.saveFlowChartData()
    // Gets flowchart data, removes 'body' from operators
    // POSTs to vendor.bot_reply.bot_flow_data.write.update

window.updateDraft()
    // Sets isUnsavedContent = true

window.onBotReplyDeleted(response)
    // flowchart('deleteOperator', botReplyUid), saves data

window.unsavedAlert()
    // Prompts user to save, calls saveFlowChartData()

window.onbeforeunload
    // Blocks navigation if isUnsavedContent = true
```

### 15.5 Unsaved Changes Guard

When `isUnsavedContent = true`:
- Edit/Delete/Duplicate buttons call `unsavedAlert()` instead of their actions
- `window.onbeforeunload` fires a browser confirmation dialog

---

## 16. Configuration & Settings Views

### 16.1 `configuration/general.blade.php` — Settings Keys

`name`, `description`, `logo_image_url`, `small_logo_image_url`, `favicon_image_url`, `dark_theme_logo_image_url`, `dark_theme_small_logo_image_url`, `dark_theme_favicon_image_url`, `contact_email`, `contact_details` (HTML), `timezone`, `default_language`

### 16.2 `configuration/misc.blade.php` — Settings Keys

- **Home page:** `current_home_page_view`, `other_home_page_url`
- **Import limit:** `contacts_import_limit_per_request`
- **Theming:** `disable_bg_image`, `allow_to_change_theme`, `current_app_theme`
- **Color customization:** Dynamic from `__settings.items.application_styles_and_colors` + `application_dark_theme_styles_and_colors`
- **Code injection:** `page_head_code` (raw HTML/CSS/JS for `<head>`)
- **Message cleanup:** `enable_automatic_message_deletion` (radio 0/1), `delete_whatsapp_message_days`
- **Temp media cleanup:** `enable_automatic_delete_vendor_temp_media`
- Cron commands displayed: `artisan whatsapp-message:delete:process`, `artisan vendor-temp-media:delete:process`

### 16.3 `configuration/payment.blade.php` — Email Settings Keys

Uses **email** settings (note: the blade file is labeled "payment" but contains email SMTP config — likely a view naming error):

`use_env_default_email_settings`, `mail_from_address`, `mail_from_name`, `mail_driver`, `smtp_mail_host`, `smtp_mail_port`, `smtp_mail_encryption`, `smtp_mail_username`, `smtp_mail_password_or_apikey`, `sparkpost_mail_password_or_apikey`, `mailgun_domain`, `mailgun_endpoint`

**Bug found:** Mailgun configuration repeats `mailgun_domain` field name for both domain and secret key inputs.

### 16.4 `configuration/social-login.blade.php` — Settings Keys

- Google: `allow_google_login`, `google_client_id`, `google_client_secret`
- Facebook: `allow_facebook_login`, `facebook_client_id`, `facebook_client_secret`
- Hidden state flags: `google_keys_exist`, `facebook_keys_exist`

### 16.5 `configuration/subscription-plans.blade.php`

Accordion structure per plan. Feature limit fields: `{featureKey}_limit` (numeric or -1). Charge fields: `{chargeType}_enabled`, `{chargeType}_plan_price_id`, `{chargeType}_charge`.

### 16.6 `configuration/whatsapp-onboarding.blade.php` — Settings Keys

- Manual: `enable_whatsapp_manual_signup`
- Embedded: `embedded_signup_app_id`, `embedded_signup_app_secret`, `embedded_signup_config_id`, `enable_embedded_signup`, `enable_business_app_onboarding`
- Facebook SDK initialized with App ID from settings
- `launchWhatsAppSignup()` — initiates embedded signup flow, tracks `phone_number_id`, `waba_id`, `is_app_onboarding`

### 16.7 `vendors/settings/ai-chat-bot-setup.blade.php` — Settings Keys

- **Bot timing:** `enable_bot_timing_restrictions`, `bot_start_timing`, `bot_end_timing`, `bot_timing_timezone`, `enable_ai_bot_timing_restrictions`, `enable_selected_other_bot_timing_restrictions[{botType}]`
- **AI general:** `flowise_failed_message`, `default_enable_flowise_ai_bot_for_users`
- **OpenAI:** `enable_open_ai_bot`, `use_existing_chat_history`, `open_ai_bot_name`, `open_ai_access_key`, `open_ai_organization_id`, `open_ai_model_key`, `open_ai_bot_data_source_type` (assistant or text), `open_ai_max_token`, `open_ai_input_training_data`, `open_ai_assistant_id`
- **Flowise:** `enable_flowise_ai_bot`, `flowise_url`, `flowise_access_token`

### 16.8 `vendors/settings/whatsapp-cloud-api-setup.blade.php`

Multi-step setup with 4 form types:

| Step | form_type | Key Fields |
|------|-----------|-----------|
| 1 | `whatsapp_setup_facebook_app_form` | `facebook_app_id`, `facebook_app_secret` |
| 2 | `whatsapp_setup_business_form` | `whatsapp_access_token`, `whatsapp_business_account_id` |
| 3 | (phone number select) | `current_phone_number_id` |
| 4 | `whatsapp_setup_test_contact` | `test_recipient_contact` |

Alpine state: `enableStep2`, `enableStep3`, `fbAppIdExists`, `isWebhookVerified`, `whatsAppSettings`

### 16.9 `mobile-app.blade.php` — Mobile Config Constants

```dart
const String baseUrl = '{url}/';
const String baseApiUrl = '${baseUrl}api/';
const String publicKey = '{YesSecurity::getPublicRsaKey()}';
const bool debug = {app.debug};
const Map configItems = {
    'pusher': { 'apiKey': '{pusher_app_key}', 'cluster': '{pusher_app_cluster}' }
}
```

Masked in demo mode.

### 16.10 `whatsapp/campaign-status.blade.php` — Alpine Data Model

`initialRequiredData` object:

| Key | Description |
|-----|-------------|
| `timeTookFromScheduledAtFormatted` | Human-readable execution time |
| `totalContacts` | Total recipients |
| `totalDelivered` / `totalDeliveredInPercent` | Delivery metrics |
| `totalRead` / `totalReadInPercent` | Read metrics |
| `totalFailed` / `totalFailedInPercent` | Failure metrics |
| `totalExpiredInPercent` | Expiry metrics |
| `totalSentInPercent` | Sent metrics |
| `totalInQueueInPercent` | Queue metrics |
| `campaignStatus` / `statusText` | Current status |
| `inQueuedCount` / `queueFailedCount` | Queue details |
| `acceptedCount` / `totalAcceptedInPercent` | Accepted count |

**Recampaign modal fields:** `failed_campaign_type`, `recampaign_type`, `campaign_id`, `title` (new group), `description`

---

## 17. Repository Methods

### 17.1 BotReplyRepository

```php
fetchBotReplyDataTableSource()
    WHERE: vendors__id, bot_flows__id IS NULL, trigger_type != 'NT_CAMPAIGN_MESSAGE'
    Searchable: name, reply_text, trigger_type, reply_trigger

fetchNonTemplateCampaignMessagePresetsDataTableSource()
    WHERE: vendors__id, bot_flows__id IS NULL, trigger_type = 'NT_CAMPAIGN_MESSAGE'

fetchNonTemplateCampaignMessagePresets()
    Returns: Collection (no pagination)
```

### 17.2 CampaignRepository

```php
fetchCampaignDataTableSource($status)
    $status == "archived" → query status IN [5]
    else → query status IN [1, 6]
    Counts: message_log_count, queue_pending_messages_count,
            queue_processing_messages_count, queue_failed_messages_count
    Searchable: title, whatsapp_templates__id, scheduled_at
    Field alias: contacts_count → '__data->total_contacts'

fetchCampaignData($campaignId)
    Eager loads: messageLog (ordered desc, limit 200)
    Counts: queuePendingMessages, queueProcessingMessages
```

### 17.3 VendorRepository

```php
storeVendor(array $inputs)
    Calls storeIt($inputs)

fetchVendorsDataTableSource()
    LEFT JOIN users ON vendors._uid = users.vendors__id
    Selected: vendors._id, _uid, title, created_at, status, slug,
              users._id AS userId, username, email, status AS user_status,
              mobile_number, CONCAT(first_name, last_name) AS fullName
    Searchable: title, fullName, email, username, slug, mobile_number
```

### 17.4 WhatsAppTemplateRepository

```php
syncTemplates($templatesData)
    Fetch current template IDs from DB
    DELETE templates not in $templatesData (array diff)
    bunchInsertUpdate() for batch sync

fetchTemplatesDataTableSource()
    Searchable: template_name, language, category, updated_at

getApprovedTemplatesByNewest()
    WHERE: status='APPROVED', vendors__id=getVendorId()
    ORDER: latest DESC

fetchTemplateListPaginatedData()
    Uses: request()->get('page_size'), request()->get('search_term')
    LIKE search on: template_name, template_id
```

### 17.5 WhatsAppMessageLogRepository

- Tracks delivery status per message
- Filters for stats: sent, delivered, read, failed counts per campaign
- `countIt(['vendors__id' => $id, 'is_system_message' => null])` — excludes system messages from dashboard count

### 17.6 WhatsAppMessageQueueRepository

- `countIt(['status' => 1, 'vendors__id' => $id])` — count pending messages
- `getQueueItemsForProcess()` — for campaign processing engine (ordered, filtered, limited)

---

## 18. Routes

### 18.1 `routes/auth.php` — Complete Route List

**Guest middleware routes:**

| Method | URI | Handler |
|--------|-----|---------|
| GET | `/auth/login` | `loginPage()` |
| POST | `/auth/login` | `processLogin()` |
| GET | `/auth/forgot-password` | `forgotPasswordPage()` |
| POST | `/auth/forgot-password` | `processForgotPasswordRequest()` |
| GET | `/auth/reset-password/{token}` | `resetPasswordPage()` |
| POST | `/auth/reset-password` | `processPasswordReset()` |
| GET | `/auth/register/vendor` | `registrationPage()` |
| POST | `/auth/register/vendor` | `register()` |
| POST | `/auth/register/vendor/activation` | `activationRequiredRegister()` |
| GET | `/auth/{userUid}/account-activation` | `accountActivation()` |
| GET | `/auth/login-google/redirect` | `redirectToGoogle()` |
| GET | `/auth/login/callback/google` | `handleGoogleCallback()` |
| GET | `/auth/login-facebook/redirect` | `redirectToFacebook()` |
| GET | `/auth/login/callback/facebook` | `handleFacebookCallback()` |
| GET | `/auth/two-factor-challenge-view` | `showTwoFactorChallengeView()` |
| GET | `/auth/two-factor-challenge-recovery-view` | `showTwoFactorChallengeRecoveryView()` |

**Authenticated routes (middleware: `auth`, throttle:6,1):**

| Method | URI | Handler |
|--------|-----|---------|
| GET | `/auth/confirm-password` | `confirmPasswordPage()` |
| POST | `/auth/confirm-password` | `processConfirmPassword()` |
| POST | `/auth/logout` | `logout()` |
| GET | `/auth/verify-email` | `verifyEmailView()` |
| GET | `/auth/verify-email/{id}/{hash}` | `verifyEmail()` (signed) |
| POST | `/auth/email/verification-notification` | `emailVerificationNotification()` |
| POST | `/auth/update-password` | `updatePassword()` |

**Throttle rate:** 6 requests per 1 minute for sensitive authenticated operations.

### 18.2 `routes/channels.php` — Broadcast Channel Authorization

```php
Broadcast::channel('vendor-channel.{vendorUid}', function ($user, $vendorUid) {
    return $vendorUid == getVendorUid();
});
```

Private channel authorization: user's vendor UID must match requested channel UID. Used by `VendorChannelBroadcast` event for real-time updates.

### 18.3 `routes/console.php`

Only contains the default Laravel `inspire` command — no custom artisan routes. All custom commands are registered via `Console/Kernel.php`.

---

## 19. QA Supplement

### 19.1 Previously Undocumented Test Cases

| Scenario | Expected Behavior |
|----------|------------------|
| Non-template campaign message (trigger_type='NT_CAMPAIGN_MESSAGE') | Appears in separate list view, processed differently from template campaigns |
| BotFlow start_trigger change | All child bot replies' `reply_trigger` updated to new value automatically |
| BotFlow unsaved changes navigation | Browser `onbeforeunload` fires, prompts user to save |
| WhatsApp webhook older than 25 minutes | Deleted without processing (max-age guard) |
| Webhook with 'Unsupported' error | Deleted immediately, not requeued |
| Webhook pending with attempted_at < 5 min ago | Skipped (not yet eligible for retry) |
| Message cleanup batch | Nulls `__data` + `message` in 1000-row batches with 200ms throttle |
| Translation scan on new language | Scans app/, resources/, config/ for `__tr()` / `__()` calls |
| Microsoft translation chunk boundary | 500 items per request, 15s sleep between chunks |
| Vendor permanent delete | Disconnects WhatsApp first, then deletes vendor+media |
| Plan limit check on bot flow create | Uses `vendorPlanDetails('bot_flows', count, vendorId)` |
| Interactive list validation | max 10 sections, max 10 rows per section, row_id must be alpha_dash + unique per section |
| Carousel minimum cards | min:2 — cannot create carousel with 1 card |
| Template name character validation | Only a-z, 0-9, underscore (enforced both JS and server) |
| OTP password reset (mobile) | 2-minute expiry (not 48 hours); OTP in email not URL |
| Welcome email with custom content | Renders `$welcomeEmailContent` HTML if set; falls back to default |
| VendorFrontend middleware on no plan | Returns code 11 JSON or `errors.no-active-plan` view |
| SubscriptionModel primary key | `id` not `_id` — only exception in entire system |
| ActivityLog no update timestamps | `setUpdatedAt()` disabled on ActivityLogModel |
| CampaignModel `is_all_contacts` flag | When true, sends to all vendor contacts regardless of group selection |
| Vendor impersonation by super admin | Sets `loggedBySuperAdmin` session, login as vendor admin |
| Super admin password change | No old password required — direct hash update |

### 19.2 Permission System Test Cases

| Scenario | Expected Behavior |
|----------|------------------|
| Team member with `manage_bot_replies` but not `manage_bot_flow_builder` | Can list/edit bots but NOT access flow builder |
| `hide_contact_phone_numbers` permission | Phone numbers masked in contact list and datatable |
| Bot reply create in bot_flow_builder context | Requires `manage_bot_flow_builder`, not `add_edit_bot_replies` |
| Campaign abort with `manage_campaigns` only | Allowed (no sub-permission needed) |
| Contact delete requires both manage_contacts + delete_contacts | Both must be 'allow' |
| Template delete requires delete_templates sub-permission | Not covered by `manage_templates` alone |

### 19.3 Parity Checklist Additions

- [ ] Non-template campaign preset messages (`trigger_type='NT_CAMPAIGN_MESSAGE'`)
- [ ] Bot flow trigger cascade on `start_trigger` change
- [ ] Webhook age guard (25-minute max, auto-delete)
- [ ] Webhook 'Unsupported' error → immediate delete
- [ ] Message cleanup batching (1000 rows, 200ms throttle, loop)
- [ ] Translation Microsoft API chunking (500 items, 15s sleep)
- [ ] Google Translate browser-side call in translation view
- [ ] Addon ZIP installation with metadata validation + optimize:clear
- [ ] Template analytics 7 preset durations
- [ ] `DYNAMIC_URL_BUTTON` + `COPY_CODE` + `VOICE_CALL` button types
- [ ] Template categories: MARKETING, UTILITY, AUTHENTICATION (not TRANSACTIONAL)
- [ ] Carousel min 2 cards, max 10 cards, max 2 buttons per card
- [ ] OTP email for mobile app password reset (2 minutes, not URL)
- [ ] Welcome email custom content override
- [ ] VendorFrontend middleware (active plan check on every vendor page)
- [ ] `SubscriptionModel` uses `id` PK (not `_id`)
- [ ] Chat inbox: Enter=send, Shift+Enter=newline
- [ ] Chat 24-hour delivery window flag display
- [ ] Campaign recampaign modal (8 delivery types → create new group)
- [ ] Bot flow unsaved-changes guard + onbeforeunload
- [ ] Flow builder panzoom (zoom/pan canvas)
- [ ] Label color customization (text_color, bg_color, max:10 each)
- [ ] Bulk contact operations: delete all, assign groups to selected, delete selected
- [ ] Contact filter: `msg_start_date` must be before_or_equal `msg_end_date`
- [ ] Webhook verify token = SHA1(vendorUid), special case for 'service-whatsapp'
- [ ] Cron mode vs queue mode (toggled by `enable_queue_jobs_for_campaigns` setting)
- [ ] Webhooks cron: every 1 second with 2s overlap protection
- [ ] Campaign cron: every 5 seconds with 2s overlap protection

---

*End of Part 3 Supplement. Read all three documents together for complete zero-loss coverage of WhatsJet SaaS v7.2.0.*

**Document set:**
1. `WhatsJet_Legacy_System_Master_Documentation_v7.2.0.md` — 94KB — Initial 14-document coverage
2. `WhatsJet_Legacy_System_Supplement_v7.2.0.md` — 52KB — Part 2: Services, middleware, auth, media, infrastructure
3. `WhatsJet_Legacy_System_Supplement_Part3_v7.2.0.md` — This file — Final: All engines, controllers, models, commands, UI
